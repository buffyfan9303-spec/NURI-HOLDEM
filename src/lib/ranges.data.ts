// 표준 프리플랍 레인지 차트 — 100bb 기준, 자체 제작(통설 합의 수치 기반, 학습용).
// 어떤 상용 솔버/사이트의 표도 복제하지 않았다. 빈도(1/0.5/0.25)는 혼합전략의 학습용 단순화다.
// 콤보 가중 %(1326 기준)가 각 차트 헤더에 표시된다 — 셀 수 %가 아니라 실제 VPIP 감각.
import type { RangeSpec } from './ranges';

/** 액션 색 — 독자 팔레트(공격=앱 인디고, 콜=에메랄드, 4벳=바이올렛). 매트릭스·범례 공용. */
export const ACTION_COLORS = {
  raise: '#5E6AD2',
  call: '#10B981',
  fourbet: '#8B5CF6',
} as const;

export interface RangeAction {
  key: 'raise' | 'call' | 'allin' | 'fourbet';
  label: string;
  spec: RangeSpec;
}
export interface RangeScenario {
  id: string;
  group: 'rfi6' | 'rfi9' | 'defend' | 'threebet' | 'vs3bet';
  label: string;
  /** 상황 설명 한 줄 — 초보가 "언제 보는 표인지" 바로 알게 */
  desc: string;
  actions: RangeAction[];
  note?: string;
}

// ── 6맥스 오픈(RFI) ─────────────────────────────────────────────
const RFI6: RangeScenario[] = [
  {
    id: 'rfi_lj', group: 'rfi6', label: 'LJ (UTG)', desc: '6맥스 첫 포지션 — 앞에 아무도 없을 때 오픈 레이즈',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '55+ A9s+ A5s A4s KTs+ QTs+ JTs T9s 98s ATo+ KQo',
      '0.5': '44 33 22 A3s A2s K9s Q9s J9s 87s 76s KJo',
    } }],
    note: '뒤에 5명 — 가장 타이트하게. 수딧 커넥터 하단·낮은 페어는 절반 빈도.',
  },
  {
    id: 'rfi_hj', group: 'rfi6', label: 'HJ', desc: '하이잭 오픈 레이즈',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '44+ A7s+ A5s-A2s K9s+ Q9s+ J9s+ T9s 98s 87s ATo+ KJo+ QJo',
      '0.5': '33 22 A6s K8s Q8s T8s 76s 65s A9o KTo',
    } }],
  },
  {
    id: 'rfi_co', group: 'rfi6', label: 'CO', desc: '컷오프 오픈 레이즈',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '22+ A2s+ K8s+ Q9s+ J9s+ T8s+ 97s+ 87s 76s 65s A9o+ KTo+ QTo+ JTo',
      '0.5': 'K7s K6s K5s Q8s J8s 54s A8o A7o K9o Q9o T9o',
    } }],
  },
  {
    id: 'rfi_btn', group: 'rfi6', label: 'BTN', desc: '버튼 오픈 레이즈 — 가장 넓다',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '22+ A2s+ K4s+ Q6s+ J7s+ T7s+ 97s+ 86s+ 75s+ 65s 54s A4o+ K9o+ Q9o+ J9o+ T8o+ 98o',
      '0.5': 'K3s K2s Q5s Q4s J6s J5s T6s 96s 85s 74s 64s 53s 43s A3o A2o K8o Q8o J8o T7o 97o 87o 76o',
    } }],
    note: '뒤에 블라인드 둘뿐 — 포지션 우위로 절반은 “아무거나 그럴듯한” 핸드까지 연다.',
  },
  {
    id: 'rfi_sb', group: 'rfi6', label: 'SB', desc: '스몰블라인드 레이즈 퍼스트 인',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '22+ A2s+ K5s+ Q8s+ J8s+ T8s+ 97s+ 87s 76s 65s 54s A7o+ A5o K9o+ Q9o+ J9o+ T9o',
      '0.5': 'K4s K3s K2s Q7s Q6s J7s T7s 96s 86s 75s 64s A6o A4o A3o A2o K8o Q8o J8o 98o 87o',
    } }],
    note: '림프 전략을 안 쓰는 “레이즈 온리” 기준. 상대가 BB 한 명뿐이라 넓지만, 포지션이 나빠 BTN보다는 신중.',
  },
];

// ── 9맥스 얼리 포지션(추가 3자리 — LJ부터는 6맥스와 동일) ─────────
const RFI9: RangeScenario[] = [
  {
    id: 'rfi_utg9', group: 'rfi9', label: 'UTG (9인)', desc: '9인 테이블 첫 포지션 — 뒤에 8명',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '77+ ATs+ KJs+ QJs JTs AQo+',
      '0.5': '66 55 A9s A5s KTs QTs T9s AJo KQo',
      '0.25': '44 33 22 A4s 98s',
    } }],
    note: '라이브 9인 기준. 뒤에 8명이 남아 프리미엄 위주 — 여기서 넓히면 좋은 핸드로 3벳을 맞는다.',
  },
  {
    id: 'rfi_utg1', group: 'rfi9', label: 'UTG+1', desc: '9인 두 번째 포지션',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '66+ A9s+ KTs+ QTs+ JTs T9s AJo+ KQo',
      '0.5': '55 44 A5s A4s 98s ATo',
      '0.25': '33 22 A3s A2s 87s',
    } }],
  },
  {
    id: 'rfi_mp9', group: 'rfi9', label: 'MP', desc: '9인 미들 포지션 (LJ 직전)',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '55+ A9s+ A5s KTs+ QTs+ J9s+ T9s 98s ATo+ KQo',
      '0.5': '44 33 22 A4s A3s K9s 87s 76s KJo',
    } }],
    note: '이후 LJ·HJ·CO·BTN·SB는 6맥스 표와 동일하게 쓰면 된다.',
  },
];

