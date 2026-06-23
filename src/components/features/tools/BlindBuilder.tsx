import { useState } from 'react';
import { CalcCard, Field, NumIn } from './calcUi';
import { generateBlinds } from '../../../api/clock';

// 블라인드 구조 생성기 — 레지 마감·최대 레벨·레벨 길이로 구조 자동 생성(로티 파이널롤백 기반 엔진).
export default function BlindBuilder() {
  const [regClose, setRegClose] = useState(16);
  const [maxLevel, setMaxLevel] = useState(25);
  const [preDur, setPreDur] = useState(20);
  const [postDur, setPostDur] = useState(15);

  const mx = Math.max(5, Math.min(maxLevel, 40));
  const rc = Math.max(1, Math.min(regClose, mx));
  const levels = generateBlinds(rc, mx, Math.max(1, preDur), Math.max(1, postDur));
  const levelCount = levels.filter((l) => l.kind === 'level').length;
  const totalMin = levels.reduce((a, l) => a + l.minutes, 0);
  let no = 0;

  return (
    <CalcCard title="블라인드 구조 생성기" desc="레지 마감·최대 레벨·레벨 길이로 구조 자동 생성">
      <div className="grid grid-cols-2 gap-2">
        <Field label="레지 마감 레벨"><NumIn value={regClose} onChange={setRegClose} suffix="LV" /></Field>
        <Field label="최대 레벨"><NumIn value={maxLevel} onChange={setMaxLevel} suffix="LV" /></Field>
        <Field label="레벨 길이(레지 전)"><NumIn value={preDur} onChange={setPreDur} suffix="분" /></Field>
        <Field label="레벨 길이(레지 후)"><NumIn value={postDur} onChange={setPostDur} suffix="분" /></Field>
      </div>
      <p className="text-2xs text-ink-muted">
        총 <b className="text-ink-secondary">{levelCount}</b>레벨 · 예상 <b className="text-ink-secondary">{(Math.round((totalMin / 60) * 10) / 10).toFixed(1)}</b>시간 (브레이크 포함)
      </p>

      <div className="max-h-80 overflow-y-auto rounded-input border border-border-subtle">
        <table className="w-full text-2xs tabular-nums">
          <thead className="sticky top-0 z-10">
            <tr className="bg-surface-high text-ink-muted">
              <th className="py-1.5 px-2 text-left font-semibold">LV</th>
              <th className="py-1.5 px-2 text-right font-semibold">SB / BB</th>
              <th className="py-1.5 px-2 text-right font-semibold">앤티</th>
              <th className="py-1.5 px-2 text-right font-semibold">시간</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l, i) => {
              if (l.kind === 'break') {
                return (
                  <tr key={i} className="border-t border-border-subtle bg-accent-300/[0.06]">
                    <td colSpan={4} className="py-1.5 px-2 text-center font-bold text-accent-300">BREAK · {l.minutes}분</td>
                  </tr>
                );
              }
              no += 1;
              const isRc = no === rc;
              return (
                <tr key={i} className={`border-t border-border-subtle ${isRc ? 'bg-amber-500/[0.08]' : ''}`}>
                  <td className="py-1.5 px-2 text-left font-bold text-ink-secondary">
                    {no}{isRc && <span className="ml-1 text-[9px] font-bold text-amber-400">레지마감</span>}
                  </td>
                  <td className="py-1.5 px-2 text-right font-semibold text-ink-primary">{l.sb.toLocaleString()} / {l.bb.toLocaleString()}</td>
                  <td className="py-1.5 px-2 text-right text-ink-muted">{l.ante ? l.ante.toLocaleString() : '-'}</td>
                  <td className="py-1.5 px-2 text-right text-ink-muted">{l.minutes}분</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-ink-muted leading-relaxed">클락 설정에서도 동일 엔진으로 자동 생성됩니다. 레벨 5단위마다 브레이크가 들어갑니다.</p>
    </CalcCard>
  );
}
