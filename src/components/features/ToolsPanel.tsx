import { useEffect, useLayoutEffect, useRef, useState, Suspense, type ReactNode } from 'react';
import { lazyWithReload } from '../../lib/lazyWithReload';
import Modal from '../atoms/Modal';
import Icon, { type IconName } from '../atoms/Icon';
import { useToast } from '../atoms/Toast';
import { shareOrCopy } from '../../lib/calendar';
import { useTrainerProgress } from '../../lib/trainerProgress';
import { useAuth } from '../../contexts/AuthContext';
import { promptLogin } from '../../lib/requireLogin';
import { goSubTab } from '../../lib/subTabTransition';
import TdaRulesTool from './gto/TdaRulesTool';
import ICMCalculator from './ICMCalculator';
import PotOddsCalc from './tools/PotOddsCalc';
import ChipDistributor from './tools/ChipDistributor';
import StructureSim from './tools/StructureSim';
import RangeGuide from './tools/RangeGuide';
import PreflopTrainer from './tools/PreflopTrainer';
import OutsCalc from './tools/OutsCalc';
import PushFoldChart from './tools/PushFoldChart';
import { SprCalc, EvCalc, MzoneCalc, BankrollCalc, VarianceCalc } from './tools/StackCalcs';
import { PayoutCalc, EndTimeCalc, ComboCalc } from './tools/MoreCalcs';
import { MdfCalc, AggroChart, RangeMatrix } from './tools/AdvancedCalcs';
import PostflopTrainer from './tools/PostflopTrainer';
import BlindBuilder from './tools/BlindBuilder';
import GlossaryPanel from './tools/GlossaryPanel';
import HandRankPanel from './tools/HandRankPanel';
import DailyDrill from './tools/DailyDrill';
import WrongNote, { type PushJump, type RangeJump } from './tools/WrongNote';

// GTO 패널·핸드 리플레이어는 에퀴티 엔진을 포함해 무거우므로 지연 로드
import { clearSnap, readSnap } from '../../lib/snapshot';
import type { DrillLink } from '../../lib/spotEvaluate';
import type { DeepGtoInit } from './gto/useDeepGto';
import type { HandReviewInit } from './gto/HandReviewTool';
import type { SpotReview } from '../../lib/spot';
const GtoDeepPanel = lazyWithReload(() => import('./gto/GtoDeepPanel'));
const HandReviewTool = lazyWithReload(() => import('./gto/HandReviewTool'));
// NURI SPOT — 구조화 스팟·분석 엔진·리포트를 물고 있어 도구 중 가장 무겁다. 열 때 받는다.
const NuriSpotPanel = lazyWithReload(() => import('./gto/NuriSpotPanel'));

/**
 * NURI SPOT 진입 초기값 — 직전 스팟이 있으면 그것, 없으면 **기존 두 도구의 스냅샷에서 카드를 물려받는다**.
 * 'GTO 핸드 분석'에서 카드를 고르다 스팟으로 넘어온 사람이 처음부터 다시 찍지 않게 하는 다리다.
 * (tool:spot 은 NuriSpotPanel 이 스스로 읽으므로 여기서는 **없을 때의 씨앗**만 만든다.)
 */
function spotInitFromSnapshots(): { spot?: Partial<SpotReview> } | undefined {
  if (readSnap<SpotReview>('tool:spot')) return undefined;      // 자기 스냅샷이 이긴다
  const g = readSnap<DeepGtoInit>('tool:gto');
  const r = readSnap<HandReviewInit>('tool:replay');
  const ids = (cs: { rank: string; suit: string }[] | undefined) => (cs ?? []).map((c) => `${c.rank}${c.suit}`);
  const hero = ids(g?.hero).length ? ids(g?.hero) : ids(r?.hero as { rank: string; suit: string }[] | undefined);
  const villain = ids(g?.villain).length ? ids(g?.villain) : ids(r?.villain as { rank: string; suit: string }[] | undefined);
  const board = ids(g?.board).length ? ids(g?.board) : ids(r?.board as { rank: string; suit: string }[] | undefined);
  if (hero.length === 0 && board.length === 0) return undefined;
  return { spot: { hero, villain, board } };
}

type ToolKey = 'spot' | 'drill' | 'gto' | 'replay' | 'pot' | 'icm' | 'range' | 'trainer' | 'postflop' | 'wrongnote' | 'mdf' | 'aggro' | 'rvr' | 'outs' | 'pushfold' | 'spr' | 'ev' | 'mzone' | 'bankroll' | 'variance' | 'blindgen' | 'chip' | 'sim' | 'payout' | 'endtime' | 'combo' | 'glossary' | 'handrank' | 'deal' | 'tda';
/** 실사용 흐름 4갈래 IA (2026-09-11 오너 지시 5갈래 → 2026-09-14 4갈래).
 *  종전 4레인(차트/트레이닝/분석/계산기)은 '도구의 종류'로 나눈 것이라, 하나의 목적(예: 한 판 복기)을
 *  이루려면 레인 세 개를 오가야 했다. 이제 **무엇을 하러 왔는가**로 가른다:
 *    explore  전략 탐색   — 스팟을 정하고 레인지·빈도를 본다
 *    train    트레이너     — 풀고 틀리고 복습한다
 *    review   핸드 리뷰    — 지난 판을 되짚는다(에퀴티·아웃츠·팟오즈·SPR·콤보·MDF·EV — 포커 수학이 여기 모인다)
 *    rules    규칙 · 대회  — TDA 규칙·용어사전 + 대회 도구(ICM·딜·M존)
 *  2026-09-14 오너 결정 "분류를 합쳐서 한 줄로": 종전 tourney(토너먼트 랩)를 rules 에 합쳤다(id 는 e2e 가 data-lane="rules" 로
 *  짚으므로 rules 유지). 규칙·수학의 '수학'(MDF·EV)은 review 로 옮겼다 — 합친 갈래 이름이 내용과 맞아야 해서다.
 *  왜 5→4 인가: 칩 6개 폭 합이 420.7px 인데 360px 바 가용폭은 326px 이라 flex-wrap 에서 항상 두 줄이었다.
 *  가로 스크롤·nowrap·고정 그리드는 접근성 게이트(가로 잘림 0 · 200% 확대)에 걸려 못 쓴다 — 총폭을 줄이는 것만 남는다.
 *  ops(매장 운영 5종)·money(뱅크롤 2종)는 GTO 탭 밖으로 이관됐다 — 카탈로그에서만 숨기고
 *  TOOLS/renderTool 에는 남겨 #tool= 딥링크·공유 하위호환을 지킨다(ops 이관 때와 같은 조리법). */
type ToolCat = 'explore' | 'train' | 'review' | 'rules' | 'ops' | 'money';

/** desc = 카드 한 줄(≤13자 완결형 명사구, 2026-09-03 개고) · keywords = 개고 전 설명(검색 재현율 보존용, 화면엔 안 그림)
 *  icon = lucide 팩 이름(2026-09-03 오너 "아이콘팩에서 최대한 잘 맞는 걸로" — 손그림 SVG 26개를 Icon 아톰으로 통일).
 *  ⚠ 26개 도구는 서로 다른 아이콘이어야 한다 — ToolsPanel.icons.test.ts 가 게이트. */
