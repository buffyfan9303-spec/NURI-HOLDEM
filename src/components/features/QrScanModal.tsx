// src/components/features/QrScanModal.tsx — 손님용 QR 체크인 스캐너.
// 왜: '체크인'은 매장에 실제로 왔다는 증명이다 — 버튼 즉시 체크인(스캔 생략)은 집에서도
// 출석 도장이 찍히는 구멍이었다(오너 리포트 2026-08-27). 매장에 비치된 체크인 QR
// (/?checkin=<venueId>, checkinUrl 인쇄물)을 카메라로 확인한 뒤에만 체크인을 실행한다.
// 딥링크(?checkin=)로 직접 진입한 경우의 자동 체크인 플로우는 App.tsx 에 그대로 보존.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';

// BarcodeDetector 는 아직 lib.dom 타입에 없다(크롬·안드로이드 웹뷰 지원, 사파리 구버전 미지원)
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(src: HTMLVideoElement): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

type Phase = 'starting' | 'scanning' | 'unsupported' | 'denied';

interface QrScanModalProps {
  open: boolean;
  onClose: () => void;
  venueId: string;
  venueName?: string;
  /** 이 매장의 체크인 QR 이 확인됐을 때만 호출 — 부모가 체크인 RPC 를 실행한다(스캔 전 체크인 발생 금지). */
  onMatch: () => void;
}

/** 스캔 원문에서 체크인 대상 매장 id 추출 — 인쇄 QR 은 `${origin}/?checkin=<venueId>` 형식(checkinUrl). */
function checkinIdOf(raw: string): string | null {
  try { return new URL(raw.trim()).searchParams.get('checkin'); } catch { return null; }
}

export default function QrScanModal({ open, onClose, venueId, venueName, onMatch }: QrScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [warn, setWarn] = useState<string | null>(null);

  // 부모가 인라인 콜백을 넘겨도(참조가 매 렌더 바뀌어도) 카메라를 재기동하지 않도록 ref 로 고정
  const onMatchRef = useRef(onMatch);
  useEffect(() => { onMatchRef.current = onMatch; });

  useEffect(() => {
    if (!open) return;
    setPhase('starting');
    setWarn(null);

    // 미지원(사파리 구버전 등) → 기기 카메라 앱 안내 폴백. 카메라 앱으로 스캔하면
    // ?checkin= 딥링크가 열리며 App.tsx 의 기존 자동 체크인이 처리한다.
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) { setPhase('unsupported'); return; }
    let detector: BarcodeDetectorLike;
    try { detector = new Detector({ formats: ['qr_code'] }); }
    catch { setPhase('unsupported'); return; }

    let alive = true;
    let matched = false; // 첫 매치 이후 중복 onMatch(→중복 체크인 RPC) 방지
    let stream: MediaStream | null = null;
    let attachedVideo: HTMLVideoElement | null = null; // cleanup 에서 ref.current 대신 사용(스냅샷)
    let timer = 0;

    // Modal 이 열림 애니메이션 상태(render)를 한 프레임 늦게 세우므로, 카메라가 아주 빨리
    // 열리면 <video> 가 아직 없을 수 있다 — 마운트될 때까지 rAF 로 재시도해 확실히 붙인다.
    const attach = (s: MediaStream) => {
      if (!alive) return;
      const v = videoRef.current;
      if (!v) { requestAnimationFrame(() => attach(s)); return; }
      attachedVideo = v;
      v.srcObject = s;
      v.play().catch(() => { /* 자동재생 거부 시 프레임 준비만 늦어짐 */ });
    };

    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        attach(s);
        setPhase('scanning');
        // rAF 매 프레임 detect 는 과잉(디코드 비용) — 350ms 폴링이면 손 흔들림 포함 체감 즉시다
        timer = window.setInterval(async () => {
          const video = videoRef.current;
          if (!alive || matched || !video || video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            const raw = codes[0]?.rawValue;
            if (!raw || !alive || matched) return;
            const scanned = checkinIdOf(raw);
            if (scanned === venueId) { matched = true; onMatchRef.current(); return; }
            // 남의 매장 QR·무관한 QR — 체크인하지 않고 계속 스캔(같은 문자열 setState 는 재렌더 없음)
            setWarn(scanned ? '이 매장의 QR이 아닙니다' : '체크인 QR이 아니에요 — 매장에 비치된 체크인 QR을 비춰 주세요');
          } catch { /* 프레임 미준비 등 일시 실패 — 다음 틱에 재시도 */ }
        }, 350);
      })
      .catch(() => { if (alive) setPhase('denied'); });

    return () => {
      alive = false;
      if (timer) window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (attachedVideo) attachedVideo.srcObject = null;
    };
  }, [open, venueId]);

  // ⚠ 포털 필수(2026-08-28 스윕): 이 모달은 VenuePage 오버레이(fixed z-40) **안에서** 렌더된다.
  // 부모가 z-40 스태킹 컨텍스트를 만들므로 Modal의 z-[60]은 그 안에서만 유효했고,
  // 루트의 하단 탭바(z-50)가 시트 하단 안내 문구를 덮었다(390px 실측 — 겹침).
  // body 로 포털해 루트 컨텍스트의 z-[60]으로 올린다(다른 루트 모달과 동일한 층).
  return createPortal(
    <Modal open={open} onClose={onClose} title="QR 체크인" maxWidth="sm" variant="sheet">
      <div className="space-y-3 p-4 pb-6">
        {(phase === 'unsupported' || phase === 'denied') ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-border-subtle bg-surface-low px-4 py-8 text-center">
            <Icon name="qr" size={28} className="text-ink-muted" />
            <p className="text-sm font-semibold text-ink-primary">
              {phase === 'denied' ? '카메라를 사용할 수 없어요' : '이 브라우저는 카메라 스캔을 지원하지 않아요'}
            </p>
            <p className="text-2xs leading-relaxed text-ink-muted">
              기기 카메라 앱으로 {venueName ?? '매장'}에 비치된 매장 QR을 스캔해 주세요 — 링크가 열리면 자동으로 체크인됩니다.
              {phase === 'denied' && <><br />또는 브라우저 설정에서 카메라 권한을 허용한 뒤 다시 시도해 주세요.</>}
            </p>
          </div>
        ) : (
          <>
            {/* aspect-square 로 공간 예약 — 카메라가 늦게 떠도 레이아웃이 밀리지 않는다(CLS 원칙) */}
            <div className="relative aspect-square overflow-hidden rounded-card border border-border-subtle bg-black">
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
              <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-3/5 w-3/5 rounded-2xl border-2 border-white/70" />
              </div>
              {phase === 'starting' && (
                <p className="absolute inset-x-0 bottom-3 text-center text-2xs font-semibold text-white/80">카메라 여는 중…</p>
              )}
            </div>
            <p className="text-center text-2xs text-ink-muted">
              {venueName ?? '매장'}에 비치된 <b className="text-ink-secondary">체크인 QR</b>을 프레임 안에 비춰 주세요.
            </p>
            {warn && (
              <p role="alert" className="flex items-center justify-center gap-1.5 rounded-input border border-danger/40 bg-danger/10 px-3 py-2 text-xs font-bold text-danger-light">
                <Icon name="alert" size={14} className="shrink-0" /> {warn}
              </p>
            )}
          </>
        )}
      </div>
    </Modal>,
    document.body,
  );
}
