/* ============================================================================
 * IntegratedSearchBar — 검색 + 날짜 레일(sticky) + 필터 칩 레일(한 줄)
 *  1) 필터 = 균일 칩 한 줄 레일(APIS·FotMob 문법, §20.1). 모든 칩 h-9 단일 언어.
 *     - GTD/MTT/대회: aria-pressed 토글 칩(재탭=해제 → 전체). 단일 tour 상태에서
 *       SearchState 의 format/gtdOnly/competitionOnly 를 파생(App 계약 불변).
 *     - 지역/등급/예산: FilterSelectChip — 투명 오버레이 <select> 로 네이티브 피커.
 *  2) 지역 대분류 11종(서울/강남/강서/경기남부/경기북부/인천/부산/대전/대구/광주/제주).
 *  3) 접근성: 토글은 aria-pressed, 셀렉트는 aria-label. 포커스 링 유지.
 *  4) SearchState 키({query,dates,regions,format,gtdOnly,competitionOnly,grade,budget})
 *     계약 불변 — 상위(App) 필터 로직 무변경.
 * ========================================================================== */
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useDeferredValue,
  useTransition,
  useImperativeHandle,
  forwardRef,
  Fragment,
} from 'react';
import { useScrollY } from '../../lib/useScrollY';

// ── 날짜 유틸 ─────────────────────────────────────────────────────────────────

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function buildDateSlots(count = 14) {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      iso:   d.toLocaleDateString('en-CA'),
      month: d.getMonth() + 1,
      day:   d.getDate(),
      dow:   DAYS_KO[d.getDay()],
      isToday: i === 0,
      isSat: d.getDay() === 6,
      isSun: d.getDay() === 0,
      showMonth: i === 0 || d.getDate() === 1, // 첫 칸·월 바뀌는 칸에 'N월' 컨텍스트
    };
  });
}

type DateSlot = ReturnType<typeof buildDateSlots>[number];

// ── 필터 상수 ─────────────────────────────────────────────────────────────────

// 지역 대분류(요구사항 2) — 복수선택 유지, 목록만 교체
// eslint-disable-next-line react-refresh/only-export-components -- 검색 상수를 외부(App)와 공유(기존 구조 유지)
export const REGION_CHIPS = [
  '서울', '강남', '강서', '경기남부', '경기북부',
  '인천', '부산', '대전', '대구', '광주', '제주',
] as const;

// 권역 묶음 — 상위 지역을 선택하면 하위 지역까지 함께 노출.
//  예) '서울' 선택 시 강남·강서 일정도 함께 보인다.
const REGION_GROUPS: Record<string, string[]> = {
  '서울': ['서울', '강남', '강서'],
};

/** 선택된 지역 칩들을 권역 묶음까지 펼쳐 중복 제거한 매칭 키 목록으로 변환 */
// eslint-disable-next-line react-refresh/only-export-components -- 검색 유틸을 외부(App)와 공유(기존 구조 유지)
export function expandRegions(regions: string[]): string[] {
  const out = new Set<string>();
  for (const r of regions) {
    const group = REGION_GROUPS[r] ?? [r];
    group.forEach((g) => out.add(g));
  }
  return [...out];
}

// 토너먼트 필터 — [전체, MTT, GTD, 대회] 라디오(상호배타)
//  전체=필터없음 / MTT=format'MTT' / GTD=guaranteed / 대회=is_competition
type TourFilter = 'all' | 'MTT' | 'GTD' | 'comp';
const TOUR_OPTIONS: { id: TourFilter; label: string }[] = [
  { id: 'all',  label: '전체' },
  { id: 'GTD',  label: 'GTD' },
  { id: 'MTT',  label: 'MTT' },
  { id: 'comp', label: '대회' },
];

// ── 필터 칩 공용 문법 — 레일의 모든 칩이 같은 높이(h-9)·라운드·서체를 공유한다 ──
// (예전 세그먼트 박스 3개가 각자 내용 폭으로 끝나 '칸이 제각각'으로 읽히던 문제의 반대 원칙)
// v4.1(오너): 알약(rounded-badge)은 안이 답답해 보인다 → 클릭 칩은 10px(rounded-chip). 카운트 배지(아래)는 알약 유지.
const CHIP_BASE = 'inline-flex h-9 shrink-0 items-center rounded-chip border border-transparent px-3.5 text-xs font-bold leading-none transition-colors';
const CHIP_ON = 'bg-accent-300/15 text-accent-300';
// P1-5(오너 진단 '선 노이즈'): 1px 테두리 대신 배경보다 한 톤 밝은 면으로 그룹화
const CHIP_OFF = 'bg-surface-high text-ink-secondary hover:bg-surface-float/70';