/**
 * 카드 제목의 **줄바꿈 지점** — 2026-09-18 오너 지시: "프리플랍 / (줄바꿈) 레인지 차트 이렇게 열을 맞춰서 정렬".
 *
 * 왜 CSS 가 아니라 데이터인가(실측): 카드 폭이 **158.75px(360·2열) ~ 290.625px(1440·4열)** 로 거의 2배 차이라
 * 자동 줄바꿈 지점이 폭마다 달라진다 — 같은 열의 카드들이 서로 다른 곳에서 꺾여 **열이 안 맞는다.**
 * 그래서 의미 단위를 사람이 정해 고정한다.
 *
 * ⚠ TOOLS 배열에 필드를 더하지 않고 **별도 표**로 둔다 — `tools/gtoContract.test.ts` 가 TOOLS 블록을
 *   정규식으로 검사하고 있어(항목 포맷·개수) 배열 모양을 건드리면 그 계약이 흔들린다.
 * ⚠ 여기 없는 키는 **한 줄**로 그린다. 그래도 칸 높이는 맞는다 — 제목 칸이 2줄 자리를 늘 예약한다.
 * ⚠ 두 줄을 합치면 반드시 `name` 과 같아야 한다(공백 하나). 아래 계약 테스트가 그걸 잠근다.
 *
 * 🔴 2026-09-18 오너 2차 지시 "굳이 두 줄이 아니어도 되는 부분은 한 줄로(예: 누리 스팟·홀덤 족보)":
 *   **가장 좁은 제목 칸(360px·2열 = 70px)에 한 줄로 들어가는 이름은 표에서 뺀다.** 실측(4174 프로덕션 빌드, text-xs 굵게):
 *   들어감 — 누리 스팟 47 · 홀덤 족보 47 · 오답 노트 47 · EV 52.7 · 콤보 58 · M존 58.3 · ICM 59.9 · SPR 60 · 아웃츠 / 확률 65.7 ·
 *   홀덤 용어사전 69.1 · 어그레션 차트 69.1 / 안 들어감 — 팟 오즈 계산기 72 · GTO 핸드 분석 76.3 · 푸시 · 폴드 차트 78.6 ·
 *   핸드 리플레이어 80.1 · 2026 TDA 규칙 85.9 · 레인지 vs 레인지 86.1 · 프리플랍 트레이너 91.1 · 포스트플랍 트레이너 102.1 ·
 *   프리플랍 레인지 차트 105.1. 320px 에서는 제목이 아이콘 아래로 내려가 칸이 92px 라 더 넉넉하다 — 360 이 최악이다.
 *   두 낱말 이름은 어차피 자연 줄바꿈 지점 = 의미 지점이라 표가 없어도 같은 자리에서 꺾인다. 표가 필요한 건
 *   **세 토막 이상**(폭마다 다른 데서 꺾이는 것)뿐이다. 이관·숨김 도구는 이 표를 안 읽는다(StoreToolsPanel 은 t.name).
 *   'MDF · 블러프 계산기' 는 어느 두 줄로 쪼개도 70px 을 넘어 360 에서 **3줄**이 됐고(핸드 리뷰 갈래만 칸 69px), 'MDF 계산기' 로 줄였다.
 */
const TITLE_LINES: Partial<Record<ToolKey, readonly [string, string]>> = {
  tda:       ['2026', 'TDA 규칙'],
  range:     ['프리플랍', '레인지 차트'],
  pushfold:  ['푸시 · 폴드', '차트'],
  trainer:   ['프리플랍', '트레이너'],
  postflop:  ['포스트플랍', '트레이너'],
  replay:    ['핸드', '리플레이어'],
  gto:       ['GTO', '핸드 분석'],
  rvr:       ['레인지', 'vs 레인지'],
  pot:       ['팟 오즈', '계산기'],
};

const TOOLS: { key: ToolKey; cat: ToolCat; name: string; desc: string; keywords?: string; icon: IconName }[] = [
  // TDA 규칙이 첫 항목(오너 지시 2026-09-14: TDA 를 위로). 2026 판 — 데이터는 src/data/tdaRules.ts.
  { key: 'tda', cat: 'rules', name: '2026 TDA 규칙', desc: '상황 물으면 규칙 찾아줌', keywords: '토너먼트 디렉터 규칙 TDA 2026 2024 한글 판정 플로어 딜러 카드 노출 올인 페널티 룰북', icon: 'gavel' },
  // ── 학습 — 차트·트레이너 ──
  { key: 'drill', cat: 'train', name: '오늘의 드릴', desc: '약한 부분만 하루 5문제', keywords: '약점 기반 하루 5문제', icon: 'target' },
  { key: 'range', cat: 'explore', name: '프리플랍 레인지 차트', desc: '포지션별 시작 핸드 기준표', keywords: '9인·6인·6맥스 포지션별 오픈·3벳·수비·vs 3벳', icon: 'grid-3x3' },
  { key: 'pushfold', cat: 'explore', name: '푸시 · 폴드 차트', desc: '칩 적을 때 올인 기준표', keywords: '자체 Nash · 셔브·콜 레인지', icon: 'arrow-up-from-line' },
  { key: 'trainer', cat: 'train', name: '프리플랍 트레이너', desc: '오픈과 올인 판단 연습', keywords: '오픈·셔브 맞히기, 오답 노트', icon: 'dumbbell' },
  { key: 'postflop', cat: 'train', name: '포스트플랍 트레이너', desc: '실전 상황 퀴즈와 해설', keywords: '실전 상황 퀴즈·해설', icon: 'brain' },
  // 오답 노트(2026-09-03, GKR-2 잔여분) — 두 트레이너의 오답 큐를 목록으로. 아이콘 = lucide book-x
  { key: 'wrongnote', cat: 'train', name: '오답 노트', desc: '틀린 핸드 모아 다시 풀기', keywords: '오답 목록 · 차트에서 보기 · 다시 풀기', icon: 'book-x' },
  { key: 'aggro', cat: 'explore', name: '어그레션 차트', desc: '포지션별 공격 권장 빈도', keywords: '포지션별 권장 빈도', icon: 'swords' },
  { key: 'glossary', cat: 'rules', name: '홀덤 용어사전', desc: '79개 용어 검색과 뜻풀이', keywords: '용어 79개 · 한글 설명·검색', icon: 'book-a' },
  // 홀덤 족보(오너 지시 2026-09-17 "용어 있는 쪽에 탭 하나 더"). 아이콘 crown = 로열 플러시. 데이터는 tools/handRank.data.ts.
  { key: 'handrank', cat: 'rules', name: '홀덤 족보', desc: '10가지 족보 순서와 예시', keywords: '핸드 랭킹 족보 순위 로열 스트레이트 플러시 포카드 풀하우스 트리플 투페어 원페어 하이카드 키커 휠 스플릿', icon: 'crown' },
  // ── 분석 — 핸드·레인지 에퀴티 ──
  // NURI SPOT — 카드·포지션·스택·액션을 **하나의 구조화된 스팟**으로 받아 분석·저장·토론까지 잇는다.
  //   ⚠ 새 레인을 만들지 않고 'review'(핸드 리뷰)에 넣는다 — 레인이 늘면
  //     e2e/gto-tab-verify.spec.ts 의 '섹션 정확히 4개'·'칩 5개' 계약이 깨진다.
  //     대신 카탈로그 위에 대표 카드(SpotHeroCard)를 따로 세워 우선순위를 준다.
  { key: 'spot', cat: 'review', name: '누리 스팟', desc: '핸드 분석 · 리플레이 · 토론', keywords: 'NURI SPOT 스팟 복기 구조화 분석 저장 토론 공유 액션 타임라인', icon: 'cards' },
  { key: 'replay', cat: 'review', name: '핸드 리플레이어', desc: '지난 판 복기와 승률 흐름', keywords: '그 핸드 복기 · 승률 추이·아웃', icon: 'clapperboard' },
  { key: 'gto', cat: 'review', name: 'GTO 핸드 분석', desc: '내 패 승률과 참고 액션', keywords: '프리/포스트플랍 승률·휴리스틱 참고 액션', icon: 'scan-search' },
  { key: 'rvr', cat: 'explore', name: '레인지 vs 레인지', desc: '양쪽 패 범위의 승률 비교', keywords: '레인지 간 에퀴티 매트릭스', icon: 'git-compare' },
  // ── 계산기 — 수치 판단 ──
  { key: 'pot', cat: 'review', name: '팟 오즈 계산기', desc: '콜에 필요한 최소 승률', keywords: '콜에 필요한 승률 계산', icon: 'percent' },
  { key: 'outs', cat: 'review', name: '아웃츠 / 확률', desc: '카드만 넣으면 완성될 확률', keywords: '카드만 넣으면 아웃 자동 계산', icon: 'dice' },
  // 2026-09-18 'MDF · 블러프 계산기' → 'MDF 계산기'(TITLE_LINES 주석 참고 — 360px 에서 3줄). 옛 이름은 keywords 로 검색된다.
  { key: 'mdf', cat: 'review', name: 'MDF 계산기', desc: '벳 크기별 최소 방어 비율', keywords: 'MDF · 블러프 계산기 수비 빈도·블러프 비율', icon: 'shield-check' },
  // 2026-09-18 오너 지시 "딜 메이킹과 ICM 계산기의 차이를 모르겠어 … ICM 계산기 쪽으로 합쳐": 딜 계산기의 표(ICM 딜 vs 칩찹)는
  //   ICM 계산기의 '딜 비교' 모드가 됐다(같은 스택·상금 입력을 두 번 치지 않는다). 옛 검색어는 keywords 로 남긴다.
  { key: 'icm', cat: 'rules', name: 'ICM 계산기', desc: '내 칩의 상금 가치 · 딜 비교', keywords: '토너먼트 기대 상금 딜 계산기 딜 메이킹 딜메이킹 ICM 딜 vs 칩찹 분배 비교 남은 사람끼리 상금 분배', icon: 'trophy' },
  // 'deal' 은 카탈로그에서 숨긴다(HIDDEN_SET) — #tool=deal 딥링크·공유 링크는 ICM 계산기의 딜 비교 모드로 도착한다.
  { key: 'deal', cat: 'rules', name: '딜 계산기', desc: '남은 사람끼리 상금 분배', keywords: 'ICM 딜 vs 칩찹 분배 비교', icon: 'handshake' },
  { key: 'spr', cat: 'review', name: 'SPR 계산기', desc: '팟 대비 내 칩 비율', keywords: '스택 대 팟 비율', icon: 'scale' },
  { key: 'ev', cat: 'review', name: 'EV 계산기', desc: '이 선택의 장기 기대값', keywords: '기대값 손익 판단', icon: 'sigma' },
  { key: 'combo', cat: 'review', name: '콤보 계산기', desc: '그 패가 나올 경우의 수', keywords: '핸드·레인지 콤보 수', icon: 'layers' },
  { key: 'mzone', cat: 'rules', name: 'M존 계산기', desc: '내 칩으로 버틸 바퀴 수', keywords: '토너 생존 압박 지수', icon: 'gauge' },
  { key: 'bankroll', cat: 'money', name: '뱅크롤 관리', desc: '게임별 권장 참가비 배수', keywords: '바인 대비 자금 권장선', icon: 'piggy-bank' },
  { key: 'variance', cat: 'money', name: '분산 시뮬', desc: '운 나쁠 때 잃을 폭 예측', keywords: 'ROI·표본 → 파산 확률', icon: 'trending-up-down' },
  // ── 매장 운영 ──
  { key: 'chip', cat: 'ops', name: '칩 분배기', desc: '1인 스택 구성과 총 칩 수', keywords: '스택 구성·총 칩 수', icon: 'coins' },
  { key: 'sim', cat: 'ops', name: '구조 시뮬', desc: '레벨별 평균 스택 깊이', keywords: '총 칩·평균 스택 깊이', icon: 'chart' },
  { key: 'blindgen', cat: 'ops', name: '블라인드 생성기', desc: '레지 마감에 맞춘 레벨표', keywords: '구조 자동 생성·표', icon: 'list-ordered' },
  { key: 'payout', cat: 'ops', name: '상금 분배', desc: '인원 넣으면 등수별 배분표', keywords: '총 상금·인원 → 분배표', icon: 'chart-pie' },
  { key: 'endtime', cat: 'ops', name: '종료시간 예측', desc: '브레이크 포함 끝나는 시각', keywords: '레벨·브레이크 → 종료 시각', icon: 'hourglass' },
];

