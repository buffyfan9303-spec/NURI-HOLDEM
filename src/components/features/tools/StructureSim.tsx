import { useMemo, useState } from 'react';
import { CalcCard, Field, NumIn, Result } from './calcUi';

// 블라인드 상승 시뮬용 라운딩 — 100/500/1000 단위로 보기 좋은 값으로 정리(clock 엔진과 동일 규칙).
const roundBlind = (v: number) => (v < 2000 ? Math.round(v / 100) * 100 : v < 10000 ? Math.round(v / 500) * 500 : Math.round(v / 1000) * 1000);

/** 토너먼트 구조 시뮬 — 인원·스택·리바인으로 총 칩과 평균 스택 깊이 추정 */
export default function StructureSim() {
  const [players, setPlayers] = useState(50);
  const [start, setStart] = useState(50000);
  const [rebuyPct, setRebuyPct] = useState(50);
  const [startBB, setStartBB] = useState(200);
  const [perLevel, setPerLevel] = useState(20); // 레벨 시간(분) — 시계열 경과 시간 표시용

  const r = useMemo(() => {
    const total = Math.round(players * start * (1 + rebuyPct / 100));
    const avg = players > 0 ? Math.round(total / players) : 0;
    const startDepth = startBB > 0 ? Math.round(start / startBB) : 0;
    const totalBB = startBB > 0 ? Math.round(total / startBB) : 0;
    // 시계열: 시작 BB(=스택/시작깊이)에서 레벨마다 1.4x 상승 가정 → 레벨 N의 평균 스택 깊이(bb).
    // 평균 스택은 탈락 없이 총칩/인원(리바인 포함) 고정으로 두는 단순 추정.
    const bb1 = startBB > 0 ? start / startBB : 0;
    const timeline: { lv: number; bb: number; depth: number; min: number }[] = [];
    if (bb1 > 0 && avg > 0) {
      for (let n = 1; n <= 12; n++) {
        const bb = Math.max(100, roundBlind(bb1 * Math.pow(1.4, n - 1)));
        const depth = avg / bb;
        timeline.push({ lv: n, bb, depth, min: n * Math.max(1, perLevel) });
        if (n >= 8 && depth < 5) break; // 8행 이상 확보 후 5bb 밑으로 떨어지면 종료
      }
    }
    return { total, avg, startDepth, totalBB, timeline };
  }, [players, start, rebuyPct, startBB, perLevel]);

  return (
    <CalcCard title="토너먼트 구조 시뮬" desc="인원·스택·리바인으로 총 칩과 평균 스택 깊이를 추정합니다.">
      <div className="grid grid-cols-2 gap-2">
        <Field label="참가 인원"><NumIn value={players} onChange={setPlayers} suffix="명" /></Field>
        <Field label="스타팅 스택"><NumIn value={start} onChange={setStart} /></Field>
        <Field label="리바인 비율(%)"><NumIn value={rebuyPct} onChange={setRebuyPct} suffix="%" /></Field>
        <Field label="시작 BB"><NumIn value={startBB} onChange={setStartBB} /></Field>
        <Field label="레벨 시간"><NumIn value={perLevel} onChange={setPerLevel} suffix="분" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Result label="총 칩" value={r.total.toLocaleString()} accent />
        <Result label="평균 스택" value={r.avg.toLocaleString()} />
        <Result label="시작 깊이" value={`${r.startDepth} BB`} />
        <Result label="전체 칩(BB)" value={`${r.totalBB.toLocaleString()} BB`} />
      </div>
      {/* 시계열: 상승률 1.4x 가정 시 레벨별 평균 스택 깊이 */}
      {r.timeline.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-input border border-border-subtle">
          <table className="w-full text-2xs tabular-nums">
            <thead className="sticky top-0 bg-surface-high text-ink-muted">
              <tr>
                <th className="py-1.5 px-2 text-left font-semibold">LV</th>
                <th className="py-1.5 px-2 text-right font-semibold">BB</th>
                <th className="py-1.5 px-2 text-right font-semibold">평균 스택</th>
                <th className="py-1.5 px-2 text-right font-semibold">경과</th>
              </tr>
            </thead>
            <tbody>
              {r.timeline.map((t) => (
                <tr key={t.lv} className="border-t border-border-subtle">
                  <td className="py-1 px-2 text-left font-bold text-ink-secondary">{t.lv}</td>
                  <td className="py-1 px-2 text-right text-ink-primary">{t.bb.toLocaleString()}</td>
                  <td className={['py-1 px-2 text-right font-bold', t.depth < 10 ? 'text-danger-light' : t.depth < 25 ? 'text-amber-400' : 'text-emerald-400'].join(' ')}>
                    {t.depth >= 10 ? Math.round(t.depth) : Math.round(t.depth * 10) / 10}bb
                  </td>
                  <td className="py-1 px-2 text-right text-ink-muted">{t.min}분</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-2xs text-ink-muted leading-snug">리바인 비율 = 총 리바인 칩 / 스타팅 칩 추정치. 표는 블라인드 상승률 1.4x·탈락 미반영 가정의 평균 스택 깊이(bb)입니다.</p>
    </CalcCard>
  );
}