// 단일선택 축(지역/등급/예산)용 드롭다운 칩 — 닫힌 칩은 짧은 라벨('지역')을, 값이 있으면
// 값 라벨('서울')을 보여준다. 실제 입력은 투명 오버레이 <select> — 안드로이드/iOS 네이티브
// 피커가 그대로 떠서 시트 구현 0줄로 APK 감각이 난다(접근성: select 가 포커스·라벨 보유).
function FilterSelectChip({ ariaLabel, value, onChange, placeholder, options }: {
  ariaLabel: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: [string, string][];
}) {
  const selected = options.find(([v]) => v === value && v !== '');
  return (
    <div className={['relative gap-1', CHIP_BASE, selected ? CHIP_ON : CHIP_OFF,
      'focus-within:ring-2 focus-within:ring-accent-300'].join(' ')}>
      <span className="pointer-events-none">{selected ? selected[1] : placeholder}</span>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
        strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden
        className="pointer-events-none">
        <path d="M2 4l3 3 3-3" />
      </svg>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {options.map(([v, l]) => <option key={v || 'all'} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

// ── 서브컴포넌트: 검색 아이콘 ─────────────────────────────────────────────────

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="18" height="18" viewBox="0 0 18 18"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden
    >
      <circle cx="8" cy="8" r="5.5" />
      <line x1="12.5" y1="12.5" x2="16" y2="16" />
    </svg>
  );
}

// ── 서브컴포넌트: 날짜 탭 단일 아이템 ────────────────────────────────────────

interface DateTabProps {
  slot: DateSlot;
  selected: boolean;
  /** 이 날짜에 승인된 대회가 있으면 하단 점 표시 — '눌러도 빈 날' 헛탭 방지 */
  hasEvents?: boolean;
  onClick: () => void;
}

function DateTab({ slot, selected, hasEvents, onClick }: DateTabProps) {
  const tabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // MO-2③: scrollIntoView 는 날짜 레일이 sticky 헤더에 일부 가리면 '페이지 세로 스크롤'까지 유발
    // ('날짜를 탭했는데 목록이 움직인다' — §20.5 #6). 레일 내부 가로 스크롤로만 센터링한다.
    const el = tabRef.current;
    if (!selected || !el) return;
    let rail: HTMLElement | null = el.parentElement;
    while (rail && rail.scrollWidth <= rail.clientWidth + 1) rail = rail.parentElement;
    if (!rail) return;
    const r = rail.getBoundingClientRect();
    const t = el.getBoundingClientRect();
    rail.scrollTo({ left: rail.scrollLeft + (t.left - r.left) - (r.width - t.width) / 2, behavior: 'smooth' });
  }, [selected]);

  // P1: 주말 표시는 유지하되 채도를 낮춰 액센트와 경쟁하지 않게(오너 진단 — 색 분산)
  const dowColor = slot.isSun ? 'text-danger-light/70' : slot.isSat ? 'text-sky-400/60' : 'text-ink-muted';

  return (
    <button
      ref={tabRef}
      type="button"
      onClick={() => { navigator.vibrate?.(8); onClick(); }}
      aria-pressed={selected}
      aria-label={`${slot.month}월 ${slot.day}일 ${slot.dow}요일${slot.isToday ? ' (오늘)' : ''}`}
      className={[
        'active:scale-90 transition-transform',
        // 정사각 셀(요일·날짜만) — '오늘' 텍스트 제거로 모든 칸 동일 높이
        'relative flex h-[2.6rem] w-[2.6rem] shrink-0 flex-col items-center justify-center rounded-[10px] select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300',
        selected ? 'text-ink-inverse' : 'text-ink-secondary hover:bg-surface-high active:bg-surface-high/70',
        // 오늘은 글자 대신 골드 테두리로 표시(미선택 시)
        !selected && slot.isToday ? 'ring-1 ring-accent-300/55' : '',
      ].join(' ')}
    >
      {/* 선택 시 골드 정사각 알약 — 셀과 정확히 일치(inset-0·동일 rounded) */}
      {selected && (
        <span aria-hidden className="anim-pop absolute inset-0 rounded-[10px] bg-accent-300 shadow-[0_4px_14px_-4px_rgb(var(--accent-300)/0.55)]" />
      )}
      <span className={['relative text-2xs font-bold leading-none', selected ? 'text-ink-inverse/85' : dowColor].join(' ')}>{slot.dow}</span>
      <span className="relative mt-0.5 text-sm font-extrabold leading-none tabular-nums">{slot.day}</span>
      {hasEvents && !selected && (
        <span aria-hidden className="absolute bottom-[3px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-accent-300/85" />
      )}
    </button>
  );
}