/** 3레인 소제목 — 접이식 금지(로드맵 FIX: 접이 헤더는 모바일 회귀). 항상 펼쳐진 섹션.
 *  §7 ⑥b: '매장 운영' 레인은 GTO 탭에서 빠져 내 매장(StoreToolsPanel)으로 이관 —
 *  카탈로그에서만 숨기고 TOOLS/renderTool 에는 남겨 #tool= 딥링크·공유 하위호환을 지킨다.
 *  icon = 섹션 소제목 앞 글리프(즐겨찾기 헤더의 star-fill 과 같은 문법) — 도구 아이콘과 겹치지 않는 이름. */
// 순서(2026-09-14 오너 지시): '규칙 · 대회'(TDA)가 맨 앞. id·아이콘은 그대로다(gtoContract 갈래 계약 · icons 게이트).
// 4갈래(2026-09-14 오너 결정 "분류를 합쳐서 한 줄로"). 실측(360px, 칩 px-2): 전체 39.3 + 규칙 · 대회 68.2 + 전략 탐색 62.2
// + 트레이너 59.4 + 핸드 리뷰 62.2 + gap 25.5 = 316.6 ≤ 326 → 한 줄. 라벨은 하나도 줄이지 않았다(px-2.5→px-2 로 4.25px×5 확보).
// '규칙 · 대회': TDA 규칙·용어사전 + ICM·딜·M존. '토너먼트'(문자폭 63.6)를 쓰면 336 으로 넘친다 — 앱 전반이 '대회'(대회 일정·대회 후기)를 쓴다.
const LANES: { id: ToolCat; label: string; desc: string; icon: IconName }[] = [
  { id: 'rules',   label: '규칙 · 대회', desc: 'TDA 규칙 · 용어사전 · 족보 · ICM · 딜 · M존', icon: 'gavel' },
  { id: 'explore', label: '전략 탐색', desc: '스팟을 정하고 레인지·빈도를 본다', icon: 'table' },
  { id: 'train',   label: '트레이너',   desc: '풀고 · 틀리고 · 오답 노트로 복습', icon: 'graduation-cap' },
  { id: 'review',  label: '핸드 리뷰',  desc: '지난 판 되짚기 — 에퀴티·아웃츠·팟오즈·SPR·MDF·EV', icon: 'microscope' },
];
// eslint-disable-next-line react-refresh/only-export-components -- 이관 레지스트리 공유(§7 ⑥b)
export const STORE_TOOL_KEYS = ['chip', 'sim', 'blindgen', 'payout', 'endtime'] as const;
/** 캘린더 뱅크롤로 이관(2026-09-11 오너 지시) — 자금 관리는 '전략 학습'이 아니라 '내 기록' 쪽 일이다.
 *  ops 와 같은 조리법: 카탈로그·검색에서만 숨기고 renderTool·#tool= 딥링크는 그대로 산다. */
// eslint-disable-next-line react-refresh/only-export-components -- 이관 레지스트리 공유
export const CALENDAR_TOOL_KEYS = ['bankroll', 'variance'] as const;
const STORE_SET = new Set<ToolKey>([...STORE_TOOL_KEYS, ...CALENDAR_TOOL_KEYS]);
/** GTO 탭 카탈로그·검색·즐겨찾기에서 숨기는 도구 = 이관 도구 + '오늘의 드릴'(오너 지시 2026-09-14: GTO 탭에서 삭제)
 *  + '딜 계산기'(오너 지시 2026-09-18: ICM 계산기에 병합 — 딜 비교 모드).
 *  같은 조리법 — TOOLS/renderTool 에는 남겨 #tool=drill·#tool=deal 딥링크와 gtoContract LEGACY_KEYS 계약을 지킨다. */
const HIDDEN_SET = new Set<ToolKey>([...STORE_SET, 'drill', 'deal']);
/** '자주 쓰는 도구' 4개(오너 지시 2026-09-14: "스팟, 차트류의 GTO 등 잘 만들어 둔 좋은 툴 4개를 상단으로") — 순서가 곧 진열 순서.
 *  '전체' 보기에서만 위 섹션으로 빼고 카탈로그에서는 뺀다(같은 카드를 두 번 그리지 않는다). 갈래를 고르거나 검색하면 이 섹션은
 *  사라지고 그 갈래·검색 결과에 제 자리로 돌아온다 — "필터를 걸었는데 관계없는 도구가 위에 떠 있는" 상태를 만들지 않기 위해서다.
 *  TOOLS/renderTool/딥링크는 그대로다(이관·드릴과 같은 조리법). */
// eslint-disable-next-line react-refresh/only-export-components -- 계약 테스트가 진열 순서를 읽는다
export const FEATURED_KEYS = ['spot', 'range', 'pushfold', 'gto'] as const satisfies readonly ToolKey[];
const FEATURED_SET = new Set<ToolKey>(FEATURED_KEYS);
/** 레인 칩 진열 순서 — 하위 탭 전환 방향(forward/back) 기준. 화면에 놓인 차례 그대로. */
const LANE_ORDER = ['all', ...LANES.map((l) => l.id)] as (ToolCat | 'all')[];

// 트레이너류는 '퀴즈' 뉘앙스(맞히기), 나머지 계산기·차트류는 '도구' 뉘앙스로 라벨링.
const QUIZ_KEYS = new Set<ToolKey>(['drill', 'range', 'pushfold', 'trainer', 'postflop', 'wrongnote']);

/** 🔴 G8(2026-09-20) — 도구를 **어떤 의도로** 열었는가. 지금은 스팟의 시작 탭 하나뿐이다. */
interface OpenIntent { spotTab?: 'analyze' | 'mine' }

