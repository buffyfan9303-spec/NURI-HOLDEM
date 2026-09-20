// src/components/features/gto/OutsFromCards.tsx
// 아웃츠 계산기 '카드로 세기' 모드 — 유저가 아웃 개수를 세는 게 아니라 **앱이 센다**.
//
// 왜: 아웃을 셀 줄 아는 사람은 애초에 이 계산기가 필요 없다. 초보는 '몇 장인지'에서 막힌다.
// 엔진은 이미 있다 — equityEngine.computeOuts 를 워커(outsAsync)로 돌려 전수계산한다.
// 근사(4·2 법칙)는 버리지 않고 **정확값 옆에 나란히** 둔다(그게 학습이다).
//
// 방향 규칙(HandReplayer 와 동일 — 같은 개념이 화면마다 다르면 그게 버그다):
//   내가 뒤지면 '내 아웃츠(역전 카드)', 앞서면 '상대 아웃츠(위험 카드)'.
//   앞선 쪽에서 computeOuts 를 그대로 부르면 '지금도 이기는 카드' 30여 장이 아웃으로 잡힌다 — 아웃이 아니다.
//
// 무거운 계산은 전부 워커. 이 파일은 ToolsPanel 정적 청크에 들어가면 안 된다(에퀴티 엔진 동반) —
// OutsCalc 가 lazy 로 부른다.
import { useEffect, useMemo, useState } from 'react';
import { CalcCard, Result } from '../tools/calcUi';
import { MiniCard } from '../../atoms/HandCards';
import Icon from '../../atoms/Icon';
import { readSnap, writeSnap } from '../../../lib/snapshot';
import { equityAsync, outsAsync } from './equityClient';
import type { OutsResult, Standing } from './equityEngine';
import HandBoardPicker from './HandBoardPicker';
import { useHandBoard, type HandBoardInit } from './useHandBoard';
import { cardId } from './useDeepGto';
import type { Card } from './gto.types';

const SNAP = 'tool:outs';
// 진입 즉시 결과 — 빈 폼 대신 대표 상황(A♠K♠ 넛 플러시 드로우 vs 셋). GTO 패널의 데모 프리필과 같은 문법.
const DEMO: HandBoardInit = { hero: ['As', 'Ks'], villain: ['Qh', 'Qd'], board: ['Qs', '7s', '2h'] };

// 2026-09-17 삭제: twoCardProb(o, T) = 1 − ((T−o)/T)((T−1−o)/(T−1)).
// 이 식을 화면에서 "정확값" 이라 불렀는데 **근사였다.** 두 가지가 겹쳐 틀린다:
//  ① computeOuts 의 아웃은 "턴에 뜨면 내가 **우세해지는** 카드"지 "뜨면 이기는 카드"가 아니다.
//     우세해진 뒤에도 리버에서 뒤집힌다(보드가 페어되며 상대가 풀하우스).
//  ② 두 장을 독립처럼 곱해 런아웃 상호작용을 통째로 무시한다.
// 실측(전수계산 대비): 데모 핸드 32.7% vs 25.6% = **7.2%p**, 셋 vs 플러시드로는 97.2% vs 74.4% = **22.7%p**.
// 쓸 정확값은 **이미 화면에 있다** — heroEquity 는 플랍·턴에서 computeEquity 가 잔여 조합을
// 전수계산한 값이다(플랍 990조합 · 턴 44장). 없는 함수를 새로 만들 이유가 없다.

