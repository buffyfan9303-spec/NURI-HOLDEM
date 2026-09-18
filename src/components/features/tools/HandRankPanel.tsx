// src/components/features/tools/HandRankPanel.tsx
// 홀덤 족보(핸드 랭킹) — 오너 지시 2026-09-17 "GTO 에 용어 있는 쪽에 탭 하나 더, 홀덤 족보".
// 데이터는 handRank.data.ts 가 단일 출처(용어사전 = glossary.data.ts 와 같은 조리법).
// 카드는 이미지가 아니라 HandCards 의 MiniCard(텍스트+CSS) — 번들 증가 0.
// 접근성: 무늬는 색만이 아니라 ♠♥♦♣ 글리프로 구분되고, 5장 묶음마다 스크린리더용 이름(A 스페이드 …)을 따로 단다 —
// ♠ 글리프는 리더마다 다르게 읽히거나 건너뛴다(CardGridPicker SUIT_NAME 주석).
import { MiniCard } from '../../atoms/HandCards';
import { SUIT_NAME } from '../gto/CardGridPicker';
import type { Suit } from '../gto/gto.types';
import { HAND_RANKS, HAND_RANK_NOTES } from './handRank.data';

const RANK_KO: Record<string, string> = { A: '에이스', K: '킹', Q: '퀸', J: '잭', T: '10' };
const cardName = (id: string) => `${RANK_KO[id.slice(0, -1)] ?? id.slice(0, -1)} ${SUIT_NAME[id.slice(-1) as Suit]}`;
const fmtFreq = (p: number) => (p < 0.1 ? `${p.toFixed(4)}%` : p < 10 ? `${p.toFixed(2)}%` : `${p.toFixed(1)}%`);

export default function HandRankPanel() {
  return (
    <div className="space-y-3">
      <p className="text-2xs text-ink-muted">강한 순서. 빈도는 내 2장 + 보드 5장(7장)에서 최선 5장이 그 족보가 될 확률입니다.</p>

      <ol className="rounded-aura border card-aura divide-y divide-border-subtle" aria-label="홀덤 족보 — 강한 순서">
        {HAND_RANKS.map((h, i) => (
          <li key={h.key} className="px-3.5 py-2.5">
            <div className="flex items-baseline gap-2">
              <span className="w-5 shrink-0 text-2xs font-bold tabular-nums text-ink-muted">{i + 1}</span>
              <span className="text-sm font-bold text-ink-primary">{h.ko}</span>
              <span className="min-w-0 text-2xs text-ink-muted">{h.en}</span>
              <span className="ml-auto shrink-0 text-2xs tabular-nums text-ink-muted">{fmtFreq(h.freq)}</span>
            </div>
            {/* 5장 행 실측(2026-09-17, 프로덕션 빌드) 최대 225px — 320px 에서도 오른쪽 끝 287px 로 남는다. 만약을 위해 flex-wrap. */}
            <div className="mt-1.5 flex flex-wrap gap-1" role="img" aria-label={h.cards.map(cardName).join(', ')}>
              <span className="contents" aria-hidden>
                {h.cards.map((c) => <MiniCard key={c} id={c} />)}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink-secondary">{h.desc}</p>
          </li>
        ))}
      </ol>

      <section className="space-y-2" aria-labelledby="handrank-notes">
        <h3 id="handrank-notes" className="text-sm font-bold text-ink-primary">자주 틀리는 것</h3>
        <ul className="rounded-aura border card-aura divide-y divide-border-subtle">
          {HAND_RANK_NOTES.map((n) => (
            <li key={n.title} className="px-3.5 py-2.5">
              <p className="text-xs font-semibold text-ink-primary">{n.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">{n.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