function renderTool(k: ToolKey, intent?: OpenIntent): ReactNode {
  switch (k) {
    case 'tda': return <TdaRulesTool />;
    // NURI SPOT — 직전 입력(tool:spot)이 있으면 그것으로, 없으면 기존 두 도구의 스냅샷에서 카드를 물려받는다.
    //   그래야 '핸드 분석에서 카드 고르다 스팟으로 넘어온' 사용자가 처음부터 다시 안 찍는다.
    // 🔴 G8 — '내 스팟' 버튼은 목록으로 가야 한다. 종전에는 두 버튼이 똑같이 `onOpen('spot')` 이라
    //   `NuriSpotPanel` 의 기본 탭('analyze')으로 들어가 **뒤 버튼이 제 기능을 못 했다**.
    //   `NuriSpotInit.tab` 은 이미 있던 통로다 — 새 상태를 만들지 않고 그것에 의도를 실어 보낸다.
    //   ⚠ 의도가 없으면(`#tool=spot` 딥링크·카탈로그 타일) 종전대로 분석 탭이다.
    case 'spot': return <NuriSpotPanel init={{ ...spotInitFromSnapshots(), ...(intent?.spotTab ? { tab: intent.spotTab } : {}) }} />;
    // '결과 먼저': 빈 폼 대신 직전 입력(스냅샷) 또는 대표 데모 핸드(AKs vs QQ)로 진입 즉시 결과.
    case 'gto': {
      const saved = readSnap<DeepGtoInit>('tool:gto');
      const hasSaved = !!(saved && ((saved.hero?.length ?? 0) + (saved.villain?.length ?? 0) > 0));
      const demo: DeepGtoInit = {
        hero: [{ rank: 'A', suit: 's' }, { rank: 'K', suit: 's' }],
        villain: [{ rank: 'Q', suit: 'h' }, { rank: 'Q', suit: 'd' }],
      };
      return <GtoDeepPanel initialState={hasSaved ? saved! : demo} />;
    }
    // 핸드 리플레이어도 같은 문법 — 직전 복기(스냅샷)가 있으면 그 핸드로, 없으면 도구 자체의 데모 핸드로.
    case 'replay': return <HandReviewTool initial={readSnap<HandReviewInit>('tool:replay') ?? undefined} />;
    case 'drill': return <DailyDrill />;
    case 'pot': return <PotOddsCalc />;
    case 'icm': return <ICMCalculator />;
    // 2026-09-03 오너 지시로 상단 바로가기 칩 제거 — 그룹 선택은 차트 안(RangeGuide 의 RANGE_GROUPS 칩)에 그대로 있어 기능 소실 0.
    // RangeGuide 의 initialGroup prop(기본 rfi9)은 손대지 않았다 — 다시 필요하면 여기 한 줄.
    // 오답 노트 '차트에서 보기' 는 tool:range / tool:pushfold 스냅샷으로 시나리오·셀을 넘긴다 — 1회성이라
    // 열린 뒤 이펙트가 지운다(tool:gto 와 달리 24h 동안 강조가 들러붙으면 안 된다). 아래 ToolsPanel 의 [active] 이펙트 참고.
    case 'range': { const j = readSnap<RangeJump>('tool:range'); return <RangeGuide initialScenId={j?.scenId} highlight={j?.hand} />; }
    // 스팟 리포트의 '비슷한 스팟 풀기' 가 tool:trainer 로 그 표의 문제를 넘긴다(위 range·pushfold 와 같은 조리법).
    case 'trainer': { const j = readSnap<DrillLink>('tool:trainer'); return <PreflopTrainer initialMode={j?.mode} initialKey={j?.key} />; }
    case 'postflop': return <PostflopTrainer />;
    case 'wrongnote': return <WrongNote />;
    case 'mdf': return <MdfCalc />;
    case 'aggro': return <AggroChart />;
    case 'rvr': return <RangeMatrix />;
    case 'outs': return <OutsCalc />;
    case 'pushfold': { const j = readSnap<PushJump>('tool:pushfold'); return <PushFoldChart initialK={j?.k} initialStack={j?.stack} initialAnte={j?.ante} initialView={j?.view} highlight={j?.hand} />; }
    case 'spr': return <SprCalc />;
    case 'ev': return <EvCalc />;
    case 'mzone': return <MzoneCalc />;
    case 'bankroll': return <BankrollCalc />;
    case 'variance': return <VarianceCalc />;
    case 'payout': return <PayoutCalc />;
    case 'endtime': return <EndTimeCalc />;
    case 'combo': return <ComboCalc />;
    case 'chip': return <ChipDistributor />;
    case 'sim': return <StructureSim />;
    case 'blindgen': return <BlindBuilder />;
    case 'glossary': return <GlossaryPanel />;
    case 'handrank': return <HandRankPanel />;
    // 딜 계산기는 ICM 계산기에 병합됐다(2026-09-18) — 옛 딥링크는 딜 비교 모드로 연다.
    case 'deal': return <ICMCalculator initialMode="deal" />;
    default: return null;
  }
}

// ── 내 매장 이관용 공개 API(§7 ⑥b) — 레지스트리·렌더러를 재사용해 중복 정의 0 ──
export type StoreToolKey = (typeof STORE_TOOL_KEYS)[number];
// eslint-disable-next-line react-refresh/only-export-components -- 이관 레지스트리 공유(관행: CommentThread groupThreads)
export const getStoreTools = () => TOOLS.filter((t) => STORE_SET.has(t.key)) as { key: StoreToolKey; name: string; desc: string; icon: IconName }[];
// eslint-disable-next-line react-refresh/only-export-components
export const renderStoreTool = (k: StoreToolKey): ReactNode => renderTool(k);

/** 캘린더 뱅크롤 이관분(2026-09-11) — StoreToolsPanel 과 같은 조리법. 레지스트리·렌더러를 재사용해 중복 정의 0. */
export type CalendarToolKey = (typeof CALENDAR_TOOL_KEYS)[number];
const CAL_SET = new Set<ToolKey>(CALENDAR_TOOL_KEYS);
// eslint-disable-next-line react-refresh/only-export-components -- 이관 레지스트리 공유
export const getCalendarTools = () => TOOLS.filter((t) => CAL_SET.has(t.key)) as { key: CalendarToolKey; name: string; desc: string; icon: IconName }[];
// eslint-disable-next-line react-refresh/only-export-components -- 이관 렌더러 공유
export const renderCalendarTool = (k: CalendarToolKey): ReactNode => renderTool(k);

/** 도구 모음 — 4레인(학습/분석/계산기/매장운영) 카탈로그 + 카드형 런처.
 *  누르면 "그 카드 행 아래 인라인"이 아니라 **전체화면 페이지**로 연다.
 *  (인라인 방식은 중간 카드를 누르면 위에 런처가 그대로 남아, 열린 도구를 찾아 내려가야 했다 —
 *   전체화면 Modal(page)은 헤더·닫기·뒤로가기·드래그 닫기까지 앱의 다른 상세 화면과 같은 문법.)
 *  레인은 접이식 금지 — 비접이 소제목 + 상단 필터 칩 행(전체/학습/분석/계산기/매장운영). */
