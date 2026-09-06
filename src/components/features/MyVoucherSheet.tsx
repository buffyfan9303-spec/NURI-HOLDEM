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
import { useState, useEffect } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import QrScanModal from './QrScanModal';
import { type QrHit } from '../../lib/qrPayload';
import VoucherWallet from './VoucherWallet';
import { listMyVouchers, isHeldVoucher } from '../../api/vouchers';
import { useIdentityEnabled } from '../../lib/identityFlag';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { checkIn, getMyCheckinStreak } from '../../api/checkins';

export default function MyVoucherSheet({ open, onClose, onVenue, onOpenWallet, onBuyin }: {
  open: boolean;
  onClose: () => void;
  /** 바인 요청 QR 을 읽었을 때 — 게임 선택·요청 전송은 App 의 딥링크(?buyin=) 경로와 **같은 함수**가 한다.
   *  여기서 따로 구현하면 게임이 여러 개인 매장의 선택 모달이 두 벌이 된다. */
  onBuyin?: (venueId: string, gameSeq: number | null) => void;
  /** 체크인한 매장으로 — 사슬 끝에서 막다른 길을 만들지 않는다 */
  onVenue?: (venueId: string) => void;
  /** 내 정보로 — 본인인증(보안 탭)·프로필 설정처럼 시트 밖에서 해야 하는 일의 출구 */
  onOpenWallet: () => void;
}) {
  const { user, refreshProfile } = useAuth();
  const toast = useToast();
  const [scanOpen, setScanOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  /** 스캔된 QR 로 실행 — 매장이 미리 정해지지 않은 진입점이라 스캔 결과가 대상이자 의도다.
   *  손님에게 '출석/바인' 을 먼저 고르게 하지 않는다: 테이블의 QR 이 이미 무엇인지 말하고 있고,
   *  먼저 고르게 하면 잘못 고를 길만 하나 늘어난다. */
  const onScanned = async (venueId: string, hit?: QrHit) => {
    setScanOpen(false);
    if (hit?.kind === 'buyin') { onClose(); onBuyin?.(venueId, hit.gameSeq); return; }
    if (busy) return;
    setBusy(true);
    try {
      const { name, streak: served } = await checkIn(venueId);
      const streak = served ?? await getMyCheckinStreak().catch(() => 0);
      // 프로필 점수·랭킹 내 순위가 재로그인 없이 따라오도록
      await refreshProfile().catch(() => {});
      // 출석 = 이벤트 참여권 1장 — 홈 배너가 들고 있는 숫자를 갱신시킨다(App.tsx 딥링크 경로와 동일 신호).
      window.dispatchEvent(new Event('nuri:event-board-refresh'));
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

          {/* ── QR — 이 시트에만 있는 기능(오너 2026-09-06: 출석과 바인 둘 다).
              매장이 정해지지 않은 상태에서 스캔할 수 있는 경로가 여기뿐이다. ── */}
          <section className="rounded-aura border card-aura p-3">
            <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-cyan" aria-hidden>
                <Icon name="qr" size={14} />
              </span>
              <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
                <h3 className="text-sm font-bold text-ink-primary">QR</h3>
                <span className="text-2xs text-ink-secondary">출석 · 바인 요청</span>
              </div>
            </div>
            {/* 무엇을 하는지는 QR 이 정한다 — 손님이 먼저 고르지 않는다. 그래서 버튼은 하나이고,
                대신 이 QR 로 무엇이 되는지를 두 줄로 못박아 둔다. */}
            <ul className="mt-2 space-y-1.5">
              <li className="flex items-start gap-2">
                <Icon name="check-circle" size={13} className="mt-px shrink-0 text-emerald-400" />
                <p className="text-2xs leading-relaxed text-ink-muted">
                  <b className="text-ink-secondary">출석</b> — 매장 비치 체크인 QR. 하루 한 번이면 충분해요.
                </p>
              </li>
              <li className="flex items-start gap-2">
                <Icon name="chip" size={13} className="mt-px shrink-0 text-accent-300" />
                <p className="text-2xs leading-relaxed text-ink-muted">
                  <b className="text-ink-secondary">바인 요청</b> — 테이블 비치 QR. 운영자가 승인하면 오늘 장부 명단에 등록됩니다.
                </p>
              </li>
            </ul>
            <button type="button" disabled={busy}
              onClick={() => { if (!user) { toast.show('로그인 후 이용할 수 있어요', 'error'); return; } setScanOpen(true); }}
              className="btn-primary mt-2.5 min-h-[44px] w-full text-sm disabled:opacity-50">
              {busy ? '체크인 중…' : 'QR 스캔하기'}
            </button>
          </section>

          {/* ── 자주 가는 매장 이용권 — 매장별 보유 장수(오너 2026-09-05 "출석만 있는데 매장별 갯수도").
              킬스위치와 무관하게 **보유 장수는 보인다**(레코드는 늘 있다). 사용·전송은 아래 지갑(스위치 ON)에서. ── */}
          <VenueVoucherCounts onVenue={onVenue && ((venueId) => { onClose(); onVenue(venueId); })} />

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

      {/* 매장을 미리 정하지 않는다 — 스캔된 QR 이 대상 매장과 할 일을 함께 알려준다 */}
      <QrScanModal open={scanOpen} onClose={() => setScanOpen(false)} onMatch={onScanned} accept="both" />
    </>
  );
}


/**
 * 매장별 보유 이용권 장수 — 많은 순(= 자주 가는 매장). 이용권은 실물 1장 = 자리 1개라 여기 단위는 '장'이 맞다
 * (장부의 T 단위와 다르다). 킬스위치 OFF 여도 장수는 보여 준다 — 손님이 '몇 장 있는지'를 못 보는 게 더 이상하다.
 * 로딩은 실제 행과 같은 높이의 스켈레톤으로 자리를 예약한다(CLS 0).
 */
function VenueVoucherCounts({ onVenue }: { onVenue?: (venueId: string) => void }) {
  const { user } = useAuth();
  const idOn = useIdentityEnabled();
  const [rows, setRows] = useState<{ venueId: string; name: string; count: number }[] | null>(null);
  useEffect(() => {
    if (!user?.id) { setRows([]); return; }
    let alive = true;
    listMyVouchers()
      .then((vs) => {
        const m = new Map<string, { venueId: string; name: string; count: number }>();
        const nowMs = Date.now();
        for (const v of vs) {
          if (!isHeldVoucher(v, nowMs)) continue; // 쓴 것·회수된 것·만료된 것은 보유가 아니다 — 지갑(VoucherWallet)과 같은 술어
          const cur = m.get(v.venueId) ?? { venueId: v.venueId, name: v.venueName ?? '매장', count: 0 };
          cur.count += 1; m.set(v.venueId, cur);
        }
        if (alive) setRows([...m.values()].sort((a, b) => b.count - a.count).slice(0, 5));
      })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [user?.id]);
  if (!user) return null;
  return (
    <section className="rounded-aura border card-aura p-3">
      <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-fuchsia" aria-hidden>
          <Icon name="ticket" size={14} />
        </span>
        <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
          <h3 className="text-sm font-bold text-ink-primary">자주 가는 매장 이용권</h3>
          <span className="text-2xs text-ink-secondary">보유 많은 순</span>
        </div>
      </div>
      {rows === null ? (
        <div className="mt-2 space-y-1.5" aria-busy="true">
          {[0, 1].map((i) => <div key={i} className="skeleton h-11 rounded-input" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-2 py-2 text-center text-2xs text-ink-muted">보유한 매장이용권이 없어요</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.venueId}>
              <button type="button" onClick={() => onVenue?.(r.venueId)} disabled={!onVenue}
                className="flex min-h-[44px] w-full items-center gap-2 rounded-input border card-aura-sub px-3 py-2 text-left transition-colors duration-[var(--dur-fast)] hover:bg-surface-high/50 disabled:cursor-default">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{r.name}</span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-accent-200">{r.count}<span className="ml-0.5 text-2xs font-semibold text-ink-muted">장</span></span>
                {onVenue && <Icon name="chevron-right" size={14} className="shrink-0 text-ink-muted" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!idOn && rows && rows.length > 0 && (
        <p className="mt-2 text-2xs text-ink-muted">사용·전송은 본인인증 오픈 후 이 시트에서 바로 할 수 있어요.</p>
      )}
    </section>
  );
}
