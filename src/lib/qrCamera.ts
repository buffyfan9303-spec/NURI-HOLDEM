// src/lib/qrCamera.ts — 앱 안 QR 스캐너 두 곳(출석 QrScanModal · 이용권 VoucherWallet)의 공용 카메라 루프.
// 왜(2026-09-24): 예전 폴백 html5-qrcode 는 zxing UMD 를 통째로 싣고 tree-shake 가 안 돼 스캐너 청크만
//   93KB(gz)였다. 우리가 쓰던 기능은 '후면 카메라 → 프레임 → QR 원문' 하나뿐이다(카메라 전환·토치·파일 스캔 미사용).
//   → 크롬 계열은 내장 BarcodeDetector, 없으면(사파리 = iOS 의 모든 브라우저) jsQR 로 canvas 프레임을 읽는다.
//   아이폰 손님에게는 jsQR 경로가 **출석의 주 경로**다 — 이 파일이 깨지면 iOS 앱 안 출석 스캔이 통째로 막힌다.

// BarcodeDetector 는 아직 lib.dom 타입에 없다
interface BarcodeDetectorLike { detect(src: HTMLVideoElement): Promise<{ rawValue: string }[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

/** 긴 변을 이 픽셀까지 줄여서 디코드한다 — 1080p 원본을 그대로 넣으면 폰에서 프레임당 수백 ms 가 걸린다. */
const MAX_SIDE = 640;

/** RGBA 픽셀 → QR 원문(없으면 null). 정적 이미지 단위 테스트가 이 함수를 직접 부른다. */
export async function decodeQrPixels(data: Uint8ClampedArray, width: number, height: number): Promise<string | null> {
  const { default: jsQR } = await import('jsqr'); // 동적 로드 — 스캐너를 열 때만 다운로드
  // ponytail: dontInvert — 앱이 만드는 QR 은 전부 흰 바탕 검은 점(qrcode 기본색). 반전 QR 을 받아야 하면 'attemptBoth'(비용 2배).
  return jsQR(data, width, height, { inversionAttempts: 'dontInvert' })?.data || null;
}

/**
 * 후면 카메라를 열어 `video` 에 붙이고, QR 원문을 찾을 때마다 `onText` 를 부른다.
 * `onText` 가 true 를 돌려주면 루프를 멈춘다(카메라는 호출부가 stop 으로 끈다).
 * 권한 거부·카메라 없음은 reject(원래 DOMException 그대로) — 호출부가 기존 안내 문구로 바꾼다.
 * `signal` 이 끊기면(언마운트·닫힘) 늦게 도착한 스트림도 즉시 끈다.
 * 반환: 카메라·루프를 끄는 stop().
 */
export async function startQrCamera(
  video: HTMLVideoElement,
  onText: (raw: string) => boolean,
  signal: AbortSignal,
): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  let stopped = false;
  let timer = 0;
  const stop = () => {
    stopped = true;
    window.clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    if (video.srcObject === stream) video.srcObject = null;
  };
  if (signal.aborted) { stop(); return stop; }
  signal.addEventListener('abort', stop, { once: true });

  video.srcObject = stream;
  video.muted = true;
  video.setAttribute('playsinline', ''); // iOS: 없으면 전체화면 플레이어로 튄다
  video.play().catch(() => { /* 자동재생 거부 시 프레임 준비만 늦어짐 */ });

  const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
  let native: BarcodeDetectorLike | null = null;
  if (Detector) { try { native = new Detector({ formats: ['qr_code'] }); } catch { native = null; } }
  let ctx: CanvasRenderingContext2D | null = null;

  const readFrame = async (): Promise<string | null> => {
    if (native) {
      try { return (await native.detect(video))[0]?.rawValue || null; }
      catch { native = null; /* 이 기기의 내장 디코더가 실패 — 이후는 jsQR 로 */ }
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    const w = Math.round(video.videoWidth * scale), h = Math.round(video.videoHeight * scale);
    if (!w || !h) return null;
    if (!ctx) ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    if (ctx.canvas.width !== w) ctx.canvas.width = w;
    if (ctx.canvas.height !== h) ctx.canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    return decodeQrPixels(ctx.getImageData(0, 0, w, h).data, w, h);
  };

  // 디코드가 끝난 뒤 다음 틱을 건다(setTimeout 체인) — 느린 폰에서 디코드가 겹쳐 쌓이지 않는다.
  const tick = async () => {
    if (stopped) return;
    if (video.readyState >= 2) {
      try {
        const raw = await readFrame();
        if (stopped) return;
        if (raw && onText(raw)) return;
      } catch { /* 프레임 미준비 등 일시 실패 — 다음 틱에 재시도 */ }
    }
    if (!stopped) timer = window.setTimeout(tick, native ? 350 : 200);
  };
  timer = window.setTimeout(tick, 0);
  return stop;
}
