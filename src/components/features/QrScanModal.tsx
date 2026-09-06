// src/components/features/QrScanModal.tsx — 손님용 QR 체크인 스캐너.
// 왜: '체크인'은 매장에 실제로 왔다는 증명이다 — 버튼 즉시 체크인(스캔 생략)은 집에서도
// 출석 도장이 찍히는 구멍이었다(오너 리포트 2026-08-27). 매장에 비치된 체크인 QR
// (/?checkin=<venueId>, checkinUrl 인쇄물)을 카메라로 확인한 뒤에만 체크인을 실행한다.
// 딥링크(?checkin=)로 직접 진입한 경우의 자동 체크인 플로우는 App.tsx 에 그대로 보존.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import { parseQr, ACTIONABLE, elsewhereMsg, type QrHit } from '../../lib/qrPayload';

// BarcodeDetector 는 아직 lib.dom 타입에 없다(크롬·안드로이드 웹뷰 지원, 사파리 구버전 미지원)
interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(src: HTMLVideoElement): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts?: { formats?: string[] }) => BarcodeDetectorLike;

type Phase = 'starting' | 'scanning' | 'unsupported' | 'denied';
/** 어느 리더로 읽는가. native=BarcodeDetector(크롬 계열) / lib=html5-qrcode(사파리·iOS 폴백) */
type Engine = 'native' | 'lib';
/** html5-qrcode 가 <video> 를 심을 자리. 이용권 스캐너(nuri-qr-reader)와 겹치면 안 된다 — 동시에 열릴 수 있다. */
const LIB_HOST = 'nuri-qr-scan';

interface QrScanModalProps {
  open: boolean;
  onClose: () => void;
  /** 특정 매장으로 한정할 때만 준다. **생략하면 아무 매장의 체크인 QR이나 받는다**
   *  (헤더의 출석 스캔처럼 매장이 미리 정해지지 않은 진입점용). */
  venueId?: string;
  venueName?: string;
  /** QR 이 확인됐을 때만 호출 — 부모가 RPC 를 실행한다(스캔 전 체크인·요청 발생 금지).
   *  첫 인자는 **스캔된 매장 id**: venueId 를 생략한 호출부는 이 값으로 대상을 정한다.
   *  둘째 인자로 무엇을 스캔했는지(체크인/바인·게임번호)를 준다 — 체크인만 쓰는 호출부는 무시하면 된다. */
  onMatch: (scannedVenueId: string, hit: QrHit) => void;
  /** 'both' 면 바인 요청 QR 도 받는다. 기본은 체크인 전용 —
   *  매장 페이지의 '출석' 버튼처럼 대상이 정해진 진입점에서 엉뚱한 QR 을 삼키지 않게. */
  accept?: 'checkin' | 'both';
}

