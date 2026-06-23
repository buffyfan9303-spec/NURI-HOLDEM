// src/components/atoms/DateTimePicker.tsx
// 날짜+시간 통합 피커 — 모바일/PC 공용. 레지마감 새벽(자정 넘김)을 위해 날짜를 함께 고른다.
// 트리거 버튼 → 팝오버(날짜 스테퍼 + 시/분 스크롤 컬럼). value/onChange는 ISO 문자열.
import { useEffect, useRef, useState } from 'react';

const WDAY = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (n: number) => String(n).padStart(2, '0');
const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const shiftDate = (ymd: string, days: number) => { const x = new Date(`${ymd}T00:00:00`); x.setDate(x.getDate() + days); return toLocalDate(x); };

function fmt(d: Date): string {
  const h = d.getHours();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${d.getMonth() + 1}.${d.getDate()}(${WDAY[d.getDay()]}) ${ampm} ${h12}:${pad(d.getMinutes())}`;
}

export default function DateTimePicker({
  value, onChange, placeholder = '날짜·시간 선택', defaultDate,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  defaultDate?: string; // 팝오버 첫 오픈 시 기본 날짜(YYYY-MM-DD)
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = value ? new Date(value) : null;

  // 편집 중 임시 상태
  const [ymd, setYmd] = useState<string>(cur ? toLocalDate(cur) : (defaultDate || toLocalDate(new Date())));
  const [hh, setHh] = useState<number>(cur ? cur.getHours() : 19);
  const [mm, setMm] = useState<number>(cur ? cur.getMinutes() : 0);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const openPicker = () => {
    const c = value ? new Date(value) : null;
    setYmd(c ? toLocalDate(c) : (defaultDate || toLocalDate(new Date())));
    setHh(c ? c.getHours() : 19);
    setMm(c ? c.getMinutes() : 0);
    setOpen(true);
  };

  const apply = (nh = hh, nm = mm, ny = ymd) => {
    const iso = new Date(`${ny}T${pad(nh)}:${pad(nm)}:00`).toISOString();
    onChange(iso);
  };

  const minutes = Array.from({ length: 12 }, (_, i) => i * 5); // 5분 단위
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => (open ? setOpen(false) : openPicker())}
        className="w-full flex items-center justify-between gap-2 input text-sm text-left">
        <span className={cur ? 'text-ink-primary font-semibold' : 'text-ink-muted'}>{cur ? fmt(cur) : placeholder}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {cur && <span role="button" tabIndex={0} onClick={(e) => { e.stopPropagation(); onChange(null); }} className="text-ink-muted hover:text-danger-light text-xs">✕</span>}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ink-muted" aria-hidden><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /></svg>
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 right-0 rounded-card border border-border-default bg-surface-float shadow-dialog p-3 space-y-2.5">
          {/* 날짜 */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <button type="button" onClick={() => setYmd((d) => shiftDate(d, -1))} className="w-8 h-8 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">‹</button>
              <div className="flex-1 text-center">
                <p className="text-sm font-bold text-accent-300 tabular-nums">{(() => { const d = new Date(`${ymd}T00:00:00`); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${WDAY[d.getDay()]})`; })()}</p>
              </div>
              <button type="button" onClick={() => setYmd((d) => shiftDate(d, 1))} className="w-8 h-8 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">›</button>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-1.5">
              <button type="button" onClick={() => setYmd(toLocalDate(new Date()))} className="text-2xs px-2 py-1 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">오늘</button>
              <button type="button" onClick={() => setYmd(shiftDate(toLocalDate(new Date()), 1))} className="text-2xs px-2 py-1 rounded-input bg-surface-high text-ink-secondary hover:text-accent-300">내일(새벽 마감용)</button>
            </div>
          </div>

          {/* 시 · 분 */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] text-ink-muted text-center mb-1">시</p>
              <div className="h-32 overflow-y-auto rounded-input border border-border-subtle bg-surface-base grid grid-cols-3 gap-0.5 p-1 scrollbar-none">
                {hours.map((h) => (
                  <button key={h} type="button" onClick={() => setHh(h)}
                    className={['py-1.5 rounded text-xs font-bold tabular-nums transition-colors', hh === h ? 'bg-accent-300 text-white' : 'text-ink-secondary hover:bg-surface-high'].join(' ')}>{pad(h)}</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-ink-muted text-center mb-1">분 (5분)</p>
              <div className="h-32 overflow-y-auto rounded-input border border-border-subtle bg-surface-base grid grid-cols-2 gap-0.5 p-1 scrollbar-none">
                {minutes.map((m) => (
                  <button key={m} type="button" onClick={() => setMm(m)}
                    className={['py-1.5 rounded text-xs font-bold tabular-nums transition-colors', mm === m ? 'bg-accent-300 text-white' : 'text-ink-secondary hover:bg-surface-high'].join(' ')}>{pad(m)}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-2xs text-ink-muted">선택: <b className="text-ink-secondary tabular-nums">{(() => { const d = new Date(`${ymd}T${pad(hh)}:${pad(mm)}:00`); return fmt(d); })()}</b></span>
            <button type="button" onClick={() => { apply(); setOpen(false); }} className="btn-primary text-xs px-4">확인</button>
          </div>
        </div>
      )}
    </div>
  );
}
