import type { ReactNode } from 'react';

/** 도구 계산기 공통 UI — 카드/필드/숫자입력/결과 */
export function CalcCard({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-card border border-border-default bg-surface-low p-3">
      <div>
        <p className="text-sm font-bold text-ink-primary">{title}</p>
        <p className="text-2xs text-ink-muted mt-0.5">{desc}</p>
      </div>
      {children}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="block text-2xs font-semibold text-ink-secondary mb-1">{label}</span>
      {children}
    </div>
  );
}

export function NumIn({ value, onChange, suffix, placeholder }: { value: number; onChange: (n: number) => void; suffix?: string; placeholder?: string }) {
  return (
    <div className="relative">
      <input
        type="number" inputMode="numeric" min={0}
        value={value || ''}
        onChange={(e) => onChange(parseInt(e.target.value, 10) || 0)}
        placeholder={placeholder}
        className={`input w-full text-sm tabular-nums ${suffix ? 'pr-8' : ''}`}
      />
      {suffix && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-2xs text-ink-muted pointer-events-none">{suffix}</span>}
    </div>
  );
}

export function Result({ label, value, accent, good, bad }: { label: string; value: string; accent?: boolean; good?: boolean; bad?: boolean }) {
  return (
    <div className="rounded-input bg-surface-high p-2">
      <p className="text-2xs text-ink-muted">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums leading-tight ${bad ? 'text-danger-light' : good ? 'text-emerald-400' : accent ? 'text-gold-300' : 'text-ink-primary'}`}>{value}</p>
    </div>
  );
}
