// src/components/features/CustomerDashboardPage.tsx
// 손님 대시보드 — 전체 페이지(모바일 포함). 헤더 🎟 버튼으로 진입.
// 내 매장이용권(매장별) + 매장 이용내역(방문·머니인·금액). 매장이용권은 금전적 가치 없음.
// 사용(회수) = 발급 매장 QR 스캔 또는 그 매장 업주 전화번호로만. 유저 간 전송 불가.
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../atoms/Icon';
import { Html5Qrcode } from 'html5-qrcode';
import {
  listMyVouchers, myVisitedVenues, myPlayHistory,
  redeemMyVoucher, redeemMyVoucherByQr, redeemMyVoucherByPhone,
  type Voucher, type VisitedVenue, type PlayHistory,
} from '../../api/vouchers';
import { wonToMan } from '../../api/ledger';
import { getMyReservations, cancelMyReservation, type MyReservationRow } from '../../api/reservations';
import { getMyRankingHistory, type MyRankingRow } from '../../api/rankings';
import { BADGES, getMyBadgeStats, type BadgeStats } from '../../lib/loyalty';

function parseVenueId(text: string): string | null {
  const t = text.trim();
  if (t.startsWith('NURIV-VENUE:')) return t.slice('NURIV-VENUE:'.length).trim();
  try { const u = new URL(t); const c = u.searchParams.get('checkin'); if (c) return c; } catch { /* not a url */ }
  if (/^[0-9a-fA-F-]{36}$/.test(t)) return t;
  return null;
}

interface Stack { venueId: string; venueName: string; title: string; ids: string[] }