export default function OutsFromCards({ onCounted }: { onCounted?: (outs: number, street: 'flop' | 'turn') => void }) {
  const init = useMemo<HandBoardInit>(() => {
    const saved = readSnap<HandBoardInit>(SNAP);
    return saved && (saved.hero?.length ?? 0) === 2 ? saved : DEMO;
  }, []);
  const hb = useHandBoard(4, init);

  const heroKey = hb.ids.hero.join(',');
  const villainKey = hb.ids.villain.join(',');
  const boardKey = hb.ids.board.join(',');
  const ready = hb.heroCards.length === 2 && hb.villainCards.length === 2
    && (hb.boardCards.length === 3 || hb.boardCards.length === 4);

  const [busy, setBusy] = useState(false);
  const [heroEquity, setHeroEquity] = useState<number | null>(null);
  const [outs, setOuts] = useState<OutsResult | null>(null);
  const [mine, setMine] = useState(true); // true=내 아웃츠(뒤지는 중) / false=상대 아웃츠(앞서는 중)
  // 🔴 G2(2026-09-20) — **현재 패 우열**. 종전에는 이 값이 없어 미래 지분(`eq.hero < 0.5`)으로 대신했다.
  const [standing, setStanding] = useState<Standing>('behind');

  // 마지막 입력 보존 — 재방문 시 빈 폼이 아니라 '그 핸드'로 돌아온다(GTO 패널과 같은 스냅샷 문법)
  useEffect(() => {
    writeSnap(SNAP, { hero: heroKey ? heroKey.split(',') : [], villain: villainKey ? villainKey.split(',') : [], board: boardKey ? boardKey.split(',') : [] });
  }, [heroKey, villainKey, boardKey]);

  useEffect(() => {
    if (!ready) { setHeroEquity(null); setOuts(null); setBusy(false); return; }
    const hero = hb.heroCards.slice(0, 2) as [Card, Card];
    const villain = hb.villainCards.slice(0, 2) as [Card, Card];
    const board = hb.boardCards.slice();
    setBusy(true);
    let alive = true;
    Promise.all([
      equityAsync(hero, villain, board),
      outsAsync(hero, villain, board),
      outsAsync(villain, hero, board),
    ]).then(([eq, ho, vo]) => {
      if (!alive) return;
      // 🔴 G2(2026-09-20) — **현재 우열은 현재 패로 판단한다.** 종전 `eq.hero < 0.5` 는
      //   '리버까지의 지분'이라 완전히 다른 값이다. 외부 평가기로 확인한 반례:
      //   A♥K♥ vs 9♣9♦ / Q♥J♠2♥ 는 **지금 9 페어가 앞서는데** 지분이 63.2% 라
      //   `behind=false` 가 되어 화면이 "이미 내가 앞서 있습니다" 라고 거짓 안내했다.
      const st: Standing = ho?.standing ?? 'tied';
      // 동률은 별도 상태다 — '앞선다'로 접으면 상대 아웃(위험 카드)을 보여 주게 되어 뜻이 뒤집힌다.
      //   동률일 때 알고 싶은 것은 "무엇이 뜨면 내가 이기나" 이므로 내 아웃을 센다.
      const showMine = st !== 'ahead';
      const picked = showMine ? ho : vo;
      setHeroEquity(eq.hero);
      setStanding(st);
      setMine(showMine);
      setOuts(picked);
      setBusy(false);
      // 직접 입력 모드로 그대로 이어지게 개수와 시점을 함께 넘긴다(보드 3장=플랍, 4장=턴)
      onCounted?.(picked?.outs ?? 0, board.length === 4 ? 'turn' : 'flop');
    }).catch(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
    // hb.*Cards 는 아래 key 문자열에서 파생된 배열이라 매 렌더 새 참조 — key 만 의존성으로 둔다(무한 루프 방지)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, heroKey, villainKey, boardKey]);

  const T = outs?.total ?? 0;
  const o = outs?.outs ?? 0;
  const oneCard = outs?.prob ?? 0;
  const onFlop = hb.boardCards.length === 3;
  const rule = onFlop ? Math.min(o * 4, 100) : o * 2; // 4·2 법칙
  const breakeven = oneCard > 0 && oneCard < 1
    ? `${(Math.round(((1 - oneCard) / oneCard) * 10) / 10).toFixed(1)} : 1`
    : '-';
  // 나에게 좋은 소식인가 — 내 아웃이 있으면 O, 상대 아웃이 0이면 O(잠긴 승리)
  const goodNews = mine ? o > 0 : o === 0;

  // 한 줄 요약 — 상세 결과는 52장 그리드 아래라 작은 화면에선 접힘 밑이다. 핵심 숫자는 슬롯 옆에 남긴다.
  const summary = !ready ? (
    <span className="text-2xs text-ink-muted">카드를 다 고르면 여기서 아웃 개수가 바로 나옵니다</span>
  ) : busy ? (
    <span className="flex items-center gap-1.5 text-2xs text-ink-muted">
      <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-accent-300 border-t-transparent" />
      아웃 세는 중…
    </span>
  ) : outs ? (
    <span className="text-2xs tabular-nums text-ink-secondary">
      <b className={goodNews ? 'text-emerald-700 dark:text-emerald-300' : 'text-danger-deep dark:text-danger-light'}>
        {mine ? '내' : '상대'} 아웃츠 {o}장
      </b>
      {' · '}다음 {outs.next === 'river' ? '리버' : '턴'} {mine ? '' : '역전 '}{(oneCard * 100).toFixed(1)}%
      {' · '}내 승률 {Math.round((heroEquity ?? 0) * 100)}%
    </span>
  ) : null;

  return (
    <div className="space-y-3">
      <CalcCard>
        <HandBoardPicker hb={hb} hint={<>보드는 플랍 3장 또는 턴 4장</>} summary={summary} />
      </CalcCard>

      {!ready ? (
        <p className="rounded-aura border card-aura px-3 py-4 text-center text-2xs leading-relaxed text-ink-muted">
          내 핸드 2장 · 상대 핸드 2장 · 보드 3~4장을 고르면 앱이 아웃을 셉니다.
          <br />
          상대 카드를 모르면 위 <b className="text-ink-secondary">직접 입력</b> 모드를 쓰세요.
        </p>
      ) : busy ? (
        <p className="flex items-center justify-center gap-1.5 rounded-aura border card-aura py-6 text-2xs text-ink-muted">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-accent-300 border-t-transparent" />
          아웃 세는 중…
        </p>
      ) : outs ? (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Result label={`${outs.next === 'river' ? '리버' : '턴+리버'}까지 내 승률`} value={`${Math.round((heroEquity ?? 0) * 100)}%`} accent />
            <Result label={`${mine ? '내' : '상대'} 아웃츠`} value={`${o}장`} good={goodNews} bad={!goodNews} />
          </div>

          {/* 아웃 카드 — '몇 장'보다 '어떤 카드'가 학습이다.
              색은 '내 아웃/상대 아웃'이 아니라 **나에게 좋은 소식인가**로 정한다:
              드로잉 데드(내 아웃 0)는 초록이면 안 되고, 상대 아웃 0(잠긴 승리)은 빨강이면 안 된다. */}
          <div className={['rounded-aura border px-3 py-2.5 space-y-1.5',
            goodNews ? 'border-emerald-500/25 bg-emerald-500/[0.06]' : 'border-danger/25 bg-danger/[0.06]'].join(' ')}>
            <p className={['flex items-center gap-1 text-2xs font-bold', goodNews ? 'text-emerald-700 dark:text-emerald-300' : 'text-danger-deep dark:text-danger-light'].join(' ')}>
              <Icon name={goodNews ? 'target' : 'alert'} size={12} className="shrink-0" />
              {mine
                /* 🔴 G2 — 이 카드 목록은 `computeOuts` 의 정의상 **"뜨면 리버까지 승률이 50%를 넘는"**
                   카드다. "뜨면 그 순간 앞선다" 가 아니다 — 둘은 플랍에서 다르다(아래 즉시 역전 줄 참고).
                   종전 문구가 그 둘을 한 문장으로 합쳐 뜻이 어긋났다. */
                ? (o === 0
                  ? (standing === 'tied' ? '비긴 상태이고, 다음 카드로 유리해지는 카드가 없습니다' : '역전 카드가 없습니다. 드로잉 데드입니다')
                  : '이 카드가 뜨면 리버까지 승률이 50%를 넘습니다')
                : (o === 0 ? '이미 앞서 있고, 다음 카드로는 뒤집히지 않습니다' : '이미 내가 앞서 있습니다. 이 카드가 뜨면 상대 승률이 50%를 넘습니다')}
            </p>
            {o > 0 && (
              <div className="flex flex-wrap gap-1">
                {outs.cards.slice(0, 24).map((c) => <MiniCard key={cardId(c)} id={cardId(c)} />)}
                {outs.cards.length > 24 && <span className="self-center text-2xs text-ink-muted">+{outs.cards.length - 24}</span>}
              </div>
            )}
          </div>

          {/* 🔴 G2(2026-09-20) — **지금 누가 앞서는가**를 별도 줄로 못박는다.
              종전에는 이 값이 화면 어디에도 없었고, 미래 지분(`내 승률`)이 그 자리를 대신해
              "이미 내가 앞서 있습니다" 라는 거짓 문장을 만들었다. 두 축을 나란히 둔다. */}
          <Result label="지금 패 우열"
            value={standing === 'ahead' ? '내가 앞섬' : standing === 'behind' ? '내가 뒤짐' : '동률'}
            good={standing === 'ahead'} bad={standing === 'behind'}
            desc="남은 카드를 한 장도 보지 않고 지금 보드까지의 패만 비교한 값입니다 — 위 '내 승률'과 방향이 다를 수 있습니다" />

          {/* 🔴 G2 — **즉시 역전 카드**는 위 목록(승률 50% 초과)과 다른 집합이다.
              플랍에서 강한 드로는 "유리해지는 카드"에는 들어가지만 그 순간 패가 앞서지는 않는다.
              수가 같으면 줄을 만들지 않는다(같은 말을 두 번 하지 않는다 — 턴에서는 쇼다운이라 항상 같다). */}
          {outs.immediateOuts !== o && (
            <Result label={`다음 1장에 ${mine ? '내가 바로 앞서는' : '상대가 바로 앞서는'} 카드`}
              value={`${outs.immediateOuts}장 · ${(outs.immediateProb * 100).toFixed(1)}%`}
              desc={`위 ${o}장은 '뜨면 리버까지 승률이 50%를 넘는' 카드이고, 이 ${outs.immediateOuts}장은 '뜨는 순간 패 자체가 앞서는' 카드입니다`} />
          )}

          {/* 팟 오즈·4·2 법칙은 '내가 드로우를 쫓을 때'의 도구다. 내가 이미 앞선 상황에 그대로 띄우면
              무엇에 대한 확률인지 뒤집혀 읽힌다 — 앞선 쪽에선 역전 확률만 남긴다. */}
          {mine ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Result label={`다음 ${outs.next === 'river' ? '리버' : '턴'} 1장 확률`} value={`${(oneCard * 100).toFixed(1)}%`} />
                {/* 🔴 G2 — 4·2 근사의 **전제**를 결과 옆에 적는다. 이 `o` 는 '뜨면 리버까지 승률이
                    50%를 넘는' 카드 수이고, 4·2 법칙의 원래 전제는 '뜨면 이기는 카드'다. 두 전제가
                    같지 않으므로 근사값을 단독 수치처럼 두지 않는다(정확값은 바로 아래에 있다). */}
                <Result label="간이 (4·2 법칙)" value={`≈${rule}%`}
                  desc={`아웃 ${o}장에 ${onFlop ? '4' : '2'}를 곱한 암산용 근사입니다 — 그 ${o}장은 '뜨면 이기는 카드'가 아니라 '뜨면 리버까지 승률 50% 초과'라 전제가 다릅니다`} />
              </div>
              {onFlop && (
                <Result label="턴+리버까지 이길 확률" value={`${((heroEquity ?? 0) * 100).toFixed(1)}%`}
                  desc={`남은 카드를 전부 돌려 계산한 값입니다. 4·2 법칙(≈${rule}%)은 2장 기준이라 아웃이 많을수록 실제보다 크게 나옵니다.`} />
              )}
              <Result label="브레이크이븐 팟 오즈" value={breakeven} desc="다음 1장 기준" />
              {onFlop && (
                <p className="flex items-start gap-1 text-2xs leading-relaxed text-amber-400">
                  <Icon name="alert" size={12} className="mt-px shrink-0" />
                  한 스트리트 판단은 1장 기준(2장 확률은 올인일 때만)
                </p>
              )}
            </>
          ) : (
            <Result label={`다음 ${outs.next === 'river' ? '리버' : '턴'} 1장에 역전당할 확률`} value={`${(oneCard * 100).toFixed(1)}%`} bad={o > 0} />
          )}
          <p className="text-2xs leading-relaxed text-ink-muted">
            남은 {T}장 중 {o}장 — 두 핸드를 다 알고 다음 카드 {T}장을 전부 돌려본 결과입니다(보드가 페어되며 상대가 더 좋아지는 런아웃까지 반영).
          </p>
        </div>
      ) : null}
    </div>
  );
}
