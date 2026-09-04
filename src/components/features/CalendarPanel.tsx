// 캘린더 — 파이프라인의 **유저 쪽 거울**(오너 지시 2026-09-04).
//
// 한 화면에서 사슬이 보여야 한다: 찜한 게임 → 예약 → 바이인(참가) → 머니인(입상).
// 같은 날짜에 이 넷이 모이므로 월 그리드가 그 연결을 가장 잘 드러낸다.
// 여기에 자동으로 못 잡는 값(현금 게임·타 매장)을 담는 수기 뱅크롤을 나란히 둔다.
//
// 설계 원칙:
//  · 자동 집계와 수기 기록을 **합산하지 않는다.** 바이인은 장부에서, 입상은 순위에서 오는
//    '사실'이고 뱅크롤은 유저의 '주장'이다. 섞으면 어느 쪽이 틀렸는지 영원히 못 가린다.
//  · 새 데이터는 찜·뱅크롤 둘뿐. 예약·입상은 사슬 위쪽 기존 함수를 그대로 쓴다.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { getMyReservations, type MyReservationRow } from '../../api/reservations';
import { getMyRankingHistory, type MyRankingRow } from '../../api/rankings';
import {
  getMyBuyinHistory, getMyLikedScheduleIds, getMyBankroll, addBankrollEntry, deleteBankrollEntry,
  type BuyinRow, type BankrollEntry,
} from '../../api/calendar';
import type { Schedule } from '../../api/schedules';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
const ymd = (d: Date) => d.toLocaleDateString('en-CA');
const won = (n: number) => n.toLocaleString('ko-KR');

/** 한 날짜에 걸린 항목들 — 마커 색과 상세 목록의 단일 출처 */
type Kind = 'like' | 'reserve' | 'buyin' | 'cash' | 'bankroll';
const KIND: Record<Kind, { label: string; dot: string; icon: Parameters<typeof Icon>[0]['name'] }> = {
  like:     { label: '찜',     dot: 'bg-fuchsia-400', icon: 'heart' },
  reserve:  { label: '예약',   dot: 'bg-indigo-400',  icon: 'calendar-check' },
  buyin:    { label: '바이인', dot: 'bg-cyan-400',    icon: 'chip' },
  cash:     { label: '머니인', dot: 'bg-gold-300',    icon: 'trophy' },
  bankroll: { label: '뱅크롤', dot: 'bg-emerald-400', icon: 'notebook' },
};

// scheduleId 를 들고 다니는 이유: 목록에서 대회 상세로 이어질 때 제목+날짜로 되찾으면
// 같은 날 동명 대회에서 엉뚱한 카드가 열린다. 사슬을 잇는 링크는 id 로만 건다.
interface DayItem { kind: Kind; title: string; detail: string; amount?: number; scheduleId?: string }

