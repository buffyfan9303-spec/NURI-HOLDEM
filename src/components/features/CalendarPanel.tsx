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
//
// ⚠ 로딩 계약(2026-09-04 리뷰에서 잡힌 결함 3종의 처방):
//   ① 사용자가 바뀌면 **반드시 다시 읽는다** — 예전엔 loaded 래치가 user 를 안 봐서
//      비로그인으로 열어 둔 뒤 로그인하면 빈 화면이 고정됐고, 계정을 바꾸면 이전 사용자
//      데이터가 그대로 남았다(개인정보 문제).
//   ② 탭이 다시 보일 때 **다시 읽는다** — 상세 모달에서 찜/예약을 해도 캘린더가 세션 내내 낡아 있었다.
//   ③ 실패를 '기록 없음'으로 위장하지 않는다 — LoadErrorCard 로 드러내고 재시도를 준다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon, { type IconName } from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import LoadErrorCard from '../atoms/LoadErrorCard';
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
/** 뱅크롤 상한 — int4(약 21.4억) 를 넘기면 서버가 영문 Postgres 오류를 던진다. 입력 단계에서 막는다. */
const BANKROLL_MAX = 2_000_000_000;

/** 한 날짜에 걸린 항목들 — 마커 색과 상세 목록의 단일 출처.
 *  색은 라이트 테마에서도 대비가 서는 토큰 계열만 쓴다(기본 Tailwind 400 톤은 흰 카드 위 1.4~3:1 로 무너진다). */
type Kind = 'like' | 'reserve' | 'buyin' | 'cash' | 'bankroll';
const KIND: Record<Kind, { label: string; dot: string; icon: IconName }> = {
  like:     { label: '찜',     dot: 'dot-like',     icon: 'heart' },
  reserve:  { label: '예약',   dot: 'dot-reserve',  icon: 'calendar-check' },
  buyin:    { label: '바이인', dot: 'dot-buyin',    icon: 'chip' },
  cash:     { label: '머니인', dot: 'dot-cash',     icon: 'trophy' },
  bankroll: { label: '뱅크롤', dot: 'dot-bankroll', icon: 'notebook' },
};

// scheduleId 를 들고 다니는 이유: 목록에서 대회 상세로 이어질 때 제목+날짜로 되찾으면
// 같은 날 동명 대회에서 엉뚱한 카드가 열린다. 사슬을 잇는 링크는 id 로만 건다.
interface DayItem { kind: Kind; title: string; detail: string; amount?: number; scheduleId?: string; venueId?: string }

const BUYIN_LIMIT = 300;
const RANK_LIMIT = 300;