export default function CustomerDashboardPage({ open, onClose, unread = [], onOpenNotification }: {
  open: boolean; onClose: () => void;
  /** 미읽음 알림 미리보기(상위 3개) — 프로필 메뉴까지 안 가도 되게 */
  unread?: { id: string; title: string; message: string; createdAt: string }[];
  onOpenNotification?: (id: string) => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [visits, setVisits] = useState<VisitedVenue[]>([]);
  const [plays, setPlays] = useState<PlayHistory[]>([]);
  const [resv, setResv] = useState<MyReservationRow[]>([]);   // 대회 참가(예약) 이력
  const [ranks, setRanks] = useState<MyRankingRow[]>([]);     // 내 입상 기록(닉네임 기준)
  const [loading, setLoading] = useState(false);
  const [redeem, setRedeem] = useState<Stack | null>(null);
  const [badgeStats, setBadgeStats] = useState<BadgeStats | null>(null); // 내 업적(랭킹 탭에서 이전)

  const reload = () => {
    setLoading(true);
    Promise.all([
      listMyVouchers(), myVisitedVenues(), myPlayHistory(),
      getMyReservations().catch(() => [] as MyReservationRow[]),
      user?.nickname ? getMyRankingHistory(user.nickname).catch(() => [] as MyRankingRow[]) : Promise.resolve([] as MyRankingRow[]),
    ])
      .then(([vs, vi, pl, rv, rk]) => { setVouchers(vs); setVisits(vi); setPlays(pl); setResv(rv); setRanks(rk); })
      .catch(() => {}).finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) reload(); }, [open]);
  useEffect(() => { if (open && user) getMyBadgeStats(user.nickname ?? null, user.activityPoints ?? 0).then(setBadgeStats).catch(() => {}); }, [open, user]);

  if (!open) return null;

  const active = vouchers.filter((v) => v.status === 'active');
  const venueMap = new Map<string, { name: string; stacks: Map<string, Stack> }>();
  for (const v of active) {
    const vid = v.venueId; const vname = v.venueName ?? '기타 매장';
    if (!venueMap.has(vid)) venueMap.set(vid, { name: vname, stacks: new Map() });
    const g = venueMap.get(vid)!;
    if (!g.stacks.has(v.title)) g.stacks.set(v.title, { venueId: vid, venueName: vname, title: v.title, ids: [] });
    g.stacks.get(v.title)!.ids.push(v.id);
  }
  const venueGroups = [...venueMap.entries()].map(([vid, g]) => ({ vid, name: g.name, stacks: [...g.stacks.values()] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  const usageMap = new Map<string, { name: string; visits: number; moneyin: number; amount: number; lastAt: string | null }>();
  for (const x of visits) usageMap.set(x.venueId, { name: x.venueName ?? '매장', visits: x.visits, moneyin: 0, amount: 0, lastAt: null });
  for (const p of plays) {
    const e = usageMap.get(p.venueId) ?? { name: p.venueName ?? '매장', visits: 0, moneyin: 0, amount: 0, lastAt: null };
    e.moneyin = p.moneyinCount; e.amount = p.totalAmount; e.lastAt = p.lastAt;
    usageMap.set(p.venueId, e);
  }
  const usage = [...usageMap.values()].sort((a, b) => (b.moneyin + b.visits) - (a.moneyin + a.visits));
  // 하이라이트 — 총 머니인/누적액 + 최다 머니인(횟수) 매장 + 최다 머니인(금액) 매장
  const totalMoneyin = plays.reduce((s, p) => s + p.moneyinCount, 0);
  const totalSpent = plays.reduce((s, p) => s + p.totalAmount, 0);
  const topMoneyin = [...usage].filter((u) => u.moneyin > 0).sort((a, b) => b.moneyin - a.moneyin)[0] ?? null;
  const topAmount = [...usage].filter((u) => u.amount > 0).sort((a, b) => b.amount - a.amount)[0] ?? null;
  const fmtDate = (iso: string | null) => { if (!iso) return ''; const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-surface-base">
      <header className="flex h-header-h shrink-0 items-center gap-2 border-b border-border-subtle px-page-x">
        <button type="button" onClick={onClose} aria-label="닫기" className="flex h-9 w-9 items-center justify-center rounded-full text-ink-secondary hover:bg-surface-high">
          <Icon name="back" size={20} />
        </button>
        <h1 className="text-base font-bold text-ink-primary">내 대시보드</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-page-x py-section">
          {/* 미읽음 알림 미리보기 — 상위 3개(탭하면 해당 화면으로) */}
          {unread.length > 0 && (
            <section className="rounded-card border border-gold-400/30 bg-gold-300/[0.05] p-3">
              <p className="mb-1.5 text-sm font-bold text-gold-300">🔔 안 읽은 알림 {unread.length > 3 ? '(' + unread.length + ')' : ''}</p>
              <ul className="space-y-1">
                {unread.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => onOpenNotification?.(n.id)}
                      className="w-full rounded-input bg-surface-high/50 px-2.5 py-2 text-left hover:bg-surface-high transition-colors">
                      <p className="truncate text-xs font-bold text-ink-primary">{n.title}</p>
                      <p className="truncate text-2xs text-ink-muted">{n.message}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {/* 업적 — 조건 달성 시 자동으로 열리는 뱃지(커뮤니티 랭킹에서 이전) */}
          {badgeStats && (
            <section className="rounded-card border border-border-default bg-surface-low p-3">
              <p className="mb-2 text-sm font-bold text-ink-primary">🏅 내 업적 <span className="text-2xs font-normal text-ink-muted">{BADGES.filter((b) => b.check(badgeStats)).length}/{BADGES.length} 달성</span></p>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {BADGES.map((b) => {
                  const got = b.check(badgeStats);
                  return (
                    <div key={b.key} title={b.desc}
                      className={['rounded-card border p-2.5 text-center transition-colors', got ? 'border-gold-400/50 bg-gold-300/[0.08]' : 'border-border-subtle bg-surface-high opacity-55'].join(' ')}>
                      <p className={['text-xl leading-none', got ? '' : 'grayscale'].join(' ')}>{b.emoji}</p>
                      <p className={['mt-1 text-xs font-bold', got ? 'text-gold-300' : 'text-ink-secondary'].join(' ')}>{b.label}</p>
                      <p className="mt-0.5 text-2xs leading-tight text-ink-muted">{b.desc}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
          {/* 내 계정 — 받는 아이디 · 본인인증(매장이용권 수령 조건) */}
          <section className="rounded-card border border-border-default bg-surface-low p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-400/15 text-base font-bold text-gold-300">
                {(user?.nickname ?? user?.name ?? '?').slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink-primary">{user?.nickname ?? user?.name ?? '회원'}</p>
                <p className="truncate text-2xs text-ink-muted">{user?.verified && user?.realName ? user.realName : '플레이어'}</p>
              </div>
              {user?.verified
                ? <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-2xs font-bold text-emerald-300">본인인증 완료</span>
                : <span className="shrink-0 rounded-full bg-danger/15 px-2 py-0.5 text-2xs font-bold text-danger">미인증</span>}
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div className="rounded-input border border-border-subtle bg-surface-base px-2.5 py-1.5">
                <p className="text-[10px] text-ink-muted">받는 아이디</p>
                <p className="truncate text-xs font-bold text-ink-primary">{user?.nickname ? '@' + user.nickname : <span className="text-amber-300">미설정</span>}</p>
              </div>
              <div className="rounded-input border border-border-subtle bg-surface-base px-2.5 py-1.5">
                <p className="text-[10px] text-ink-muted">이용권 수령</p>
                <p className={`truncate text-xs font-bold ${user?.verified ? 'text-emerald-300' : 'text-danger'}`}>{user?.verified ? '가능' : '인증 필요'}</p>
              </div>
            </div>
            {!user?.verified && (
              <p className="mt-2 text-2xs leading-relaxed text-amber-300/90">⚠ 본인인증을 완료해야 매장이용권을 받을 수 있어요. 프로필에서 인증을 진행하세요.</p>
            )}
            {user?.verified && !user?.nickname && (
              <p className="mt-2 text-2xs leading-relaxed text-amber-300/90">⚠ 받는 아이디(닉네임)를 설정하면 업주가 더 쉽게 이용권을 보낼 수 있어요. 프로필에서 설정하세요.</p>
            )}
          </section>

          <div className="rounded-card border border-amber-500/40 bg-amber-500/[0.08] p-3">
            <p className="text-sm font-bold text-amber-300">⚠️ 매장이용권은 금전적 가치가 없습니다</p>
            <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">현금·포인트가 아니며 환불·현금화·유저 간 거래가 불가합니다. 발급한 매장에서 사용(회수)만 가능합니다.</p>
          </div>

          {/* 하이라이트 요약 — 보유 이용권·방문·머니인·최다 머니인 매장/금액 */}
          {!loading && (usage.length > 0 || active.length > 0) && (
            <section className="space-y-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="보유 이용권" value={`${active.length}장`} accent />
                <Stat label="방문 매장" value={`${usage.length}곳`} />
                <Stat label="총 머니인" value={`${totalMoneyin}회`} />
                <Stat label="누적 머니인액" value={totalSpent ? wonToMan(totalSpent) + '만' : '-'} accent />
              </div>
              {(topMoneyin || topAmount) && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {topMoneyin && <HiCard title="최다 머니인 매장" name={topMoneyin.name} detail={`머니인 ${topMoneyin.moneyin}회 · 누적 ${topMoneyin.amount ? wonToMan(topMoneyin.amount) + '만' : '-'}`} />}
                  {topAmount && <HiCard title="최다 머니인 금액" name={topAmount.name} detail={`${wonToMan(topAmount.amount)}만 · ${topAmount.moneyin}회`} />}
                </div>
              )}
            </section>
          )}

          <section>
            <p className="mb-1.5 text-sm font-bold text-ink-primary">내 매장이용권 <span className="text-gold-300">{active.length}</span></p>
            {loading ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
              : venueGroups.length === 0 ? <p className="py-6 text-center text-2xs text-ink-muted">보유한 매장이용권이 없습니다.</p>
                : <div className="space-y-3">{venueGroups.map((g) => (
                  <div key={g.vid} className="rounded-card border border-border-default bg-surface-low p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink-primary">
                      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-gold-300" /><span className="min-w-0 truncate">{g.name}</span>
                    </p>
                    <ul className="space-y-1.5">{g.stacks.map((s) => (
                      <li key={s.title} className="flex items-center gap-2 rounded-input border border-gold-400/40 bg-gold-300/[0.05] px-3 py-2">
                        <span className="text-base" aria-hidden>🎟</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{s.title} <span className="text-2xs text-ink-muted">×{s.ids.length}</span></span>
                        <button type="button" onClick={() => setRedeem(s)} className="btn-primary shrink-0 px-3 text-2xs">사용하기</button>
                      </li>
                    ))}</ul>
                  </div>
                ))}</div>}
          </section>

          <section>
            <p className="mb-1.5 text-sm font-bold text-ink-primary">매장 이용·참가 내역</p>
            {loading ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
              : usage.length === 0 ? <p className="py-6 text-center text-2xs text-ink-muted">방문·머니인 기록이 아직 없습니다.</p>
                : <ul className="space-y-1.5">{usage.map((u, i) => (
                  <li key={i} className="rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-ink-primary">{u.name}</p>
                      {u.lastAt && <span className="shrink-0 text-[10px] text-ink-muted">최근 {fmtDate(u.lastAt)}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-2xs text-ink-muted">
                      <span>방문 <b className="text-ink-secondary tabular-nums">{u.visits}</b>회</span>
                      <span>머니인 <b className="text-ink-secondary tabular-nums">{u.moneyin}</b>회</span>
                      <span>누적 <b className="text-gold-300 tabular-nums">{u.amount ? wonToMan(u.amount) + '만' : '-'}</b></span>
                    </div>
                  </li>
                ))}</ul>}
          </section>

          {/* 대회 참가(예약) 내역 — 내가 예약했던 대회들 */}
          <section>
            <p className="mb-1.5 text-sm font-bold text-ink-primary">대회 참가 내역 <span className="text-2xs font-normal text-ink-muted">(참가 예약 기준)</span></p>
            {loading ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
              : resv.length === 0 ? <p className="py-6 text-center text-2xs text-ink-muted">아직 참가 예약한 대회가 없습니다.</p>
                : <ul className="space-y-1.5">{resv.slice(0, 15).map((r) => {
                  const upcoming = r.date >= new Date().toLocaleDateString('en-CA');
                  return (
                  <SwipeCancelRow
                    key={`${r.scheduleId}-${r.reservedAt}`}
                    cancelable={upcoming}
                    onCancel={async () => {
                      try {
                        await cancelMyReservation(r.scheduleId);
                        toast.show('예약을 취소했습니다', 'success');
                        setResv((prev) => prev.filter((x) => x.scheduleId !== r.scheduleId));
                      } catch (e) {
                        toast.show(e instanceof Error ? e.message : '예약 취소 실패', 'error');
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-semibold text-ink-primary">{r.title}
                        {upcoming && <span className="ml-1.5 rounded-badge bg-emerald-400/15 px-1.5 py-0.5 text-2xs font-bold text-emerald-400 align-middle">예정</span>}
                      </p>
                      <span className="shrink-0 text-[10px] tabular-nums text-ink-muted">{r.date}{r.startTime ? ` ${r.startTime.slice(0, 5)}` : ''}</span>
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-2xs text-ink-muted">
                      {r.venueName && <span>{r.venueName}</span>}
                      <span>예약명 <b className="text-ink-secondary">{r.displayName}</b></span>
                    </p>
                  </SwipeCancelRow>
                  );
                })}</ul>}
            {resv.some((r) => r.date >= new Date().toLocaleDateString('en-CA')) && (
              <p className="mt-1 text-2xs text-ink-muted">예정 예약은 왼쪽으로 밀면(PC는 마우스 올리면) 취소할 수 있어요.</p>
            )}
          </section>

          {/* 내 입상 기록 — 매장 순위 등록에서 내 닉네임이 잡힌 이력 */}
          <section>
            <p className="mb-1.5 text-sm font-bold text-ink-primary">내 입상 기록 <span className="text-2xs font-normal text-ink-muted">(매장 순위 등록 기준)</span></p>
            {loading ? <p className="py-6 text-center text-2xs text-ink-muted">불러오는 중…</p>
              : !user?.nickname ? <p className="py-6 text-center text-2xs text-ink-muted">프로필에서 아이디(닉네임)를 설정하면 입상 기록이 자동 연결됩니다.</p>
              : ranks.length === 0 ? <p className="py-6 text-center text-2xs text-ink-muted">아직 입상 기록이 없습니다 — 매장에서 순위가 등록되면 자동으로 표시됩니다.</p>
                : <><RankTrendChart rows={ranks} />
                <ul className="space-y-1.5">{ranks.slice(0, 15).map((r, i) => (
                  <li key={i} className="flex items-center gap-2.5 rounded-input border border-border-subtle bg-surface-low px-3 py-2">
                    <span className={['flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-extrabold tabular-nums',
                      r.position === 1 ? 'bg-gold-300 text-ink-inverse' : r.position === 2 ? 'bg-slate-300 text-ink-inverse' : r.position === 3 ? 'bg-amber-700 text-white' : 'bg-surface-float text-ink-secondary'].join(' ')}>
                      {r.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink-primary">{r.venueName}</p>
                      <p className="text-[10px] tabular-nums text-ink-muted">{r.date}</p>
                    </div>
                    {r.prize && <span className="shrink-0 text-xs font-bold tabular-nums text-gold-300">{r.prize}점</span>}
                  </li>
                ))}</ul></>}
          </section>
        </div>
      </div>

      {redeem && <RedeemSheet stack={redeem} onClose={() => setRedeem(null)} onDone={() => { setRedeem(null); reload(); }} />}
    </div>
  );
}

/** 예약 행 스와이프 취소 — 모바일은 왼쪽으로 밀고, PC는 호버로 취소 버튼 노출. */
function SwipeCancelRow({ cancelable, onCancel, children }: { cancelable: boolean; onCancel: () => void; children: React.ReactNode }) {
  const [dx, setDx] = useState(0);
  const [busy, setBusy] = useState(false);
  const start = useRef<{ x: number; y: number; dx: number } | null>(null);
  const REVEAL = 76; // 취소 버튼 폭
  const onTouchStart = (e: React.TouchEvent) => {
    if (!cancelable) return;
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, dx };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!cancelable || !start.current) return;
    const mx = e.touches[0].clientX - start.current.x;
    const my = e.touches[0].clientY - start.current.y;
    if (Math.abs(my) > Math.abs(mx)) return; // 세로 스크롤 우선
    setDx(Math.min(0, Math.max(-REVEAL - 14, start.current.dx + mx)));
  };
  const onTouchEnd = () => {
    if (!cancelable) return;
    start.current = null;
    setDx((v) => (v <= -REVEAL / 2 ? -REVEAL : 0)); // 절반 넘게 밀면 열림 고정
  };
  const fire = async () => {
    if (busy) return;
    setBusy(true);
    try { await onCancel(); } finally { setBusy(false); setDx(0); }
  };
  return (
    <li className="group relative overflow-hidden rounded-input border border-border-subtle bg-surface-low">
      {cancelable && (
        <button
          type="button" onClick={fire} disabled={busy}
          className="absolute inset-y-0 right-0 flex w-[76px] items-center justify-center bg-danger text-xs font-bold text-white active:opacity-80 disabled:opacity-60"
        >
          {busy ? '취소 중…' : '예약 취소'}
        </button>
      )}
      <div
        className={[
          'relative bg-surface-low px-3 py-2 transition-transform duration-150 ease-out',
          // PC: 호버 시 살짝 밀려 취소 버튼이 보인다(터치 불가 환경 대응)
          cancelable ? 'md:group-hover:-translate-x-[76px]' : '',
        ].join(' ')}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </li>
  );
}

/** 내 전적 그래프 — 순위 추이(시간순, 1위가 위). 최근 15개. */
function RankTrendChart({ rows }: { rows: MyRankingRow[] }) {
  // rows는 최신순 → 시간순으로 뒤집고 최근 15개만
  const pts = [...rows].slice(0, 15).reverse();
  if (pts.length < 2) return null; // 1개뿐이면 추세가 없어 리스트만 보여준다
  const W = 560, H = 130, PAD_X = 26, PAD_T = 14, PAD_B = 22;
  const maxPos = Math.max(4, ...pts.map((p) => p.position));
  const x = (i: number) => PAD_X + (i * (W - PAD_X * 2)) / (pts.length - 1);
  const y = (pos: number) => PAD_T + ((pos - 1) * (H - PAD_T - PAD_B)) / (maxPos - 1 || 1);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.position).toFixed(1)}`).join(' ');
  const avg = Math.round((pts.reduce((s, p) => s + p.position, 0) / pts.length) * 10) / 10;
  const best = Math.min(...pts.map((p) => p.position));
  const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  return (
    <div className="mb-2 rounded-card border border-border-subtle bg-surface-low p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-bold text-ink-secondary">순위 추이 <span className="font-normal text-ink-muted">(최근 {pts.length}회 · 위로 갈수록 높은 순위)</span></p>
        <p className="text-2xs text-ink-muted">최고 <b className="text-gold-300">{best}위</b> · 평균 <b className="text-ink-secondary">{avg}위</b></p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full" role="img" aria-label="내 순위 추이 그래프">
        {/* 가이드선: 1위/중간/하단 */}
        {[1, Math.ceil(maxPos / 2), maxPos].map((g) => (
          <g key={g}>
            <line x1={PAD_X} y1={y(g)} x2={W - PAD_X} y2={y(g)} stroke="#2B3139" strokeWidth="1" strokeDasharray={g === 1 ? '' : '3 4'} />
            <text x={PAD_X - 5} y={y(g) + 3.5} textAnchor="end" fontSize="10" fill="#848E9C">{g}위</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="#FCD535" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.position)} r={p.position <= 3 ? 4.5 : 3.5}
              fill={p.position === 1 ? '#FCD535' : p.position <= 3 ? '#B7BDC6' : '#474D57'}
              stroke="#181A20" strokeWidth="1.5" />
            {/* 라벨은 표본이 적을 때만 전부, 많으면 듬성듬성(겹침 방지) */}
            {(pts.length <= 8 || i % 2 === 0 || i === pts.length - 1) && (
              <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="9.5" fill="#848E9C">{md(p.date)}</text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

function RedeemSheet({ stack, onClose, onDone }: { stack: Stack; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'menu' | 'qr' | 'phone'>('menu');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const vid = stack.ids[0];

  const doDirect = async () => {
    if (!window.confirm(`'${stack.venueName}'에서 이용권을 사용(전송)할까요? 되돌릴 수 없습니다.`)) return;
    setBusy(true);
    try { const n = await redeemMyVoucher(vid); toast.show(`${n} 이용권 사용 완료`, 'success'); onDone(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '사용 실패', 'error'); setBusy(false); }
  };
  const doQr = async (text: string) => {
    const venueId = parseVenueId(text);
    if (!venueId) { toast.show('매장 QR이 아닙니다', 'error'); setMode('menu'); return; }
    setBusy(true);
    try { const n = await redeemMyVoucherByQr(vid, venueId); toast.show(`${n} 이용권 사용 완료`, 'success'); onDone(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '사용 실패', 'error'); setBusy(false); setMode('menu'); }
  };
  const doPhone = async () => {
    setBusy(true);
    try { const n = await redeemMyVoucherByPhone(vid, phone); toast.show(`${n} 이용권 사용 완료`, 'success'); onDone(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '사용 실패', 'error'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative w-full max-w-md space-y-3 rounded-t-dialog border border-border-default bg-surface-mid p-4 animate-slide-up sm:rounded-dialog">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-bold text-ink-primary">{stack.venueName} · {stack.title}</p>
          <button type="button" onClick={onClose} aria-label="닫기" className="shrink-0 text-lg leading-none text-ink-muted">✕</button>
        </div>
        {mode === 'menu' && (<>
          <p className="text-2xs text-ink-muted">발급 매장(<b className="text-ink-secondary">{stack.venueName}</b>)에서만 사용됩니다. 방법을 선택하세요.</p>
          <button type="button" disabled={busy} onClick={doDirect} className="btn-primary w-full text-sm disabled:opacity-50">✅ 이 매장으로 바로 전송(사용)</button>
          <button type="button" onClick={() => setMode('qr')} className="btn-ghost w-full text-sm">📷 매장 QR 스캔해서 사용</button>
          <button type="button" onClick={() => setMode('phone')} className="btn-ghost w-full text-sm">📞 매장 업주 전화번호로 전송</button>
        </>)}
        {mode === 'qr' && (
          <div className="space-y-2">
            <p className="text-2xs text-ink-muted">매장에 비치된 QR을 비춰 주세요. (카메라 권한 필요)</p>
            <QrScanner onResult={doQr} onError={(m) => { toast.show(m, 'error'); setMode('menu'); }} />
            <button type="button" onClick={() => setMode('menu')} className="btn-ghost w-full text-2xs">취소</button>
          </div>
        )}
        {mode === 'phone' && (
          <div className="space-y-2">
            <p className="text-2xs text-ink-muted">발급 매장 <b className="text-ink-secondary">업주 전화번호</b>를 입력하세요.</p>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="010-0000-0000" className="input w-full text-sm" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setMode('menu')} className="btn-ghost flex-1 text-sm">뒤로</button>
              <button type="button" disabled={busy} onClick={doPhone} className="btn-primary flex-1 text-sm disabled:opacity-50">{busy ? '처리 중…' : '사용'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function QrScanner({ onResult, onError }: { onResult: (text: string) => void; onError: (msg: string) => void }) {
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let done = false;
    const stop = () => { const s = scanner; scanner = null; if (s) { s.stop().then(() => s.clear()).catch(() => {}); } };
    (async () => {
      try {
        scanner = new Html5Qrcode('nuri-qr-reader');
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 },
          (text) => { if (!done) { done = true; const r = text; stop(); onResult(r); } },
          () => {});
      } catch (e) { onError(e instanceof Error ? e.message : '카메라를 열 수 없습니다. 권한을 확인하세요.'); }
    })();
    return () => { done = true; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div id="nuri-qr-reader" className="mx-auto w-full max-w-[280px] overflow-hidden rounded-input bg-black" style={{ minHeight: 220 }} />;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-input border border-border-subtle bg-surface-low p-2 text-center">
      <p className={`text-base font-extrabold leading-none tabular-nums ${accent ? 'text-gold-300' : 'text-ink-primary'}`}>{value}</p>
      <p className="mt-1 text-[10px] text-ink-muted">{label}</p>
    </div>
  );
}

function HiCard({ title, name, detail }: { title: string; name: string; detail: string }) {
  return (
    <div className="rounded-card border border-gold-400/30 bg-gold-300/[0.05] p-3">
      <p className="text-2xs font-bold text-gold-300">{title}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-ink-primary">{name}</p>
      <p className="text-2xs text-ink-muted">{detail}</p>
    </div>
  );
}
