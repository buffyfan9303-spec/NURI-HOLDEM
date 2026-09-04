// src/components/features/MyVoucherSheet.tsx
// 헤더 [이용권 · 출석] 시트 — **출석 QR + 매장이용권 지갑** 둘이다.
//
// ⚠ 목록을 여기에 손으로 다시 그리지 않는다(2026-09-04 에 그 중복을 만들었다가 되돌렸다).
//   보유·매장별 그룹·만료 D-day·인증 게이트 사전고지·사용(3경로)·사용 내역은 전부
//   VoucherWallet 하나가 갖고 있고, 내 정보(대시보드)와 이 시트가 **같은 컴포넌트**를 쓴다.
//   오너 지시(2026-09-05): "매장이용권 아이콘에 보유내역·전송 등 매장이용권 관련 기능을 —
//   대시보드와 똑같이 말고 이용권 내역만." → 대시보드의 나머지(전적·방문·초대)는 오지 않는다.
//   출석 QR 은 이 시트에만 있다: 매장이 정해지지 않은 상태에서 스캔할 수 있는 경로가 여기뿐이다
//   (VenuePage 의 체크인은 이미 그 매장 안에 들어가 있어야 누를 수 있다).
//
// ⚠ 이 시트는 **App 루트에서 렌더한다**(헤더 안이 아니라). 헤더는 sticky z-50 이라 스태킹 컨텍스트를
//   만들고, 그 안에서 Modal 의 fixed z-[60] 이 갇혀 하단 탭바(fixed z-50, DOM 후순위)에 덮였다 —
//   시트 아래쪽 약 100px 이 잘려 버튼이 아예 안 보였다(오너 스크린샷). QrScanModal 이 2026-08-28 에
//   createPortal 로 고친 것과 같은 결함이라, 여기서는 애초에 루트에서 렌더해 원인을 없앤다.
import { useState } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import QrScanModal from './QrScanModal';
import VoucherWallet from './VoucherWallet';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { checkIn, getMyCheckinStreak } from '../../api/checkins';

export default function MyVoucherSheet({ open, onClose, onVenue, onOpenWallet }: {
  open: boolean;
  onClose: () => void;
  /** 체크인한 매장으로 — 사슬 끝에서 막다른 길을 만들지 않는다 */
  onVenue?: (venueId: string) => void;
  /** 내 정보로 — 본인인증(보안 탭)·프로필 설정처럼 시트 밖에서 해야 하는 일의 출구 */
  onOpenWallet: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  /** 스캔된 매장으로 체크인 — 매장이 미리 정해지지 않은 진입점이라 스캔 결과가 대상이다 */
  const onScanned = async (venueId: string) => {
    setScanOpen(false);
    if (busy) return;
    setBusy(true);
    try {
      const name = await checkIn(venueId);
      const streak = await getMyCheckinStreak().catch(() => 0);
      toast.show(`${name || '매장'} 출석 완료${streak >= 2 ? ` · ${streak}일 연속` : ''}`, 'success');
      onClose();
      onVenue?.(venueId);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '체크인에 실패했어요', 'error');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="이용권 · 출석">
        {/* Modal 본문(flex-1 overflow-y-auto)은 패딩을 주지 않는다 — 소비자가 넣는 규약이다.
            이 파일만 빠뜨려 카드가 시트 모서리에 붙어 있었다(2026-09-05 검증). */}
        <div className="space-y-3 p-4">

          {/* ── 출석 QR — 이 시트에만 있는 기능 ── */}
          <section className="rounded-aura border card-aura p-3">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-cyan" aria-hidden>
                <Icon name="qr" size={14} />
              </span>
              <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
                <h3 className="text-sm font-bold text-ink-primary">출석 QR</h3>
                <span className="text-2xs text-ink-secondary">매장 비치 QR 스캔</span>
              </div>
            </div>
            <p className="mt-2 text-2xs leading-relaxed text-ink-muted">
              매장에 비치된 체크인 QR을 비추면 출석이 기록됩니다. 하루 한 번이면 충분해요.
            </p>
            <button type="button" disabled={busy}
              onClick={() => { if (!user) { toast.show('로그인 후 이용할 수 있어요', 'error'); return; } setScanOpen(true); }}
              className="btn-primary mt-2 min-h-[44px] w-full text-sm disabled:opacity-50">
              {busy ? '체크인 중…' : 'QR 스캔해서 출석'}
            </button>
          </section>

          {/* ── 매장이용권 지갑 — 대시보드와 같은 정본(킬스위치 OFF 면 스스로 아무것도 그리지 않는다) ──
              본인인증 CTA 는 시트 안에서 끝낼 수 없으니 내 정보로 넘긴다.
              매장 머리글을 누르면 발급 매장으로 — 사슬 끝에서 막다른 길을 만들지 않는다. */}
          <VoucherWallet
            compact
            onNeedVerify={() => { onClose(); onOpenWallet(); }}
            onVenue={onVenue && ((venueId) => { onClose(); onVenue(venueId); })}
          />

        </div>
      </Modal>

      {/* 매장을 미리 정하지 않는다 — 스캔된 QR 이 대상 매장을 알려준다 */}
      <QrScanModal open={scanOpen} onClose={() => setScanOpen(false)} onMatch={onScanned} />
    </>
  );
}