// ── 서브컴포넌트: 날짜 슬라이더 ──────────────────────────────────────────────

interface DateSliderProps {
  selectedDates: string[];      // 복수 선택
  onToggle: (iso: string) => void;
  onPick: (iso: string) => void; // 7일 이후 임의 날짜 직접 선택
  eventDates?: ReadonlySet<string>;
}

function DateSlider({ selectedDates, onToggle, onPick, eventDates }: DateSliderProps) {
  // 3주치를 가로 모멘텀 레일로 노출(스냅·관성 스크롤), 그 외는 '달력'으로 지정
  const slots = useRef(buildDateSlots(21)).current;
  const todayIso = slots[0].iso;

  // P0-1d: 'N월' 인라인 셀이 7칸 리듬을 깨던 것 → 레일 위 캡션으로 승격
  const months = [...new Set(slots.map((x) => x.month))];
  return (
    <>
    <div aria-hidden className="px-page-x pt-1 text-2xs font-bold leading-none text-ink-muted">
      {months.map((m) => `${m}월`).join(' – ')}
    </div>
    <div
      role="group"
      aria-label="날짜 빠른 선택 (복수 선택 가능)"
      className="flex items-center gap-1.5 overflow-x-auto scrollbar-none scroll-fade-r px-page-x pt-1 pb-1.5 [-webkit-overflow-scrolling:touch] sm:gap-2"
    >
      {slots.map((slot) => (
        <Fragment key={slot.iso}>
          <DateTab
            slot={slot}
            selected={selectedDates.includes(slot.iso)}
            hasEvents={!!eventDates?.has(slot.iso)}
            onClick={() => onToggle(slot.iso)}
          />
        </Fragment>
      ))}

      {/* 날짜 직접 선택 (3주 이후) — 네이티브 date picker 오버레이 */}
      <label
        title="날짜 직접 선택"
        className="relative flex shrink-0 flex-col items-center justify-center w-[2.6rem] h-[2.6rem] rounded-[10px] border border-dashed border-border-default text-ink-secondary hover:bg-surface-high hover:border-accent-400/50 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-accent-300"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="text-2xs font-semibold leading-none mt-0.5">달력</span>
        <input
          type="date"
          min={todayIso}
          onChange={(e) => { if (e.target.value) onPick(e.target.value); }}
          className="absolute inset-0 opacity-0 cursor-pointer"
          aria-label="날짜 직접 선택"
        />
      </label>
    </div></>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export interface SearchState {
  query: string;
  dates: string[];   // 복수 선택 (Multi-select) — 비어있으면 전체
  regions: string[]; // 복수 선택 (Multi-select) — 비어있으면 전체
  format: string | null;
  gtdOnly: boolean;
  competitionOnly: boolean; // '대회' 필터 — is_competition=true 만 노출 (Task 3)
  /** 대회 등급 축(데일리/새틀라이트/시리즈) — null=전체 */
  grade: 'daily' | 'satellite' | 'series' | null;
  /** 바이인 예산 상한(원) — null=전체. 한국 유저 1차 제약은 포맷이 아니라 예산(UX-2).
   *  §28 정합: 참가비는 상품 가격 정보라 표시·필터 대상이다. */
  budget: number | null;
}

interface IntegratedSearchBarProps {
  onChange: (state: SearchState) => void;
  placeholder?: string;
  className?: string;
  /** 지정 시 검색창+날짜 부분만 이 top 값으로 sticky 고정(필터·칩은 스크롤). */
  stickyTop?: string;
  /** 승인된 대회가 있는 날짜(ISO) 집합 — 날짜 슬라이더에 점(·)으로 표시해 헛탭 방지 */
  eventDates?: ReadonlySet<string>;
  /** P0-1b: 정렬·뷰토글 등 상위 컨트롤을 필터 칩 레일 끝에 통합(별도 띠 제거) */
  trailing?: React.ReactNode;
}

export interface SearchBarHandle { clearAll: () => void }

const IntegratedSearchBar = forwardRef<SearchBarHandle, IntegratedSearchBarProps>(function IntegratedSearchBar({
  onChange,
  placeholder = '대회명, 펍 이름, 지역 검색…',
  className = '',
  stickyTop,
  trailing,
  eventDates,
}, ref) {
  const [rawQuery,       setRawQuery]       = useState('');
  // 날짜·지역은 복수 선택(배열). 토글 방식으로 추가/제거.
  // 기본값 = 무선택('오늘부터 앞으로') — 예전엔 '오늘'이 기본 선택이라 심야·평일 오전 첫 방문이
  // 빈 화면/종료 카드가 됐고, 아무것도 안 건 사람에게 '초기화' 버튼까지 보였다(UX 재감사 1순위).
  const [selectedDates,  setSelectedDates]  = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  // 토너먼트 필터는 단일 선택(라디오). format/gtdOnly는 여기서 파생.
  const [tour,           setTour]           = useState<TourFilter>('all');
  // 대회 등급 축(Phase 14 보류 해제 — schedules.grade 컬럼 신설)
  const [grade, setGrade] = useState<'daily' | 'satellite' | 'series' | null>(null);
  // 바이인 예산 축(UX-2) — buyIn.amount(원) 상한 단일 선택
  const [budget, setBudget] = useState<number | null>(null);
  const [isFocused,      setIsFocused]      = useState(false);
  // P0-1a(오너 진단 '컨트롤 6단'): 검색 입력은 기본 접힘 — 레일의 돋보기 칩으로 열고,
  // 검색어가 남아 있는 동안은 계속 보인다(기능 보존·상시 띠 제거)
  const [searchOpen, setSearchOpen] = useState(false);
  useEffect(() => { if (searchOpen) inputRef.current?.focus(); }, [searchOpen]);
  const inputRef                            = useRef<HTMLInputElement>(null);
  const stickyRef                           = useRef<HTMLDivElement>(null);
  const [, startTransition]                = useTransition();

  // 고정바 구분선: 스크롤 위치에 따라 보더 토글(정지=옅게/스크롤=또렷). classList 만 만져 리렌더 0.
  // MO-9A: 개별 리스너 대신 공용 useScrollY 구독(프레임당 1회 보장).
  useScrollY(useCallback((y: number) => {
    if (!stickyTop) return;
    const el = stickyRef.current;
    if (!el) return;
    const stuck = y > 4;
    // 테마 인지 Tailwind 보더 클래스 토글(정지=옅은 subtle / 스크롤=또렷한 strong). transition-colors 로 부드럽게.
    el.classList.toggle('border-border-strong', stuck);
    el.classList.toggle('border-border-subtle', !stuck);
  }, [stickyTop]));

  const deferredQuery = useDeferredValue(rawQuery);

  useEffect(() => {
    // tour → format/gtdOnly/competitionOnly 파생 (SearchState 계약 유지)
    const format          = tour === 'MTT' ? 'MTT' : null;
    const gtdOnly         = tour === 'GTD';
    const competitionOnly = tour === 'comp';
    startTransition(() => {
      onChange({ query: deferredQuery, dates: selectedDates, regions: selectedRegions, format, gtdOnly, competitionOnly, grade, budget });
    });
  }, [deferredQuery, selectedDates, selectedRegions, tour, grade, budget, onChange]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => { setRawQuery(e.target.value); },
    [],
  );

  const handleClear = useCallback(() => {
    setRawQuery('');
    inputRef.current?.focus();
  }, []);

  // 모바일: 엔터/검색키를 누르면 입력 포커스를 해제해 키보드를 내린다(결과/포스터가 보이게).
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    inputRef.current?.blur();
  }, []);

  // 배열 토글 헬퍼 — 이미 있으면 제거, 없으면 추가 (복수 선택)
  const toggleInArray = (arr: string[], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const handleDateToggle   = useCallback((iso: string) => setSelectedDates((prev) => toggleInArray(prev, iso)), []);
  // 캘린더로 고른 날짜는 토글이 아니라 '추가'만(이미 있으면 유지)
  const handlePickDate     = useCallback((iso: string) => setSelectedDates((prev) => prev.includes(iso) ? prev : [...prev, iso]), []);
  const handleRegionToggle = useCallback((r: string) => setSelectedRegions((prev) => toggleInArray(prev, r)), []);

  // 토너먼트 필터는 칩 자체가 하이라이트라 카운트 뱃지에서 제외(중복 표시 제거)
  // 칩 레일은 스크롤로 화면 밖으로 사라지므로, 스크롤 후에도 sticky 검색바 배지가
  // '필터 걸려 있음'을 알려야 한다 — 유형/등급/예산도 카운트에 포함(리뷰 확정 반영)
  const activeCount =
    (rawQuery.length > 0 ? 1 : 0) +
    selectedDates.length +
    selectedRegions.length +
    (tour !== 'all' ? 1 : 0) +
    (grade !== null ? 1 : 0) +
    (budget !== null ? 1 : 0);

  const hasActiveFilter = activeCount > 0;

  const clearAll = useCallback(() => {
    setRawQuery('');
    setSelectedDates([]);
    setSelectedRegions([]);
    setTour('all');
    setGrade(null);
    setBudget(null);
  }, []);

  // 전체 초기화를 부모(App)의 '총 N개' 줄에서 호출 — 필터바 안에서 한 줄 먹던 버튼 제거
  useImperativeHandle(ref, () => ({ clearAll }), [clearAll]);

  return (
    <div className={[stickyTop ? 'contents' : 'w-full', className].join(' ')}>
      {/* 검색창 + 날짜만 sticky 고정(필터·칩은 스크롤되어 사라짐 → 고정 높이 최소화).
          불투명 배경 + 구분선 — 스크롤 시 뒤 컨텐츠가 비쳐 보이던 현상 제거(깔끔한 고정). */}
      <div
        ref={stickyRef}
        // before:* = '브리지' — 검색바 위로 불투명 surface-base 띠를 깔아, 스크롤 시 헤더 축소로 생길 수 있는
        // 헤더-검색바 사이 틈으로 뒤 컨텐츠가 비치는 현상을 어떤 상태에서도 가린다(JS 측정 의존 없이 확실).
        className={stickyTop ? "relative sticky z-30 bg-surface-base border-b border-border-subtle transition-colors duration-[var(--dur-fast)] before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-4 before:bg-surface-base before:content-['']" : ''}
        style={stickyTop ? { top: stickyTop } : undefined}
      >
      {/* ── 검색창 ─────────────────────────────────────────────────────── */}
      {(searchOpen || rawQuery.length > 0) && (
      <div className="px-page-x pt-1.5 pb-1.5">
        <form
          onSubmit={handleSubmit}
          className={[
            'flex items-center gap-2 px-3',
            'bg-surface-high rounded-[12px] h-10', // v4.1: 알약 → 12px(오너: 알약은 안이 답답해 보인다)
            'border transition-colors duration-[var(--dur-fast)]',
            isFocused
              ? 'border-accent-300'
              : 'border-border-default',
          ].join(' ')}
        >
          <SearchIcon className="shrink-0 text-ink-muted" />

          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={rawQuery}
            onChange={handleQueryChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder}
            aria-label="요강 검색"
            className={[
              'flex-1 bg-transparent text-sm text-ink-primary',
              'placeholder:text-ink-muted',
              'outline-none border-none',
              '[&::-webkit-search-cancel-button]:appearance-none',
            ].join(' ')}
          />

          {rawQuery.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="검색어 초기화"
              className="shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-surface-float text-ink-muted hover:text-ink-primary transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden>
                <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          )}

          {hasActiveFilter && (
            <span
              aria-label="활성 필터"
              className="shrink-0 min-w-[1.25rem] h-5 flex items-center justify-center rounded-badge bg-accent-300 text-white text-2xs font-bold px-1"
            >
              {activeCount}
            </span>
          )}
        </form>
      </div>
      )}

      {/* ── 날짜 슬라이더 탭 (복수 선택) ─────────────────────────────────── */}
      <DateSlider selectedDates={selectedDates} onToggle={handleDateToggle} onPick={handlePickDate} eventDates={eventDates} />
      </div>{/* /sticky 검색+날짜 */}

      {/* ── 필터 칩 레일 — 균일 칩 '한 줄'(APIS·FotMob 문법, §20.1) ─────────────
           예전엔 세그먼트 박스 3개 + 드롭다운이 flex-wrap 으로 4줄로 꺾여(각 박스가
           내용 폭대로 제각각 끝남) 필터가 화면 2/3를 먹었다. 규칙:
           · 모든 칩 h-9 · rounded-badge · 같은 서체/보더 — 시각 언어 하나
           · 고빈도 이지선다(GTD/MTT/대회)는 즉시 토글 칩(탭 1회, 재탭 = 해제 → 전체)
           · 저빈도 단일선택(지역/등급/예산)은 네이티브 select 칩(안드로이드 네이티브 피커
             = APK 감각, 시트 구현 0줄) — 값 선택 시 칩이 값 라벨로 바뀌고 액센트 점등 */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none scroll-fade-r px-page-x pt-2 pb-1">
        <button
          type="button"
          aria-label={searchOpen ? '검색 닫기' : '검색 열기'}
          aria-expanded={searchOpen}
          onClick={() => setSearchOpen((v) => !v)}
          className={['w-9 justify-center px-0', CHIP_BASE, searchOpen || rawQuery ? CHIP_ON : CHIP_OFF].join(' ')}
        >
          <SearchIcon className="h-4 w-4" />
        </button>
        <FilterSelectChip
          ariaLabel="지역 선택"
          value={selectedRegions[0] ?? ''}
          onChange={(v) => setSelectedRegions(v ? [v] : [])}
          placeholder="지역"
          options={[['', '전체 지역'], ...REGION_CHIPS.map((r) => [r, r] as [string, string])]}
        />
        {/* 재탭=해제 토글이라 radio 가 아니라 aria-pressed 문법(DateTab 과 동일 관용구).
            상호배타(하나 켜면 나머지 꺼짐)는 상태 파생이 보장한다. */}
        {TOUR_OPTIONS.filter((o) => o.id !== 'all').map(({ id, label }) => {
          const active = tour === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setTour(active ? 'all' : id)}
              className={[CHIP_BASE, 'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-300', active ? CHIP_ON : CHIP_OFF].join(' ')}
            >
              {label}
            </button>
          );
        })}
        <FilterSelectChip
          ariaLabel="대회 등급"
          value={grade ?? ''}
          onChange={(v) => setGrade((v || null) as typeof grade)}
          placeholder="등급"
          options={[['', '등급 전체'], ['daily', '데일리'], ['satellite', '새틀'], ['series', '시리즈']]}
        />
        {/* 바이인 예산 축(UX-2) — '오늘 5만원짜리 뭐 있지'가 한국 유저 1차 질문 */}
        <FilterSelectChip
          ariaLabel="바이인 예산"
          value={budget != null ? String(budget) : ''}
          onChange={(v) => setBudget(v ? Number(v) : null)}
          placeholder="예산"
          options={[['', '예산 전체'], ['30000', '3만↓'], ['50000', '5만↓'], ['100000', '10만↓']]}
        />
        {trailing}
      </div>

      {/* ── 활성 필터 요약 칩 — 날짜는 슬라이더에 이미 표시되므로 '복수 선택일 때만' 칩 노출
           (기본 단일 오늘 칩이 매번 한 줄을 먹던 문제 제거). 검색어·지역은 그대로 칩. ── */}
      {(rawQuery || selectedRegions.length > 0 || selectedDates.length > 1) && (
        <div
          className="flex flex-wrap gap-1.5 px-page-x pt-0.5 pb-1.5"
          role="status"
          aria-live="polite"
          aria-label="적용된 필터"
        >
          {rawQuery && (
            <FilterChip label={`"${rawQuery}"`} onRemove={handleClear} />
          )}
          {/* 날짜 여러 개 → 칩 하나로 요약(2줄 폭증 방지). ×는 날짜 필터 전체 해제. 개별 해제는 슬라이더 탭. */}
          {selectedDates.length > 1 && (
            <FilterChip
              label={`${formatDateLabel([...selectedDates].sort()[0])} 외 ${selectedDates.length - 1}일`}
              onRemove={() => setSelectedDates([])}
            />
          )}
          {/* 선택된 지역마다 칩 1개 (복수 선택) */}
          {selectedRegions.map((r) => (
            <FilterChip key={r} label={r} onRemove={() => handleRegionToggle(r)} />
          ))}
        </div>
      )}
    </div>
  );
});

export default IntegratedSearchBar;

// ── 필터 칩 ──────────────────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-0.5 h-5 px-1.5 rounded-badge bg-surface-float border border-border-default text-2xs text-ink-secondary">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${label} 필터 제거`}
        className="text-ink-muted hover:text-ink-primary transition-colors focus:outline-none"
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <line x1="1" y1="1" x2="7" y2="7" /><line x1="7" y1="1" x2="1" y2="7" />
        </svg>
      </button>
    </span>
  );
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day   = d.getDate();
  const dow   = DAYS_KO[d.getDay()];
  return `${month}/${day}(${dow})`;
}
