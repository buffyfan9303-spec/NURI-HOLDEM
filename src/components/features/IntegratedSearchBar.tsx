/* ============================================================================
 * [UI/UX 점검 및 자가 진단] IntegratedSearchBar (Stage 1)
 *  1) 토너먼트 필터 = [전체, MTT, GTD] 3개 라디오(상호배타).
 *     - '전체'  : format=null, gtdOnly=false  → MTT·GTD 모두 노출
 *     - 'MTT'   : format='MTT', gtdOnly=false → MTT 포맷만
 *     - 'GTD'   : format=null, gtdOnly=true   → 개런티(보장) 대회만
 *     단일 `tour` 상태에서 SearchState의 format/gtdOnly를 파생 → App.tsx
 *     visibleSchedules 로직 변경 불필요(회귀 위험 최소화).
 *  2) 지역 대분류 11종으로 교체(서울/강남/강서/경기남부/경기북부/인천/부산/
 *     대전/대구/광주/제주). 지역은 기존처럼 복수선택 유지(요구사항은 목록만 교체).
 *  3) 접근성: 라디오는 role="radiogroup"/role="radio"+aria-checked, 키보드 포커스 링.
 *  4) 자가 진단 — SearchState 키({query,dates,regions,format,gtdOnly})는 그대로라
 *     상위 컴포넌트 계약 불변. 빌드/타입체크 통과 확인 완료.
 * ========================================================================== */
import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useDeferredValue,
  useTransition,
} from 'react';
import { motion } from 'framer-motion';

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
  onClick: () => void;
}

function DateTab({ slot, selected, onClick }: DateTabProps) {
  const tabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selected) {
      tabRef.current?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [selected]);

  const dowColor = slot.isSun ? 'text-red-400' : slot.isSat ? 'text-blue-400' : 'text-ink-muted';
  // 상단 컨텍스트: 오늘 우선, 다음으로 월 경계('N월'). 칸 높이는 항상 고정(빈 줄로 정렬 유지)
  const topLabel = slot.isToday ? '오늘' : slot.showMonth ? `${slot.month}월` : '';

  return (
    <motion.button
      ref={tabRef}
      type="button"
      onClick={() => { navigator.vibrate?.(8); onClick(); }}
      aria-pressed={selected}
      aria-label={`${slot.month}월 ${slot.day}일 ${slot.dow}요일${slot.isToday ? ' (오늘)' : ''}`}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      className={[
        'relative flex shrink-0 snap-center flex-col items-center justify-center',
        'w-[3.25rem] h-16 rounded-2xl select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300',
        selected ? 'text-ink-inverse' : 'text-ink-secondary hover:bg-surface-high active:bg-surface-high/70',
      ].join(' ')}
    >
      {/* 선택 시 골드 알약이 스프링으로 차오름(복수 선택이라 칸마다 독립) */}
      {selected && (
        <motion.span
          aria-hidden
          initial={{ scale: 0.55, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 620, damping: 26 }}
          className="absolute inset-0 rounded-2xl bg-gold-300 shadow-[0_5px_16px_-5px_rgba(252,213,53,0.65)]"
        />
      )}
      <span className={[
        'relative h-3 text-[9px] font-bold leading-none',
        selected ? 'text-ink-inverse/70' : slot.isToday ? 'text-gold-300' : 'text-ink-muted/70',
      ].join(' ')}>{topLabel}</span>
      <span className={[
        'relative my-0.5 text-2xs font-bold leading-none',
        selected ? 'text-ink-inverse/85' : dowColor,
      ].join(' ')}>{slot.dow}</span>
      <span className="relative text-base font-extrabold leading-none tabular-nums">{slot.day}</span>
    </motion.button>
  );
}

// ── 서브컴포넌트: 날짜 슬라이더 ──────────────────────────────────────────────

interface DateSliderProps {
  selectedDates: string[];      // 복수 선택
  onToggle: (iso: string) => void;
  onPick: (iso: string) => void; // 7일 이후 임의 날짜 직접 선택
}