export default function ToolsPanel() {
  const toast = useToast();
  const [active, setActive] = useState<ToolKey | null>(() => {
    // 딥링크: #tool=key 로 특정 도구 바로 열기(공유·재방문) — 하위호환 계약, 변경 금지
    const m = window.location.hash.match(/^#tool=([a-z]+)/);
    return m && TOOLS.some((t) => t.key === m[1]) ? (m[1] as ToolKey) : null;
  });
  // GTO 도구는 로그인 회원 전용(오너 지시 2026-08-27) — 카탈로그는 보이되 실행에 게이트
  //
  // ⚠ 2026-08-30: 예전엔 `if (!user) promptLogin()` 이었는데, 그게 **user 의 세 상태를 둘로 뭉갰다.**
  //   Supabase 세션 복원은 비동기라 '페이지는 그려졌고 카드도 눌리는데 user 는 아직 null' 인 구간이 있다.
  //   그 사이의 탭은 '비로그인' 으로 판정돼 도구가 안 열리고 로그인 시트가 떴다 —
  //   **로그인했는데 로그인하라고 뜨는** 그 증상이다.
  //   느린 기기일수록 창이 넓어진다. CI(2워커)에서 실측 12회 중 2회(약 17%) 재현됐고,
  //   tools 스펙이 CI 에서만 다섯 번 간헐 실패하던 것의 정체가 이거였다.
  //   → 로딩 중이면 **판정하지 말고 의도를 기억**했다가, 세션이 확정된 뒤에 연다.
  //     확정 결과가 '비로그인' 이면 그때 로그인 시트를 띄운다(안내가 늦는 게 아니라 정확해진다).
  const { user, loading: authLoading } = useAuth();
  const pendingTool = useRef<ToolKey | null>(null);
  // 🔴 G8(2026-09-20) — 진입 의도. 로그인 대기 경로(`pendingTool`)를 지나도 **같이** 살아남아야
  //   "로그인하고 돌아왔더니 분석 탭" 이 되지 않는다. 그래서 ref 와 state 를 짝으로 둔다.
  const pendingIntent = useRef<OpenIntent | undefined>(undefined);
  const [intent, setIntent] = useState<OpenIntent | undefined>(undefined);
  const open = (k: ToolKey, opts?: OpenIntent) => {
    if (authLoading) { pendingTool.current = k; pendingIntent.current = opts; return; }   // 아직 모른다 — 결론을 미룬다
    if (!user) { promptLogin(); return; }
    setIntent(opts);
    setActive(k);
  };
  useEffect(() => {
    if (authLoading) return;
    const k = pendingTool.current;
    if (!k) return;
    const i = pendingIntent.current;
    pendingTool.current = null;
    pendingIntent.current = undefined;
    if (!user) { promptLogin(); return; }
    setIntent(i);
    setActive(k);
  }, [authLoading, user]);
  const close = () => setActive(null);

  // ── 딥링크 해시(#tool=)는 **도구 자신의 history 항목**에 얹는다 ──────────────
  // 2026-08-28 회귀 수정. 예전엔 open() 이 그 자리에서 replaceState 로 해시를 썼다.
  //   그러면 해시가 '도구를 열기 전' 항목에 찍히고, Modal 이 그 위에 새 항목을 밀면서
  //   URL(=해시)을 물려받는다. 닫을 때 위 항목의 해시만 지우고 backstack 이 한 칸 되돌아오면
  //   **아래 항목의 낡은 해시가 되살아나 hashchange → 도구가 즉시 다시 열린다.**
  //   실측 로그: replace(/) → go(-1) → popstate(/#tool=range) → hashchange → push(layer 3).
  //   (지금까지 안 터진 이유: 예전 replaceState 가 그 항목의 __layer 토큰까지 지워서
  //    backstack 이 균형 back 을 아예 포기했다. 토큰 보존을 고치자 이 지뢰가 드러났다.)
  // 처방: 해시를 '도구 항목'에만 둔다.
  //   ① 진입 항목의 해시는 layout 단계에서 걷어낸다 — Modal 의 pushState(passive effect)보다 먼저다.
  //   ② 도구가 열린 뒤(부모 passive effect = 자식 push 이후)에 그 항목에 해시를 얹는다.
  //   ③ 닫힐 때는 서 있는 항목의 해시만 지우면 된다 — 아래 항목엔 애초에 해시가 없다.
  const stripToolHash = () => {
    if (!window.location.hash.startsWith('#tool=')) return;
    try { history.replaceState(null, '', window.location.pathname + window.location.search); } catch { /* 무시 */ }
  };
  const activeRef = useRef<ToolKey | null>(active);
  activeRef.current = active;
  useLayoutEffect(() => { stripToolHash(); }, []); // 딥링크 진입 항목 정규화(1회)
  useEffect(() => {
    if (!active) { stripToolHash(); return; }
    if (window.location.hash === `#tool=${active}`) return;
    try { history.replaceState(null, '', `#tool=${active}`); } catch { /* 무시 */ }
  }, [active]);
  // 차트 점프 파라미터는 1회성 — 렌더(useState 초기화)가 읽은 뒤 커밋 후에 지운다.
  // 렌더 중에 지우면 StrictMode 이중 렌더의 두 번째 호출이 null 을 읽는다.
  useEffect(() => {
    if (active === 'range' || active === 'pushfold' || active === 'trainer') clearSnap(`tool:${active}`);
  }, [active]);
  // 도구 딥링크 공유 — 시스템 공유 시트(모바일) 또는 클립보드 복사(PC). #tool= 로 그 도구가 바로 열린다.
  const share = async (k: ToolKey) => {
    const t = TOOLS.find((x) => x.key === k);
    const label = QUIZ_KEYS.has(k) ? '오늘의 퀴즈' : '포커 도구';
    try {
      const how = await shareOrCopy({
        title: t ? `${t.name} · 누리홀덤` : '누리홀덤 도구',
        text: t ? `${t.name} — ${label}` : '누리홀덤 도구',
        url: `${window.location.origin}/#tool=${k}`,
      });
      if (how === 'copy') toast.show('링크 복사됨', 'success');
    } catch { /* 사용자가 공유 시트를 닫음 */ }
  };

  // 도구 사이 상호 링크(<a href="#tool=key">) — **열린 상태에서 갈아끼운다**.
  // 2026-08-29 실측 버그: 예전엔 앵커가 그냥 해시를 밀었고, 그러면 backstack 이 자기 것이 아닌
  // history 항목을 보고 '사용자가 나갔다'로 판정해 **도구가 통째로 닫혔다**(팟 오즈 링크가 그랬다 —
  // 아웃츠 → 팟 오즈로 가는 대신 런처로 튕겼다). history 를 건드려 고치려 들면 위 ①②③ 지뢰밭에
  // 다시 들어가야 한다. 그래서 아예 **네비게이션을 만들지 않는다** — 클릭을 가로채 active 만 바꾸고,
  // 해시는 기존 [active] 이펙트가 같은 항목에 replaceState 로 얹는다(항목 수 불변).
  const swapToolOnLinkClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest?.('a[href^="#tool="]');
    if (!a) return;
    const k = (a.getAttribute('href') ?? '').slice('#tool='.length);
    if (!TOOLS.some((t) => t.key === k)) return;
    e.preventDefault();
    open(k as ToolKey);
  };

  // 검색 + 레인 필터 칩 — 접이식 헤더(모바일 회귀)를 대체하는 비접이 IA.
  const [q, setQ] = useState('');
  const [lane, setLane] = useState<ToolCat | 'all'>('all');
  const ql = q.trim().toLowerCase();
  // 검색도 카탈로그와 같은 범위(이관 도구·오늘의 드릴 제외)
  const hits = ql ? TOOLS.filter((t) => !HIDDEN_SET.has(t.key) && (t.name.toLowerCase().includes(ql) || t.desc.toLowerCase().includes(ql) || (t.keywords ?? '').toLowerCase().includes(ql))) : null;
  // 즐겨찾기 — 레인 위에 상시 노출(최대 6개)
  const [favs, setFavs] = useState<ToolKey[]>(() => {
    try { return JSON.parse(localStorage.getItem('nuri:fav-tools') || '[]'); } catch { return []; }
  });
  const toggleFav = (k: ToolKey) => setFavs((prev) => {
    const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k].slice(-6);
    try { localStorage.setItem('nuri:fav-tools', JSON.stringify(next)); } catch { /* quota */ }
    return next;
  });
  const favTools = favs.map((k) => TOOLS.find((t) => t.key === k)).filter((t) => t && !HIDDEN_SET.has(t.key)) as typeof TOOLS;

  // 트레이너 진행(스트릭/XP/오늘 목표) — 이미 로컬에 있는 데이터 구독(신규 fetch 0)
  const prog = useTrainerProgress();

  // 다른 곳(공유 링크·도구 간 상호 딥링크·nuri:open-tool)에서 해시가 바뀌면 반영.
  // ⚠ layout 이펙트인 이유(2026-09-03 실측): 다른 탭에서 이 패널을 처음 마운트시키며 여는 경로는
  //   'pane 이 보이는 첫 rAF' 에 hashchange 를 쏜다. 그 rAF 는 커밋(=layout 단계) 뒤·passive 이펙트 앞에
  //   낄 수 있어, passive 로 붙이면 리스너가 없는 채로 이벤트가 지나가고 이어 도는 [active](null) 이펙트가
  //   해시까지 걷어냈다(GTO 카탈로그만 뜸). 커밋 시점에 붙여야 'pane 이 보인다 ⇒ 리스너가 있다' 가 성립한다.
  useLayoutEffect(() => {
    const onHash = () => {
      const m = window.location.hash.match(/^#tool=([a-z]+)/);
      if (!m || !TOOLS.some((t) => t.key === m[1])) return;
      if (activeRef.current === m[1]) return;
      // 위 ① 과 같은 이유 — 해시를 갖고 도착한 이 항목에서 해시를 걷어내고,
      // 도구가 열린 뒤 그 도구의 항목에 다시 얹는다(닫을 때 되살아나지 않게).
      stripToolHash();
      setActive(m[1] as ToolKey);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const grid = (items: typeof TOOLS) => (
    <div className="grid auto-rows-fr grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((t) => (
        <ToolCard key={t.key} testId={`tool-${t.key}`} tone={LANE_TONE[t.cat]} name={t.name} lines={TITLE_LINES[t.key]} desc={t.desc} icon={t.icon} onClick={() => open(t.key)}
          fav={favs.includes(t.key)} onToggleFav={() => toggleFav(t.key)} />
      ))}
    </div>
  );

  const activeTool = active ? TOOLS.find((t) => t.key === active) : null;


  return (
    <div className="hero-aurora space-y-3">
      {/* 프리플랍 레인지 차트 대표 카드(2026-08-30 편입)는 2026-09-14 오너 결정으로 뺐다 — '자주 쓰는 도구'(FEATURED_KEYS 의 range)가
          그 역할을 대신한다. NURI SPOT 대표 카드는 '탭의 주인공'(2026-09-03 오너 결정)이라 남긴다. */}
      {/* 트레이너 진행 스트립(오늘 N/목표 · 스트릭 · XP · 목표까지 N문제).
          2026-09-14 오너 지시로 이 자리의 '오늘의 드릴' 카드는 뺐다(드릴 화면 자체는 #tool=drill 로 남는다).
          이 지표는 드릴이 아니라 트레이너 기록이라 그대로 둔다 — 없어진 정보 0. */}
      <div data-main-enter className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
          <span className="text-ink-muted">오늘 <b className="tabular-nums text-ink-primary">{prog.today}/{prog.goal}</b></span>
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <Icon name="flame" size={12} className="text-accent-300" aria-hidden />
            <b className="tabular-nums text-accent-200">{prog.streak}</b>일
          </span>
          <span className="text-ink-muted">XP <b className="tabular-nums text-ink-secondary">{prog.xp.toLocaleString()}</b></span>
        </span>
        <span className={['shrink-0 text-2xs font-semibold', prog.goalMet ? 'text-emerald-400' : 'text-ink-muted'].join(' ')}>
          {prog.goalMet ? '오늘 목표 달성' : `목표까지 ${prog.remaining}문제`}
        </span>
      </div>

      {/* NURI SPOT — GTO 홈의 대표 진입점. 검색·레인 칩보다 위, 그러나 낮게. */}
      {!hits && <SpotHeroCard onOpen={open} />}

      {/* 도구 검색 */}
      <div data-main-enter className="relative">
        <Icon name="search" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" aria-hidden />
        {/* type=search: 네이티브 지우기(×) 버튼 + 모바일 '검색' 키(enterKeyHint). .input[type=search] 가 12px 라운드·pl-10 을 준다 */}
        <input type="search" enterKeyHint="search" autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} placeholder="도구 검색 · 이름·기능"
          className="input w-full text-sm" aria-label="도구 검색" />
      </div>

      {/* 레인 필터 칩 — 보이는 높이 34px, 탭 타깃 46px(`.tap-y-44::before { inset:-6px 0 }` 로 위아래 6px 확장), aria-pressed 토글.
          flex-wrap + 칩 5개(2026-09-14 오너 결정 "분류를 합쳐서 한 줄로"). 종전 6개는 폭 합 420.7px 이라 360px 바(326px)에서
          마지막 칩 하나만 혼자 둘째 줄로 떨어졌다(오너 지적). 갈래를 합치고 px-2 로 줄여 316.6px — 360 부터 한 줄이고
          320·200% 확대에서는 자연히 두 줄로 접힌다(줄바꿈 능력을 남긴 채 폭만 줄였다).
          한 줄 가로 스크롤·3×2 고정 그리드는 시도했다가 철회했다 — e2e 접근성 게이트(typography-regression 의 "가로 잘림 0",
          gto-tab-verify 의 "가로 스크롤 0")가 clientWidth < scrollWidth 를 잘림으로 보고, 고정 셀은 200% 에서 3px 넘쳤다.
          그래서 칩에 whitespace-nowrap 도 두지 않는다 — 320px·200% 에서는 칩 안에서 글자가 접혀야 게이트를 지난다.
          ⚠ gap-y 가 gap-x 보다 큰 이유(2026-09-11 실측): gap-1.5(6.375px)는 위아래 줄의 6px 확장이 서로 겹치는 폭이라
            실효 터치 높이가 39px 로 줄었다. gap-y-3(12.75px) > 6+6 이면 두 줄 모두 46px 을 온전히 가진다. */}
      {!hits && (
        <div data-main-enter data-tools-lanebar="" role="group" aria-label="도구 분류 필터"
          className="flex flex-wrap justify-center gap-x-1.5 gap-y-3">
          {([{ id: 'all' as const, label: '전체' }, ...LANES]).map((l) => {
            const on = lane === l.id;
            return (
              // data-lane: e2e 가 라벨 대신 이 값을 짚는다. 라벨은 오너 지시로 자주 바뀌는데
              //   (예전 '계산기' → 지금 '규칙 · 수학') 셀렉터가 라벨에 묶여 있으면 이름만 바꿔도
              //   게이트가 조용히 꺼진다 — subtab-motion 의 tools-lane 계측이 실제로 그렇게 죽어 있었다.
              <button key={l.id} type="button" aria-pressed={on} data-lane={l.id}
                onClick={() => { const next = on && l.id !== 'all' ? 'all' : l.id; goSubTab('tools-lane', LANE_ORDER, lane, next, () => setLane(next)); }}
                className={['tap-y-44 inline-flex h-8 items-center justify-center rounded-badge border px-2 text-2xs font-semibold transition-colors',
                  on ? 'border-accent-300 bg-accent-300 text-white' : 'border-transparent bg-surface-high text-ink-secondary hover:text-ink-primary'].join(' ')}>
                {l.label}
              </button>
            );
          })}
        </div>
      )}

      {/* 즐겨찾기 — 레인과 무관하게 항상 보이는 내 도구 */}
      {!hits && favTools.length > 0 && (
        <section data-main-enter className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border-subtle pb-1.5">
            <h2 className="inline-flex items-center gap-1 text-sm font-bold text-ink-primary">
              <Icon name="star-fill" size={13} className="text-accent-300" aria-hidden /> 즐겨찾기
            </h2>
            <span className="text-2xs font-semibold tabular-nums text-ink-muted">{favTools.length}개</span>
          </div>
          {grid(favTools)}
        </section>
      )}

      {/* 자주 쓰는 도구 — 즐겨찾기 아래, 카탈로그 위(오너 지시 2026-09-14). '전체' 보기에서만; 갈래·검색 중에는 제 자리로 돌아간다. */}
      {!hits && lane === 'all' && (
        <section data-main-enter data-testid="tools-featured" className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border-subtle pb-1.5">
            <h2 className="inline-flex items-center gap-1 text-sm font-bold text-ink-primary">
              <Icon name="trophy" size={13} className="text-accent-300" aria-hidden /> 자주 쓰는 도구
            </h2>
            <span className="text-2xs font-semibold tabular-nums text-ink-muted">{FEATURED_KEYS.length}개</span>
            <span className="min-w-0 text-2xs text-ink-secondary">스팟 · 차트 · GTO 분석 바로가기</span>
          </div>
          {grid(FEATURED_KEYS.map((k) => TOOLS.find((t) => t.key === k)!))}
        </section>
      )}

      {/* 도구 목록 — 레인 전환의 본문(방향성 푸시 대상).
          레인 사이는 space-y-4(17px): 섹션 안(헤더→그리드) 8.5px 의 2배라 밑줄 헤더가 자기 그리드 쪽으로 붙어 레인이 묶음으로 읽힌다
          (space-y-3 은 1.5배라 '계산기 N개' 헤더가 위 레인의 마지막 카드에 붙어 보였다). */}
      <div data-main-enter data-tools-lanepanel="" className="space-y-4">
      {hits ? (
        hits.length === 0
          ? <p className="py-8 text-center text-2xs text-ink-muted">'{q.trim()}' 에 맞는 도구가 없습니다</p>
          : grid(hits)
      ) : (
        // 4갈래 흐름 — 비접이 소제목 섹션(필터 칩이 보이는 갈래를 고른다)
        LANES.filter((l) => lane === 'all' || lane === l.id).map((l) => {
          // '전체' 에서는 위 '자주 쓰는 도구' 4개를 여기서 뺀다(중복 카드 0). 갈래를 고르면 그 갈래에 제 자리로 돌아온다.
          const items = TOOLS.filter((t) => t.cat === l.id && !HIDDEN_SET.has(t.key) && !(lane === 'all' && FEATURED_SET.has(t.key)));
          return (
            <section key={l.id} className="space-y-2">
              {/* §7 P0-A: 레인 설명이 `truncate` 라 320px·100% 에서도 172/178,
                  200% 에서는 170/357 로 잘렸다("지난 판 되짚기 — 에퀴티·아웃…").
                  소제목 줄을 wrap 시켜 설명이 필요하면 아랫줄로 흐르게 한다. */}
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border-subtle pb-1.5">
                <h2 className="inline-flex items-center gap-1 text-sm font-bold text-ink-primary">
                  <Icon name={l.icon} size={13} className="text-accent-300" aria-hidden /> {l.label}
                </h2>
                <span className="text-2xs font-semibold tabular-nums text-ink-muted">{items.length}개</span>
                {/* 🔴 2026-09-18: 레인 소제목(l.desc)을 화면에서 뺐다 — 바로 아래 카드 그리드가
                    같은 도구 이름을 그대로 다시 보여준다(화면에 이미 보이는 것의 반복).
                    이 줄은 320px·200% 에서 170/357 로 잘리던 자리이기도 하다(위 주석) — 중복을 없애니 잘림도 같이 사라진다.
                    ⚠ LANES[].desc 데이터는 그대로 둔다 — 지우면 gtoContract 의 LANES 포맷 검사가 흔들린다. */}
              </div>
              {grid(items)}
            </section>
          );
        })
      )}
      </div>

      {/* 도구 실행 — 전체화면 페이지(헤더·뒤로가기·드래그 닫기 = 앱 공통 문법).
          ⚠ display:contents 래퍼 필수 — 루트가 space-y-3 이라 Modal(fixed inset-0)이 직계 자식이면
          space-y 의 margin-top(0.75rem)이 fixed 박스에도 적용돼 전체화면 상단이 12.75px 내려앉고,
          그 틈으로 뒤 헤더(프로필 등급 링)가 비쳤다(오너 리포트 2026-08-27). contents 는 박스를
          만들지 않아 margin 이 무효가 되고, 다이얼로그는 space-y 의 직계 자식에서 벗어난다. */}
      <div className="contents">
      {/* 공유는 **창에 딸린 동작**이라 제목줄(닫기 옆)에 둔다 — 본문 위 전용 행에 두면
          내용과 상관없는 버튼이 위에 홀로 떠 보인다(오너 2026-09-06 스크린샷). */}
      <Modal open={!!activeTool} onClose={close} variant="page" title={activeTool?.name} maxWidth="2xl"
        headerAction={active ? (
          <button type="button" onClick={() => share(active)}
            aria-label={`${activeTool?.name ?? '도구'} 링크 공유`}
            // tap-y-44: 보이는 박스(38.3px)는 그대로 두고 위아래 6px씩 눌림 영역만 확장(index.css:1005-1006).
            // 헤더 행에는 overflow-x-auto 조상이 없어(오버행이 안 잘림) 실측 확인됨(2026-09-20).
            className="tap-y-44 inline-flex h-9 items-center gap-1.5 rounded-input px-2.5 text-2xs font-semibold text-ink-secondary transition-colors hover:bg-surface-high hover:text-ink-primary">
            <Icon name="share" size={15} aria-hidden />
            <span className="hidden sm:inline">공유</span>
          </button>
        ) : undefined}>
        {/* onClick 은 앵커 클릭 위임 전용 — 이 div 자체는 인터랙티브가 아니다.
            앵커는 키보드 Enter 도 click 으로 오므로 별도 키 핸들러가 필요 없다. */}
        <div className="px-page-x py-3 pb-8" onClick={swapToolOnLinkClick}>
          <Suspense fallback={<div className="py-10 text-center text-2xs text-ink-muted">불러오는 중…</div>}>
            {/* #tool= 딥링크로 비로그인 진입해도 게이트가 유지되게 실행 지점에서 한 번 더 확인 */}
            {active ? (user ? renderTool(active, intent) : (
              <div className="flex flex-col items-center gap-3 py-14 text-center">
                <p className="text-sm font-bold text-ink-primary">로그인하면 GTO 도구를 쓸 수 있어요</p>
                <p className="text-2xs text-ink-muted">차트·트레이너·계산기 전부 무료입니다</p>
                <button type="button" onClick={() => promptLogin()} className="btn-primary h-10 px-5 text-sm font-bold">로그인하기</button>
              </div>
            )) : null}
          </Suspense>
        </div>
      </Modal>
      </div>
    </div>
  );
}

