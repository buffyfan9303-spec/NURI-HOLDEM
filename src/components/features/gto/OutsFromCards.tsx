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
import type { OutsResult } from './equityEngine';
import HandBoardPicker from './HandBoardPicker';
import { useHandBoard, type HandBoardInit } from './useHandBoard';
import { cardId } from './useDeepGto';
import type { Card } from './gto.types';

const SNAP = 'tool:outs';
// 진입 즉시 결과 — 빈 폼 대신 대표 상황(A♠K♠ 넛 플러시 드로우 vs 셋). GTO 패널의 데모 프리필과 같은 문법.
const DEMO: HandBoardInit = { hero: ['As', 'Ks'], villain: ['Qh', 'Qd'], board: ['Qs', '7s', '2h'] };

/** 아웃 o 장이 남은 T 장 중 2장 안에 뜰 확률(정확한 카드 세기 — 근사 아님) */
function twoCardProb(o: number, T: number): number {
  if (T < 2 || o <= 0) return 0;
  return 1 - ((T - o) / T) * ((T - 1 - o) / (T - 1));
}

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
      const behind = eq.hero < 0.5;
      const picked = behind ? ho : vo;
      setHeroEquity(eq.hero);
      setMine(behind);
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
  const twoCard = onFlop ? twoCardProb(o, T) : 0;
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
                ? (o === 0 ? '역전 카드가 없습니다. 드로잉 데드입니다' : '이 카드가 뜨면 내가 앞섭니다')
                : (o === 0 ? '이미 앞서 있고, 다음 카드로는 뒤집히지 않습니다' : '이미 내가 앞서 있습니다. 이 카드가 뜨면 역전당합니다')}
            </p>
            {o > 0 && (
              <div className="flex flex-wrap gap-1">
                {outs.cards.slice(0, 24).map((c) => <MiniCard key={cardId(c)} id={cardId(c)} />)}
                {outs.cards.length > 24 && <span className="self-center text-2xs text-ink-muted">+{outs.cards.length - 24}</span>}
              </div>
            )}
          </div>

          {/* 팟 오즈·4·2 법칙은 '내가 드로우를 쫓을 때'의 도구다. 내가 이미 앞선 상황에 그대로 띄우면
              무엇에 대한 확률인지 뒤집혀 읽힌다 — 앞선 쪽에선 역전 확률만 남긴다. */}
          {mine ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Result label={`다음 ${outs.next === 'river' ? '리버' : '턴'} 1장 확률`} value={`${(oneCard * 100).toFixed(1)}%`} />
                {onFlop
                  ? <Result label="턴+리버 2장 확률" value={`${(twoCard * 100).toFixed(1)}%`} />
                  : <Result label="간이 (4·2 법칙)" value={`≈${rule}%`} />}
              </div>
              {onFlop && (
                <Result label="간이 (4·2 법칙 · 2장 기준)" value={`≈${rule}%`}
                  desc={`정확값은 ${(twoCard * 100).toFixed(1)}%. 4·2 법칙은 아웃이 많을수록 실제보다 크게 나옵니다.`} />
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