export default function CalendarPanel({ schedules, onSelect, onVenue, onLogin, active }: {
  schedules: Schedule[];
  onSelect: (s: Schedule) => void;
  /** 바이인·머니인 행 → 그 매장 페이지. 없으면 행이 클릭되지 않을 뿐 화면은 그대로(내 매장 안에서는 안 넘긴다) */
  onVenue?: (venueId: string) => void;
  /** 비로그인 안내에서 바로 로그인 — 없으면 버튼을 그리지 않는다(무반응 클릭 금지) */
  onLogin?: () => void;
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
  const [err, setErr] = useState<unknown>(null);

  const uid = user?.id ?? null;
  const reload = useCallback(async () => {
    if (!uid) { setLoaded(true); setErr(null); return; }
    setErr(null);
    const r = await Promise.allSettled([
      getMyLikedScheduleIds(), getMyReservations(200), getMyBuyinHistory(BUYIN_LIMIT),
      getMyRankingHistory(user?.nickname ?? '', RANK_LIMIT), getMyBankroll(300),
    ]);
    const [l, rv, b, k, w] = r;
    if (l.status === 'fulfilled') setLikes(l.value);
    if (rv.status === 'fulfilled') setReservations(rv.value);
    if (b.status === 'fulfilled') setBuyins(b.value);
    if (k.status === 'fulfilled') setRanks(k.value);
    if (w.status === 'fulfilled') setBankroll(w.value);
    // 하나라도 실패하면 드러낸다 — 조회 실패를 '기록 없음'으로 보여주면 유저가 영원히 원인을 모른다.
    const failed = r.find((x) => x.status === 'rejected');
    if (failed && failed.status === 'rejected') setErr(failed.reason);
    setLoaded(true);
  }, [uid, user?.nickname]);

  // ① 사용자가 바뀌면 화면을 비우고 다시 읽는다(계정 전환 시 이전 데이터 잔존 방지).
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadedForRef.current === uid) return;
    loadedForRef.current = uid;
    setLikes(new Set()); setReservations([]); setBuyins([]); setRanks([]); setBankroll([]);
    setLoaded(false); setErr(null);
  }, [uid]);

  // ② 탭이 '보이게 될 때' 읽는다. 숨어 있는 동안은 왕복을 만들지 않고,
  //    다시 보이면 새로 읽어 상세 모달에서 한 찜·예약이 반영된다(keep-alive 라 마운트가 안 일어난다).
  const wasActive = useRef(false);
  useEffect(() => {
    const became = active && !wasActive.current;
    wasActive.current = active;
    if (active && (!loaded || became)) void reload();
  }, [active, loaded, reload]);

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
      amount: b.amount, venueId: b.venueId ?? undefined,
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

  // 조회창 하한 — 상한(BUYIN_LIMIT·RANK_LIMIT)에 걸려 더 옛 기록이 안 들어왔을 수 있다.
  // 그 사실을 숨기면 '기록이 없다'와 '아직 안 불러왔다'가 구분되지 않는다.
  const oldestLoaded = useMemo(() => {
    const ds = [...buyins.map((b) => b.sessionDate), ...ranks.map((r) => r.date)].filter(Boolean).sort();
    return ds[0] ?? null;
  }, [buyins, ranks]);

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

  const monthPrefix = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
  const dayItems = byDate.get(picked) ?? [];
  const scheduleById = useMemo(() => new Map(schedules.map((s) => [s.id, s])), [schedules]);

  // 이번 달 요약 — 파이프라인 결과를 숫자 한 줄로. 뱅크롤은 '합산하지 않고' 따로 센다.
  const summary = useMemo(() => {
    const inMonth = (d: string) => d.startsWith(monthPrefix);
    const mb = buyins.filter((b) => inMonth(b.sessionDate));
    return {
      buyinCount: mb.length,
      buyinSum: mb.reduce((a, b) => a + b.amount, 0),
      cashCount: ranks.filter((r) => inMonth(r.date)).length,
      bankrollSum: bankroll.filter((e) => inMonth(e.entryDate)).reduce((a, e) => a + e.amount, 0),
    };
  }, [monthPrefix, buyins, ranks, bankroll]);

  // 선택한 날 열리는 대회(승인된 것만) — 새 쿼리 없이 이미 받은 schedules 에서 뽑는다
  const dayOpenGames = useMemo(
    () => schedules.filter((s) => s.date === picked && s.approved)
      .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')),
    [schedules, picked],
  );

  // 찜 목록과 헤더 카운트는 **같은 배열**에서 나와야 한다(예전엔 헤더가 전체 찜 수라 0줄에도 'N개'가 떴다)
  const likedUpcoming = useMemo(
    () => schedules.filter((s) => likes.has(s.id) && s.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
    [schedules, likes, today],
  );

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
          {/* 막다른 길 금지 — 비로그인 모바일에서 이 화면이 5번째 칸이라 여기서 로그인으로 갈 수 있어야 한다 */}
          {onLogin && (
            <button type="button" onClick={onLogin} className="btn-primary mt-4 w-full max-w-[220px] py-2.5 text-sm">
              로그인하기
            </button>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-page-x py-section">
      {/* 월 이동 */}
      <div className="flex items-center justify-between">
        <button type="button" aria-label="이전 달" className="hit -my-1 p-1 text-ink-secondary hover:text-ink-primary"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>
          <Icon name="chevron-left" size={20} />
        </button>
        <h2 className="font-display text-lg font-bold tracking-tight text-ink-primary">
          {cursor.getFullYear()}년 {cursor.getMonth() + 1}월
        </h2>
        <button type="button" aria-label="다음 달" className="hit -my-1 p-1 text-ink-secondary hover:text-ink-primary"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>
          <Icon name="chevron-right" size={20} />
        </button>
      </div>

      {err != null && <LoadErrorCard error={err} what="내 기록" onRetry={() => { setLoaded(false); void reload(); }} compact />}

      {/* 이번 달 요약 — 바이인/머니인은 '사실', 뱅크롤은 '내 기록'이라 나란히 둔다.
          sub 줄은 값이 없어도 자리를 지킨다(조건부로 넣으면 월을 옮길 때마다 아래가 15px 밀린다 = CLS). */}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat label="바이인" value={`${summary.buyinCount}회`} sub={summary.buyinSum > 0 ? `${won(summary.buyinSum)}원` : ' '} tone="cyan" />
        <Stat label="머니인" value={`${summary.cashCount}회`} sub=" " tone="gold" />
        <Stat label="내 기록" value={`${summary.bankrollSum >= 0 ? '+' : ''}${won(summary.bankrollSum)}`} sub=" " tone={summary.bankrollSum >= 0 ? 'emerald' : 'danger'} />
      </div>

      {/* 월 그리드 — 이 화면의 주인공 면이라 아우라 헤어라인(.ring-aura)을 준다.
          글로우(.ring-aura-glow)는 쓰지 않는다: 화면당 1곳 규칙의 '주인공'은 지금 진행 중인 무언가를
          가리키는 신호인데, 캘린더는 상시 화면이라 늘 빛나면 신호가 아니라 배경이 된다. */}
      <section className="rounded-aura border card-aura ring-aura p-2">
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
          // 스켈레톤 높이는 실제 행(44px)과 같아야 로드 완료 시 아래가 안 밀린다
          <ul className="mt-1 space-y-0.5" aria-busy="true">
            {[0, 1].map((i) => <li key={i} className="skeleton h-[44px] rounded-input" />)}
          </ul>
        ) : dayItems.length === 0 ? (
          <p className="py-6 text-center text-2xs text-ink-muted">
            이 날은 기록이 없어요
            {oldestLoaded && picked < oldestLoaded && (
              <><br /><span className="text-ink-secondary">{oldestLoaded.replace(/-/g, '.')} 이전 기록은 아직 불러오지 않았어요</span></>
            )}
          </p>
        ) : (
          <ul className="mt-1 space-y-0.5">
            {dayItems.map((it, i) => {
              const s = it.scheduleId ? scheduleById.get(it.scheduleId) : undefined;
              // 대회로 갈 수 없으면 매장으로라도 잇는다 — 사슬 끝에서 막다른 길을 만들지 않는다
              const vid = !s && it.venueId && onVenue ? it.venueId : undefined;
              const Row = (
                <>
                  <span className={['flex h-6 w-6 shrink-0 items-center justify-center rounded-full', KIND[it.kind].dot, 'bg-opacity-20'].join(' ')} aria-hidden>
                    <Icon name={KIND[it.kind].icon} size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-primary">{it.title}</span>
                    {it.detail && <span className="block truncate text-2xs text-ink-muted">{KIND[it.kind].label} · {it.detail}</span>}
                  </span>
                  {/* 금액은 바이인에만 붙인다 — 뱅크롤은 title 이 이미 '+12,000' 이라 여기 또 쓰면 중복이다
                      (예전엔 뱅크롤에도 span 을 그려 항상 빈 문자열 + gap 만 먹는 죽은 칸이었다) */}
                  {it.kind === 'buyin' && it.amount != null && (
                    <span className="shrink-0 text-xs font-bold tabular-nums text-ink-secondary">{won(it.amount)}원</span>
                  )}
                </>
              );
              const cls = 'flex w-full min-h-[var(--row-h-sm)] items-center gap-2.5 rounded-input px-2 py-1.5 text-left';
              return (
                <li key={`${it.kind}:${i}`}>
                  {s ? (
                    <button type="button" onClick={() => onSelect(s)} className={`${cls} transition-colors hover:bg-surface-high/50`}>{Row}</button>
                  ) : vid ? (
                    <button type="button" onClick={() => onVenue!(vid)} className={`${cls} transition-colors hover:bg-surface-high/50`}>{Row}</button>
                  ) : (
                    <div className={cls}>{Row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* 이 날 열리는 대회 — 사슬의 첫 칸(노출 → 찜/예약).
          위 마커에는 섞지 않는다: 마커는 '내 기록'이라 남의 일정이 들어가면 신호가 죽는다.
          여기서 대회를 눌러 상세로 가면 찜·예약 버튼이 있으므로, 캘린더가 '보는 곳'에서
          '시작하는 곳'이 된다(예전엔 찜이 0개인 신규 유저에게 영원히 빈 화면이었다). 새 쿼리 0건. */}
      {dayOpenGames.length > 0 && (
        <section className="rounded-aura border card-aura p-3">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-indigo" aria-hidden>
              <Icon name="cards" size={14} />
            </span>
            <h3 className="text-sm font-bold text-ink-primary">이 날 열리는 대회</h3>
            <span className="text-2xs tabular-nums text-ink-muted">{dayOpenGames.length}개</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {dayOpenGames.slice(0, 10).map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onSelect(s)}
                  className="flex w-full min-h-[var(--row-h-sm)] items-center gap-2.5 rounded-input px-2 py-1.5 text-left transition-colors hover:bg-surface-high/50">
                  {likes.has(s.id) && <span className="shrink-0 rounded-chip chip-aura px-1.5 py-0.5 text-2xs font-bold">찜</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-primary">{s.title}</span>
                    <span className="block truncate text-2xs text-ink-muted">
                      {[s.startTime?.slice(0, 5), s.pubName].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <Icon name="chevron-right" size={14} className="shrink-0 text-ink-muted" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <BankrollCard date={picked} rows={bankroll} onChanged={reload} toast={toast} />

      {/* 이름 매칭 안내 — 기록이 비는 이유를 화면에서 미리 알려준다.
          ⚠ 바이인과 머니인은 **매칭 기준이 다르다**: 바이인은 장부의 이름(실명·닉네임·name 3개 중 하나),
          머니인은 순위표의 **닉네임만**(rankings.getMyRankingHistory 가 nickname 한 컬럼만 대조한다).
          예전 문구는 둘을 뭉뚱그려 '장부의 이름'이라고만 해서 머니인이 안 잡히는 이유를 못 짚어 줬다. */}
      <p className="px-1 text-2xs leading-relaxed text-ink-muted">
        <b className="text-ink-secondary">바이인</b>은 매장 장부에 적힌 이름(실명·닉네임)으로,{' '}
        <b className="text-ink-secondary">머니인</b>은 순위표의 <b className="text-ink-secondary">닉네임</b>으로 찾습니다.
        기록이 비어 있다면 내 정보에서 그 이름들이 매장에 알린 이름과 같은지 확인해 주세요.
        <br />
        내 이름과 <b className="text-ink-secondary">똑같은 이름을 쓰는 회원이 있으면</b> 그 이름의 바이인은
        보여 드리지 않습니다 — 남의 기록이 섞이는 것을 막기 위해서예요. 닉네임을 조금 바꾸면 다시 보입니다.
      </p>

      {/* 찜한 다가올 게임 — 캘린더 밖에서도 한눈에. 헤더 수와 목록은 같은 배열에서 나온다. */}
      {likedUpcoming.length > 0 && (
        <section className="rounded-aura border card-aura p-3">
          <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-fuchsia" aria-hidden>
              <Icon name="heart" size={14} />
            </span>
            <h3 className="text-sm font-bold text-ink-primary">찜한 게임</h3>
            <span className="text-2xs tabular-nums text-ink-muted">{likedUpcoming.length}개</span>
          </div>
          <ul className="mt-1 space-y-0.5">
            {likedUpcoming.slice(0, 8).map((s) => (
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
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'cyan' | 'gold' | 'emerald' | 'danger' }) {
  // stat-* 토큰은 라이트 오버라이드를 갖고 있다. cyan·gold 는 없어서 라이트 흰 카드 위 1.45:1 이었다 —
  // index.css 에 stat-cyan·stat-gold 를 추가하고 여기서 그것만 쓴다(하드 팔레트 금지).
  const cls = tone === 'cyan' ? 'stat-cyan' : tone === 'gold' ? 'stat-gold' : tone === 'emerald' ? 'stat-emerald' : 'text-danger-deep dark:text-danger-light';
  return (
    <div className="rounded-input border border-border-subtle bg-surface-low p-2 text-center">
      <p className={`text-base font-extrabold leading-none tabular-nums ${cls}`}>{value}</p>
      <p className="mt-1 text-2xs text-ink-muted">{label}</p>
      {/* 값이 없어도 자리를 지킨다 — 조건부 렌더는 월 이동마다 아래를 15px 밀어 올린다 */}
      <p className="text-2xs tabular-nums text-ink-muted">{sub ?? ' '}</p>
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
    // 상한을 클라이언트에서 막는다 — 넘기면 서버가 영문 Postgres 오류를 그대로 토스트에 뱉는다
    if (n > BANKROLL_MAX) { toast.show(`한 번에 ${won(BANKROLL_MAX)}원까지 기록할 수 있어요`, 'error'); return; }
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
        <span className={['shrink-0 text-sm font-extrabold tabular-nums', total >= 0 ? 'stat-emerald' : 'text-danger-deep dark:text-danger-light'].join(' ')}>
          {total >= 0 ? '+' : ''}{won(total)}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric"
          placeholder="금액" aria-label="금액" className="input min-w-0 flex-1 text-sm tabular-nums" />
        <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={40}
          placeholder="메모(선택)" aria-label="메모" className="input min-w-0 flex-1 text-sm" />
        <div className="flex gap-1.5">
          <button type="button" onClick={() => add(1)} disabled={busy} aria-label="플러스로 기록"
            className="min-h-[44px] rounded-input border border-emerald-400/50 bg-emerald-400/10 px-3 text-sm font-bold stat-emerald disabled:opacity-50">＋</button>
          <button type="button" onClick={() => add(-1)} disabled={busy} aria-label="마이너스로 기록"
            className="min-h-[44px] rounded-input border border-danger/40 bg-danger/10 px-3 text-sm font-bold text-danger-deep dark:text-danger-light disabled:opacity-50">－</button>
        </div>
      </div>

      {dayRows.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {dayRows.map((r) => (
            <li key={r.id} className="flex min-h-[var(--row-h-sm)] items-center gap-2 rounded-input px-2">
              <span className={['shrink-0 text-sm font-bold tabular-nums', r.amount >= 0 ? 'stat-emerald' : 'text-danger-deep dark:text-danger-light'].join(' ')}>
                {r.amount >= 0 ? '+' : ''}{won(r.amount)}
              </span>
              <span className="min-w-0 flex-1 truncate text-2xs text-ink-muted">{r.memo}</span>
              <button type="button" onClick={() => remove(r.id)} disabled={busy}
                aria-label="기록 삭제" className="hit shrink-0 p-2 text-ink-muted hover:text-danger-light disabled:opacity-40">
                <Icon name="trash" size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
