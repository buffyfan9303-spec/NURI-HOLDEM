import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import { useTrainerProgress, recordAnswer, setDailyGoal, GOAL_CHOICES } from '../../../lib/trainerProgress';

/* 포스트플랍 트레이너 — 실전 상황 퀴즈(GTO 위자드 연습 모드 스타일).
   시나리오를 보고 최적 액션을 고르면 정답·해설 + 정답률을 추적한다.
   v2: 60문항 · 카테고리 필터 · 사이클마다 재셔플(오답 우선 배치) · localStorage 기록(카테고리별 약점 → 보완 추천). */

type Action = '벳' | '체크' | '콜' | '레이즈' | '폴드' | '⅓팟 벳' | '⅔팟 벳' | '팟 벳' | '오버벳' | '올인';
type Category = 'cbet' | 'defense' | 'bluffcatch' | 'sizing' | '3betpot' | 'turn' | 'river' | 'preflop';

// eslint-disable-next-line react-refresh/only-export-components -- ToolsPanel 'For You' 추천이 약점 카테고리 라벨을 공유(단일 소스)
export const CAT_LABEL: Record<Category, string> = {
  cbet: '시벳', defense: '수비', bluffcatch: '블러프캐치', sizing: '사이징',
  '3betpot': '3벳팟', turn: '턴', river: '리버', preflop: '프리플랍',
};
const ALL_CATS = Object.keys(CAT_LABEL) as Category[];

interface Scenario {
  id: number;
  cat: Category;       // 카테고리(필터·약점 추적)
  spot: string;        // 상황 한 줄
  hand: string;        // 내 핸드
  board: string;       // 보드
  pot: string;         // 팟/스택 정보
  options: Action[];
  answer: Action;
  alsoOk?: Action;     // 혼합 전략 허용 답
  why: string;         // 해설(개념 명시, 2~3문장 — 수치는 팟 정보와 일치)
}

