import { useMemo, useState } from 'react';

/* 포스트플랍 트레이너 — 실전 상황 퀴즈(GTO 위자드 연습 모드 스타일).
   시나리오를 보고 최적 액션을 고르면 정답·해설 + 정답률을 추적한다. */

type Action = '벳' | '체크' | '콜' | '레이즈' | '폴드';
interface Scenario {
  id: number;
  spot: string;        // 상황 한 줄
  hand: string;        // 내 핸드
  board: string;       // 보드
  pot: string;         // 팟/스택 정보
  options: Action[];
  answer: Action;
  alsoOk?: Action;     // 혼합 전략 허용 답
  why: string;         // 해설
}

const SCENARIOS: Scenario[] = [
  { id: 1, spot: 'BTN 오픈 → BB 콜. 헤즈업 플랍, 상대 체크', hand: 'A♠ K♦', board: 'K♥ 7♣ 2♦', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', why: '드라이 보드 탑페어 탑키커 — 레인지·너트 우위 모두 내 쪽. 작게(⅓팟) 높은 빈도로 밸류벳.' },
  { id: 2, spot: 'BTN 오픈 → BB 콜. 플랍 상대 체크', hand: 'Q♠ J♠', board: 'A♥ 8♦ 3♣', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', why: 'A하이 드라이 보드는 오픈한 쪽(BTN)의 레인지 우위가 극대 — 거의 전 레인지로 ⅓팟 시벳이 표준.' },
  { id: 3, spot: 'UTG 오픈 → BTN 콜. 플랍에서 내가 벳, 상대 레이즈', hand: 'A♦ A♣', board: '9♠ 8♠ 7♥', pot: '레이즈 후 팟 24bb · 유효 88bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: '몬스터 드로우·셋이 많은 최악의 보드. 오버페어는 콜로 팟 통제 — 3벳은 블러프만 접게 하고 밸류에게 박힘.' },
  { id: 4, spot: 'CO 오픈 → BB 콜. 플랍 체크-체크, 턴 상대 체크', hand: '6♦ 6♣', board: 'K♣ 9♦ 4♠ / 2♥', pot: '팟 5.5bb', options: ['벳', '체크'], answer: '체크', why: '플랍을 체크한 K보드에서 66은 쇼다운 가치만 남음. 벳은 더 좋은 핸드만 콜 — 체크 후 저렴하게 쇼다운.' },
  { id: 5, spot: 'BTN 오픈 → BB 콜. 플랍 시벳 콜, 턴', hand: 'A♣ 5♣', board: 'Q♣ 9♣ 3♦ / 7♣', pot: '팟 12bb · 유효 88bb', options: ['벳', '체크'], answer: '벳', why: '넛플러시 완성. 상대 레인지에 약한 플러시·투페어·셋이 살아있는 지금 ⅔~¾팟 밸류벳.' },
  { id: 6, spot: 'BB 디펜드. 플랍 상대 ⅓팟 시벳', hand: '8♥ 7♥', board: '9♥ 6♣ 2♦', pot: '벳 후 팟 7.3bb', options: ['콜', '레이즈', '폴드'], answer: '콜', alsoOk: '레이즈', why: '양차+백도어. 콜 기본, 일부 빈도 레이즈(세미블러프)도 GTO 혼합 — 폴드만 명확한 실수.' },
  { id: 7, spot: 'SB 3벳 → BTN 콜. 플랍', hand: 'A♠ Q♠', board: 'J♦ 8♣ 4♥', pot: '팟 18.5bb · 유효 91bb', options: ['벳', '체크'], answer: '벳', why: '3벳 팟의 레인지 우위 + 오버카드 2장·백도어 — ⅓팟 고빈도 시벳이 표준(체크는 BTN에게 주도권 헌납).' },
  { id: 8, spot: 'BTN 오픈 → BB 콜. 플랍 시벳 콜, 턴 시벳 콜, 리버', hand: 'K♠ K♦', board: 'Q♥ 8♦ 3♣ / 5♠ / A♦', pot: '팟 40bb · 유효 60bb', options: ['벳', '체크'], answer: '체크', why: '리버 A는 BB의 콜 레인지(Ax)를 전부 살려주는 최악의 카드. KK는 체크 후 벳엔 블러프캐처로 판단.' },
  { id: 9, spot: 'MP 오픈에 BTN인 나', hand: 'A♦ J♦', board: '(프리플랍)', pot: '오픈 2.5bb · 유효 100bb', options: ['콜', '레이즈', '폴드'], answer: '레이즈', alsoOk: '콜', why: 'AJs는 BTN에서 3벳(밸류+블로커) 또는 콜 혼합. 폴드는 명확한 손해.' },
  { id: 10, spot: 'BB 디펜드. 플랍 체크 → 상대 체크. 턴', hand: 'T♠ 9♠', board: '8♠ 5♦ 2♣ / J♥', pot: '팟 5.5bb', options: ['벳', '체크'], answer: '벳', why: '상대가 플랍 체크백 → 캡 레인지. J 턴은 내 레인지에 유리 + 양차 — 프로브 벳으로 폴드 에퀴티+에퀴티 동시 확보.' },
  { id: 11, spot: 'CO 오픈 → BTN 3벳, 나(CO)', hand: 'K♣ Q♣', board: '(프리플랍)', pot: '3벳 9bb · 유효 100bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: 'KQs는 3벳에 수익적 콜(포지션 불리해도 플레이아빌리티 최상). 4벳은 과격, 폴드는 과소.' },
  { id: 12, spot: 'BTN 오픈 → BB 콜. 플랍 ⅓ 시벳 → 상대 체크레이즈', hand: '7♦ 7♠', board: 'Q♠ 7♥ 2♣', pot: '레이즈 후 팟 16bb', options: ['콜', '레이즈', '폴드'], answer: '레이즈', alsoOk: '콜', why: '미들셋 — 드라이 보드라 슬로플레이(콜)도 가능하지만, 체크레이즈 레인지엔 Qx 밸류가 많아 3벳 밸류가 큼.' },
  { id: 13, spot: 'BB vs BTN 오픈. 플랍 시벳에 콜, 턴 더블배럴', hand: 'A♥ 9♥', board: 'K♦ 9♣ 4♥ / 2♠', pot: '벳 9bb · 팟 21bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: '미들페어+오버카드+백도어 — MDF상 접기엔 너무 강하고 레이즈할 밸류는 아님. 표준 블러프캐처 콜.' },
  { id: 14, spot: 'UTG 오픈에 BB인 나', hand: 'J♠ T♠', board: '(프리플랍)', pot: '오픈 2.5bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: 'JTs는 어떤 오픈에도 BB에서 디펜드(콜). 3벳은 UTG 강레인지 상대로 비효율.' },
  { id: 15, spot: 'BTN 오픈 → BB 콜. 플랍 시벳 콜, 턴', hand: 'A♠ K♠', board: 'Q♦ 7♣ 3♥ / 2♦', pot: '팟 12bb', options: ['벳', '체크'], answer: '체크', alsoOk: '벳', why: 'AK하이는 턴 체크백(쇼다운 가치+리버 블러프캐치) 빈도가 높음. 더블배럴도 혼합이지만 기본은 체크.' },
  { id: 16, spot: '리버. 상대가 팟 벳(블러프캐치 판단)', hand: 'K♥ Q♥', board: 'Q♠ 8♦ 4♣ / 6♠ / 2♥', pot: '벳 20bb · 팟 40bb', options: ['콜', '폴드'], answer: '콜', why: '팟 벳엔 33% 승률만 있으면 콜. 탑페어 굿키커는 상대 밸류(셋·투페어)와 미스드 드로우 블러프를 모두 고려해도 콜 범위.' },
  { id: 17, spot: 'SB(나) vs BB 림프 팟. 플랍', hand: 'A♣ 2♣', board: 'A♦ A♥ 6♣', pot: '팟 2bb', options: ['벳', '체크'], answer: '체크', why: '트립스+락 보드 — 상대 레인지에 맞는 게 없음. 체크로 따라오게 유도(슬로플레이가 EV 최대).' },
  { id: 18, spot: '3벳 팟. 플랍 시벳에 상대 올인(스택 팟 비슷)', hand: 'Q♦ Q♣', board: 'J♠ 6♦ 3♣', pot: 'SPR ≈ 1', options: ['콜', '폴드'], answer: '콜', why: 'SPR 1 이하 3벳 팟 오버페어는 절대 폴드 불가 — KK/AA에 일부 지더라도 JX·드로우·AK 전체 상대 압도적 콜.' },
];

const suitColor = (s: string) => (s.includes('♥') || s.includes('♦') ? 'text-red-400' : 'text-ink-primary');

export default function PostflopTrainer() {
  const [order] = useState(() => [...SCENARIOS].sort(() => Math.random() - 0.5));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Action | null>(null);
  const [right, setRight] = useState(0);
  const [total, setTotal] = useState(0);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);

  const sc = order[idx % order.length];
  const isCorrect = (a: Action) => a === sc.answer || a === sc.alsoOk;

  const pick = (a: Action) => {
    if (picked) return;
    setPicked(a);
    setTotal((t) => t + 1);
    if (isCorrect(a)) {
      setRight((r) => r + 1);
      setStreak((s) => { const n = s + 1; setBest((b) => Math.max(b, n)); return n; });
    } else setStreak(0);
  };
  const next = () => { setPicked(null); setIdx((i) => i + 1); };

  const cards = useMemo(() => sc.hand.split(' '), [sc]);
  const boardCards = useMemo(() => sc.board === '(프리플랍)' ? [] : sc.board.split(' '), [sc]);

  return (
    <div className="rounded-card border border-border-default bg-surface-low p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-ink-primary">포스트플랍 트레이너</h3>
          <p className="text-2xs text-ink-muted mt-0.5">상황을 보고 최적 액션을 고르세요 — 정답률·연속 기록을 추적합니다.</p>
        </div>
        <div className="shrink-0 text-right text-2xs tabular-nums">
          <p className="font-bold text-accent-300">{total > 0 ? Math.round((right / total) * 100) : 0}% <span className="font-normal text-ink-muted">({right}/{total})</span></p>
          <p className="text-ink-muted">연속 {streak} · 최고 {best}</p>
        </div>
      </div>

      {/* 상황 */}
      <div className="rounded-input border border-accent-400/25 bg-accent-300/[0.04] p-3 space-y-2">
        <p className="text-xs font-semibold text-ink-secondary">{sc.spot}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="text-[10px] text-ink-muted mr-0.5">내 핸드</span>
            {cards.map((c) => (
              <span key={c} className={['rounded-[5px] border border-border-default bg-surface-base px-1.5 py-1 text-sm font-extrabold', suitColor(c)].join(' ')}>{c}</span>
            ))}
          </span>
          {boardCards.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="text-[10px] text-ink-muted mr-0.5">보드</span>
              {boardCards.map((c, i) => c === '/' ? <span key={i} className="text-ink-muted">·</span> : (
                <span key={i} className={['rounded-[5px] border border-border-default bg-surface-base px-1.5 py-1 text-sm font-extrabold', suitColor(c)].join(' ')}>{c}</span>
              ))}
            </span>
          )}
        </div>
        <p className="text-2xs text-ink-muted tabular-nums">{sc.pot}</p>
      </div>

      {/* 선택지 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {sc.options.map((a) => {
          const chosen = picked === a;
          const reveal = picked !== null;
          const cls = !reveal
            ? 'border-border-default bg-surface-high hover:border-accent-400/50 text-ink-primary'
            : isCorrect(a)
              ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-300'
              : chosen
                ? 'border-danger/60 bg-danger/10 text-danger-light'
                : 'border-border-subtle bg-surface-high text-ink-muted';
          return (
            <button key={a} type="button" onClick={() => pick(a)} disabled={picked !== null}
              className={['rounded-input border py-2.5 text-sm font-extrabold transition-colors', cls].join(' ')}>
              {a}
            </button>
          );
        })}
      </div>

      {/* 해설 + 다음 */}
      {picked && (
        <div className="animate-fade-in space-y-2">
          <div className={['rounded-input border p-2.5 text-2xs leading-relaxed',
            isCorrect(picked) ? 'border-emerald-400/40 bg-emerald-400/[0.06] text-ink-secondary' : 'border-danger/40 bg-danger/[0.06] text-ink-secondary'].join(' ')}>
            <p className="font-bold mb-0.5">{isCorrect(picked) ? '✅ 정답!' : `❌ 정답은 「${sc.answer}」${sc.alsoOk ? ` (「${sc.alsoOk}」도 인정)` : ''}`}</p>
            {sc.why}
          </div>
          <button type="button" onClick={next} className="btn-primary w-full py-2 text-sm">다음 문제 →</button>
        </div>
      )}
    </div>
  );
}