type TileTone = 'violet' | 'indigo' | 'fuchsia' | 'cyan';
/** 레인 → 타일 색(v6.3): 차트 violet · 트레이닝 fuchsia · 분석 cyan · 계산기 indigo (emerald 는 라이브 신호색이라 제외) */
const LANE_TONE: Record<string, TileTone> = { chart: 'violet', learn: 'fuchsia', analyze: 'cyan', calc: 'indigo', ops: 'indigo' };
/**
 * NURI SPOT 대표 카드 — GTO 홈의 첫 블록.
 *
 * 왜 카드 하나를 따로 세우나: 'spot' 은 카탈로그 안에서는 28개 중 하나로 보인다. 그런데 이건
 * 도구가 아니라 **흐름**이다(분석 → 저장 → 토론). 그래서 카탈로그 위에 한 번 더 세운다.
 * 대신 **높이를 낮게 유지**한다 — 모바일 첫 화면에서 이 카드 아래로 검색창·레인 칩·차트/트레이너가
 * 바로 이어져야 한다(오너 지시 2: 첫 화면에서 새 스팟 분석·차트·트레이너 셋을 다 알아볼 수 있을 것).
 */
function SpotHeroCard({ onOpen }: { onOpen: (k: ToolKey, opts?: OpenIntent) => void }) {
  return (
    <section
      data-main-enter
      data-testid="spot-hero"
      className="relative rounded-card border border-accent-400/30 bg-surface-mid p-3"
      // 히어로에만 강한 LED. 아래 도구 카드들은 이 빛을 반복하지 않는다(광량 단계).
      // 2026-09-18: 인라인 rgb 글로우 → 토큰 LED([data-aura] hero). 라이트에서 약해지고 고대비·강제색에서 꺼진다.
      data-aura data-aura-level="hero" data-aura-variant="violet"
      aria-label="NURI SPOT"
    >
      {/* ⚠ U/§7 P0-2(2026-09-12 실측): 200% 텍스트 확대 · 390px 에서 이 행의 텍스트 칸이
          clientWidth 19px / scrollWidth 119px 가 돼 **"NURI SPOT" 과 설명이 통째로 사라졌다.**
          원인은 글자 크기가 아니라 오른쪽 배지가 `shrink-0` 로 행을 다 먹는 것 —
          그래서 글자를 줄이는 대신 **배지를 아래 줄로 흘려보낸다**(§7: 중요한 정보를 작게 줄여 박스에 넣지 마라).
          100% 에서는 폭이 남아 줄바꿈이 일어나지 않아 현재 화면은 그대로다. */}
      <div className="flex flex-wrap items-center gap-2.5">
        {/* 🔴 2026-09-19 (2차) 오너 지시: **"누리스팟 최상단 배너 아이콘은 기존 아이콘으로 변경,
            gto 내에 있는 아이콘은 지금 그대로 유지."** → 이 배너만 앱 로고 심볼로 되돌린다.
            같은 날 1차에서 내가 `cards` 로 바꿨던 자리다(이유: 헤더에 같은 마크가 있어 '앱 이름'처럼
            읽힌다고 봤다). 오너가 화면을 보고 아니라고 했으니 배너는 원래대로 간다.
            ⚠ **도구 카탈로그 타일(이 파일 위쪽 TOOLS 의 `icon: 'cards'`)은 건드리지 마라** —
              그게 "gto 내에 있는 아이콘" 이고 지금 그대로 유지가 지시다. 둘을 같이 맞추려 들지 마라. */}
        <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/12"
          style={{ background: 'radial-gradient(120% 120% at 50% 0%, #242B48 0%, #141930 58%, #0A0D1B 100%)' }} aria-hidden>
          <img src="/brand/nuri-holdem-symbol.svg" alt="" width={20} height={20} draggable={false} />
        </span>
        <div className="min-w-0 flex-[1_1_3.5rem]">
          <p className="text-sm font-extrabold tracking-tight text-ink-primary">NURI SPOT</p>
          {/* ⚠ §7(2026-09-12 실측): 360px 에서 `truncate` 로 잘려 87 < 142 였다.
              이미 11.69px 라 **더 줄이면 안 되는 구간**이므로 글자를 키우지도 줄이지도 않고
              줄바꿈으로 푼다(§7: 긴 정보는 줄바꿈·재배치로 푼다).
              ⚠ 2026-09-12 2차: `line-clamp-2` 로 상한을 뒀더니 **320px·100% 에서 이미 clientHeight 32 /
              scrollHeight 48** — 셋 중 마지막 토막('토론')이 잘려 있었다. 세로 잘림도 정보 소실이라 상한을 뺀다. */}
          {/* 🔴 2026-09-18 오너 지시로 설명줄을 뺐다("누리 스팟 아래 핸드 분석 리플레이 토론 이런 설명들 전체 삭제").
              같은 커밋에서 `e2e/nuri-spot.spec.ts:56` 의 이 문구 단언도 `data-testid` 기준으로 바꿨다
              (CLAUDE.md: 라벨을 바꾸면 같은 커밋에서 셀렉터를 data-testid 로 교체). */}
        </div>
        {/* `text-[10px]` 은 역할 사다리 밖이라 루트 17px 확대를 못 받는다 — `text-2xs`(11.69px)로 올린다.
            `shrink-0` 도 뺐다: 320px·200% 에서 이 배지 하나가 245px 을 선점해 섹션(199px)을 밖으로 밀었다.
            배지 글자는 스스로 줄바꿈된다 — 잘리는 것이 아니라 두 줄이 된다. */}
        <span className="min-w-0 rounded-badge border border-border-default bg-surface-high px-1.5 py-0.5 text-2xs font-semibold text-ink-muted"
          title="프리플랍은 자체 차트·Nash 데이터와 일치할 때만 기준 빈도를 보여주고, 포스트플랍은 에퀴티·팟오즈만 계산합니다.">
          프리플랍 차트 · 수학
        </span>
      </div>
      {/* 🔴 2026-09-20 오너 지시: "그런 사람 없어 앞으로 200% 확대 다 빼" ·
          "기존 작업에서도 200% 확대를 전제로 뭔가 둡다면 모든 기준은 100%".
          종전 주석: "`.btn` 이 whitespace-nowrap 이라 **200% 확대에서** '새 스팟 분석'(137px)이
          2열 칸(128px)을 넘쳐 두 줄을 허용했다" — **그 전제가 사라졌다.**
          100% 에서는 한 줄에 들어가므로 `whitespace-normal`·`leading-tight` 를 걷어낸다.
          ⚠ `min-h-[44px]` 는 **남긴다** — 그건 확대 대책이 아니라 손가락 터치 최소치다.
          ⚠ 100% 에서 한 줄인지는 실측으로 확인했다(아래 커밋 메시지에 수치). */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => onOpen('spot')} className="btn-primary min-h-[44px] px-2 text-xs">
          새 스팟 분석
        </button>
        <button type="button" onClick={() => onOpen('spot', { spotTab: 'mine' })} className="btn-ghost min-h-[44px] px-2 text-xs">
          내 스팟
        </button>
      </div>
    </section>
  );
}