export default function QrScanModal({ open, onClose, venueId, venueName, onMatch, accept = 'checkin' }: QrScanModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [engine, setEngine] = useState<Engine>('native');
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
    if (!navigator.mediaDevices?.getUserMedia) { setPhase('unsupported'); return; }
    const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    let detector: BarcodeDetectorLike | null = null;
    if (Detector) { try { detector = new Detector({ formats: ['qr_code'] }); } catch { detector = null; } }

    let alive = true;
    let matched = false; // 첫 매치 이후 중복 onMatch(→중복 체크인 RPC) 방지
    let stream: MediaStream | null = null;

    // 스캔 원문 → 실행/안내. 두 엔진이 **같은 판정**을 쓰도록 한 곳에 둔다.
    const handleRaw = (raw: string): boolean => {
      const hit = parseQr(raw);
      const actionable = !!hit && ACTIONABLE.includes(hit.kind) && (accept === 'both' || hit.kind === 'checkin');
      if (actionable && hit?.venueId && (!venueId || hit.venueId === venueId)) { onMatchRef.current(hit.venueId, hit); return true; }
      setWarn(actionable ? '이 매장의 QR이 아닙니다'
        : hit && elsewhereMsg(hit.kind) ? elsewhereMsg(hit.kind)!
        : hit?.kind === 'buyin' ? '바인 요청 QR이에요. 출석은 매장 비치 체크인 QR을 비춰 주세요'
        : accept === 'both' ? '매장 QR이 아니에요. 테이블·카운터에 비치된 출석 또는 바인 요청 QR을 비춰 주세요'
        : '체크인 QR이 아니에요. 매장에 비치된 체크인 QR을 비춰 주세요');
      return false;
    };

    // ⚠ BarcodeDetector 는 **크롬 계열 전용**이다. 사파리(=iOS 의 모든 브라우저, 카톡·네이버 인앱 포함)에는
    //   없어서, 예전에는 아이폰 손님이 앱 안에서 QR 을 아예 못 찍고 '지원하지 않아요' 카드만 봤다
    //   (2026-09-06 QR 감사). 이용권 스캐너(VoucherWallet)는 이미 html5-qrcode 를 동적 로드해 iOS 에서도
    //   되고 있었다 — 같은 라이브러리가 이미 의존성에 있으므로 여기서도 같은 폴백을 태운다.
    if (!detector) {
      setEngine('lib');
      let lib: { stop: () => Promise<void>; clear: () => void } | null = null;
      (async () => {
        try {
          const { Html5Qrcode } = await import('html5-qrcode');
          if (!alive) return;
          // Modal 이 한 프레임 뒤에 본문을 붙이므로 host 가 생길 때까지 기다린다.
          for (let i = 0; i < 30 && alive && !document.getElementById(LIB_HOST); i++) {
            await new Promise((r) => requestAnimationFrame(r));
          }
          if (!alive || !document.getElementById(LIB_HOST)) return;
          const inst = new Html5Qrcode(LIB_HOST);
          lib = inst;
          await inst.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 },
            (text) => { if (!matched && alive && handleRaw(text)) { matched = true; } },
            () => { /* 프레임마다 오는 '못 찾음' — 무시 */ });
          if (alive) setPhase('scanning');
        } catch { if (alive) setPhase('denied'); }
      })();
      return () => {
        alive = false;
        const l = lib; lib = null;
        if (l) { l.stop().then(() => l.clear()).catch(() => {}); }
      };
    }

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
            const codes = await detector!.detect(video);
            const raw = codes[0]?.rawValue;
            if (!raw || !alive || matched) return;
            // venueId 를 안 준 호출부는 아무 매장 QR 이나 받는다(어느 매장인지는 인자로 넘긴다)
            if (handleRaw(raw)) { matched = true; return; }
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
  }, [open, venueId, accept]);

  // ⚠ 포털 필수(2026-08-28 스윕): 이 모달은 VenuePage 오버레이(fixed z-40) **안에서** 렌더된다.
  // 부모가 z-40 스태킹 컨텍스트를 만들므로 Modal의 z-[60]은 그 안에서만 유효했고,
  // 루트의 하단 탭바(z-50)가 시트 하단 안내 문구를 덮었다(390px 실측 — 겹침).
  // body 로 포털해 루트 컨텍스트의 z-[60]으로 올린다(다른 루트 모달과 동일한 층).
  return createPortal(
    <Modal open={open} onClose={onClose} title={accept === 'both' ? 'QR 스캔' : 'QR 체크인'} maxWidth="sm" variant="sheet">
      <div className="space-y-3 p-4 pb-6">
        {(phase === 'unsupported' || phase === 'denied') ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-border-subtle bg-surface-low px-4 py-8 text-center">
            <Icon name="qr" size={28} className="text-ink-muted" />
            <p className="text-sm font-semibold text-ink-primary">
              {phase === 'denied' ? '카메라를 사용할 수 없어요' : '이 브라우저는 카메라 스캔을 지원하지 않아요'}
            </p>
            <p className="text-2xs leading-relaxed text-ink-muted">
              기기 카메라 앱으로 {venueName ?? '매장'}에 비치된 QR을 스캔해 주세요 — 링크가 열리면
              {accept === 'both' ? ' 출석 또는 참가(바인) 요청이 이어집니다.' : ' 자동으로 체크인됩니다.'}
              {phase === 'denied' && <><br />또는 브라우저 설정에서 카메라 권한을 허용한 뒤 다시 시도해 주세요.</>}
            </p>
          </div>
        ) : (
          <>
            {/* aspect-square 로 공간 예약 — 카메라가 늦게 떠도 레이아웃이 밀리지 않는다(CLS 원칙) */}
            <div className="relative aspect-square overflow-hidden rounded-card border border-border-subtle bg-black">
              {engine === 'lib'
                ? <div id={LIB_HOST} className="absolute inset-0 [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
                : <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />}
              <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-3/5 w-3/5 rounded-2xl border-2 border-white/70" />
              </div>
              {phase === 'starting' && (
                <p className="absolute inset-x-0 bottom-3 text-center text-2xs font-semibold text-white/80">카메라 여는 중…</p>
              )}
            </div>
            <p className="text-center text-2xs text-ink-muted">
              {venueName ?? '매장'}에 비치된 <b className="text-ink-secondary">{accept === 'both' ? '출석 또는 바인 요청 QR' : '체크인 QR'}</b>을 프레임 안에 비춰 주세요.
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
