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

// ── 날짜 유틸 ─────────────────────────────────────────────────────────────────

const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

function buildDateSlots(count = 14) {
  const today = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      iso:   d.toISOString().slice(0, 10),
      month: d.getMonth() + 1,
      day:   d.getDate(),
      dow:   DAYS_KO[d.getDay()],
      isToday: i === 0,
      isSat: d.getDay() === 6,
      isSun: d.getDay() === 0,
    };
  });
}

type DateSlot = ReturnType<typeof buildDateSlots>[number];

// ── 필터 상수 ─────────────────────────────────────────────────────────────────

// 지역 대분류(요구사항 2) — 복수선택 유지, 목록만 교체
const REGION_CHIPS = [
  '서울', '강남', '강서', '경기남부', '경기북부',
  '인천', '부산', '대전', '대구', '광주', '제주',
] as const;

// 토너먼트 필터(요구사항 2) — [전체, MTT, GTD] 라디오(상호배타)
type TourFilter = 'all' | 'MTT' | 'GTD';
const TOUR_OPTIONS: { id: TourFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'MTT', label: 'MTT' },
  { id: 'GTD', label: 'GTD' },
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

  const dowColor = slot.isSun
    ? 'text-red-400'
    : slot.isSat
    ? 'text-blue-400'
    : 'text-ink-muted';

  return (
    <button
      ref={tabRef}
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={`${slot.month}월 ${slot.day}일 ${slot.dow}요일${slot.isToday ? ' (오늘)' : ''}`}
      className={[
        'relative flex flex-col items-center justify-center shrink-0',
        'w-12 h-tab-h rounded-input',
        'transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300',
        selected
          ? 'bg-gold-300 text-ink-inverse'
          : 'text-ink-secondary hover:bg-surface-high',
      ].join(' ')}
    >
      {slot.isToday && !selected && (
        <span aria-hidden className="absolute top-1 w-1 h-1 rounded-full bg-gold-300" />
      )}
      <span className={[
        'text-2xs font-medium leading-none mb-0.5',
        selected ? 'text-ink-inverse' : dowColor,
      ].join(' ')}>
        {slot.dow}
      </span>
      <span className="text-sm font-semibold leading-none">{slot.day}</span>
    </button>
  );
}

// ── 서브컴포넌트: 날짜 슬라이더 ──────────────────────────────────────────────

interface DateSliderProps {
  selectedDates: string[];      // 복수 선택
  onToggle: (iso: string) => void;
}

function DateSlider({ selectedDates, onToggle }: DateSliderProps) {
  const slots = useRef(buildDateSlots(14)).current;

  return (
    <div
      role="group"
      aria-label="날짜 빠른 선택 (복수 선택 가능)"
      className={[
        'flex gap-1 overflow-x-auto',
        'px-page-x pb-1',
        'scrollbar-none [&::-webkit-scrollbar]:hidden',
        'overflow-x-scroll [-webkit-overflow-scrolling:touch]',
      ].join(' ')}
    >
      {slots.map((slot) => (
        <DateTab
          key={slot.iso}
          slot={slot}
          selected={selectedDates.includes(slot.iso)}
          onClick={() => onToggle(slot.iso)}
        />
      ))}
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
    // tour → format/gtdOnly 파생 (SearchState 계약 유지)
    const format  = tour === 'MTT' ? 'MTT' : null;
    const gtdOnly = tour === 'GTD';
    startTransition(() => {
      onChange({ query: deferredQuery, dates: selectedDates, regions: selectedRegions, format, gtdOnly });
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

  // 배열 토글 헬퍼 — 이미 있으면 제거, 없으면 추가 (복수 선택)
  const toggleInArray = (arr: string[], value: string) =>
    arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

  const handleDateToggle   = useCallback((iso: string) => setSelectedDates((prev) => toggleInArray(prev, iso)), []);
  const handleRegionToggle = useCallback((r: string) => setSelectedRegions((prev) => toggleInArray(prev, r)), []);

  const activeCount =
    (rawQuery.length > 0 ? 1 : 0) +
    selectedDates.length +
    selectedRegions.length +
    (tour !== 'all' ? 1 : 0);

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
        <div
          className={[
            'flex items-center gap-2 px-3',
            'bg-surface-high rounded-input h-11',
            'border transition-all duration-150',
            isFocused
              ? 'border-gold-300 ring-1 ring-gold-300'
              : 'border-border-default',
          ].join(' ')}
        >
          <SearchIcon className="shrink-0 text-ink-muted" />

          <input
            ref={inputRef}
            type="search"
            inputMode="search"
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
        </div>
      </div>

      {/* ── 날짜 슬라이더 탭 (복수 선택) ─────────────────────────────────── */}
      <DateSlider selectedDates={selectedDates} onToggle={handleDateToggle} />

      {/* ── 지역(복수선택) + 토너먼트(라디오) 필터 ──────────────────────── */}
      <div className="flex flex-col gap-1.5 px-page-x pt-2 pb-1">
        {/* 지역 칩 */}
        <div
          className="flex gap-1.5 overflow-x-auto scrollbar-none [-webkit-overflow-scrolling:touch]"
          aria-label="지역 필터"
        >
          {REGION_CHIPS.map((r) => {
            const active = selectedRegions.includes(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => handleRegionToggle(r)}
                className={[
                  'shrink-0 px-2.5 py-1 rounded-badge text-2xs font-semibold border transition-colors focus:outline-none',
                  active
                    ? 'bg-gold-300/20 border-gold-300 text-gold-300'
                    : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary hover:border-border-strong',
                ].join(' ')}
              >
                {r}
              </button>
            );
          })}
        </div>

        {/* 토너먼트 필터 — [전체, MTT, GTD] 라디오(상호배타) */}
        <div className="flex items-center gap-1.5">
          <div
            role="radiogroup"
            aria-label="토너먼트 필터"
            className="inline-flex items-center gap-1 rounded-input bg-surface-high p-0.5 border border-border-default"
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
                    'px-3 py-1 rounded-[6px] text-2xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-300',
                    active
                      ? 'bg-gold-300 text-ink-inverse'
                      : 'text-ink-muted hover:text-ink-secondary',
                  ].join(' ')}
                >
                  {label}
                </button>
              );
            })}
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

      {/* ── 활성 필터 요약 칩 ────────────────────────────────────────────── */}
      {hasActiveFilter && (
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
            <FilterChip key={r} label={`📍 ${r}`} onRemove={() => handleRegionToggle(r)} />
          ))}
          {/* 토너먼트 필터 칩 (단일) */}
          {tour !== 'all' && (
            <FilterChip label={tour} onRemove={() => setTour('all')} />
          )}
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
