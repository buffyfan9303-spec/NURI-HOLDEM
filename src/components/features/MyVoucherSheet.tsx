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
import { useState, useEffect, useCallback, useMemo } from 'react';
import Modal from '../atoms/Modal';
import Icon from '../atoms/Icon';
import QrScanModal from './QrScanModal';
import { type QrHit } from '../../lib/qrPayload';
import VoucherWallet from './VoucherWallet';
import {
  listMyVouchers, isHeldVoucher, redeemMyVouchersByQr, redeemMyVouchersByPhone,
  findUserByPhone, type Voucher, type TransferTarget,
} from '../../api/vouchers';
import { useIdentityEnabled } from '../../lib/identityFlag';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { checkIn, getMyCheckinStreak } from '../../api/checkins';
import { useBackClose } from '../../lib/backstack';

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

  // 보유 이용권은 시트가 **한 번** 읽는다 — 아래 '자주 가는 매장' 카드와 '보내기' 가 같은 목록을 본다.
  // 예전엔 카드가 혼자 읽어서, 보내기를 붙이면 같은 조회가 두 벌이 됐다.
  const [held, setHeld] = useState<Voucher[] | null>(null);
  const reloadHeld = useCallback(() => {
    if (!user?.id) { setHeld([]); return; }
    listMyVouchers()
      .then((vs) => { const now = Date.now(); setHeld(vs.filter((v) => isHeldVoucher(v, now) && !v.usedAt)); })
      .catch(() => setHeld([]));
  }, [user?.id]);
  useEffect(() => { if (open) reloadHeld(); }, [open, reloadHeld]);

  /** 매장별 보유 묶음 — 많은 순. '보유한 매장의 이용권만' 이라는 규칙의 단일 출처다.
   *  ⚠ 묶음 안은 **만료 임박순**으로 세운다. 보내기는 앞에서부터 잘라 쓰므로(ids.slice(0, count))
   *    이 순서가 곧 '어느 장이 먼저 나가는가'다. listMyVouchers 는 발급 최신순으로 오는데 그대로 쓰면
   *    최신 장이 먼저 나가고 **만료 임박한 장이 남아 그대로 소멸한다** — 손님 자산이 한 방향으로만
   *    사라진다(자리 1개 = 참가비 1회분). 서버(redeem_my_voucher_by_qr/_by_phone)는 넘긴 id 를 그대로
   *    쓸 뿐 먼저 쓸 장을 골라 주지 않으므로 고르는 책임은 여기에 있다.
   *    같은 자산을 다루는 VoucherWallet 도 같은 이유로 만료 오름차순을 명시한다. 무기한은 맨 뒤. */
  const byVenue = useMemo(() => {
    const at = (v: Voucher) => (v.expiresAt ? new Date(v.expiresAt).getTime() : Infinity);
    const m = new Map<string, { venueId: string; name: string; ids: string[] }>();
    for (const v of [...(held ?? [])].sort((a, b) => at(a) - at(b))) {
      const cur = m.get(v.venueId) ?? { venueId: v.venueId, name: v.venueName ?? '매장', ids: [] };
      cur.ids.push(v.id); m.set(v.venueId, cur);
    }
    return [...m.values()].sort((a, b) => b.ids.length - a.ids.length);
  }, [held]);

  /** 보내기 단계 — 바인 QR 로 들어오면 via='qr'(방금 그 매장 QR 이 증빙), 수동이면 via='phone'. */
  const [plan, setPlan] = useState<null | {
    venueId: string; venueName: string; ids: string[]; via: 'qr' | 'phone'; gameSeq: number | null;
  }>(null);

  /** 스캔된 QR 로 실행 — 매장이 미리 정해지지 않은 진입점이라 스캔 결과가 대상이자 의도다.
   *  손님에게 '출석/바인' 을 먼저 고르게 하지 않는다: 테이블의 QR 이 이미 무엇인지 말하고 있고,
   *  먼저 고르게 하면 잘못 고를 길만 하나 늘어난다. */
  const onScanned = async (venueId: string, hit?: QrHit) => {
    setScanOpen(false);
    if (hit?.kind === 'buyin') {
      // 오너 2026-09-08: "바이인을 할 때 몇 장을 보낼 것인지도 질문". 이 매장 이용권이 있을 때만 묻는다 —
      // 없는 사람에게 '0장' 을 고르게 하는 건 걸음만 하나 늘리는 것이다(그때는 예전대로 바로 요청).
      const g = byVenue.find((x) => x.venueId === venueId);
      if (g && g.ids.length > 0) { setPlan({ ...g, venueName: g.name, via: 'qr', gameSeq: hit.gameSeq ?? null }); return; }
      onClose(); onBuyin?.(venueId, hit.gameSeq); return;
    }
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
          {/* ── 수동으로 보내기(오너 2026-09-08 "그 아래 수동으로 매장이용권을 보내는 것도").
              QR 을 못 찍는 상황(스티커 훼손·카메라 거부)의 출구다.
              ⚠ '수동' 이 무증빙은 아니다 — 무증빙 사용(redeem_my_voucher)은 2026-09-07 에 폐지됐다.
                여기서 수동 = **업주 전화번호** 경로. 남아 있는 유일한 QR-없는 증빙 경로다.
              ⚠ 목록은 **보유한 매장만** 나온다(오너 지시). 안 가진 매장을 고를 수 있으면
                고른 뒤에 실패하는 길을 하나 만드는 것뿐이다. ── */}
          {byVenue.length > 0 && (
            <section className="rounded-aura border card-aura p-3">
              <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-violet" aria-hidden>
                  <Icon name="send" size={14} />
                </span>
                <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
                  <h3 className="text-sm font-bold text-ink-primary">수동으로 보내기</h3>
                  <span className="text-2xs text-ink-secondary">QR 없이 · 업주 번호</span>
                </div>
              </div>
              <p className="mt-2 text-2xs leading-relaxed text-ink-muted">보유한 매장만 보입니다. 장수를 정하고 한 번 더 확인한 뒤 보냅니다.</p>
              <ul className="mt-2 space-y-1.5">
                {byVenue.map((g) => (
                  <li key={g.venueId}>
                    <button type="button"
                      onClick={() => setPlan({ ...g, venueName: g.name, via: 'phone', gameSeq: null })}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-input border card-aura-sub px-3 py-2 text-left transition-colors duration-[var(--dur-fast)] hover:bg-surface-high/50">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{g.name}</span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-accent-200">{g.ids.length}<span className="ml-0.5 text-2xs font-semibold text-ink-muted">장</span></span>
                      <Icon name="chevron-right" size={14} className="shrink-0 text-ink-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <VenueVoucherCounts rows={held === null ? null : byVenue} onVenue={onVenue && ((venueId) => { onClose(); onVenue(venueId); })} />

          {/* ── 매장이용권 지갑 — 대시보드와 같은 정본(킬스위치 OFF 면 스스로 아무것도 그리지 않는다) ──
              본인인증 CTA 는 시트 안에서 끝낼 수 없으니 내 정보로 넘긴다.
              매장 머리글을 누르면 발급 매장으로 — 사슬 끝에서 막다른 길을 만들지 않는다. */}
          <VoucherWallet
            compact
            onNeedVerify={() => { onClose(); onOpenWallet(); }}
            onVenue={onVenue && ((venueId) => { onClose(); onVenue(venueId); })}
          />

          {/* ⚠ 보내기 시트는 반드시 **Modal 안쪽**에 그린다(형제로 내보내면 안 된다).
              Modal 은 열려 있는 동안 document 에 focusin 리스너를 걸고, 포커스가 자기 밖으로
              나가면 자기 첫 포커스 대상으로 되잡는다(Modal.tsx onFocusIn). 이 시트를 </Modal> 밖에
              두면 **부모 Modal 이 계속 open** 이라(여기서 onClose 를 부르지 않는다) 그 가드가 살아 있고,
              전화번호 입력칸을 눌러도 포커스가 즉시 헤더 '닫기' 로 끌려가 한 글자도 안 들어간다.
              실측 2026-09-08: 클릭 후 activeElement = BUTTON[aria-label=닫기] · 11자 입력 후 value=""
              → 수동 보내기 경로가 완주 불가였다.
              바로 위 VoucherWallet 의 사용 시트도 같은 방식(손으로 짠 fixed 오버레이)인데 Modal
              **자식**이라 멀쩡하다 — 그 구조에 맞춘다. */}
          {plan && (
            <SendVouchersSheet
              plan={plan}
              onCancel={() => setPlan(null)}
              /** 이용권 없이 요청만 — 바인 QR 경로에서만 나온다(수동에는 '요청' 개념이 없다) */
              onPlainBuyin={() => { const p = plan; setPlan(null); onClose(); onBuyin?.(p.venueId, p.gameSeq); }}
              onDone={(msg) => { setPlan(null); reloadHeld(); toast.show(msg, 'success'); onClose(); }}
            />
          )}

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
function VenueVoucherCounts({ rows: all, onVenue }: {
  /** 보유 묶음 — 시트가 한 번 읽어 내려준다(예전엔 이 컴포넌트가 따로 또 조회했다). null=로딩 중 */
  rows: { venueId: string; name: string; ids: string[] }[] | null;
  onVenue?: (venueId: string) => void;
}) {
  const { user } = useAuth();
  const idOn = useIdentityEnabled();
  const rows = all === null ? null : all.slice(0, 5).map((g) => ({ venueId: g.venueId, name: g.name, count: g.ids.length }));
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


/**
 * 이용권 보내기 — **장수 → (수동이면 업주 번호) → 확인** 세 걸음.
 *
 * 오너 2026-09-08: "몇 장을 보낼 것인지 질문" + "보내는 사람이 실수하지 않게 확실하게 확인(더블체킹)".
 *
 * 더블체크를 '버튼 두 번'으로 하지 않는다 — 확인 화면에서 버튼만 하나 더 누르는 건 손가락이
 * 이미 그 자리에 있어서 그냥 눌린다. **체크박스로 장수를 다시 인정**하게 만든 뒤에야 보내기가 열린다.
 * (이용권은 되돌릴 수 없다: 사용 처리가 장부 요청을 만들고 그 요청을 업주가 승인한다.)
 *
 * 경로 둘 다 **현장 증빙이 있다**:
 *   · via='qr'    — 방금 그 매장의 바인 QR 을 찍었다(스캔 결과가 곧 매장 id).
 *   · via='phone' — 업주 전화번호. 서버가 입력 번호와 업주 번호 일치를 강제한다.
 *   무증빙 경로(redeem_my_voucher)는 폐지됐다(2026-09-07) — 여기서도 되살리지 않는다.
 */
function SendVouchersSheet({ plan, onCancel, onDone, onPlainBuyin }: {
  plan: { venueId: string; venueName: string; ids: string[]; via: 'qr' | 'phone'; gameSeq: number | null };
  onCancel: () => void;
  onDone: (message: string) => void;
  onPlainBuyin: () => void;
}) {
  const toast = useToast();
  // escape: ESC 가 이 시트만 닫는다 — 예전엔 부모 Modal(이용권·출석)의 ESC 리스너가 시트째 통째로 닫았다(MODAL-01).
  useBackClose(true, onCancel, { escape: true });
  const max = plan.ids.length;
  const [count, setCount] = useState(1);
  const [step, setStep] = useState<'count' | 'phone' | 'confirm'>('count');
  const [phone, setPhone] = useState('');
  const [target, setTarget] = useState<TransferTarget | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  // 장수가 바뀌면 확인을 무효화한다 — '3장'을 인정해 놓고 5장으로 바꿔 보내는 길을 막는다.
  const setCountSafe = (n: number) => { setCount(Math.min(max, Math.max(1, n))); setAgreed(false); };

  const lookupPhone = async () => {
    setBusy(true);
    try {
      // find_user_by_phone 은 업주·admin 전용이라 일반 유저에겐 0행이 온다(에러가 아니다).
      // 서버가 어차피 번호 일치를 강제하므로 조회는 '되면 좋은 확인'으로 낮추고 매장명으로 세운다.
      const t = (await findUserByPhone(phone))[0] ?? null;
      setTarget(t ?? { id: '', display: plan.venueName });
    } catch { setTarget({ id: '', display: plan.venueName }); }
    setBusy(false);
    setStep('confirm');
  };

  const send = async () => {
    setBusy(true);
    const ids = plan.ids.slice(0, count);
    const r = plan.via === 'qr'
      ? await redeemMyVouchersByQr(ids, plan.venueId)
      : await redeemMyVouchersByPhone(ids, phone);
    setBusy(false);
    // 부분 성공을 전량 성공으로 말하지 않는다 — 그 한 문장이 장부에서 다툼이 된다.
    if (r.ok === 0) { toast.show(r.reasons[0] || '보내지 못했어요', 'error'); return; }
    onDone(r.failed > 0
      ? `${plan.venueName} ${r.ok}장 전송 · ${r.failed}장 실패(${r.reasons[0] ?? '사유 미상'})`
      : `${plan.venueName} ${r.ok}장 전송 완료`);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="닫기" onClick={onCancel} className="absolute inset-0 overscroll-contain bg-black/70" />
      {/* aria-modal: 스크린리더가 뒤의 이용권 지갑을 같은 화면으로 읽지 않게(MODAL-03). 포커스 되잡기는 부모 Modal 이 한다(위 주석). */}
      <div role="dialog" aria-modal="true" aria-label="이용권 보내기"
        className="relative w-full max-w-md space-y-3 rounded-t-dialog border border-border-default bg-surface-mid p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-sheet-up sm:rounded-dialog sm:pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-ink-primary">{plan.venueName}</p>
            <p className="text-2xs text-ink-muted">
              보유 {max}장 · {plan.via === 'qr' ? '바인 QR 확인됨' : 'QR 없이 보내기'}
            </p>
          </div>
          <button type="button" onClick={onCancel} aria-label="닫기" className="hit shrink-0 text-ink-muted"><Icon name="close" size={18} /></button>
        </div>

        {step === 'count' && (<>
          <p className="text-2xs text-ink-muted">몇 장을 보낼까요?</p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setCountSafe(count - 1)} disabled={count <= 1}
              aria-label="한 장 줄이기"
              className="btn-ghost h-11 w-11 shrink-0 text-lg font-bold disabled:opacity-40">−</button>
            <input type="number" inputMode="numeric" min={1} max={max} value={count}
              onChange={(e) => setCountSafe(Number(e.target.value) || 1)}
              aria-label="보낼 장수"
              className="input h-11 min-w-0 flex-1 text-center text-lg font-extrabold tabular-nums" />
            <button type="button" onClick={() => setCountSafe(count + 1)} disabled={count >= max}
              aria-label="한 장 늘리기"
              className="btn-ghost h-11 w-11 shrink-0 text-lg font-bold disabled:opacity-40">+</button>
          </div>
          {/* 자주 쓰는 장수 — 1장이 대부분이고, 전량은 '남김없이'를 한 번에 고르는 길 */}
          <div className="flex gap-1.5">
            {[1, 2, 3].filter((n) => n <= max).map((n) => (
              <button key={n} type="button" onClick={() => setCountSafe(n)}
                className={`min-h-[40px] flex-1 rounded-input border text-sm font-bold tabular-nums transition-colors ${count === n ? 'border-accent-400 bg-accent-400/15 text-accent-200' : 'border-border-default text-ink-secondary'}`}>{n}장</button>
            ))}
            {max > 3 && (
              <button type="button" onClick={() => setCountSafe(max)}
                className={`min-h-[40px] flex-1 rounded-input border text-sm font-bold tabular-nums transition-colors ${count === max ? 'border-accent-400 bg-accent-400/15 text-accent-200' : 'border-border-default text-ink-secondary'}`}>전량 {max}장</button>
            )}
          </div>
          <button type="button" onClick={() => setStep(plan.via === 'phone' ? 'phone' : 'confirm')}
            className="btn-primary min-h-[44px] w-full text-sm">다음</button>
          {/* 바인 QR 로 들어온 경우에만 — 이용권을 안 쓰고 요청만 보내는 길(현장 결제) */}
          {plan.via === 'qr' && (
            <button type="button" onClick={onPlainBuyin} className="btn-ghost w-full text-2xs">
              이용권 없이 참가 요청만 보내기(현장 결제)
            </button>
          )}
        </>)}

        {step === 'phone' && (
          <div className="space-y-2">
            <p className="text-2xs text-ink-muted">발급 매장 <b className="text-ink-secondary">업주 전화번호</b>를 입력하세요. 번호가 맞아야 서버가 보내 줍니다.</p>
            <input value={phone} onChange={(e) => { setPhone(e.target.value); setTarget(null); setAgreed(false); }}
              inputMode="tel" autoComplete="tel" placeholder="010-0000-0000" aria-label="업주 전화번호"
              className="input h-11 w-full text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep('count')} className="btn-ghost h-11 flex-1 text-sm">뒤로</button>
              <button type="button" disabled={busy || phone.replace(/[^0-9]/g, '').length < 10} onClick={lookupPhone}
                className="btn-primary h-11 flex-1 text-sm disabled:opacity-50">{busy ? '조회 중…' : '받는 곳 확인'}</button>
            </div>
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-3">
            {/* 확인 카드 — 되돌릴 수 없는 값 셋(어디로 · 몇 장 · 남는 장수)을 한눈에 */}
            <dl className="space-y-1.5 rounded-input border border-amber-500/40 bg-amber-500/[0.08] px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-2xs text-ink-muted">받는 곳</dt>
                <dd className="min-w-0 truncate text-sm font-bold text-ink-primary">{target?.display || plan.venueName}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-2xs text-ink-muted">보낼 장수</dt>
                <dd className="text-base font-extrabold tabular-nums text-accent-200">{count}장</dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="shrink-0 text-2xs text-ink-muted">보낸 뒤 남는 장수</dt>
                <dd className="text-sm font-bold tabular-nums text-ink-secondary">{max - count}장</dd>
              </div>
            </dl>
            <p className="text-2xs leading-relaxed text-ink-muted">보낸 이용권은 <b className="text-ink-secondary">되돌릴 수 없습니다.</b> 매장 장부에 사용 요청으로 올라가고 운영자가 승인합니다.</p>
            {/* 더블체크 — 버튼을 한 번 더 누르는 건 확인이 아니다. 장수를 다시 인정하게 만든다. */}
            <label className="flex cursor-pointer items-start gap-2 rounded-input border border-border-default px-3 py-2.5">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent-400))]" />
              <span className="text-2xs font-semibold text-ink-secondary">
                네, <b className="text-ink-primary">{target?.display || plan.venueName}</b>에 <b className="tabular-nums text-ink-primary">{count}장</b>을 보냅니다.
              </span>
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep(plan.via === 'phone' ? 'phone' : 'count')} className="btn-ghost h-11 flex-1 text-sm">뒤로</button>
              <button type="button" disabled={!agreed || busy} onClick={send} data-testid="voucher-send-confirm"
                className="btn-primary inline-flex h-11 flex-1 items-center justify-center gap-1 text-sm disabled:opacity-50">
                {busy ? '보내는 중…' : <><Icon name="check" size={14} /> {count}장 보내기</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