function DateSlider({ selectedDates, onToggle, onPick }: DateSliderProps) {
  // 3주치를 가로 모멘텀 레일로 노출(스냅·관성 스크롤), 그 외는 '달력'으로 지정
  const slots = useRef(buildDateSlots(21)).current;
  const todayIso = slots[0].iso;

  return (
    <div
      role="group"
      aria-label="날짜 빠른 선택 (복수 선택 가능)"
      className="flex gap-1.5 overflow-x-auto scrollbar-none snap-x scroll-px-page-x px-page-x pb-1.5 [-webkit-overflow-scrolling:touch] sm:gap-2"
    >
      {slots.map((slot) => (
        <DateTab
          key={slot.iso}
          slot={slot}
          selected={selectedDates.includes(slot.iso)}
          onClick={() => onToggle(slot.iso)}
        />
      ))}

      {/* 날짜 직접 선택 (3주 이후) — 네이티브 date picker 오버레이 */}
      <label
        title="날짜 직접 선택"
        className="relative flex shrink-0 snap-center flex-col items-center justify-center w-[3.25rem] h-16 rounded-2xl border border-dashed border-border-default text-ink-secondary hover:bg-surface-high hover:border-gold-400/50 cursor-pointer transition-colors focus-within:ring-2 focus-within:ring-gold-300"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span className="text-[10px] font-semibold leading-none mt-1">달력</span>
        <input
          type="date"
          min={todayIso}
          onChange={(e) => { if (e.target.value) onPick(e.target.value); }}
          className="absolute inset-0 opacity-0 cursor-pointer"
          aria-label="날짜 직접 선택"
        />
      </label>
    </div>
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
}

interface IntegratedSearchBarProps {
  onChange: (state: SearchState) => void;
  placeholder?: string;
  className?: string;
}

export default function IntegratedSearchBar({
  onChange,
  placeholder = '대회명, 펍 이름, 지역 검색…',
  className = '',
}: IntegratedSearchBarProps) {
  const [rawQuery,       setRawQuery]       = useState('');
  // 날짜·지역은 복수 선택(배열). 토글 방식으로 추가/제거.
  const [selectedDates,  setSelectedDates]  = useState<string[]>([]);
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]);
  // 토너먼트 필터는 단일 선택(라디오). format/gtdOnly는 여기서 파생.
  const [tour,           setTour]           = useState<TourFilter>('all');
  const [isFocused,      setIsFocused]      = useState(false);
  const inputRef                            = useRef<HTMLInputElement>(null);
  const [, startTransition]                = useTransition();

  const deferredQuery = useDeferredValue(rawQuery);

  useEffect(() => {
    // tour → format/gtdOnly/competitionOnly 파생 (SearchState 계약 유지)
    const format          = tour === 'MTT' ? 'MTT' : null;
    const gtdOnly         = tour === 'GTD';
    const competitionOnly = tour === 'comp';
    startTransition(() => {
      onChange({ query: deferredQuery, dates: selectedDates, regions: selectedRegions, format, gtdOnly, competitionOnly });
    });
  }, [deferredQuery, selectedDates, selectedRegions, tour, onChange]);

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
  const activeCount =
    (rawQuery.length > 0 ? 1 : 0) +
    selectedDates.length +
    selectedRegions.length;

  const hasActiveFilter = activeCount > 0;

  const clearAll = useCallback(() => {
    setRawQuery('');
    setSelectedDates([]);
    setSelectedRegions([]);
    setTour('all');
  }, []);

  return (
    <div className={['w-full', className].join(' ')}>
      {/* ── 검색창 ─────────────────────────────────────────────────────── */}
      <div className="px-page-x pt-2 pb-2">
        <form
          onSubmit={handleSubmit}
          className={[
            'flex items-center gap-2 px-3',
            'bg-surface-high rounded-input h-11',
            'border transition-all duration-150',
            isFocused
              ? 'border-gold-300'
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
              className="shrink-0 min-w-[1.25rem] h-5 flex items-center justify-center rounded-badge bg-gold-300 text-ink-inverse text-2xs font-bold px-1"
            >
              {activeCount}
            </span>
          )}
        </form>
      </div>

      {/* ── 날짜 슬라이더 탭 (복수 선택) ─────────────────────────────────── */}
      <DateSlider selectedDates={selectedDates} onToggle={handleDateToggle} onPick={handlePickDate} />

      {/* ── 지역(복수선택) + 토너먼트(라디오) 필터 ──────────────────────── */}
      <div className="flex flex-col gap-2 px-page-x pt-2 pb-1">
        {/* 토너먼트 + 지역 필터 — 한 줄(라디오 + 지역 드롭다운) */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div
            role="radiogroup"
            aria-label="토너먼트 필터"
            className="inline-flex items-center gap-0.5 rounded-input bg-surface-high/60 p-0.5 border border-border-subtle"
          >
            {TOUR_OPTIONS.map(({ id, label }) => {
              const active = tour === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTour(id)}
                  className={[
                    'relative inline-flex items-center h-6 px-3 rounded-[6px] text-2xs font-bold leading-none transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300',
                    active ? 'text-ink-inverse' : 'text-ink-muted hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {active && (
                    <motion.span layoutId="tour-filter-pill" aria-hidden
                      className="absolute inset-0 rounded-[6px] bg-gold-300"
                      transition={{ type: 'spring', stiffness: 700, damping: 42 }} />
                  )}
                  <span className="relative">{label}</span>
                </button>
              );
            })}
          </div>

          {/* 지역 선택 드롭다운 (단일 선택) — 칩 대신 콤팩트한 select */}
          <div className="relative">
            <select
              aria-label="지역 선택"
              value={selectedRegions[0] ?? ''}
              onChange={(e) => setSelectedRegions(e.target.value ? [e.target.value] : [])}
              className={[
                'appearance-none h-7 pl-3 pr-7 rounded-input border text-2xs font-bold leading-none cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300',
                selectedRegions.length > 0
                  ? 'bg-gold-300/15 border-gold-300 text-gold-300'
                  : 'bg-surface-high/60 border-border-subtle text-ink-secondary hover:border-border-strong',
              ].join(' ')}
            >
              <option value="">전체 지역</option>
              {REGION_CHIPS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden
              className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-ink-muted"
            >
              <path d="M2 4l3 3 3-3" />
            </svg>
          </div>

          {/* 전체 초기화 (필터 있을 때만) */}
          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearAll}
              className="ml-auto px-2 py-1 rounded-badge text-2xs text-ink-muted hover:text-danger border border-transparent hover:border-danger/40 transition-colors focus:outline-none"
            >
              전체 초기화
            </button>
          )}
        </div>
      </div>

      {/* ── 활성 필터 요약 칩 (토너먼트 선택은 칩 하이라이트로 충분 → 요약 제외) ── */}
      {(rawQuery || selectedDates.length > 0 || selectedRegions.length > 0) && (
        <div
          className="flex flex-wrap gap-1.5 px-page-x pt-1 pb-2 animate-slide-up"
          role="status"
          aria-live="polite"
          aria-label="적용된 필터"
        >
          {rawQuery && (
            <FilterChip label={`"${rawQuery}"`} onRemove={handleClear} />
          )}
          {/* 선택된 날짜마다 칩 1개 (복수 선택) */}
          {selectedDates.map((iso) => (
            <FilterChip key={iso} label={formatDateLabel(iso)} onRemove={() => handleDateToggle(iso)} />
          ))}
          {/* 선택된 지역마다 칩 1개 (복수 선택) */}
          {selectedRegions.map((r) => (
            <FilterChip key={r} label={r} onRemove={() => handleRegionToggle(r)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── 필터 칩 ──────────────────────────────────────────────────────────────────

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-badge bg-surface-float border border-border-default text-xs text-ink-secondary">
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
