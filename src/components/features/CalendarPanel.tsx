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
import {
  getMyLikedScheduleIds, getMyBankroll, addBankrollEntry, deleteBankrollEntry,
  type BankrollEntry,
} from '../../api/calendar';
import type { Schedule } from '../../api/schedules';
import { investedOf, isMemoEntry, filterRoiRows, roiStats, roiNotice, ROI_MIN_EVENTS } from '../../lib/roi';

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;
const ymd = (d: Date) => d.toLocaleDateString('en-CA');
const won = (n: number) => n.toLocaleString('ko-KR');
/** 뱅크롤 상한 — int4(약 21.4억) 를 넘기면 서버가 영문 Postgres 오류를 던진다. 입력 단계에서 막는다. */
const BANKROLL_MAX = 2_000_000_000;

/** 한 날짜에 걸린 항목들 — 마커 색과 상세 목록의 단일 출처.
 *  색은 라이트 테마에서도 대비가 서는 토큰 계열만 쓴다(기본 Tailwind 400 톤은 흰 카드 위 1.4~3:1 로 무너진다). */
type Kind = 'like' | 'reserve' | 'bankroll' | 'memo';
const KIND: Record<Kind, { label: string; dot: string; icon: IconName }> = {
  like:     { label: '찜',     dot: 'dot-like',     icon: 'heart' },
  reserve:  { label: '예약',   dot: 'dot-reserve',  icon: 'calendar-check' },
  bankroll: { label: '뱅크롤', dot: 'dot-bankroll', icon: 'notebook' },
  // 기타 스케줄 — 예약과 색이 겹치면 마커로 구분이 안 되므로 비어 있는 골드 톤(dot-cash)을 쓴다
  memo:     { label: '일정',   dot: 'dot-cash',     icon: 'calendar' },
};

// scheduleId 를 들고 다니는 이유: 목록에서 대회 상세로 이어질 때 제목+날짜로 되찾으면
// 같은 날 동명 대회에서 엉뚱한 카드가 열린다. 사슬을 잇는 링크는 id 로만 건다.
interface DayItem { kind: Kind; title: string; detail: string; amount?: number; scheduleId?: string; venueId?: string }


