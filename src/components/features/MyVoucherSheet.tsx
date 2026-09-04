// src/components/features/MyVoucherSheet.tsx
// 헤더 [이용권] 버튼이 여는 시트 — **매장이용권 지갑 + 출석 QR** 두 가지만 담는다(오너 지시 2026-09-04).
//
// 왜 두 가지뿐인가: 헤더는 상시 크롬이라 진입점이 늘수록 나머지가 다 흐려진다. 이용권과 출석은
// '매장에 가서 하는 일' 하나로 묶이므로 같은 시트에 있는 것이 맞고, 그 밖의 것은 각자 탭이 있다.
//
// ⚠ 이 진입점은 본인인증·이용권 통합 킬스위치(identity_voucher_enabled)에 묶여 있다.
//   오너 지시 2026-08-29: "본인인증은 당분간 비활성화, 이와 동시에 매장이용권 관련 비활성화."
//   그래서 이용권 지갑은 스위치가 켜졌을 때만 그린다. **출석 QR 은 이용권과 무관하므로 항상 보인다** —
//   스위치가 꺼진 동안 이 시트는 '출석 전용'이 되고, 켜지면 지갑이 위에 붙는다.
import { useCallback, useEffect, useState } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import LoadErrorCard from '../atoms/LoadErrorCard';
import QrScanModal from './QrScanModal';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { useIdentityEnabled } from '../../lib/identityFlag';
import { listMyVouchers, type Voucher } from '../../api/vouchers';
import { checkIn, getMyCheckinStreak } from '../../api/checkins';

/** 남은 이용권만 센다 — 사용·만료분은 지갑의 '쓸 수 있는 장수'가 아니다 */
const isLive = (v: Voucher) =>
  v.status === 'active' && (!v.expiresAt || v.expiresAt >= new Date().toISOString().slice(0, 10));

export default function MyVoucherSheet({ open, onClose, onVenue }: {
  open: boolean;
  onClose: () => void;
  /** 이용권을 준 매장으로 — 사슬 끝에서 막다른 길을 만들지 않는다 */
  onVenue?: (venueId: string) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const voucherOn = useIdentityEnabled();

  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!user || !voucherOn) { setLoaded(true); return; }
    setErr(null);
    try { setVouchers(await listMyVouchers()); }
    catch (e) { setErr(e); }
    finally { setLoaded(true); }
  }, [user, voucherOn]);

  // 열릴 때만 읽는다 — 헤더 버튼은 상시 떠 있으므로 마운트 시점에 읽으면 매 방문 왕복이 된다
  useEffect(() => { if (open) { setLoaded(false); void reload(); } }, [open, reload]);

  /** 스캔된 매장으로 체크인 — 매장이 미리 정해지지 않은 진입점이라 스캔 결과가 대상이다 */
  const onScanned = async (venueId: string) => {
    setScanOpen(false);
    if (busy) return;
    setBusy(true);
    try {
      const name = await checkIn(venueId);
      const streak = await getMyCheckinStreak().catch(() => 0);
      const tail = streak >= 2 ? ` · ${streak}일 연속` : '';
      toast.show(`${name || '매장'} 출석 완료${tail}`, 'success');
      onClose();
      onVenue?.(venueId);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '체크인에 실패했어요', 'error');
    } finally { setBusy(false); }
  };

  const live = vouchers.filter(isLive);

  return (
    <>
      <Modal open={open} onClose={onClose} title="이용권 · 출석">
        <div className="space-y-3">

          {/* ── 출석 QR — 스위치와 무관하게 항상 ── */}
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
            <button type="button" onClick={() => { if (!user) { toast.show('로그인 후 이용할 수 있어요', 'error'); return; } setScanOpen(true); }}
              disabled={busy} className="btn-primary mt-2 min-h-[44px] w-full text-sm disabled:opacity-50">
              {busy ? '체크인 중…' : 'QR 스캔해서 출석'}
            </button>
          </section>

          {/* ── 매장이용권 지갑 — 킬스위치가 켜졌을 때만 ── */}
          {voucherOn && (
            <section className="rounded-aura border card-aura p-3">
              <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad" aria-hidden>
                  <Icon name="ticket" size={14} />
                </span>
                <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
                  <h3 className="text-sm font-bold text-ink-primary">내 매장이용권</h3>
                  <span className="text-2xs text-ink-secondary">매장에서 발급</span>
                </div>
                <span className="shrink-0 text-sm font-extrabold tabular-nums text-accent-200">{live.length}장</span>
              </div>

              {err != null ? (
                <div className="mt-2"><LoadErrorCard error={err} what="이용권" onRetry={() => { setLoaded(false); void reload(); }} compact /></div>
              ) : !loaded ? (
                // 스켈레톤 높이는 실제 행과 같아야 로드 완료 시 아래가 안 밀린다
                <ul className="mt-1 space-y-0.5" aria-busy="true">
                  {[0, 1].map((i) => <li key={i} className="skeleton h-[var(--row-h-sm)] rounded-input" />)}
                </ul>
              ) : live.length === 0 ? (
                <p className="py-5 text-center text-2xs text-ink-muted">
                  아직 받은 이용권이 없어요.<br />매장에서 발급하면 여기에 모입니다.
                </p>
              ) : (
                <ul className="mt-1 space-y-0.5">
                  {live.map((v) => {
                    const row = (
                      <>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full dot-like bg-opacity-20" aria-hidden>
                          <Icon name="ticket" size={13} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink-primary">{v.title}</span>
                          <span className="block truncate text-2xs text-ink-muted">
                            {v.venueName ?? '매장'}{v.expiresAt ? ` · ${v.expiresAt.replace(/-/g, '.')}까지` : ''}
                          </span>
                        </span>
                      </>
                    );
                    const cls = 'flex w-full min-h-[var(--row-h-sm)] items-center gap-2.5 rounded-input px-2 py-1.5 text-left';
                    return (
                      <li key={v.id}>
                        {onVenue ? (
                          <button type="button" onClick={() => { onClose(); onVenue(v.venueId); }}
                            className={`${cls} transition-colors hover:bg-surface-high/50`}>{row}</button>
                        ) : <div className={cls}>{row}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mt-2 px-1 text-2xs leading-relaxed text-ink-muted">
                이용권은 매장이 발급하는 표시값입니다. 금전적 가치가 없고 사고팔거나 남에게 넘길 수 없어요.
              </p>
            </section>
          )}

        </div>
      </Modal>

      {/* 매장을 미리 정하지 않는다 — 스캔된 QR 이 대상 매장을 알려준다 */}
      <QrScanModal open={scanOpen} onClose={() => setScanOpen(false)} onMatch={onScanned} />
    </>
  );
}