function ToolCard({ name, lines, desc, icon, onClick, fav, onToggleFav, testId, tone = 'violet' }: {
  name: string;
  /** 제목의 줄바꿈 지점(TITLE_LINES). 없으면 한 줄로 그린다. 합치면 `name` 과 같아야 한다. */
  lines?: readonly [string, string];
  /** 카드에 **그리지 않는다**(2026-09-18 오너: 설명줄 전체 삭제). PC 호버 툴팁(title)으로만 남긴다 —
   *  데이터 자체는 TOOLS 에 그대로 있어 검색(`t.desc`)과 다른 두 화면(StoreToolsPanel·CalendarToolsPanel)이 계속 쓴다. */
  desc: string; icon: IconName; onClick: () => void; testId?: string; tone?: TileTone;
  fav?: boolean; onToggleFav?: () => void;
}) {
  // 버튼 안에 role="button" 스팬(중첩 인터랙티브 위반) 대신 형제 버튼 2개 — 키보드로도 별을 켤 수 있다.
  return (
    <div className="relative h-full">
      {/* 세로 타일(2026-09-03 오너: "설명이 너무 길고 불완전") — 아이콘을 위로 올려 텍스트 폭을 106px → 155px(390px 2열)로 넓히고,
          설명은 ≤13자 완결형 명사구 한 줄(TOOLS[].desc 전면 개고). 이름은 안 자른다(2줄 허용) — 같은 행 칸 높이는 그리드 auto-rows-fr + h-full 이 맞춘다.
          아이콘 행 오른쪽 자리는 즐겨찾기 별(형제 버튼, 우상단). 레퍼런스 aura-ui 피처 카드 문법(아이콘 타일 위 · 제목 · 한 줄 설명). */}
      {/* 🔴 2026-09-18 오너 지시로 **가로 배치**가 됐다 — 아이콘 왼쪽, 제목 오른쪽, 설명줄 없음.
          예전 주석(세로 타일·설명 ≤13자)은 그 지시로 폐기됐다. 남은 계약은 이것뿐이다:
            · 제목 칸은 **늘 2줄 자리를 예약**한다(min-h-[2.5em] + leading-tight) — 그래야 한 줄짜리 제목이
              섞여도 같은 행의 카드들이 **같은 높이**가 된다(오너: "열을 맞춰서 정렬").
              2026-09-18 2차(한 줄 제목 허용) 뒤로는 예약 칸 안에서 **세로 가운데**(flex-col justify-center) —
              한 줄 제목이 예약 칸 위에 붙으면 아이콘보다 7px 높이 떠 보였고 아래가 빈 줄로 남았다(360 실측 스크린샷).
              두 줄 제목은 2.5em 을 꽉 채우므로 가운데 정렬로 위치가 바뀌지 않는다.
            · 줄바꿈 지점은 CSS 자동이 아니라 TITLE_LINES 가 정한다(카드 폭이 폭마다 2배 차이) — 단 **70px 에 한 줄로
              들어가는 이름은 표에 없다**(TITLE_LINES 주석의 실측표). 그 이름들은 한 줄이다.
            · 오른쪽 `pr-7` 은 우상단 즐겨찾기 별(h-8 w-8 · right-1)을 피하는 자리다.
          ⚠ `flex-wrap` + 제목 칸 `flex-[1_1_5rem]` — **rem basis 라 루트 글자 200% 확대를 그대로 탄다.**
            확대되면 아이콘(h-8 = 2rem → 68px)과 별 회피 여백이 카드를 다 먹어 제목이 들어갈 자리가 없어진다.
            그때 제목 칸이 **스스로 아이콘 아래로 내려가** 카드 전폭을 쓴다(예전 세로 배치로 자동 복귀).
            실측(2026-09-18): 넣기 전 320·390 200% 에서 카드 clientWidth 116 / scrollWidth 166 = 50px 잘림.
          ⚠ `aria-label={name}` — 두 줄로 쪼갠 제목이 보조기기에서 한 낱말로 읽히게 한다.
          ⚠ `title={desc}` — 화면에서 뺀 설명을 **버리지는 않는다**(PC 호버 툴팁). 검색은 계속 t.desc 를 읽는다. */}
      <button type="button" onClick={onClick} data-testid={testId} aria-label={name} title={desc}
        className="flex h-full w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-aura border card-aura py-2.5 pl-2.5 pr-8 text-left hover:border-accent-400/40">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-input tile-grad tile-grad-${tone}`}>
          <Icon name={icon} size={16} strokeWidth={1.8} aria-hidden />
        </span>
        <span className="flex min-h-[2.5em] min-w-0 flex-[1_1_4rem] flex-col justify-center text-xs font-bold leading-tight text-ink-primary">
          {(lines ?? [name]).map((l) => (
            <span key={l} className="block [overflow-wrap:anywhere]">{l}</span>
          ))}
        </span>
      </button>
      {/* 별 — transform 유틸 금지: 전역 button:active 가 transform 을 scale 로 통째로 덮어 -translate-y-1/2 가 누르는 60ms 동안 사라져 별이 튀었다.
          opacity-30 은 비텍스트 대비(WCAG 1.4.11) 미달 — 색 토큰만으로 켬/끔 구분(채운 별+accent vs 윤곽 별+muted). */}
      {onToggleFav && (
        <button type="button" onClick={onToggleFav} aria-label={fav ? `${name} 즐겨찾기 해제` : `${name} 즐겨찾기 추가`} aria-pressed={fav}
          // [B] 34×34px 미달 — .hit 로 44px 확보하려 했으나 실측(elementFromPoint)에서 실패했다:
          //   `.hit{position:relative}`(index.css, components 레이어)와 `absolute` 유틸(utilities 레이어,
          //   같은 특이도 0,1,0)이 같은 position 속성을 놓고 부딪히는데 이 저장소 빌드에서는 `.hit` 이 이겨
          //   버튼이 `position:relative` 로 떨어지며 `right-1 top-1` 배치가 깨졌다 — 카드 밑에 깔린 본문
          //   버튼이 시각적 중심을 가로챘다(2026-09-19 스윕 재실측 실제 재현, ImageLightbox.tsx:150 에
          //   이미 같은 함정이 기록돼 있었다 — absolute 요소에는 `.hit` 대신 이 방식을 쓴다).
          //   inline style 로 position 을 최우선 순위로 못박아 `.hit` 의 확장(::after)은 그대로 살리고
          //   자기 배치만 되찾는다 — index.css 를 고치지 않는 최소 수정.
          style={{ position: 'absolute' }}
          className={['hit right-1 top-1 flex h-8 w-8 items-center justify-center',
            fav ? 'text-accent-300' : 'text-ink-muted hover:text-ink-secondary'].join(' ')}>
          <Icon name={fav ? 'star-fill' : 'star'} size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