export default function CalendarPanel({ schedules, onSelect, active }: {
  schedules: Schedule[];
  onSelect: (s: Schedule) => void;
  /** 탭이 화면에 떠 있는가 — keep-alive 라 숨어 있을 때 로드하지 않는다 */
  active: boolean;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const today = ymd(new Date());
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [picked, setPicked] = useState<string>(today);

  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [reservations, setReservations] = useState<MyReservationRow[]>([]);
  const [buyins, setBuyins] = useState<BuyinRow[]>([]);
  const [ranks, setRanks] = useState<MyRankingRow[]>([]);
  const [bankroll, setBankroll] = useState<BankrollEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(() => {
    if (!user) { setLoaded(true); return; }
    void Promise.allSettled([
      getMyLikedScheduleIds(), getMyReservations(200), getMyBuyinHistory(200),
      getMyRankingHistory(user.nickname ?? '', 200), getMyBankroll(300),
    ]).then(([l, r, b, k, w]) => {
      if (l.status === 'fulfilled') setLikes(l.value);
      if (r.status === 'fulfilled') setReservations(r.value);
      if (b.status === 'fulfilled') setBuyins(b.value);
      if (k.status === 'fulfilled') setRanks(k.value);
      if (w.status === 'fulfilled') setBankroll(w.value);
      setLoaded(true);
    });
  }, [user]);
  // keep-alive 탭이라 '보일 때' 처음 한 번만 — 숨어 있는 동안 왕복을 만들지 않는다
  useEffect(() => { if (active && !loaded) reload(); }, [active, loaded, reload]);

  /** 날짜 → 항목들. 다섯 소스를 하나의 맵으로 모으는 곳이 여기 하나뿐이어야 마커와 목록이 안 어긋난다. */
  const byDate = useMemo(() => {
    const m = new Map<string, DayItem[]>();
    const push = (date: string, item: DayItem) => {
      if (!date) return;
      const arr = m.get(date); if (arr) arr.push(item); else m.set(date, [item]);
    };
    schedules.forEach((s) => {
      if (likes.has(s.id)) push(s.date, { kind: 'like', title: s.title, detail: s.pubName ?? '', scheduleId: s.id });
    });
    reservations.forEach((r) => push(r.date, {
      kind: 'reserve', title: r.title, scheduleId: r.scheduleId,
      detail: [r.venueName, r.startTime?.slice(0, 5)].filter(Boolean).join(' · '),
    }));
    buyins.forEach((b) => push(b.sessionDate, {
      kind: 'buyin', title: b.title || b.venueName || '바이인',
      detail: [b.venueName, b.entryNo ? `${b.entryNo}엔트리` : ''].filter(Boolean).join(' · '),
      amount: b.amount,
    }));
    ranks.forEach((r) => push(r.date, {
      kind: 'cash', title: `${r.position}위`, detail: [r.venueName, r.prize].filter(Boolean).join(' · '),
    }));
    bankroll.forEach((e) => push(e.entryDate, {
      kind: 'bankroll', title: e.amount > 0 ? `+${won(e.amount)}` : won(e.amount),
      detail: e.memo, amount: e.amount,
    }));
    return m;
  }, [schedules, likes, reservations, buyins, ranks, bankroll]);

  // 월 그리드 — 앞뒤 빈칸 포함 6주 고정(달마다 높이가 바뀌면 아래 목록이 위아래로 튄다 = CLS)
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [cursor]);

  const monthLabel = `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
  const dayItems = byDate.get(picked) ?? [];
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);

  // 이번 달 요약 — 파이프라인 결과를 숫자 한 줄로. 뱅크롤은 '합산하지 않고' 따로 센다.
  const summary = useMemo(() => {
    const pre = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const inMonth = (d: string) => d.startsWith(pre);
    return {
      buyinCount: buyins.filter((b) => inMonth(b.sessionDate)).length,
      buyinSum: buyins.filter((b) => inMonth(b.sessionDate)).reduce((a, b) => a + b.amount, 0),
      cashCount: ranks.filter((r) => inMonth(r.date)).length,
      bankrollSum: bankroll.filter((e) => inMonth(e.entryDate)).reduce((a, e) => a + e.amount, 0),
    };
  }, [cursor, buyins, ranks, bankroll]);

  if (!user) {
    return (
      <div className="px-page-x py-section">
        <section className="rounded-aura border card-aura p-6 text-center">
          <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-input tile-grad" aria-hidden>
            <Icon name="calendar" size={20} />
          </span>
          <p className="text-sm font-bold text-ink-primary">로그인하면 내 캘린더가 열려요</p>
          <p className="mt-1 text-2xs leading-relaxed text-ink-secondary">
            예약한 게임 · 찜한 게임 · 바이인 · 머니인 기록이 날짜별로 모이고,<br />뱅크롤을 직접 기록할 수 있어요.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-page-x py-section">
      {/* 월 이동 */}
      <div className="flex items-center justify-between">
        <button type="button" aria-label="이전 달" className="tap-y-44 -my-1 p-1 text-ink-secondary hover:text-ink-primary"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          <Icon name="chevron-left" size={20} />
        </button>
        <h2 className="font-display text-lg font-bold tracking-tight text-ink-primary">{monthLabel}</h2>
        <button type="button" aria-label="다음 달" className="tap-y-44 -my-1 p-1 text-ink-secondary hover:text-ink-primary"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      {/* 이번 달 요약 — 바이인/머니인은 '사실', 뱅크롤은 '내 기록'이라 나란히 둔다 */}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="바이인" value={`${summary.buyinCount}회`} sub={summary.buyinSum > 0 ? `${won(summary.buyinSum)}원` : undefined} tone="cyan" />
        <Stat label="머니인" value={`${summary.cashCount}회`} tone="gold" />
        <Stat label="내 기록" value={`${summary.bankrollSum >= 0 ? '+' : ''}${won(summary.bankrollSum)}`} tone={summary.bankrollSum >= 0 ? 'emerald' : 'danger'} />
      </div>

      {/* 월 그리드 */}
      <section className="rounded-aura border card-aura p-2">
        <div className="grid grid-cols-7 pb-1">
          {DAYS_KO.map((d, i) => (
            <span key={d} className={['text-center text-2xs font-semibold', i === 0 ? 'text-danger-light' : i === 6 ? 'text-accent-200' : 'text-ink-muted'].join(' ')}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d) => {
            const key = ymd(d);
            const items = byDate.get(key);
            const outside = d.getMonth() !== cursor.getMonth();
            const isToday = key === today;
            const isPicked = key === picked;
            // 마커는 종류당 하나씩만 — 같은 날 바이인 3회여도 점 3개가 아니라 점 1개다(정보 밀도 ≠ 소음)
            const kinds = items ? [...new Set(items.map((i) => i.kind))] : [];
            return (
              <button key={key} type="button" onClick={() => setPicked(key)}
                aria-label={`${d.getMonth() + 1}월 ${d.getDate()}일${kinds.length ? ` · ${kinds.map((k) => KIND[k].label).join(' ')}` : ''}`}
                aria-pressed={isPicked}
                className={[
                  'flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-input transition-colors',
                  isPicked ? 'chip-aura' : 'hover:bg-surface-high/50',
                  outside ? 'opacity-35' : '',
                ].join(' ')}>
                <span className={['text-xs tabular-nums', isToday ? 'font-extrabold text-accent-200' : 'font-medium text-ink-primary'].join(' ')}>
                  {d.getDate()}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {kinds.slice(0, 4).map((k) => <span key={k} className={`h-1 w-1 rounded-full ${KIND[k].dot}`} />)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 선택한 날 */}
      <section className="rounded-aura border card-aura p-3">
        <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad" aria-hidden>
            <Icon name="calendar" size={14} />
          </span>
          <h3 className="text-sm font-bold text-ink-primary">
            {Number(picked.slice(5, 7))}월 {Number(picked.slice(8, 10))}일
          </h3>
          <span className="text-2xs tabular-nums text-ink-muted">{dayItems.length}건</span>
        </div>
        {!loaded ? (
          <div className="space-y-1 pt-2" aria-busy="true">
            {[0, 1].map((i) => <div key={i} className="skeleton h-[44px] rounded-input" />)}
          </div>
        ) : dayItems.length === 0 ? (
          <p className="py-6 text-center text-2xs text-ink-muted">이 날은 기록이 없어요</p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {dayItems.map((it, i) => {
              // 찜·예약은 대회 상세로 이어진다 — 사슬을 끊지 않는다
              const s = it.scheduleId ? scheduleById.get(it.scheduleId) : undefined;
              const Row = (
                <>
                  <span className={['flex h-6 w-6 shrink-0 items-center justify-center rounded-full', KIND[it.kind].dot, 'bg-opacity-20'].join(' ')} aria-hidden>
                    <Icon name={KIND[it.kind].icon} size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-primary">{it.title}</span>
                    {it.detail && <span className="block truncate text-2xs text-ink-muted">{KIND[it.kind].label} · {it.detail}</span>}
                  </span>
                  {it.amount != null && (
                    <span className={['shrink-0 text-xs font-bold tabular-nums',
                      it.kind === 'bankroll' ? (it.amount >= 0 ? 'stat-emerald' : 'text-danger-light') : 'text-ink-secondary'].join(' ')}>
                      {it.kind === 'buyin' ? `${won(it.amount)}원` : ''}
                    </span>
                  )}
                </>
              );
              const cls = 'flex w-full min-h-[var(--row-h-sm)] items-center gap-2.5 rounded-input px-2 py-1.5 text-left';
              return (
                <li key={`${it.kind}:${i}`}>
                  {s ? (
                    <button type="button" onClick={() => onSelect(s)} className={`${cls} transition-colors hover:bg-surface-high/50`}>{Row}</button>
                  ) : (
                    <div className={cls}>{Row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BankrollCard date={picked} rows={bankroll} onChanged={reload} toast={toast} />

      {/* 이름 매칭 안내 — 바이인이 안 잡히는 유일한 이유라 화면에서 미리 알려준다 */}
      <p className="px-1 text-2xs leading-relaxed text-ink-muted">
        바이인·머니인 기록은 매장 장부에 적힌 <b className="text-ink-secondary">이름</b>으로 찾습니다.
        기록이 비어 있다면 내 정보에서 실명·닉네임이 매장에 알린 이름과 같은지 확인해 주세요.
      </p>

      {/* 찜한 다가올 게임 — 캘린더 밖에서도 한눈에 */}
      {likes.size > 0 && (
        <section className="rounded-aura border card-aura p-3">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-fuchsia" aria-hidden>
              <Icon name="heart" size={14} />
            </span>
            <h3 className="text-sm font-bold text-ink-primary">찜한 게임</h3>
            <span className="text-2xs tabular-nums text-ink-muted">{likes.size}개</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {schedules.filter((s) => likes.has(s.id) && s.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)
              .map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => onSelect(s)}
                    className="flex w-full min-h-[var(--row-h-sm)] items-center gap-2.5 rounded-input px-2 py-1.5 text-left transition-colors hover:bg-surface-high/50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-primary">{s.title}</span>
                      <span className="block truncate text-2xs text-ink-muted">{s.date.slice(5).replace('-', '.')} · {s.pubName}</span>
                    </span>
                    <Icon name="chevron-right" size={14} className="shrink-0 text-ink-muted" />
                  </button>
                </li>
              ))}
          </ul>
          {schedules.filter((s) => likes.has(s.id) && s.date >= today).length === 0 && (
            <p className="py-4 text-center text-2xs text-ink-muted">다가오는 찜한 게임이 없어요</p>
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'cyan' | 'gold' | 'emerald' | 'danger' }) {
  const cls = tone === 'cyan' ? 'text-cyan-300' : tone === 'gold' ? 'text-gold-300' : tone === 'emerald' ? 'stat-emerald' : 'text-danger-light';
  return (
    <div className="rounded-input border border-border-subtle bg-surface-low p-2 text-center">
      <p className={`text-base font-extrabold leading-none tabular-nums ${cls}`}>{value}</p>
      <p className="mt-1 text-2xs text-ink-muted">{label}</p>
      {sub && <p className="text-2xs tabular-nums text-ink-muted">{sub}</p>}
    </div>
  );
}

/** 수기 뱅크롤 — 자동 집계가 못 잡는 현금 게임·타 매장 결과를 유저가 직접 +/- 로 적는다. */
function BankrollCard({ date, rows, onChanged, toast }: {
  date: string;
  rows: BankrollEntry[];
  onChanged: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast: { show: (m: string, t?: any) => void };
}) {
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const dayRows = rows.filter((r) => r.entryDate === date);
  const total = rows.reduce((a, r) => a + r.amount, 0);

  const add = async (sign: 1 | -1) => {
    const n = Math.trunc(Number(amount.replace(/[^0-9]/g, '')));
    if (!n) { toast.show('금액을 입력해 주세요', 'error'); return; }
    setBusy(true);
    try {
      await addBankrollEntry({ entryDate: date, amount: n * sign, memo });
      setAmount(''); setMemo('');
      toast.show(sign > 0 ? '플러스로 기록했어요' : '마이너스로 기록했어요', 'success');
      onChanged();
    } catch (e) {
      toast.show(e instanceof Error ? e.message : '기록 실패', 'error');
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try { await deleteBankrollEntry(id); onChanged(); }
    catch (e) { toast.show(e instanceof Error ? e.message : '삭제 실패', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <section className="rounded-aura border card-aura p-3">
      <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-cyan" aria-hidden>
          <Icon name="notebook" size={14} />
        </span>
        <div className="flex min-w-0 flex-1 items-baseline gap-x-2">
          <h3 className="text-sm font-bold text-ink-primary">뱅크롤 기록</h3>
          <span className="text-2xs text-ink-secondary">직접 적는 장부</span>
        </div>
        <span className={['shrink-0 text-sm font-extrabold tabular-nums', total >= 0 ? 'stat-emerald' : 'text-danger-light'].join(' ')}>
          {total >= 0 ? '+' : ''}{won(total)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric"
          placeholder="금액" aria-label="금액" className="input min-w-0 flex-1 text-sm tabular-nums" />
        <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={40}
          placeholder="메모(선택)" aria-label="메모" className="input min-w-0 flex-1 text-sm" />
        <div className="flex gap-1.5">
          <button type="button" onClick={() => add(1)} disabled={busy}
            className="min-h-[44px] rounded-input border border-emerald-400/50 bg-emerald-400/10 px-3 text-sm font-bold stat-emerald disabled:opacity-50">＋</button>
          <button type="button" onClick={() => add(-1)} disabled={busy}
            className="min-h-[44px] rounded-input border border-danger/40 bg-danger/10 px-3 text-sm font-bold text-danger-light disabled:opacity-50">－</button>
        </div>
      </div>

      {dayRows.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {dayRows.map((r) => (
            <li key={r.id} className="flex min-h-[var(--row-h-sm)] items-center gap-2 rounded-input px-2">
              <span className={['shrink-0 text-sm font-bold tabular-nums', r.amount >= 0 ? 'stat-emerald' : 'text-danger-light'].join(' ')}>
                {r.amount >= 0 ? '+' : ''}{won(r.amount)}
              </span>
              <span className="min-w-0 flex-1 truncate text-2xs text-ink-muted">{r.memo}</span>
              <button type="button" onClick={() => remove(r.id)} disabled={busy}
                aria-label="기록 삭제" className="shrink-0 p-2 text-ink-muted hover:text-danger-light disabled:opacity-40">
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