// ── 블라인드 수비 ───────────────────────────────────────────────
const DEFEND: RangeScenario[] = [
  {
    id: 'bb_vs_btn', group: 'defend', label: 'BB vs BTN 오픈', desc: '버튼이 2.5bb 오픈 — 빅블라인드의 수비(3벳+콜)',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo A5s A4s',
        '0.5': 'JJ TT AQs KQs A3s A2s K9s T9s 98s AQo',
        '0.25': '99 AJs KJs 87s 76s',
      } },
      { key: 'call', label: '콜', spec: {
        // 3벳에 들어간 핸드는 콜에서 나머지 빈도만 갖는다(합계 ≤ 1 — 테스트로 보증)
        '1': '88-22 ATs-A6s KTs Q9s+ J9s+ T8s 97s 86s 75s 65s 54s ATo AJo KTo+ QTo+ JTo T9o 98o',
        '0.75': '99 AJs KJs 87s 76s',
        '0.5': 'JJ TT AQo KQs A3s A2s K9s T9s 98s K8s-K4s Q8s Q7s Q6s J8s J7s 96s 85s 74s 64s 53s 43s A9o-A6o A5o-A2o K9o Q9o J9o 87o 76o',
      } },
    ],
    note: '이미 1bb를 낸 상태 + 마지막 액션이라 아주 넓게 수비한다. 3벳은 밸류(QQ+)와 블러프(A5s류)의 양극(폴라) 구조.',
  },
  {
    id: 'bb_vs_sb', group: 'defend', label: 'BB vs SB 오픈', desc: 'SB가 3bb 오픈 — 빅블라인드 수비 (헤즈업 팟)',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'TT+ AQs+ A5s A4s AQo+',
        '0.5': '99 88 AJs ATs KQs KJs QJs JTs T9s A3s A2s K9s AJo KQo',
      } },
      { key: 'call', label: '콜', spec: {
        '1': '77-22 A9s-A6s K8s KTs Q9s QTs J9s T8s 98s 87s 76s 65s 54s ATo KTo KJo QTo+ JTo',
        '0.5': '99 88 AJs ATs KQs KJs QJs JTs T9s K9s AJo KQo K7s-K2s Q8s-Q4s J8s J7s T7s 97s 96s 86s 75s 64s 53s A9o-A2o K9o Q9o J9o T9o 98o',
      } },
    ],
    note: '포지션 우위(포스트플랍 마지막 액션)가 우리에게 있어 SB 오픈엔 더 공격적으로 수비한다.',
  },
];

// ── 3벳 ─────────────────────────────────────────────────────────
const THREEBET: RangeScenario[] = [
  {
    id: 'sb_3bet_btn', group: 'threebet', label: 'SB 3벳 vs BTN', desc: '버튼 오픈에 SB의 3벳 — 리니어(직선형) 구조',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': '99+ ATs+ A5s KQs KJs QJs AJo+ KQo',
      '0.5': '88 77 A9s A4s A3s KTs QTs JTs T9s ATo',
    } }],
    note: 'SB는 포지션이 나빠 콜보다 3벳 중심(3벳 or 폴드에 가깝게). 넓은 BTN 오픈을 상대하므로 좋은 핸드를 직선형으로 늘린다.',
  },
  {
    id: 'btn_3bet_co', group: 'threebet', label: 'BTN 3벳 vs CO', desc: '컷오프 오픈에 버튼의 3벳 — 폴라(양극) 구조',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'TT+ AQs+ AKo A5s A4s',
      '0.5': '99 88 AJs ATs KQs QJs JTs T9s 98s A3s A2s AQo',
    } }],
    note: '포지션이 있어 콜도 가능하므로 3벳은 최상위 밸류 + A5s류 블러프의 양극 구조. 중간 핸드는 콜로 돌린다.',
  },
];

// ── vs 3벳 ──────────────────────────────────────────────────────
const VS3BET: RangeScenario[] = [
  {
    id: 'btn_vs_sb3bet', group: 'vs3bet', label: 'BTN vs SB 3벳', desc: '버튼 오픈 → SB 3벳 — 버튼의 응수(4벳+콜)',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s A4s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'JJ TT 99 AQs AJs ATs KQs QJs JTs T9s 98s AQo',
        '0.5': '88 77 A9s A8s KJs QTs 87s 76s 65s KQo AJo',
      } },
    ],
    note: '포지션이 있어 넓게 콜한다. 4벳은 KK+ 확정 + QQ/AK/A5s 혼합 — 상대가 3벳을 멈추지 못하게 하는 최소 방어.',
  },
];

export const RANGE_SCENARIOS: RangeScenario[] = [...RFI6, ...RFI9, ...DEFEND, ...THREEBET, ...VS3BET];

export const RANGE_GROUPS: { id: RangeScenario['group']; label: string; desc: string }[] = [
  { id: 'rfi6', label: '오픈 (6맥스)', desc: '앞에 아무도 없을 때 — 포지션별 오픈 레이즈' },
  { id: 'rfi9', label: '오픈 (9인 얼리)', desc: '9인 테이블 추가 얼리 3자리 (이후는 6맥스와 동일)' },
  { id: 'defend', label: '블라인드 수비', desc: '상대 오픈에 BB의 3벳·콜' },
  { id: 'threebet', label: '3벳', desc: '상대 오픈에 리레이즈 — 직선형 vs 양극형' },
  { id: 'vs3bet', label: 'vs 3벳', desc: '내 오픈이 3벳을 맞았을 때 — 4벳·콜' },
];