export default function CalendarPanel({ schedules, onSelect, onOpenSchedule, onVenue, onLogin, active, resVersion = 0 }: {
  schedules: Schedule[];
  onSelect: (s: Schedule) => void;
  /** scheduleId 만 아는 항목(예약)을 열 때 — App 이 목록 → 없으면 권한을 지키는 단건 조회로 잇는다(F09).
   *  캘린더는 browse 탭이 아니라 목록이 낡을 수 있는 자리다: '없음' 으로 단정하면 살아 있는 대회가 막힌다. */
  onOpenSchedule?: (scheduleId: string, opts?: { fallbackVenueId?: string | null }) => void;
  /** 매장 페이지로 — 예약한 대회가 현재 로드된 일정에 없을 때의 대체 경로 */
  onVenue?: (venueId: string) => void;
  /** 비로그인 안내에서 바로 로그인 — 없으면 버튼을 그리지 않는다(무반응 클릭 금지) */
  onLogin?: () => void;
  /** 탭이 화면에 떠 있는가 — keep-alive 라 숨어 있을 때 로드하지 않는다 */
  active: boolean;
  /** 예약이 바뀌었다는 App 의 신호(F06). 캘린더가 떠 있는 채 위에서 예약/취소가 나면 여기서만 다시 읽는다.
   *  ⚠ 예약 표시만 갱신한다 — 수기 재무 기록(bankroll_entries)은 읽기 그대로, 장부 금액 자동 복제 없음. */
  resVersion?: number;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const today = ymd(new Date());
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [picked, setPicked] = useState<string>(today);

  const [likes, setLikes] = useState<Set<string>>(new Set());
  const [reservations, setReservations] = useState<MyReservationRow[]>([]);
  const [bankroll, setBankroll] = useState<BankrollEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  /** 셋 중 **뱅크롤 조회만** 실패했는가 — 문구와 LED 를 정확히 말하기 위해 따로 둔다(2026-09-10).
   *  err 은 '셋 중 하나라도' 라서, 이걸로 뭉뚱그리면 일정만 실패했을 때 '뱅크롤을 못 불러왔다'는 거짓말이 된다. */
  const [bankrollErr, setBankrollErr] = useState<unknown>(null);

  const uid = user?.id ?? null;
  const reload = useCallback(async () => {
    if (!uid) { setLoaded(true); setErr(null); setBankrollErr(null); return; }
    setErr(null); setBankrollErr(null);
    const r = await Promise.allSettled([
      getMyLikedScheduleIds(), getMyReservations(200), getMyBankroll(300),
    ]);
    const [l, rv, w] = r;
    if (l.status === 'fulfilled') setLikes(l.value);
    if (rv.status === 'fulfilled') setReservations(rv.value);
    if (w.status === 'fulfilled') setBankroll(w.value); else setBankrollErr(w.reason);
    // 하나라도 실패하면 드러낸다 — 조회 실패를 '기록 없음'으로 보여주면 유저가 영원히 원인을 모른다.
    const failed = r.find((x) => x.status === 'rejected');
    if (failed && failed.status === 'rejected') setErr(failed.reason);
    setLoaded(true);
  }, [uid]);

  // ① 사용자가 바뀌면 화면을 비우고 다시 읽는다(계정 전환 시 이전 데이터 잔존 방지).
  const loadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadedForRef.current === uid) return;
    loadedForRef.current = uid;
    setLikes(new Set()); setReservations([]); setBankroll([]);
    setLoaded(false); setErr(null); setBankrollErr(null);
  }, [uid]);

  // ② 탭이 '보이게 될 때' 읽는다. 숨어 있는 동안은 왕복을 만들지 않고,
  //    다시 보이면 새로 읽어 상세 모달에서 한 찜·예약이 반영된다(keep-alive 라 마운트가 안 일어난다).
  const wasActive = useRef(false);
  useEffect(() => {
    const became = active && !wasActive.current;
    wasActive.current = active;
    if (active && (!loaded || became)) void reload();
  }, [active, loaded, reload]);

  // ③ 캘린더 탭이 계속 떠 있는 동안 그 위(상세 모달·'내 정보')에서 예약/취소가 일어난 경우.
  //    ② 는 '다시 보이게 될 때'만 읽으므로 이 경우를 못 잡는다 — 숨어 있을 때 온 신호는 ② 가 흡수한다.
  const seenResV = useRef(resVersion);
  useEffect(() => {
    if (seenResV.current === resVersion) return;
    seenResV.current = resVersion;
    if (active) void reload();
  }, [resVersion, active, reload]);

  /** 날짜 → 항목들. 세 소스(찜·예약·수기)를 한 맵으로 모으는 곳이 여기 하나뿐이어야 마커와 목록이 안 어긋난다.
   *  ⚠ 매장 장부 바이인·랭킹 머니인은 **넣지 않는다**(오너 지시 2026-09-04) — 그건 유저가 직접 적는다. */
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
      kind: 'reserve', title: r.title, scheduleId: r.scheduleId, venueId: r.venueId ?? undefined,
      detail: [r.venueName, r.startTime?.slice(0, 5)].filter(Boolean).join(' · '),
    }));
    // 한 테이블(bankroll_entries)이 둘을 겸한다 — 금액이 있으면 뱅크롤, 0 이면 기타 스케줄(메모만).
    bankroll.forEach((e) => push(e.entryDate, isMemoEntry(e)
      ? { kind: 'memo', title: e.memo, detail: '' }
      : { kind: 'bankroll', title: e.amount > 0 ? `+${won(e.amount)}` : won(e.amount), detail: e.memo, amount: e.amount }));
    return m;
  }, [schedules, likes, reservations, bankroll]);

  // 조회창 하한 — 상한(BUYIN_LIMIT·RANK_LIMIT)에 걸려 더 옛 기록이 안 들어왔을 수 있다.
  // 그 사실을 숨기면 '기록이 없다'와 '아직 안 불러왔다'가 구분되지 않는다.
  const oldestLoaded = useMemo(() => {
    const ds = bankroll.map((e) => e.entryDate).filter(Boolean).sort();
    return ds[0] ?? null;
  }, [bankroll]);

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
    const mine = bankroll.filter((e) => inMonth(e.entryDate));
    return {
      reserveCount: reservations.filter((r) => inMonth(r.date)).length,
      likeCount: schedules.filter((s) => likes.has(s.id) && inMonth(s.date)).length,
      bankrollSum: mine.reduce((a, e) => a + e.amount, 0),
    };
  }, [monthPrefix, reservations, schedules, likes, bankroll]);

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
            예약한 대회와 찜한 대회가 날짜별로 모이고,<br />뱅크롤과 일정을 직접 적어 둘 수 있어요.
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

      {/* 2026-09-10 문구 정정 — '내 기록을(를) 불러오지 못했습니다' 는 무엇이 실패했는지 말하지 않고
          '을(를)' 이 그대로 노출됐다. 제목·보조를 이 화면만 덮는다(공용 템플릿은 그대로). */}
      {err != null && (
        <LoadErrorCard
          error={err}
          what={bankrollErr != null ? '뱅크롤 데이터' : '캘린더 정보'}
          title={bankrollErr != null ? '뱅크롤 데이터를 불러오지 못했습니다' : '캘린더 정보를 불러오지 못했습니다'}
          hint="로그인이 만료되었거나 데이터를 불러오는 중 문제가 발생했습니다."
          onRetry={() => { setLoaded(false); void reload(); }}
          compact
        />
      )}

      {/* 이번 달 요약 — 전부 '내가 한 것'이다(예약·찜·내가 적은 뱅크롤).
          매장 장부에서 끌어오는 값은 없다(오너 지시 2026-09-04).
          sub 줄은 값이 없어도 자리를 지킨다(조건부로 넣으면 월을 옮길 때마다 아래가 15px 밀린다 = CLS). */}
      {/* 2026-09-10 — '내 기록'은 무엇의 기록인지 말하지 않았다. '순손익'으로 바꾸되
          아래 카드의 '전체 누계 순손익'과 같은 낱말이 되므로 **sub 줄에 범위를 적는다**(§6 '범위가 문구로 구분됨').
          sub 는 이미 자리를 지키는 줄이라 높이 변화 0. */}
      <div className="grid grid-cols-3 gap-1.5">
        <Stat testId="sum-reserve" label="예약" value={`${summary.reserveCount}건`} sub="이번 달" tone="cyan" />
        <Stat testId="sum-like" label="찜" value={`${summary.likeCount}개`} sub="이번 달" tone="gold" />
        <Stat testId="sum-net" label="순손익" value={`${summary.bankrollSum >= 0 ? '+' : ''}${won(summary.bankrollSum)}`} sub="이번 달" tone={summary.bankrollSum >= 0 ? 'emerald' : 'danger'} />
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
                  'cal-day flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-input',
                  isPicked ? 'chip-aura shadow-glow' : 'hover:bg-surface-high/50',
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
              // 목록에 없는 예약(=이 탭이 낡았거나 목록 밖 대회)은 id 로 다시 확인해 연다.
              const byId = !s && it.scheduleId && onOpenSchedule ? it.scheduleId : undefined;
              const Row = (
                <>
                  <span className={['flex h-6 w-6 shrink-0 items-center justify-center rounded-full', KIND[it.kind].dot, 'bg-opacity-20'].join(' ')} aria-hidden>
                    <Icon name={KIND[it.kind].icon} size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-primary">{it.title}</span>
                    {it.detail && <span className="block truncate text-2xs text-ink-muted">{KIND[it.kind].label} · {it.detail}</span>}
                  </span>
                </>
              );
              const cls = 'flex w-full min-h-[var(--row-h-sm)] items-center gap-2.5 rounded-input px-2 py-1.5 text-left';
              return (
                <li key={`${it.kind}:${i}`}>
                  {s ? (
                    <button type="button" onClick={() => onSelect(s)} className={`${cls} transition-colors hover:bg-surface-high/50`}>{Row}</button>
                  ) : byId ? (
                    <button type="button" onClick={() => onOpenSchedule!(byId, { fallbackVenueId: it.venueId ?? null })} className={`${cls} transition-colors hover:bg-surface-high/50`}>{Row}</button>
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

      <BankrollCard date={picked} monthPrefix={monthPrefix} rows={bankroll} loaded={loaded} failed={bankrollErr != null} onChanged={reload} onPickDate={setPicked} toast={toast} />

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

function Stat({ label, value, sub, tone, testId }: {
  label: string; value: string; sub?: string; tone: 'cyan' | 'gold' | 'emerald' | 'danger';
  /** data-stat — 라벨 문자열 대신 e2e 가 잡는 안정 키(CLAUDE.md: 라벨을 바꾸면 같은 커밋에서 testid 로 교체) */
  testId?: string;
}) {
  // stat-* 토큰은 라이트 오버라이드를 갖고 있다. cyan·gold 는 없어서 라이트 흰 카드 위 1.45:1 이었다 —
  // index.css 에 stat-cyan·stat-gold 를 추가하고 여기서 그것만 쓴다(하드 팔레트 금지).
  const cls = tone === 'cyan' ? 'stat-cyan' : tone === 'gold' ? 'stat-gold' : tone === 'emerald' ? 'stat-emerald'
    : 'text-danger-deep dark:text-danger-light';
  return (
    // p-2 → p-1.5: 320px 에서 '+250,000' 이 칸을 3px 넘겨 잘렸다(2026-09-10 실측). 좌우 4.2px 를 되찾고 칸 높이도 4px 줄어든다.
    <div data-stat={testId} className="rounded-input border border-border-subtle bg-surface-low p-1.5 text-center">
      {/* 360px 3칸(칸 ~100px)에서 '-150,000' 같은 8자 값이 두 줄로 꺾였다(2026-09-10 캡처) — 숫자는 절대 꺾지 않고 긴 값만 한 단 줄인다 */}
      <p className={`${value.length > 7 ? 'text-sm' : 'text-base'} whitespace-nowrap font-extrabold leading-none tabular-nums ${cls}`}>{value}</p>
      <p className="mt-1 text-2xs text-ink-muted">{label}</p>
      {/* 값이 없어도 자리를 지킨다 — 조건부 렌더는 월 이동마다 아래를 15px 밀어 올린다 */}
      <p className="text-2xs tabular-nums text-ink-muted">{sub ?? ' '}</p>
    </div>
  );
}

/** 수기 뱅크롤 — 자동 집계가 못 잡는 현금 게임·타 매장 결과를 유저가 직접 +/- 로 적는다. */
/** 내가 적는 기록 — 뱅크롤(금액)과 일정(메모) 두 가지를 한 카드에서, 모드를 갈라 받는다.
 *  저장은 둘 다 bankroll_entries 한 테이블로 간다(금액 0 = 일정). DB 제약: amount<>0 or buy_in>0 or memo<>''(20260909b).
 *  개인 ROI(참가비·매장·게임)는 선택 입력 — 개인 비공개 기록이라 랭킹·비교로 잇지 않는다(src/lib/roi.ts). */
function BankrollCard({ date, monthPrefix, rows, loaded, failed, onChanged, onPickDate, toast }: {
  date: string;
  /** 위 달력이 보고 있는 달(YYYY-MM) — ROI '이번 달' 범위의 단일 출처 */
  monthPrefix: string;
  rows: BankrollEntry[];
  /** 조회가 끝났는가. false 면 rows=[] 가 '0원'이 아니라 '아직 모름'이다 — 히어로에 '—' 를 그리고 Aura 를 끈다. */
  loaded: boolean;
  /** 조회가 실패했는가. 실패도 '0원'으로 위장하지 않는다(§6, LoadErrorCard 와 같은 원칙). */
  failed: boolean;
  onChanged: () => void;
  /** 날짜 입력이 달력 선택을 그대로 움직인다 — 두 값을 따로 두면 저장한 날과 보이는 날이 어긋난다 */
  onPickDate: (d: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toast: { show: (m: string, t?: any) => void };
}) {
  const [mode, setMode] = useState<'bankroll' | 'memo'>('bankroll');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  // 개인 ROI 입력(선택) — 비우면 0/'' 로 저장돼 옛 행과 같다
  const [buyIn, setBuyIn] = useState('');
  const [rebuy, setRebuy] = useState('');
  const [addon, setAddon] = useState('');
  const [venueName, setVenueName] = useState('');
  const [gameName, setGameName] = useState('');
  // ROI 범위 — 이번 달/전체 · 매장 · 게임(문자열 일치)
  const [period, setPeriod] = useState<'month' | 'all'>('month');
  const [venue, setVenue] = useState('');
  const [game, setGame] = useState('');
  const venues = useMemo(() => [...new Set(rows.map((r) => r.venueName).filter(Boolean))].sort(), [rows]);
  const games = useMemo(() => [...new Set(rows.map((r) => r.gameName).filter(Boolean))].sort(), [rows]);
  const stats = useMemo(() => roiStats(filterRoiRows(rows, {
    monthPrefix: period === 'month' ? monthPrefix : undefined, venue: venue || undefined, game: game || undefined,
  })), [rows, period, monthPrefix, venue, game]);
  const showRoi = stats.events >= ROI_MIN_EVENTS;
  const notice = roiNotice(stats);
  const trendMax = Math.max(1, ...stats.months.map((m) => Math.abs(m.net)));
  const dayRows = rows.filter((r) => r.entryDate === date);

  // 손익 — 불러온 범위 전체 기준. 합계 하나면 '얼마 넣고 얼마 벌었는지'가 안 보인다(오너 지시).
  const money = rows.filter((r) => r.amount !== 0);
  const plus = money.filter((r) => r.amount > 0).reduce((a, r) => a + r.amount, 0);
  const minus = money.filter((r) => r.amount < 0).reduce((a, r) => a + r.amount, 0); // 음수
  const net = plus + minus;

  // ── 전체 누계 히어로의 상태 (2026-09-10) ──────────────────────────────────
  // '기록 없음'과 '정확히 0'을 가른다 — 0원으로 오해시키지 않는다(§6).
  // 뱅크롤 기록 = 금액이 있거나(±) 참가비를 적은 행. 메모만 있는 '일정'은 뱅크롤이 아니다.
  const hasBankroll = rows.some((r) => r.amount !== 0 || investedOf(r) > 0);
  const heroReady = loaded && !failed && hasBankroll;
  // Aura 는 '실제 상태를 말할 때만' 켠다: 로딩·오류·기록 없음은 전부 끈다(§6·§12).
  const heroVariant = net > 0 ? 'emerald' : net < 0 ? 'rose' : 'violet';
  const netText = heroReady ? `${net >= 0 ? '+' : ''}${won(net)}` : '—';
  const heroNote = failed ? '불러오지 못했어요'
    : !loaded ? '불러오는 중이에요'
    : !hasBankroll ? '아직 기록이 없어요'
    : null;

  const save = async (sign: 1 | -1 | 0) => {
    const num = (s: string) => Math.trunc(Number(s.replace(/[^0-9]/g, '')) || 0);
    const n = num(amount);
    // 개인 ROI 입력 — 일정 모드에서는 싣지 않는다(일정은 참가가 아니다)
    const extra = sign === 0
      ? { buyIn: 0, rebuy: 0, addon: 0, venueName: '', gameName: '' }
      : { buyIn: num(buyIn), rebuy: num(rebuy), addon: num(addon), venueName: venueName.trim(), gameName: gameName.trim() };
    const invested = investedOf(extra);
    if (sign === 0) {
      if (!memo.trim()) { toast.show('내용을 입력해 주세요', 'error'); return; }
    } else {
      // 금액 0 이어도 참가비가 있으면 본전 기록이다
      if (!n && !invested) { toast.show('금액을 입력해 주세요', 'error'); return; }
      // 상한을 클라이언트에서 막는다 — 넘기면 서버가 영문 Postgres 오류를 그대로 토스트에 뱉는다
      if (n > BANKROLL_MAX || invested > BANKROLL_MAX) { toast.show(`한 번에 ${won(BANKROLL_MAX)}원까지 기록할 수 있어요`, 'error'); return; }
    }
    setBusy(true);
    try {
      const { degraded } = await addBankrollEntry({ entryDate: date, amount: sign === 0 ? 0 : n * sign, memo, ...extra });
      setAmount(''); setMemo(''); setBuyIn(''); setRebuy(''); setAddon(''); setVenueName(''); setGameName('');
      // 마이그레이션 전 서버 — 참가비 등이 저장되지 않았다는 사실을 숨기지 않는다
      if (degraded) toast.show('서버 업데이트 중입니다 — 금액·메모만 먼저 기록됩니다', 'info');
      else toast.show(sign === 0 ? '일정을 적었어요' : sign > 0 ? '플러스로 기록했어요' : '마이너스로 기록했어요', 'success');
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

  // 트레이 안에 반반 — 활성만 상자였을 때는 왼쪽만 컨트롤처럼 보이고 오른쪽은 떠 있는 글자로 읽혔다.
  const tabCls = (on: boolean) => [
    'min-h-[44px] flex-1 rounded-[6px] px-3 text-xs font-bold transition-colors',
    on ? 'chip-aura' : 'text-ink-muted hover:text-ink-secondary',
  ].join(' ');

  return (
    <section className="rounded-aura border card-aura p-3">
      <div className="flex items-center gap-2 border-b border-border-subtle pb-1.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-cyan" aria-hidden>
          <Icon name="notebook" size={14} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 2026-09-10 — '내가 적는 기록'은 기능을 말하지 않는다. 제목/부제를 맞바꾼다. */}
          <h3 className="text-sm font-bold leading-tight text-ink-primary">뱅크롤 · 일정</h3>
          <span className="text-2xs leading-tight text-ink-secondary">손익을 기록하고 개인 일정을 관리해요</span>
        </div>
      </div>

      {/* ── 전체 누계 ────────────────────────────────────────────────────────────
          범위: 불러온 행 전체(필터 무시). 아래 '선택 기간 분석'과 **모집단이 다르다** —
          그래서 두 구획을 제목으로 갈라 놓는다(§6). 순손익 하나를 주 지표로 키우고
          수익·손실은 그 아래 한 줄로 내린다: 예전 3칸은 셋 다 같은 무게라 무엇이 결론인지 없었다.
          LED 는 여기 한 곳뿐이다(§6 뱅크롤 Aura) — 카드 전체를 칠하지 않는다. */}
      <p className="mt-2 text-2xs font-bold text-ink-muted">전체 누계</p>
      <div
        data-aura={heroReady ? '' : undefined}
        data-aura-level={heroReady ? 'hero' : undefined}
        data-aura-variant={heroReady ? heroVariant : undefined}
        className="mt-1 rounded-input border border-border-subtle bg-surface-low px-3 py-2.5"
      >
        <p className="text-2xs text-ink-muted">순손익</p>
        <p className={[
          netText.length > 9 ? 'text-lg' : 'text-[22px]',
          'whitespace-nowrap font-extrabold leading-none tabular-nums',
          !heroReady ? 'text-ink-muted' : net > 0 ? 'stat-emerald' : net < 0 ? 'text-danger-deep dark:text-danger-light' : 'text-ink-primary',
        ].join(' ')}>{netText}</p>
        {/* 한 줄로 자리를 항상 지킨다 — 조건부로 빼면 도착할 때 아래가 밀린다(CLS) */}
        {/* 줄은 접히되 **숫자는 안 꺾인다** — 200% 확대에서 nowrap 이면 카드 밖으로 넘쳐 가로 스크롤이 생겼다(2026-09-10 실측). */}
        <p className="mt-1.5 text-2xs tabular-nums text-ink-secondary">
          {heroNote ?? (<><span className="whitespace-nowrap">수익 <b className="stat-emerald">+{won(plus)}</b></span> · <span className="whitespace-nowrap">손실 <b className="text-danger-deep dark:text-danger-light">{won(minus)}</b></span></>)}
        </p>
      </div>

      {/* ── 선택 기간 분석 ──────────────────────────────────────────────────────
          필터가 바로 이 구획의 지표만 움직인다는 것을 붙여 놓아 보인다(§6).
          참가비가 적힌 행만 센다(분모 없는 행이 분자에 섞이면 ROI 가 거짓이 된다 — src/lib/roi.ts).
          개인 비공개 기록이라 랭킹·비교로 잇지 않는다. */}
      <p className="mt-3 text-2xs font-bold text-ink-muted">선택 기간 분석</p>
      <div className="mt-1 grid grid-cols-3 gap-1.5" role="group" aria-label="ROI 범위">
        <select value={period} onChange={(e) => setPeriod(e.target.value as 'month' | 'all')} aria-label="ROI 기간"
          className="input min-h-[44px] min-w-0 px-0.5 text-[11px]">
          <option value="month">{monthPrefix.replace('-', '.')}</option>
          <option value="all">전체</option>
        </select>
        {/* 기본 옵션은 '매장 전체'(4자)가 아니라 '매장'(2자)이다 — 2026-09-10 실측:
            320px 에서 칸 안쪽 71.5px 에 '매장 전체' 글자가 69.6px 이라 여유 1.9px 밖에 없어
            네이티브 드롭다운 화살표가 글자를 덮었다. 2자면 여유가 20px 로 벌어진다.
            고르면 매장명이 그대로 뜨므로 '무엇을 거르는 칸인지'는 기본 상태 라벨이 말해 준다. */}
        <select value={venue} onChange={(e) => setVenue(e.target.value)} aria-label="ROI 매장" className="input min-h-[44px] min-w-0 px-0.5 text-[11px]">
          <option value="">매장</option>
          {venues.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="ROI 게임" className="input min-h-[44px] min-w-0 px-0.5 text-[11px]">
          <option value="">게임</option>
          {games.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      {/* 핵심 3 — 순손익·ROI·ITM. '무엇을 보고 판단하는가'가 이 줄이다.
          ⚠ 라벨을 바꿨으므로(참가→참가 횟수, 결과→총 회수액, 순결과→순손익) e2e 셀렉터를
            같은 커밋에서 data-stat 으로 교체했다(CLAUDE.md: 라벨 결합 셀렉터는 느슨하게 풀지 않는다). */}
      <div className="mt-1.5 grid grid-cols-3 gap-1.5" data-testid="roi-stats">
        <Stat testId="net" label="순손익" value={`${stats.net >= 0 ? '+' : ''}${won(stats.net)}`} sub=" " tone={stats.net >= 0 ? 'emerald' : 'danger'} />
        {/* 3건 미만이면 % 대신 — : 한두 판의 % 는 사람을 속인다(아래 안내가 이유를 말한다) */}
        <Stat testId="roi" label="ROI" value={showRoi && stats.roi != null ? `${stats.roi.toFixed(1)}%` : '—'} sub=" " tone={(stats.roi ?? 0) >= 0 ? 'emerald' : 'danger'} />
        <Stat testId="itm" label="ITM" value={showRoi && stats.itm != null ? `${Math.round(stats.itm)}%` : '—'} sub=" " tone="cyan" />
      </div>
      {/* 보조 지표는 칸이 아니라 **한 줄**이다(2026-09-10 오너 지시).
          3칸 + 부가설명(입상·평균·최고)은 320px 에서 두 줄로 꺾여 83.9px 를 먹었다 — 주지표행(56.2px)보다 컸다.
          위 셋을 설명하는 재료일 뿐이라 무게를 한 줄까지 내린다: 83.9 → 15.9px.
          숫자만 nowrap 이라 좁은 폭에서는 낱말 사이에서 접히고 금액은 안 꺾인다. */}
      <p className="mt-1.5 text-center text-2xs tabular-nums text-ink-secondary">
        <span className="whitespace-nowrap"><b data-stat="events" className="font-bold text-ink-primary">{stats.events}회</b> 참가</span>
        {' · '}
        <span className="whitespace-nowrap">참가비 <b data-stat="invested" className="font-bold text-ink-primary">{won(stats.invested)}</b></span>
        {' · '}
        <span className="whitespace-nowrap">회수 <b data-stat="result" className="font-bold text-ink-primary">{won(stats.resultSum)}</b></span>
      </p>
      {notice && <p className="mt-1 text-center text-2xs text-ink-secondary" data-testid="roi-notice">{notice}</p>}
      {/* 월별 추세 — 전체 기간일 때만(한 달 범위에선 막대 하나라 추세가 아니다). 차트 라이브러리 없이 폭 % 막대. */}
      {period === 'all' && stats.months.length > 0 && (
        <ul className="mt-1.5 space-y-0.5" aria-label="월별 순결과 추세" data-testid="roi-trend">
          {stats.months.slice(-12).map((m) => (
            <li key={m.month} className="flex items-center gap-1.5 text-2xs tabular-nums">
              <span className="w-12 shrink-0 text-ink-muted">{m.month.replace('-', '.')}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-high/60" aria-hidden>
                <span className={['block h-2 rounded-full', m.net >= 0 ? 'bg-emerald-400/70' : 'bg-danger/60'].join(' ')}
                  style={{ width: `${Math.round((Math.abs(m.net) / trendMax) * 100)}%` }} />
              </span>
              <span className={['w-20 shrink-0 text-right font-semibold', m.net >= 0 ? 'stat-emerald' : 'text-danger-deep dark:text-danger-light'].join(' ')}>
                {m.net >= 0 ? '+' : ''}{won(m.net)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* 무엇을 적는 중인지 먼저 고른다 — 예전엔 한 줄에 5개가 섞여 모드가 안 보였다 */}
      <p className="mt-3 text-2xs font-bold text-ink-muted">기록 추가</p>
      <div className="mt-1 flex gap-0.5 rounded-input bg-surface-high/60 p-0.5" role="tablist" aria-label="기록 종류">
        <button type="button" role="tab" aria-selected={mode === 'bankroll'}
          onClick={() => setMode('bankroll')} className={tabCls(mode === 'bankroll')}>뱅크롤</button>
        <button type="button" role="tab" aria-selected={mode === 'memo'}
          onClick={() => setMode('memo')} className={tabCls(mode === 'memo')}>일정</button>
      </div>

      {/* ⚠ `flex-wrap` + 자식마다 `min-w-0` 은 **줄바꿈이 영영 안 일어난다** — 0까지 줄일 수 있다고
          선언하면 wrap 조건('더 못 줄임')에 도달하지 못해 컨트롤 5개가 한 줄에서 뭉개진다.
          그 상태에서 type=date 는 내부 스피너 폭이 고정이라 글자가 먼저 깨지고 '메모(선택)'이 잘렸다.
          → wrap 에 기대지 않고 줄을 명시한다(2026-09-05 오너 스크린샷). */}
      {/* ⚠ 두 줄이 서로 다른 방식으로 폭을 나누면 오른쪽 끝이 어긋난다 — 예전엔 위가 `flex-1 + w-28`,
          아래가 `flex-1 + px-4 버튼 2개` 라 날짜칸과 메모칸의 오른쪽 변이 서로 다른 자리에 섰다
          (2026-09-06 오너 스크린샷). **한 그리드(6칸)로 두 줄을 같은 열에 세운다** —
          날짜 4 + 금액 2 / 메모 4 + ＋1 + －1. 높이도 44px 하나로 맞춰 줄마다 튀지 않게 한다.
          `flex-wrap` 에 기대지 않는 이유는 아래 옛 주석 그대로다(min-w-0 자식은 영영 줄바꿈되지 않는다). */}
      <div className="mt-1.5 grid grid-cols-6 gap-1.5">
        {/* 날짜 — 달력 선택과 같은 값. 여기서 바꾸면 위 달력도 그 날로 옮겨간다(단일 출처). */}
        <input type="date" value={date} onChange={(e) => e.target.value && onPickDate(e.target.value)}
          aria-label="날짜"
          className={['input min-h-[44px] min-w-0 text-sm tabular-nums', mode === 'bankroll' ? 'col-span-4' : 'col-span-6'].join(' ')} />
        {mode === 'bankroll' && (
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric"
            placeholder="금액" aria-label="금액" className="input col-span-2 min-h-[44px] min-w-0 text-sm tabular-nums" />
        )}
        {mode === 'bankroll' && (
          /* 개인 ROI 입력(선택) — 접어 둔다: +/- 만 적는 사람에게 칸 5개는 소음이다. 같은 6칸 그리드라 오른쪽 변이 맞는다. */
          <details className="col-span-6 rounded-input bg-surface-high/40 px-2 py-1.5" data-testid="roi-inputs">
            <summary className="cursor-pointer select-none text-2xs font-semibold text-ink-secondary">참가비 · 매장 · 게임 적기 (선택)</summary>
            <p className="mt-1 text-2xs leading-relaxed text-ink-muted">금액은 참가비를 뺀 순결과로 적어요. 참가비를 적으면 ROI·ITM 이 계산돼요.</p>
            {/* 라벨을 눈에 보이게 단다(2026-09-10 §6) — placeholder 는 입력을 시작하는 순간 사라져서
                '이 칸이 뭐였지'를 만든다. <label> 이 그리드 칸을 잡고 input 은 그 안에서 100% 를 쓴다.
                aria-label 은 그대로 둔다 — e2e 가 getByLabel 로 잡는 계약이다. */}
            <div className="mt-1.5 grid grid-cols-6 gap-1.5">
              <label className="col-span-2 min-w-0">
                <span className="mb-0.5 block text-2xs text-ink-muted">참가비</span>
                <input value={buyIn} onChange={(e) => setBuyIn(e.target.value)} inputMode="numeric" placeholder="0" aria-label="참가비"
                  className="input min-h-[44px] w-full min-w-0 text-sm tabular-nums" />
              </label>
              <label className="col-span-2 min-w-0">
                <span className="mb-0.5 block text-2xs text-ink-muted">재진입</span>
                <input value={rebuy} onChange={(e) => setRebuy(e.target.value)} inputMode="numeric" placeholder="0" aria-label="재진입"
                  className="input min-h-[44px] w-full min-w-0 text-sm tabular-nums" />
              </label>
              <label className="col-span-2 min-w-0">
                <span className="mb-0.5 block text-2xs text-ink-muted">애드온</span>
                <input value={addon} onChange={(e) => setAddon(e.target.value)} inputMode="numeric" placeholder="0" aria-label="애드온"
                  className="input min-h-[44px] w-full min-w-0 text-sm tabular-nums" />
              </label>
              <label className="col-span-3 min-w-0">
                <span className="mb-0.5 block text-2xs text-ink-muted">매장</span>
                <input value={venueName} onChange={(e) => setVenueName(e.target.value)} maxLength={40} list="roi-venue-names" placeholder="예: 누리홀덤 강남" aria-label="매장 이름"
                  className="input min-h-[44px] w-full min-w-0 text-sm" />
              </label>
              <label className="col-span-3 min-w-0">
                <span className="mb-0.5 block text-2xs text-ink-muted">게임</span>
                <input value={gameName} onChange={(e) => setGameName(e.target.value)} maxLength={40} list="roi-game-names" placeholder="예: 데일리" aria-label="게임 이름"
                  className="input min-h-[44px] w-full min-w-0 text-sm" />
              </label>
              {/* 필터는 문자열 일치라 같은 이름으로 적어야 잡힌다 — 예전에 적은 이름을 제안한다 */}
              <datalist id="roi-venue-names">{venues.map((v) => <option key={v} value={v} />)}</datalist>
              <datalist id="roi-game-names">{games.map((g) => <option key={g} value={g} />)}</datalist>
            </div>
          </details>
        )}

        <input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={40}
          placeholder={mode === 'bankroll' ? '메모(선택)' : '일정 내용'}
          aria-label={mode === 'bankroll' ? '메모' : '일정 내용'}
          className="input col-span-4 min-h-[44px] min-w-0 text-sm" />
        {mode === 'bankroll' ? (<>
          <button type="button" onClick={() => save(1)} disabled={busy} aria-label="플러스로 기록"
            className="col-span-1 min-h-[44px] rounded-input border border-emerald-400/50 bg-emerald-400/10 text-sm font-bold stat-emerald disabled:opacity-50">＋</button>
          <button type="button" onClick={() => save(-1)} disabled={busy} aria-label="마이너스로 기록"
            className="col-span-1 min-h-[44px] rounded-input border border-danger/40 bg-danger/10 text-sm font-bold text-danger-deep dark:text-danger-light disabled:opacity-50">－</button>
        </>) : (
          <button type="button" onClick={() => save(0)} disabled={busy}
            className="btn-primary col-span-2 min-h-[44px] text-sm">저장</button>
        )}
      </div>

      {dayRows.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {dayRows.map((r) => (
            <li key={r.id} className="flex min-h-[var(--row-h-sm)] items-center gap-2 rounded-input px-2">
              {/* 금액 0 = 일정 — '+0' 을 그리면 돈 기록으로 오해된다 */}
              {isMemoEntry(r) ? (
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-primary">{r.memo}</span>
              ) : (<>
                <span className={['shrink-0 text-sm font-bold tabular-nums', r.amount > 0 ? 'stat-emerald' : 'text-danger-deep dark:text-danger-light'].join(' ')}>
                  {r.amount > 0 ? '+' : ''}{won(r.amount)}
                </span>
                <span className="min-w-0 flex-1 truncate text-2xs text-ink-muted">
                  {[r.venueName, r.gameName, investedOf(r) > 0 ? `참가비 ${won(investedOf(r))}` : '', r.memo].filter(Boolean).join(' · ')}
                </span>
              </>)}
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