const SCENARIOS: Scenario[] = [
  /* ── 기존 18문항 (유지·보수) ─────────────────────────────── */
  { id: 1, cat: 'cbet', spot: 'BTN 오픈 → BB 콜. 헤즈업 플랍, 상대 체크', hand: 'A♠ K♦', board: 'K♥ 7♣ 2♦', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', why: '드라이 K하이 보드 탑페어 탑키커 — 레인지 우위와 너트 우위가 모두 오픈너 쪽입니다. 이런 보드는 ⅓팟 소액을 높은 빈도로 치는 레인지 시벳이 표준 — 약한 Kx·포켓에게서 3스트리트 밸류를 시작하는 지점입니다.' },
  { id: 2, cat: 'cbet', spot: 'BTN 오픈 → BB 콜. 플랍 상대 체크', hand: 'Q♠ J♠', board: 'A♥ 8♦ 3♣', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', why: 'A하이 드라이 보드는 오픈한 쪽(BTN)의 레인지 우위가 극대인 텍스처 — 거의 전 레인지로 ⅓팟 시벳이 표준입니다. QJ 같은 에어도 폴드 에퀴티와 백도어 덕에 벳 레인지에 자연스럽게 포함됩니다.' },
  { id: 3, cat: 'defense', spot: 'UTG 오픈 → BTN 콜. 플랍에서 내가 벳, 상대 레이즈', hand: 'A♦ A♣', board: '9♠ 8♠ 7♥', pot: '레이즈 후 팟 24bb · 유효 88bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: '몬스터 드로우·셋이 다 깔리는 최악의 보드에서 오버페어는 콜로 팟 통제(팟 컨트롤)가 정석입니다. 3벳은 블러프만 접게 하고 밸류에겐 스택이 박히는 역선택입니다.' },
  { id: 4, cat: 'turn', spot: 'CO 오픈 → BB 콜. 플랍 체크-체크, 턴 상대 체크', hand: '6♦ 6♣', board: 'K♣ 9♦ 4♠ / 2♥', pot: '팟 5.5bb', options: ['벳', '체크'], answer: '체크', why: '플랍을 체크로 넘긴 K보드에서 66은 쇼다운 가치만 남은 핸드입니다. 벳은 더 좋은 핸드만 콜하는 역선택 — 체크로 저렴하게 쇼다운 가는 게 EV 최대입니다(쇼다운 밸류 원칙).' },
  { id: 5, cat: 'turn', spot: 'BTN 오픈 → BB 콜. 플랍 시벳 콜, 턴', hand: 'A♣ 5♣', board: 'Q♣ 9♣ 3♦ / 7♣', pot: '팟 12bb · 유효 88bb', options: ['벳', '체크'], answer: '벳', why: '턴에 넛플러시 완성 — 상대 레인지엔 약한 플러시·투페어·셋이 아직 살아 있습니다. 밸류가 가장 두꺼운 지금 ⅔~¾팟으로 팟을 키우는 게 표준입니다(밸류 극대화 타이밍).' },
  { id: 6, cat: 'defense', spot: 'BB 디펜드. 플랍 상대 ⅓팟 시벳', hand: '8♥ 7♥', board: '9♥ 6♣ 2♦', pot: '⅓팟 벳 1.8bb · 벳 후 팟 7.3bb', options: ['콜', '레이즈', '폴드'], answer: '콜', alsoOk: '레이즈', why: '양차(오픈엔드)+백도어 플러시 — 콜이 기본이고 일부 빈도의 세미블러프 레이즈도 GTO 혼합입니다. ⅓팟 벳의 필요 승률은 20%뿐이라 폴드만 명확한 실수입니다.' },
  { id: 7, cat: '3betpot', spot: 'SB 3벳 → BTN 콜. 플랍', hand: 'A♠ Q♠', board: 'J♦ 8♣ 4♥', pot: '팟 18.5bb · 유효 91bb', options: ['벳', '체크'], answer: '벳', why: '3벳 팟은 3벳터(SB)의 레인지 우위가 큰 데다 오버카드 2장+백도어까지 있습니다. ⅓팟 고빈도 시벳이 표준 — 체크는 BTN에게 주도권을 헌납해 J하이 보드를 공짜로 넘겨줍니다.' },
  { id: 8, cat: 'river', spot: 'BTN 오픈 → BB 콜. 플랍 시벳 콜, 턴 시벳 콜, 리버', hand: 'K♠ K♦', board: 'Q♥ 8♦ 3♣ / 5♠ / A♦', pot: '팟 40bb · 유효 60bb', options: ['벳', '체크'], answer: '체크', why: '리버 A는 BB의 콜 레인지(Ax)를 전부 살려주는 최악의 역전 카드입니다. KK가 벳하면 이기는 핸드는 접고 지는 Ax만 콜 — 체크 후 벳이 오면 블러프캐처로 판단합니다.' },
  { id: 9, cat: 'preflop', spot: 'MP 오픈에 BTN인 나', hand: 'A♦ J♦', board: '(프리플랍)', pot: '오픈 2.5bb · 유효 100bb', options: ['콜', '레이즈', '폴드'], answer: '레이즈', alsoOk: '콜', why: 'AJs는 BTN에서 3벳(밸류+A 블로커) 또는 콜을 혼합하는 핸드입니다. 포지션·플레이아빌리티 모두 최상급이라 폴드만 명확한 손해입니다.' },
  { id: 10, cat: 'turn', spot: 'BB 디펜드. 플랍 체크 → 상대 체크. 턴', hand: 'T♠ 9♠', board: '8♠ 5♦ 2♣ / J♥', pot: '팟 5.5bb', options: ['벳', '체크'], answer: '벳', why: '상대의 플랍 체크백으로 레인지가 캡됐고, J 턴은 내 콜 레인지에 유리한 카드입니다. 양차까지 있으니 프로브 벳으로 폴드 에퀴티+에퀴티를 동시에 노립니다(프로브 벳 개념).' },
  { id: 11, cat: 'preflop', spot: 'CO 오픈 → BTN 3벳, 나(CO)', hand: 'K♣ Q♣', board: '(프리플랍)', pot: '3벳 9bb · 유효 100bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: 'KQs는 3벳에 수익적으로 콜할 수 있는 대표 핸드 — 포지션이 불리해도 플레이아빌리티가 최상입니다. 4벳은 과격하고 폴드는 과소 수비입니다.' },
  { id: 12, cat: 'defense', spot: 'BTN 오픈 → BB 콜. 플랍 ⅓ 시벳 → 상대 체크레이즈', hand: '7♦ 7♠', board: 'Q♠ 7♥ 2♣', pot: '레이즈 후 팟 16bb', options: ['콜', '레이즈', '폴드'], answer: '레이즈', alsoOk: '콜', why: '미들셋 — 드라이 보드라 슬로플레이(콜)도 혼합이지만, 체크레이즈 레인지엔 Qx 밸류가 많아 3벳의 밸류가 큽니다. 셋은 상대 밸류에게서 스택을 뽑아야 하는 핸드입니다.' },
  { id: 13, cat: 'bluffcatch', spot: 'BB vs BTN 오픈. 플랍 시벳에 콜, 턴 더블배럴(¾팟)', hand: 'A♥ 9♥', board: 'K♦ 9♣ 4♥ / 2♠', pot: '벳 9bb · 벳 후 팟 21bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: '미들페어+오버카드+백도어 — MDF상 접기엔 너무 강하고 레이즈할 밸류는 아닙니다. 필요 승률 30%(9/30)를 상대 미스드 드로우·에어까지 합치면 충족하는 표준 블러프캐처 콜입니다.' },
  { id: 14, cat: 'preflop', spot: 'UTG 오픈에 BB인 나', hand: 'J♠ T♠', board: '(프리플랍)', pot: '오픈 2.5bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: 'JTs는 어떤 오픈에도 BB에서 디펜드하는 핸드입니다(마감 팟 오즈+플레이아빌리티). 3벳은 UTG 강레인지 상대로 비효율입니다.' },
  { id: 15, cat: 'turn', spot: 'BTN 오픈 → BB 콜. 플랍 시벳 콜, 턴', hand: 'A♠ K♠', board: 'Q♦ 7♣ 3♥ / 2♦', pot: '팟 12bb', options: ['벳', '체크'], answer: '체크', alsoOk: '벳', why: 'AK하이는 턴 체크백(쇼다운 가치 보존+리버 블러프캐치 전환) 빈도가 높은 핸드입니다. 더블배럴도 혼합이지만 기본은 체크 — 벳은 나은 핸드만 남기는 역선택이 되기 쉽습니다.' },
  { id: 16, cat: 'bluffcatch', spot: '리버. 상대가 팟 사이즈 벳(블러프캐치 판단)', hand: 'K♥ Q♥', board: 'Q♠ 8♦ 4♣ / 6♠ / 2♥', pot: '팟 벳 40bb · 팟 40bb→80bb', options: ['콜', '폴드'], answer: '콜', why: '팟 벳 콜의 필요 승률은 40/(40+80)=33%입니다. 탑페어 굿키커는 상대 밸류(셋·투페어)에 지지만, 미스드 스트레이트·에어 블러프까지 합치면 33%를 넘는 표준 블러프캐치 콜입니다.' },
  { id: 17, cat: 'cbet', spot: 'SB(나) vs BB 림프 팟. 플랍', hand: 'A♣ 2♣', board: 'A♦ A♥ 6♣', pot: '팟 2bb', options: ['벳', '체크'], answer: '체크', why: '트립스+락 보드 — 상대 레인지에 걸리는 게 없어 벳은 전부 접게 만듭니다. 체크로 블러프를 유도하거나 따라오게 하는 슬로플레이가 EV 최대입니다(너트 우위 트랩).' },
  { id: 18, cat: '3betpot', spot: '3벳 팟. 플랍 시벳에 상대 올인(스택≈팟)', hand: 'Q♦ Q♣', board: 'J♠ 6♦ 3♣', pot: 'SPR ≈ 1', options: ['콜', '폴드'], answer: '콜', why: 'SPR 1 이하의 3벳 팟 오버페어는 절대 폴드 불가 — 팟 사이즈 올인의 필요 승률 ~33%를 Jx·드로우·AK 전체 상대로 압도합니다. KK/AA에 일부 지는 건 감수하는 커밋 구간입니다.' },

  /* ── 신규: 시벳 (레인지·너트 우위, 보드 텍스처, 멀티웨이) ── */
  { id: 19, cat: 'cbet', spot: 'BTN 오픈 → BB 콜. 플랍 상대 체크', hand: '7♦ 6♦', board: 'K♠ Q♦ 3♥', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', why: '브로드웨이 투카드 보드(KQx)는 오픈 레인지가 압도하는 레인지 우위 보드 — 거의 전 레인지 ⅓팟 시벳이 표준입니다. 76s 같은 에어도 백도어 스트레이트·폴드 에퀴티 덕에 벳 레인지에 포함됩니다.' },
  { id: 20, cat: 'cbet', spot: 'BTN 오픈 → BB 콜. 플랍 상대 체크', hand: 'A♣ K♦', board: '6♥ 5♥ 4♠', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '체크', why: '로우 커넥티드 보드는 콜러(BB)의 수딧 커넥터·소포켓이 다 맞는 텍스처 — 오픈너의 레인지 우위가 사라져 시벳 빈도를 크게 낮춰야 합니다. AK하이는 오버카드 6아웃을 들고 체크 후 턴을 보는 편이 체크레이즈에 시달리는 벳보다 낫습니다(A하이 보드와 로우 보드의 차이).' },
  { id: 21, cat: 'cbet', spot: 'CO 오픈 → BTN 콜 → BB 콜. 3웨이 플랍, 두 명 체크', hand: 'A♦ Q♦', board: 'J♠ 9♦ 8♥', pot: '팟 8bb · 3웨이', options: ['벳', '체크'], answer: '체크', why: '멀티웨이는 누군가 맞았을 확률이 높아 블러프 EV가 급락 — 시벳을 강밸류·강드로로 좁히는 멀티웨이 체크 원칙이 적용됩니다. 웻한 J98에서 오버카드 둘은 벳할 이유가 없습니다.' },
  { id: 22, cat: 'cbet', spot: 'BTN 오픈 → BB 콜. 플랍 상대 체크', hand: 'A♥ K♣', board: '8♠ 8♦ 3♣', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', why: '페어드 보드는 양쪽 다 잘 안 맞지만 오버카드·오버페어 비중은 오픈너가 앞서는 레인지 우위 텍스처 — ¼~⅓팟 초소액 고빈도 시벳이 표준입니다. AK는 최강 논페어로 밸류 백업까지 있어 자동 벳입니다.' },
  { id: 23, cat: 'cbet', spot: 'BTN 오픈 → BB 콜. 플랍 상대 체크', hand: 'K♣ Q♣', board: 'Q♥ 9♥ 4♥', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', alsoOk: '체크', why: '모노톤 보드는 어떤 핸드도 에퀴티가 깎여 있어 사이즈를 ⅓팟 이하로 줄이고 레인지 전체를 보호하는 게 원칙입니다. 하트 없는 탑페어는 작은 밸류벳과 체크를 혼합 — 큰 벳만은 피하세요(플러시에게만 액션 받는 역선택).' },
  { id: 24, cat: 'cbet', spot: 'UTG 오픈 → BB 콜. 플랍 상대 체크', hand: '6♠ 5♠', board: 'A♦ K♣ 4♥', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', why: 'AKx 보드의 AA·KK·AK는 사실상 오픈너에게만 있는 너트 우위 — 상대는 강하게 저항할 수 없어 전 레인지 ⅓팟 벳이 자동 이익입니다. 65s 같은 레인지 최하단도 이 보드에선 벳이 체크보다 EV가 높습니다.' },
  { id: 25, cat: 'cbet', spot: 'BTN 오픈 → SB 콜 → BB 콜. 3웨이 플랍, 두 명 체크', hand: 'K♠ K♦', board: 'K♥ 8♣ 4♦', pot: '팟 8bb · 3웨이', options: ['벳', '체크'], answer: '벳', why: '멀티웨이 체크 원칙은 블러프·마지널에 적용되는 것이지 너트엔 적용되지 않습니다. 톱셋은 둘 중 하나의 Kx·8x·포켓에게서 3스트리트 밸류를 시작해야 하는 핸드 — 드라이 보드라 소액이면 충분합니다.' },
  { id: 26, cat: 'cbet', spot: 'CO 오픈 → BTN 콜. 헤즈업 플랍, 내가(CO) 선액션', hand: 'Q♥ Q♠', board: '9♣ 7♣ 6♦', pot: '팟 6bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', alsoOk: '체크', why: '미들 커넥티드 보드는 콜러에게도 좋지만 오버페어는 여전히 레인지 최상위입니다. 드로우가 많으니 ⅔팟급 큰 사이즈로 보호+밸류를 동시에 챙기는 게 기본(체크는 일부 혼합) — 프리카드로 역전당할 콤보가 너무 많습니다.' },

  /* ── 신규: 수비 (MDF, 체크레이즈, 도넉 억제) ─────────────── */
  { id: 27, cat: 'defense', spot: 'BB 디펜드. 플랍 상대 ⅓팟 시벳', hand: 'J♦ T♦', board: 'Q♠ 8♥ 3♦', pot: '⅓팟 벳 1.8bb · 벳 후 팟 7.3bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: '⅓팟 벳의 MDF는 75% — BB는 거트샷·백도어·오버카드류까지 넓게 수비해야 익스플로잇당하지 않습니다. JT는 거트샷(9)+백도어 플러시로 필요 승률 20%를 여유 있게 넘는 표준 콜입니다.' },
  { id: 28, cat: 'defense', spot: 'BB 디펜드. 플랍 상대 ⅓팟 시벳', hand: '6♠ 5♠', board: 'J♥ 7♠ 3♠', pot: '⅓팟 벳 1.8bb · 벳 후 팟 7.3bb', options: ['콜', '레이즈', '폴드'], answer: '레이즈', alsoOk: '콜', why: '체크레이즈 레인지엔 셋·투페어 같은 밸류와 함께 에퀴티 높은 세미블러프가 필요합니다. 플러시드로+거트샷(4)인 65s는 최우선 후보 — 폴드 에퀴티에 실패해도 12아웃 내외가 남습니다.' },
  { id: 29, cat: 'defense', spot: 'BTN 오픈에 BB로 콜. 플랍에서 내가 먼저 액션', hand: '9♠ 8♠', board: '9♦ 5♣ 2♥', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '체크', why: '콜러는 레인지 열세라 도넉벳(OOP 선제 벳)은 이론상 거의 0빈도 — 벳하면 내 체크 레인지가 캡되고 레이즈에 시달립니다. 탑페어도 체크 후 콜/체크레이즈로 플레이하는 도넉 억제 원칙입니다.' },
  { id: 30, cat: 'defense', spot: 'BTN(나) 오픈 → BB 콜. 내가 ⅓팟 시벳 → 상대 체크레이즈(3배)', hand: 'K♦ Q♣', board: 'K♠ 9♦ 4♣', pot: '레이즈 후 팟 16bb · 유효 90bb', options: ['콜', '레이즈', '폴드'], answer: '콜', why: '드라이 K하이 체크레이즈에 탑페어 굿키커를 접으면 MDF에 크게 미달 — 체크레이즈 블러프에 무한 익스플로잇당합니다. 3벳(리레이즈)은 밸류(셋·투페어)에게만 액션 받는 역선택이라 콜로 팟 통제가 표준입니다.' },
  { id: 31, cat: 'defense', spot: 'BB 디펜드, 플랍 ⅓팟 콜. 턴에서 상대 ¾팟 배럴', hand: 'A♦ 5♦', board: 'K♠ Q♦ 7♣ / 2♥', pot: '벳 9bb · 팟 12bb (¾팟)', options: ['콜', '폴드'], answer: '폴드', why: '¾팟 벳의 MDF는 57%지만, MDF는 「전부 콜」이 아니라 에퀴티·개선 가능성 순으로 레인지 상위부터 채우는 개념입니다. 노페어·노드로 A하이는 수비 레인지 하단 밖 — 표준 폴드입니다.' },
  { id: 32, cat: 'defense', spot: 'BB 디펜드. 플랍 콜, 턴 상대 하프팟 배럴', hand: '9♥ 8♥', board: 'Q♥ 7♥ 3♦ / 2♣', pot: '벳 6bb · 팟 12bb (하프팟)', options: ['콜', '레이즈', '폴드'], answer: '콜', why: '플러시드로 9아웃은 리버 한 장 기준 약 20% — 하프팟 벳의 필요 승률 25%엔 못 미치지만, 플러시 완성 시 추가 수익(임플라이드 오즈)이 그 차이를 메웁니다. 레이즈는 이미 한 번 콜한 턴에선 신뢰도가 낮습니다.' },
  { id: 33, cat: 'defense', spot: 'SB 오픈 → BB 콜(나). 플랍 상대 팟 벳', hand: '8♦ 8♣', board: 'K♦ T♠ 6♠', pot: '팟 벳 5.5bb · 벳 후 팟 11bb', options: ['콜', '폴드'], answer: '폴드', why: '팟 벳의 MDF는 50% — Kx·Tx·플러시드로·스트레이트드로만으로 절반이 채워져, 아웃 2개뿐인 언더포켓은 수비 레인지에서 밀려납니다. 턴·리버 배럴까지 감안하면 콜은 명확한 마이너스입니다.' },

  /* ── 신규: 블러프캐치 (블로커·팟 오즈) ───────────────────── */
  { id: 34, cat: 'bluffcatch', spot: 'BB 디펜드로 리버까지 콜-콜. 상대(BTN) 트리플 배럴 팟 벳', hand: 'A♠ T♦', board: 'T♠ 9♠ 4♦ / 2♠ / 7♦', pot: '팟 벳 24bb · 팟 24bb→48bb', options: ['콜', '폴드'], answer: '콜', why: '내 A♠ 블로커가 상대의 너트플러시 밸류를 원천 차단하고, 미스드 스트레이트(QJ·86류) 블러프는 그대로 살아 있습니다. 팟 벳 필요 승률 33% — 블로커 블러프캐치의 교과서 콜입니다.' },
  { id: 35, cat: 'bluffcatch', spot: 'BB 디펜드로 리버까지. 상대(BTN) 리버 팟 벳', hand: 'Q♠ J♥', board: 'Q♥ 8♥ 5♣ / K♦ / 2♣', pot: '팟 벳 18bb · 팟 18bb→36bb', options: ['콜', '폴드'], answer: '폴드', why: '내 J♥가 상대의 주 블러프인 미스드 하트 드로우(J♥T♥·J♥9♥류)를 블로킹해 블러프 빈도를 깎습니다. 팟 벳 필요 승률 33%를 못 채우는 마이너스 블로커 폴드 — 같은 Qx라도 하트 없는 콤보가 콜 우선입니다.' },
  { id: 36, cat: 'bluffcatch', spot: 'BB 디펜드. 플랍 콜, 턴 체크-체크, 리버 상대 하프팟 벳', hand: '7♠ 6♠', board: 'K♣ 7♦ 4♠ / T♥ / 2♦', pot: '하프팟 벳 6bb · 팟 12bb→18bb', options: ['콜', '폴드'], answer: '콜', why: '하프팟 벳의 필요 승률은 25%뿐 — 턴을 체크로 넘긴 상대 라인엔 미스드 백도어·승부수 에어가 충분해 서드페어도 넘습니다. 블러프캐치는 절대 강도가 아니라 팟 오즈 대비 블러프 빈도의 문제입니다.' },
  { id: 37, cat: 'bluffcatch', spot: 'BB 디펜드. 플랍·턴 체크-체크, 리버 상대 ⅔팟 벳', hand: 'A♣ J♣', board: '9♥ 6♦ 3♠ / Q♣ / 4♠', pot: '⅔팟 벳 8bb · 팟 12bb→20bb', options: ['콜', '폴드'], answer: '콜', why: '두 번 체크한 상대의 리버 벳은 얇은 밸류+포기 못한 에어의 승부수가 섞인 레인지입니다. ⅔팟 필요 승률은 29% — A하이 최상위인 AJ는 상대 미스드 에어(KT·JT류)를 이기는 블러프캐처 콜입니다.' },
  { id: 38, cat: 'bluffcatch', spot: 'CO 오픈 → BB 콜(나). 플랍 콜, 턴 체크-체크, 리버 상대 팟 벳', hand: '8♠ 8♥', board: 'A♣ 9♦ 4♦ / 6♣ / K♠', pot: '팟 벳 20bb · 팟 20bb→40bb', options: ['콜', '폴드'], answer: '폴드', why: '팟 벳엔 33% 승률이 필요한데, A·K가 다 깔린 리버에서 88이 이기는 건 미스드 다이아몬드뿐이고 밸류(Ax·Kx)엔 전부 집니다. 좋은 블로커도 없는 언더포켓은 수비 레인지 하단 — 폴드가 표준입니다.' },

  /* ── 신규: 사이징 (보드 텍스처·폴라·지오메트릭·SPR) ──────── */
  { id: 39, cat: 'sizing', spot: 'BTN 오픈 → BB 콜. 플랍 상대 체크 — 사이즈는?', hand: 'A♦ T♦', board: 'A♠ 7♦ 2♣', pot: '팟 5.5bb · 유효 97bb', options: ['⅓팟 벳', '⅔팟 벳', '오버벳', '체크'], answer: '⅓팟 벳', why: '드라이 A하이는 레인지 우위·너트 우위 모두 극대 — 전 레인지 ⅓팟 이하 소액 벳이 이론 표준입니다. 큰 사이즈는 상대 레인지를 즉시 정리해 줘, 약한 핸드에게서 뽑을 밸류를 스스로 버리는 셈입니다.' },
  { id: 40, cat: 'sizing', spot: 'BTN 오픈 → BB 콜. 플랍 상대 체크 — 사이즈는?', hand: 'A♠ A♣', board: 'T♠ 9♠ 5♥', pot: '팟 5.5bb · 유효 97bb', options: ['⅓팟 벳', '⅔팟 벳', '체크'], answer: '⅔팟 벳', why: '드로우가 촘촘한 웻 보드에선 소액 벳이 사실상 프리카드 — 오버페어는 ⅔팟 이상 큰 사이즈로 드로우에 비싼 가격을 물리고 밸류+보호를 동시에 챙깁니다. 보드 텍스처가 사이즈를 결정한다는 원칙의 전형입니다.' },
  { id: 41, cat: 'sizing', spot: 'BTN 오픈 → BB 콜. 시벳-콜, 턴 체크-체크. 리버 상대 체크 — 사이즈는?', hand: 'K♥ T♥', board: 'Q♠ J♦ 4♥ / 8♣ / 9♥', pot: '팟 20bb · 유효 80bb', options: ['⅔팟 벳', '오버벳', '체크'], answer: '오버벳', why: '리버 오버벳은 너트급+블러프로 구성된 폴라 레인지 전용 — 너트 스트레이트는 상대의 캡된 원페어에게서 최대치를 뽑아야 합니다. 팟 20bb에 35bb(175%)를 치면 상대 필요 승률이 35/90≈39%로 치솟지만, 콜 레인지의 실제 승률은 0에 가까워 EV 최대입니다.' },
  { id: 42, cat: 'sizing', spot: 'BTN 오픈 → BB 콜. 플랍 시벳 콜. 턴 상대 체크 — 사이즈는?', hand: 'A♥ A♦', board: 'K♦ 8♦ 3♣ / 2♠', pot: '팟 12bb · 유효 88bb', options: ['⅓팟 벳', '⅔팟 벳', '체크'], answer: '⅔팟 벳', why: '오버페어는 Kx·플러시드로에게 턴·리버 두 번 더 밸류를 받을 핸드 — 남은 스트리트에 스택을 균등 분할하는 지오메트릭 사이징(≈⅔팟씩)이 표준입니다. 소액 벳은 상대 최고 콜 핸드에게서 뽑을 총액을 줄입니다.' },
  { id: 43, cat: 'sizing', spot: 'BTN(나) 오픈 → BB 콜. 시벳 콜, 배럴 콜. 리버 상대 체크 — 미스드 드로우, 사이즈는?', hand: '7♠ 6♠', board: 'K♠ 9♠ 2♦ / 5♥ / Q♣', pot: '팟 40bb · 유효 85bb', options: ['⅔팟 벳', '오버벳', '체크'], answer: '오버벳', alsoOk: '체크', why: '이 리버에서 밸류(셋·투페어 최상위)를 오버벳으로 친다면 블러프도 같은 사이즈여야 레인지가 균형 — 사이즈는 핸드가 아니라 레인지가 정합니다. 2배 팟 오버벳(80bb)이면 상대 MDF가 40/120=33%까지 내려가 폴드 에퀴티가 극대화됩니다(포기 체크도 혼합).' },
  { id: 44, cat: 'sizing', spot: '플랍 벳-콜로 팟이 커진 턴. 상대 체크 — 사이즈는?', hand: 'A♣ K♣', board: 'A♠ K♦ 7♣ / 3♦', pot: '팟 60bb · 유효 55bb (SPR<1)', options: ['⅔팟 벳', '올인', '체크'], answer: '올인', why: 'SPR 1 이하에선 남은 스택이 팟보다 작아 나눠 칠 이유가 없습니다 — 탑투페어는 올인이 기하학적으로 최대 밸류입니다. 작게 치면 리버에 스택이 어중간하게 남아 상대가 실수할 여지만 줄어듭니다.' },

  /* ── 신규: 3벳 팟 (SPR·레인지 우위) ─────────────────────── */
  { id: 45, cat: '3betpot', spot: 'SB(나) 3벳 → BTN 콜. 플랍 — 사이즈는?', hand: 'A♥ K♥', board: 'K♦ 7♣ 2♠', pot: '팟 20bb · 유효 90bb (SPR≈4.5)', options: ['⅓팟 벳', '⅔팟 벳', '체크'], answer: '⅓팟 벳', why: '3벳 팟은 SPR이 낮아 ⅓팟만 쳐도 리버까지 스택이 자연히 들어가는 커밋 구조입니다. K하이 보드의 레인지 우위까지 겹쳐 소액 고빈도 시벳이 표준 — 큰 사이즈는 불필요한 리스크만 추가합니다.' },
  { id: 46, cat: '3betpot', spot: 'SB(나) 3벳 → BTN 콜. 플랍', hand: 'A♠ K♠', board: '9♦ 8♦ 4♣', pot: '팟 20bb · 유효 90bb', options: ['벳', '체크'], answer: '체크', alsoOk: '벳', why: '미들 커넥티드 보드는 콜러(BTN)의 수딧 커넥터·포켓이 다 맞는 텍스처 — 3벳터라도 여기선 레인지 우위가 사라져 시벳 빈도를 크게 줄입니다. AK하이는 체크로 팟 통제가 기본, 벳(오버카드 6아웃)은 일부 혼합입니다.' },
  { id: 47, cat: '3betpot', spot: 'BB(나) 3벳 → BTN 콜. 플랍 ⅓팟 시벳 → 상대 올인', hand: 'K♠ K♥', board: 'A♥ 8♣ 3♦', pot: '팟 22.5bb · 시벳 7bb → 상대 올인 89bb (콜 82bb, 필요 승률 ~41%)', options: ['콜', '폴드'], answer: '폴드', why: '3벳 팟 A하이 보드의 올인 레인지는 AK·셋 중심 — KK의 승률은 ~25%로 필요 승률 41%에 한참 미달합니다. A 블로커도 없어 상대 블러프 빈도를 깎지도 못하니, KK라도 여긴 폴드입니다.' },
  { id: 48, cat: '3betpot', spot: 'CO 오픈 → BTN(나) 3벳 → CO 콜. 플랍 상대 체크', hand: 'A♠ Q♠', board: 'K♠ 9♠ 3♦', pot: '팟 20bb · 유효 89bb', options: ['벳', '체크'], answer: '벳', why: '넛플러시 드로우+오버카드 = 에퀴티 ~45%에 폴드 에퀴티까지 얹는 세미블러프 최상위 클래스입니다. SPR 낮은 3벳 팟에선 이 클래스는 스택이 들어가도 손해가 아니라 벳-콜/벳-올인이 표준입니다.' },
  { id: 49, cat: '3betpot', spot: 'SB 3벳 → BTN(나) 콜. 플랍 상대 ⅓팟 시벳', hand: 'Q♠ J♠', board: 'K♦ T♠ 4♣', pot: '⅓팟 시벳 7bb · 팟 20bb (필요 승률 ~20%)', options: ['콜', '폴드'], answer: '콜', why: '⅓팟 시벳의 MDF는 75% — 더블 거트(A·9, 8아웃)+백도어의 QJ는 자동 수비 구간입니다. 3벳 팟에서도 소액 벳엔 넓게 버텨야 하며, 필요 승률은 20%에 불과합니다.' },

  /* ── 신규: 턴 (딜레이드 시벳·배럴·포기·체크레이즈) ───────── */
  { id: 50, cat: 'turn', spot: 'BTN(나) 오픈 → BB 콜. 플랍 체크-체크. 턴 상대 체크', hand: 'A♦ 5♦', board: 'T♠ 6♦ 2♦ / K♣', pot: '팟 5.5bb · 유효 97bb', options: ['벳', '체크'], answer: '벳', why: '두 번 체크한 상대의 레인지는 캡됐고, K 턴은 오픈너인 내 레인지에 유리한 카드 — 딜레이드 시벳의 폴드 에퀴티가 큽니다. 콜당해도 넛플러시 드로우 9아웃이 살아 있는 세미블러프입니다.' },
  { id: 51, cat: 'turn', spot: 'BTN 오픈 → BB 콜. 플랍 ⅓팟 시벳 콜. 턴', hand: 'Q♣ J♣', board: 'K♥ 9♣ 3♣ / 2♦', pot: '팟 9bb · 유효 95bb', options: ['벳', '체크'], answer: '벳', why: '플러시드로+거트샷(T)+오버카드 — 콜당해도 12아웃 내외에 폴드 에퀴티까지 더한 표준 더블배럴입니다. 이런 에퀴티 배럴이 있어야 밸류 배럴도 액션을 받습니다(레인지 균형).' },
  { id: 52, cat: 'turn', spot: 'BTN 오픈 → BB 콜. 플랍 ⅓팟 시벳 콜. 턴', hand: '7♠ 6♠', board: 'Q♦ J♦ 4♣ / T♥', pot: '팟 9bb · 유효 95bb', options: ['벳', '체크'], answer: '체크', why: '배럴은 에퀴티·블로커·상대 레인지 약화 중 하나는 있어야 합니다. T 턴은 상대 콜 레인지(KQ·QT·JT·KT)를 오히려 강화하고 76s는 노에퀴티 — 원 앤 던으로 포기가 정답입니다.' },
  { id: 53, cat: 'turn', spot: 'BB 디펜드. 플랍 ⅓팟 콜. 턴에서 플러시 완성, 상대 ⅔팟 배럴', hand: '8♥ 7♥', board: '9♥ 6♥ 2♣ / A♥', pot: '⅔팟 벳 6bb · 팟 9bb', options: ['콜', '레이즈', '폴드'], answer: '레이즈', alsoOk: '콜', why: '플러시 완성 + 상대는 A♥로 탑페어·넛FD가 된 배럴 레인지 — 지금이 스택을 키울 최적 타이밍입니다. 콜 슬로플레이도 혼합이지만, 리버가 체크로 끝나면 밸류 손실이 커 레이즈가 기본입니다.' },
  { id: 54, cat: 'turn', spot: 'CO 오픈 → BB 콜. 플랍 ⅓팟 시벳 콜. 턴', hand: '9♠ 9♦', board: 'K♣ 8♦ 4♠ / Q♥', pot: '팟 9bb · 유효 95bb', options: ['벳', '체크'], answer: '체크', why: 'Q 턴은 상대 콜 레인지(Qx 포함)를 살리고 99의 상대 승률을 깎는 카드입니다. 미들 포켓은 턴 체크로 팟 통제+쇼다운 가치 보존이 표준 — 배럴은 나쁜 핸드는 접고 좋은 핸드만 콜하게 만듭니다.' },
  { id: 55, cat: 'turn', spot: 'BB 디펜드. 플랍 체크-체크. 턴 상대 하프팟 벳', hand: 'J♥ T♥', board: '9♥ 8♦ 3♣ / 2♥', pot: '벳 3bb · 팟 5.5bb', options: ['콜', '레이즈', '폴드'], answer: '레이즈', alsoOk: '콜', why: '오픈엔드+플러시드로 15아웃은 리버 한 장으로도 ~33% — 폴드 에퀴티가 조금만 있어도 체크레이즈 세미블러프가 즉시 플러스입니다. 플랍을 체크한 상대의 딜레이드 벳 레인지는 마지널이 많아 접는 빈도도 높습니다.' },

  /* ── 신규: 리버 (폴라 대응·씬 밸류·블로커 블러프·블록벳) ── */
  { id: 56, cat: 'river', spot: 'BB 디펜드로 리버까지 콜-콜. 상대 리버 1.5배 팟 오버벳', hand: 'A♣ J♠', board: 'J♥ T♥ 4♣ / 6♥ / Q♠', pot: '오버벳 30bb · 팟 20bb (필요 승률 37.5%)', options: ['콜', '폴드'], answer: '폴드', why: '플러시·스트레이트가 다 완성된 런아웃의 1.5배 팟 오버벳은 극단적 폴라 — 필요 승률 30/80=37.5%를 채우려면 블러프가 아주 많아야 하는데, 이 라인은 밸류(플러시·스트레이트·셋)가 압도합니다. 세컨드페어급 블러프캐처는 레인지 하단이라 폴드가 표준입니다.' },
  { id: 57, cat: 'river', spot: 'BTN(나) 오픈 → BB 콜. 플랍 시벳 콜, 턴 체크-체크. 리버 상대 체크', hand: 'K♦ T♠', board: 'K♣ 8♦ 5♠ / 2♥ / 7♣', pot: '팟 12bb · 유효 85bb', options: ['⅓팟 벳', '팟 벳', '체크'], answer: '⅓팟 벳', why: '상대 체크 레인지엔 약한 Kx·8x·포켓이 남아 KT는 씬 밸류 구간 — 콜받는 범위의 절반 이상을 이기면 밸류벳입니다. 단 사이즈는 ⅓팟 소액이 핵심 — 크게 치면 나보다 나쁜 핸드가 다 접습니다.' },
  { id: 58, cat: 'river', spot: 'BTN(나) 오픈 → BB 콜. 시벳 콜, 배럴 콜. 리버 상대 체크', hand: 'K♦ Q♦', board: 'A♠ J♦ 7♦ / 3♠ / 2♣', pot: '팟 40bb · 유효 60bb', options: ['벳', '체크'], answer: '벳', why: '쇼다운 가치 0 + 상대 콜 레인지 상단(AK·KJ·QJ류)을 블로킹하는 KQ는 최우선 블러프 후보입니다(블로커 선정 원칙). 체크는 100% 패배 — 폴라 벳으로 Jx·미들페어의 폴드를 유도해야 EV가 남습니다.' },
  { id: 59, cat: 'river', spot: 'BTN(나) 오픈 → BB 콜. 시벳 콜, 턴 벳 콜. 리버에서 상대가 ¼팟 블록벳', hand: '8♥ 8♦', board: '8♠ 6♣ 2♦ / K♦ / 3♥', pot: '블록벳 5bb · 팟 20bb (¼팟)', options: ['콜', '레이즈', '폴드'], answer: '레이즈', why: '블록벳은 마지널 핸드가 싸게 쇼다운 가려는 사이즈 — 셋은 레이즈로 그 마지널(약한 Kx·6x)에게서 한 번 더 밸류를 뽑아야 합니다. 콜은 팟 오즈상 안전하지만 명백한 밸류 손실입니다(팟 컨트롤은 상대 사정).' },
  { id: 60, cat: 'river', spot: 'BTN(나) vs BB. 플랍·턴 체크로 흘러온 리버, 상대 체크', hand: '9♦ 9♣', board: 'A♠ Q♣ 5♦ / 7♥ / 2♠', pot: '팟 6bb · 유효 97bb', options: ['벳', '체크'], answer: '체크', why: '99는 상대의 5x·7x·미스드 에어는 이기고 Ax·Qx엔 지는 전형적 쇼다운 밸류 핸드 — 벳하면 지는 핸드만 콜합니다(웨이어헤드/웨이비하인드). 체크로 공짜 쇼다운을 받는 게 EV 최대입니다.' },
];

/* 기록(localStorage) — 총계 + 카테고리별 정답률로 약점 추적 */
interface CatStat { t: number; c: number }
interface Stats { total: number; correct: number; streak: number; best: number; byCat: Partial<Record<Category, CatStat>> }
const STAT_KEY = 'nuri:trainer:postflop:v2';
const EMPTY_STATS: Stats = { total: 0, correct: 0, streak: 0, best: 0, byCat: {} };
const loadStats = (): Stats => {
  try { return { ...EMPTY_STATS, byCat: {}, ...JSON.parse(localStorage.getItem(STAT_KEY) || '{}') }; }
  catch { return { ...EMPTY_STATS, byCat: {} }; }
};

const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

const suitColor = (s: string) => (s.includes('♥') || s.includes('♦') ? 'text-red-400' : 'text-ink-primary');

export default function PostflopTrainer() {
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [order, setOrder] = useState<Scenario[]>(() => shuffle(SCENARIOS));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<Action | null>(null);
  const [wrongIds, setWrongIds] = useState<number[]>([]); // 이번 사이클 오답 → 다음 사이클 앞쪽 배치
  const [stats, setStats] = useState<Stats>(loadStats);
  const prog = useTrainerProgress();            // 게이미피케이션 진행(로컬 공용 — 별도 키)
  const [celebrate, setCelebrate] = useState(false); // 목표 달성 순간 인라인 배너 1회

  const sc = order[idx % order.length];
  const isCorrect = (a: Action) => a === sc.answer || a === sc.alsoOk;

  const saveStats = (s: Stats) => { setStats(s); try { localStorage.setItem(STAT_KEY, JSON.stringify(s)); } catch { /* quota */ } };

  const pick = (a: Action) => {
    if (picked) return;
    setPicked(a);
    const ok = isCorrect(a);
    if (recordAnswer(ok).justHitGoal) setCelebrate(true); // 오늘 목표 달성 순간 감지
    if (!ok) setWrongIds((w) => (w.includes(sc.id) ? w : [...w, sc.id]));
    const streak = ok ? stats.streak + 1 : 0;
    const cur = stats.byCat[sc.cat] ?? { t: 0, c: 0 };
    saveStats({
      total: stats.total + 1,
      correct: stats.correct + (ok ? 1 : 0),
      streak,
      best: Math.max(stats.best, streak),
      byCat: { ...stats.byCat, [sc.cat]: { t: cur.t + 1, c: cur.c + (ok ? 1 : 0) } },
    });
  };

  const next = () => {
    setPicked(null);
    setCelebrate(false);
    if (idx + 1 >= order.length) {
      // 사이클 종료 — 재셔플하되 오답 문항을 앞쪽에 우선 배치(같은 순서 반복 금지)
      const wrong = order.filter((s) => wrongIds.includes(s.id));
      const rest = order.filter((s) => !wrongIds.includes(s.id));
      setOrder([...shuffle(wrong), ...shuffle(rest)]);
      setWrongIds([]);
      setIdx(0);
    } else setIdx(idx + 1);
  };

  const changeFilter = (f: Category | 'all') => {
    if (f === filter) return;
    setFilter(f);
    setOrder(shuffle(f === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.cat === f)));
    setIdx(0);
    setPicked(null);
    setWrongIds([]);
    setCelebrate(false);
  };

  const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
  const catRows = useMemo(() =>
    (Object.entries(stats.byCat) as [Category, CatStat][])
      .filter(([, v]) => v.t > 0)
      .map(([k, v]) => ({ cat: k, t: v.t, c: v.c, rate: Math.round((v.c / v.t) * 100) }))
      .sort((a, b) => a.rate - b.rate), [stats]);
  // 보완 추천 — 3문항 이상 풀었고 정답률 80% 미만인 카테고리, 낮은 순 1~2개
  const weakCats = useMemo(() => catRows.filter((r) => r.t >= 3 && r.rate < 80).slice(0, 2), [catRows]);

  const cards = useMemo(() => sc.hand.split(' '), [sc]);
  const boardCards = useMemo(() => sc.board === '(프리플랍)' ? [] : sc.board.split(' '), [sc]);

  return (
    // 제목은 전체화면 헤더가 이미 표시 — 공통 CalcCard 로 흡수(2중 노출 제거)
    <CalcCard>
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs text-ink-muted">60문항 · 카테고리별 출제 — 오답은 다음 사이클에 먼저 다시 나옵니다.</p>
        <div className="shrink-0 text-right text-2xs tabular-nums">
          <p className="font-bold text-accent-300">{acc}% <span className="font-normal text-ink-muted">({stats.correct}/{stats.total})</span></p>
          <p className="text-ink-muted">연속 {stats.streak} · 최고 {stats.best}</p>
        </div>
      </div>

      {/* 게이미피케이션 진행 — 일일 목표·스트릭·XP (두 트레이너 공용 로컬 키, 위 정답률과 별도) */}
      <div className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-2xs">
            <span className="text-ink-muted">오늘 <b className="text-ink-primary tabular-nums">{prog.today}/{prog.goal}</b></span>
            <span className="text-ink-muted" title={`스트릭 프리즈 ${prog.freezes}개 보유`}>🔥 <b className="text-accent-300 tabular-nums">{prog.streak}</b></span>
            <span className="text-ink-muted">XP <b className="text-ink-secondary tabular-nums">{prog.xp.toLocaleString()}</b></span>
          </div>
          <div className="inline-flex items-center gap-1">
            <span className="text-2xs text-ink-muted mr-0.5">목표</span>
            {GOAL_CHOICES.map((g) => (
              <button key={g} type="button" onClick={() => setDailyGoal(g)}
                className={['h-6 px-1.5 rounded-[6px] text-2xs font-bold leading-none tabular-nums transition-colors', prog.goal === g ? 'bg-accent-300 text-white' : 'bg-surface-high text-ink-muted'].join(' ')}>{g}</button>
            ))}
          </div>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-high">
          <div className={['h-full rounded-full', prog.goalMet ? 'bg-emerald-400' : 'bg-accent-300'].join(' ')} style={{ width: `${prog.goal ? Math.min(100, Math.round((prog.today / prog.goal) * 100)) : 0}%` }} />
        </div>
        {prog.goalMet && <p className="text-2xs text-emerald-300">🎉 오늘 목표 달성 — 스트릭 🔥{prog.streak}일 유지 중</p>}
      </div>

      {/* 카테고리 필터 칩 */}
      <div className="flex flex-wrap gap-1">
        {(['all', ...ALL_CATS] as const).map((f) => (
          <button key={f} type="button" onClick={() => changeFilter(f)}
            className={['rounded-full border px-2 py-0.5 text-2xs font-bold transition-colors',
              filter === f ? 'border-accent-400/60 bg-accent-300/10 text-accent-300' : 'border-border-default bg-surface-high text-ink-muted hover:border-accent-400/40'].join(' ')}>
            {f === 'all' ? '전체' : CAT_LABEL[f]}
          </button>
        ))}
      </div>

      {/* 상황 */}
      <div className="rounded-input border border-accent-400/25 bg-accent-300/[0.04] p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold text-ink-secondary">{sc.spot}</p>
          <span className="shrink-0 rounded-full border border-border-default bg-surface-high px-1.5 py-0.5 text-2xs text-ink-muted tabular-nums">{CAT_LABEL[sc.cat]} · {(idx % order.length) + 1}/{order.length}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="text-2xs text-ink-muted mr-0.5">내 핸드</span>
            {cards.map((c) => (
              <span key={c} className={['rounded-[5px] border border-border-default bg-surface-base px-1.5 py-1 text-sm font-extrabold', suitColor(c)].join(' ')}>{c}</span>
            ))}
          </span>
          {boardCards.length > 0 && (
            <span className="flex items-center gap-1">
              <span className="text-2xs text-ink-muted mr-0.5">보드</span>
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
          {celebrate && (
            <div className="rounded-input border border-emerald-400/50 bg-emerald-400/10 p-2.5 text-center">
              <p className="text-sm font-extrabold text-emerald-300">🎉 오늘 목표 달성!</p>
              <p className="mt-0.5 text-2xs text-ink-secondary">+50 XP 보너스 · 스트릭 🔥{prog.streak}일</p>
            </div>
          )}
          <div className={['rounded-input border p-2.5 text-2xs leading-relaxed',
            isCorrect(picked) ? 'border-emerald-400/40 bg-emerald-400/[0.06] text-ink-secondary' : 'border-danger/40 bg-danger/[0.06] text-ink-secondary'].join(' ')}>
            <p className="font-bold mb-0.5">{isCorrect(picked) ? '✅ 정답!' : `❌ 정답은 「${sc.answer}」${sc.alsoOk ? ` (「${sc.alsoOk}」도 인정)` : ''}`}</p>
            {sc.why}
          </div>
          <button type="button" onClick={next} className="btn-primary w-full py-2 text-sm">다음 문제 →</button>
        </div>
      )}

      {/* 카테고리별 기록 + 약점 보완 추천 */}
      {catRows.length > 0 && (
        <div className="rounded-input border border-border-subtle bg-surface-base p-2.5 space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {catRows.map((r) => (
              <span key={r.cat} className="rounded-full border border-border-default bg-surface-high px-2 py-0.5 text-2xs tabular-nums text-ink-secondary">
                {CAT_LABEL[r.cat]} <b className={r.rate >= 80 ? 'text-emerald-300' : r.rate >= 60 ? 'text-ink-primary' : 'text-amber-300'}>{r.rate}%</b> <span className="text-ink-muted">({r.c}/{r.t})</span>
              </span>
            ))}
          </div>
          {weakCats.length > 0 && (
            <p className="text-2xs text-amber-300">📌 보완 추천 — {weakCats.map((w) => `${CAT_LABEL[w.cat]} ${w.rate}%`).join(' · ')} : 필터로 골라 집중 연습해 보세요.</p>
          )}
        </div>
      )}
    </CalcCard>
  );
}
