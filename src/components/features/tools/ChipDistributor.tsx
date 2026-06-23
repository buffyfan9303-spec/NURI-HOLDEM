import { useMemo, useState } from 'react';
import { CalcCard, Field, NumIn, Result } from './calcUi';

type Row = { denom: number; per: number };

/** 칩 분배기 — 1인 스택 구성 + 매장이 준비할 총 칩 수 계산 */
export default function ChipDistributor() {
  const [players, setPlayers] = useState(50);
  // 기본 칩 액면 100·500·1000·5000·25000 (직접 추가/수정 가능)
  const [rows, setRows] = useState<Row[]>([
    { denom: 100, per: 10 }, { denom: 500, per: 6 }, { denom: 1000, per: 4 }, { denom: 5000, per: 3 }, { denom: 25000, per: 1 },
  ]);
  const perStack = useMemo(() => rows.reduce((a, r) => a + (r.denom || 0) * (r.per || 0), 0), [rows]);
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const add = () => setRows((rs) => [...rs, { denom: 0, per: 0 }]);
  const del = (i: number) => setRows((rs) => rs.filter((_, k) => k !== i));

  return (
    <CalcCard title="칩 분배기" desc="1인 스택 구성과 매장이 준비할 총 칩 수를 계산합니다.">
      <Field label="참가 인원"><NumIn value={players} onChange={setPlayers} suffix="명" /></Field>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[1fr_1fr_1.3fr_auto] gap-1.5 px-1 text-2xs text-ink-muted">
          <span>칩 액면</span><span>1인 개수</span><span className="text-right">총 필요</span><span />
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1.3fr_auto] gap-1.5 items-center">
            <NumIn value={r.denom} onChange={(v) => setRow(i, { denom: v })} />
            <NumIn value={r.per} onChange={(v) => setRow(i, { per: v })} />
            <span className="text-right text-xs tabular-nums text-ink-secondary">{((r.per || 0) * players).toLocaleString()}개</span>
            <button type="button" onClick={() => del(i)} aria-label="삭제"
              className="w-7 h-7 flex items-center justify-center rounded-input text-ink-muted hover:text-danger-light">✕</button>
          </div>
        ))}
        <button type="button" onClick={add}
          className="w-full py-1.5 rounded-input border border-dashed border-border-default text-2xs text-ink-secondary hover:text-accent-300 hover:border-accent-400/50 transition-colors">+ 액면 추가</button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Result label="1인 스택" value={perStack.toLocaleString()} accent />
        <Result label="총 스택(전체)" value={(perStack * players).toLocaleString()} />
      </div>
    </CalcCard>
  );
}
