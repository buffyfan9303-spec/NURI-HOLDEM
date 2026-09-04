// src/components/features/MyVoucherSheet.tsx
// 헤더 [이용권 · 출석] 시트 — **출석 QR + 기존 지갑 진입점** 둘뿐이다.
//
// ⚠ 2026-09-05 정정: 처음엔 여기에 이용권 목록을 직접 그렸는데, 그건 중복이었다.
//   CustomerDashboardPage 의 '내 매장이용권' 섹션이 이미 매장별 그룹핑·만료 D-day·인증 게이트 사전고지·
//   사용(3경로)·사용 내역까지 전부 갖고 있다. 목록을 두 벌 유지하면 반드시 갈라진다 —
//   여기서는 **보내기만** 하고 지갑은 한 곳으로 둔다.
//   남긴 것은 출석 QR 하나다: 매장이 정해지지 않은 상태에서 스캔할 수 있는 경로가 여기밖에 없다
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
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useIdentityEnabled } from '../../lib/identityFlag';
import { checkIn, getMyCheckinStreak } from '../../api/checkins';

export default function MyVoucherSheet({ open, onClose, onVenue, onOpenWallet }: {
  open: boolean;
  onClose: () => void;
  /** 체크인한 매장으로 — 사슬 끝에서 막다른 길을 만들지 않는다 */
  onVenue?: (venueId: string) => void;
  /** 내 정보(지갑)로 — 이용권 목록의 정본은 그쪽이다 */
  onOpenWallet: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const voucherOn = useIdentityEnabled();
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
        <div className="space-y-3">

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

          {/* ── 이용권은 '보내기'만 — 목록의 정본은 내 정보다 ──
              킬스위치가 꺼져 있으면 지갑 쪽 이용권 섹션 자체가 안 그려지므로 이 줄도 함께 감춘다
              (눌러도 아무것도 없는 죽은 칸을 만들지 않는다). */}
          {voucherOn && (
            <button type="button" onClick={() => { onClose(); onOpenWallet(); }}
              className="flex w-full items-center gap-2.5 rounded-aura border card-aura p-3 text-left transition-colors duration-[var(--dur-fast)] hover:bg-surface-high/50">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad" aria-hidden>
                <Icon name="ticket" size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink-primary">내 매장이용권</span>
                <span className="block text-2xs text-ink-muted">받은 이용권과 사용 내역 보기</span>
              </span>
              <Icon name="chevron-right" size={16} className="shrink-0 text-ink-muted" />
            </button>
          )}

        </div>
      </Modal>

      {/* 매장을 미리 정하지 않는다 — 스캔된 QR 이 대상 매장을 알려준다 */}
      <QrScanModal open={scanOpen} onClose={() => setScanOpen(false)} onMatch={onScanned} />
    </>
  );
}
