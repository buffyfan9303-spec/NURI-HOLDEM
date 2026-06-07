import { useMemo, useState } from 'react';
import { CalcCard, Field, NumIn, Result } from './calcUi';

/** 토너먼트 구조 시뮬 — 인원·스택·리바인으로 총 칩과 평균 스택 깊이 추정 */
export default function StructureSim() {
  const [players, setPlayers] = useState(50);
  const [start, setStart] = useState(50000);
  const [rebuyPct, setRebuyPct] = useState(50);
  const [startBB, setStartBB] = useState(200);

  const r = useMemo(() => {
    const total = Math.round(players * start * (1 + rebuyPct / 100));
    const avg = players > 0 ? Math.round(total / players) : 0;
    const startDepth = startBB > 0 ? Math.round(start / startBB) : 0;
    const totalBB = startBB > 0 ? Math.round(total / startBB) : 0;
    return { total, avg, startDepth, totalBB };
  }, [players, start, rebuyPct, startBB]);

  return (
    <CalcCard title="토너먼트 구조 시뮬" desc="인원·스택·리바인으로 총 칩과 평균 스택 깊이를 추정합니다.">
      <div className="grid grid-cols-2 gap-2">
        <Field label="참가 인원"><NumIn value={players} onChange={setPlayers} suffix="명" /></Field>
        <Field label="스타팅 스택"><NumIn value={start} onChange={setStart} /></Field>
        <Field label="리바인 비율(%)"><NumIn value={rebuyPct} onChange={setRebuyPct} suffix="%" /></Field>
        <Field label="시작 BB"><NumIn value={startBB} onChange={setStartBB} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Result label="총 칩" value={r.total.toLocaleString()} accent />
        <Result label="평균 스택" value={r.avg.toLocaleString()} />
        <Result label="시작 깊이" value={`${r.startDepth} BB`} />
        <Result label="전체 칩(BB)" value={`${r.totalBB.toLocaleString()} BB`} />
      </div>
      <p className="text-[10px] text-ink-muted leading-snug">리바인 비율 = 총 리바인 칩 / 스타팅 칩 추정치. 실제 구조는 블라인드 상승 속도에 따라 달라집니다.</p>
    </CalcCard>
  );
}
