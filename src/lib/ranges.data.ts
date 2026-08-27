// 표준 프리플랍 레인지 차트 — 100bb 기준, 자체 제작(통설 합의 수치 기반, 학습용).
// 어떤 상용 솔버/사이트의 표도 복제하지 않았다. 빈도(1/0.5/0.25)는 혼합전략의 학습용 단순화다.
// 콤보 가중 %(1326 기준)가 각 차트 헤더에 표시된다 — 셀 수 %가 아니라 실제 VPIP 감각.
import type { RangeSpec } from './ranges';

/** 액션 색 — 독자 팔레트(공격=앱 인디고, 콜=에메랄드, 4벳=바이올렛, 폴드=무채).
 *  매트릭스·범례·액션 빈도바 공용 — '액션 축' 색은 반드시 이 상수만 쓴다.
 *  ⚠ 색 2축 분리(검증 #01 critical): 이 액션 축과 GtoDeepPanel 의 에퀴티 강도 축
 *  (gto/equityBands.ts EQUITY_BANDS)은 서로 다른 의미 축이므로 통일 대상이 아니다.
 *  raise 인디고(#5E6AD2)는 구 accent-300 과 같은 값이었으나 '데이터 시각화 fill 전용' 도메인 고정색이다 —
 *  2026-08-27 accent 가 플럼 바이올렛으로 이동한 뒤에도 차트 fill·범례·빈도바의 의미 축은 그대로 잠근다. */
export const ACTION_COLORS = {
  raise: '#5E6AD2',
  call: '#10B981',
  fourbet: '#8B5CF6',
  fold: '#6B7280',
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
// 오픈 포지션이 뒤로 갈수록(LJ→BTN) 상대 오픈이 넓어지므로 BB 의 수비도 넓어진다.
// 3벳은 밸류(프리미엄) + 블러프(A5s류 블로커·수딧갭)의 양극(폴라) 구조. 오프수트 블로커까지 넣어
// 콤보 가중 %가 통설(BB vs BTN ≈ 10~12%)에 닿게 한다 — 예전 5.5% 는 블러프를 수딧만 넣어 얇았다.
const DEFEND: RangeScenario[] = [
  {
    id: 'bb_vs_lj', group: 'defend', label: 'BB vs LJ 오픈', desc: 'LJ(UTG)가 2.5bb 오픈 — 얼리 오픈은 강해서 타이트하게 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo AQs',
        '0.5': 'JJ TT AJs KQs A5s A4s KJo AQo',
        '0.25': '99 KJs A3s A2s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'ATs ATo A9s A8s A7s A6s KQo KTs QJs QJo QTs JTs JTo J9s T9s 98s 88 87s 77 76s 66 65s 55 54s 44 33 22',
        '0.5': 'AJo KTo K9s K8s QTo Q9s Q8s J8s T9o T8s 97s 86s 75s 64s',
      } },
    ],
    note: '얼리 포지션 오픈 레인지는 강하다 — 3벳은 프리미엄 위주, 콜은 뒤로 잘 놀 수 있는 수딧·페어 중심.',
  },
  {
    id: 'bb_vs_hj', group: 'defend', label: 'BB vs HJ 오픈', desc: '하이잭이 2.5bb 오픈 — 조금 더 넓게 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo AQs A5s',
        '0.5': 'JJ TT AJs KQs KJs A4s A3s A2s KJo AQo',
        '0.25': '99 KTs QJs A9o',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AJo ATs ATo A9s A8s A7s A6s KQo K9s QJo QTs Q9s JTs JTo J9s T9s 98s 88 87s 77 76s 66 65s 55 54s 44 33 22',
        '0.5': 'KTo K8s K7s QTo Q9o Q8s JTo J8s T9o T8s 98o 97s 86s 75s 64s 53s',
      } },
    ],
    note: 'HJ 오픈은 LJ보다 약간 넓다 — 3벳에 A5s~A2s 블러프를 더하고 콜 레인지도 확장.',
  },
  {
    id: 'bb_vs_co', group: 'defend', label: 'BB vs CO 오픈', desc: '컷오프가 2.5bb 오픈 — 넓은 오픈이라 넓게 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo AQs A5s A4s',
        '0.5': 'JJ TT AJs KQs KJs A3s A2s AQo AJo ATo KJo A9o',
        '0.25': '99 88 ATs KTs K9s QJs QTs JTs T9s 98s A8o A7o',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'A9s A8s A7s A6s KQo QJo Q9s JTo J9s T9o T8s 97s 87s 77 76s 66 65s 55 54s 44 33 22',
        '0.5': 'KTo K8s K7s K6s QTo Q9o Q8s Q7s J9o J8s J7s T7s 98o 96s 87o 86s 75s 64s 53s 43s',
      } },
    ],
    note: 'CO 오픈은 꽤 넓어(≈27%) BB 가 폴라 3벳을 늘리고 콜도 크게 벌린다.',
  },
  {
    id: 'bb_vs_btn', group: 'defend', label: 'BB vs BTN 오픈', desc: '버튼이 2.5bb 오픈 — 가장 넓은 오픈, 가장 넓은 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo AQs AJs KQs',
        '0.5': 'JJ TT 99 88 ATs KJs KTs A5s A4s A3s A2s AQo AJo ATo A9o A8o A7o',
        '0.25': 'K9s K8s QJs QTs JTs T9s 98s 87s 76s 65s A6o A5o',
      } },
      { key: 'call', label: '콜', spec: {
        // 3벳에 들어간 핸드는 콜에서 나머지 빈도만(합계 ≤ 1 — 테스트로 보증)
        '1': 'A9s A8s A7s A6s KJo KTo K7s K6s K5s QJo QTo Q9s Q8s Q7s Q6s JTo J9s J8s J7s T9o T8s T7s 98o 97s 96s 86s 85s 77 75s 74s 66 64s 55 54s 53s 44 43s 33 22',
        '0.5': 'A4o A3o A2o K9o K8o K4s Q9o Q8o Q5s J9o J8o J6s T8o T6s 97o 87o 76o 65o 63s 52s 42s',
      } },
    ],
    note: '버튼은 아무 두 장으로 벌리므로(≈45%) BB 는 거의 절반을 수비한다. 3벳은 밸류(QQ+)와 블러프(A2s~A5s·A9o류)의 폴라 구조.',
  },
  {
    id: 'bb_vs_sb', group: 'defend', label: 'BB vs SB 오픈', desc: 'SB가 3bb 오픈 — 헤즈업, 포지션 우위로 가장 공격적으로 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'TT+ AQs+ AJs A5s A4s A3s A2s AQo+',
        '0.5': '99 88 77 ATs KQs KJs QJs JTs T9s K9s Q9s KJo AJo KQo ATo A9o A8o',
        '0.25': '66 KTs QTs J9s 98s 87s 76s 65s K8s A7o A6o',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'A9s A8s A7s A6s KTo K7s K6s K5s QJo QTo Q8s Q7s JTo J8s J7s T9o T8s T7s 98o 97s 96s 86s 85s 75s 64s 55 54s 53s 44 33 22',
        '0.5': 'A5o A4o A3o A2o K9o K8o K4s Q9o Q8o Q6s J9o J6s T8o T6s 97o 87o 76o 74s 65o 63s 52s 43s',
      } },
    ],
    note: 'SB 는 넓게 열고(≈40%) BB 는 포지션 우위(포스트플랍 마지막 액션)로 매우 넓게 수비한다.',
  },
  {
    id: 'sb_vs_btn', group: 'defend', label: 'SB vs BTN 오픈', desc: 'BTN 오픈에 SB의 수비 — 뒤에 BB가 남아 콜보다 3벳 중심',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': '99+ ATs+ A5s A4s KQs KJs QJs AJo+ KQo',
        '0.5': '88 77 A9s A8s A3s A2s KTs K9s QTs JTs T9s 98s A5o KJo',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'ATo A7s A6s Q9s J9s T8s 87s 76s 66 65s 55 44 33 22',
        '0.5': 'KTo K8s K7s QJo QTo Q8s J8s 97s 86s 75s 54s',
      } },
    ],
    note: 'SB 는 콜하면 뒤의 BB 가 스퀴즈로 압박한다 — 그래서 콜은 좁게, 3벳(리니어) 중심으로 수비한다.',
  },
];

// ── 3벳 ─────────────────────────────────────────────────────────
// IP(포지션 있음) 3벳은 폴라(최상위 밸류 + 블로커 블러프), OOP 3벳은 리니어(좋은 핸드를 죽 늘림).
const THREEBET: RangeScenario[] = [
  {
    id: 'co_3bet_lj', group: 'threebet', label: 'CO 3벳 vs LJ', desc: 'LJ 오픈에 컷오프의 3벳 — 얼리 오픈 상대라 타이트 폴라',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'QQ+ AKs AKo A5s',
      '0.5': 'JJ TT AQs AJs KQs A4s KJs',
    } }],
    note: '얼리 포지션 오픈은 강해서 3벳을 좁게 — 밸류 위주 + A5s/A4s 블로커 소량.',
  },
  {
    id: 'btn_3bet_lj', group: 'threebet', label: 'BTN 3벳 vs LJ', desc: 'LJ 오픈에 버튼의 3벳',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'QQ+ AKs AKo A5s A4s',
      '0.5': 'JJ TT AQs AJs KQs KJs A3s',
    } }],
    note: '포지션이 있어도 얼리 오픈 상대라 타이트하게 — 밸류 + 수딧 휠 에이스 블러프.',
  },
  {
    id: 'btn_3bet_co', group: 'threebet', label: 'BTN 3벳 vs CO', desc: '컷오프 오픈에 버튼의 3벳 — 폴라(양극) 구조',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'TT+ AQs+ AKo A5s A4s A3s',
      '0.5': '99 88 AJs ATs KQs KJs QJs JTs T9s 98s A2s AQo KJo',
    } }],
    note: 'CO 오픈은 넓어(≈27%) 3벳을 벌린다 — 최상위 밸류 + A2s~A5s·수딧 커넥터 블러프의 폴라 구조.',
  },
  {
    id: 'sb_3bet_btn', group: 'threebet', label: 'SB 3벳 vs BTN', desc: '버튼 오픈에 SB의 3벳 — 리니어(직선형) 구조',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': '99+ ATs+ A5s A4s KQs KJs QJs AJo+ KQo',
      '0.5': '88 77 A9s A8s A3s A2s KTs K9s QTs JTs T9s 98s ATo KJo',
    } }],
    note: 'SB 는 포지션이 나빠 콜보다 3벳 중심(3벳 아니면 폴드). 넓은 BTN 오픈을 상대하므로 좋은 핸드를 직선형으로 늘린다.',
  },
  {
    id: 'sb_3bet_co', group: 'threebet', label: 'SB 3벳 vs CO', desc: '컷오프 오픈에 SB의 3벳 — 리니어',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'TT+ AJs+ A5s KQs AJo+ KQo',
      '0.5': '99 88 ATs A4s A3s KJs QJs JTs T9s A9s KQo',
    } }],
    note: 'CO 오픈 상대 SB 3벳 — BTN 상대보다 조금 좁게, 여전히 리니어 중심.',
  },
];

// ── vs 3벳 ──────────────────────────────────────────────────────
// 내 오픈이 3벳을 맞았을 때. 포지션 있으면(BTN이 SB/BB 3벳 상대) 넓게 콜, 없으면 타이트 4벳/폴드.
const VS3BET: RangeScenario[] = [
  {
    id: 'lj_vs_3bet', group: 'vs3bet', label: 'LJ vs 3벳', desc: 'LJ 오픈 → 뒤에서 3벳 — 얼리라 매우 타이트하게 continue',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AQs JJ TT',
        '0.5': 'AQo AJs KQs QJs JTs T9s 99',
      } },
    ],
    note: '얼리 오픈이 3벳을 맞으면 레인지가 이미 강해도 좁게 continue — 4벳은 KK+ 중심, 콜은 프리미엄.',
  },
  {
    id: 'co_vs_btn3bet', group: 'vs3bet', label: 'CO vs BTN 3벳', desc: 'CO 오픈 → BTN 3벳 — 포지션 없이 continue',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s A4s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AQs AQo AJs KQs QJs JJ JTs TT T9s 99',
        '0.5': 'AJo ATs KQo KJs QTs 98s 88 87s',
      } },
    ],
    note: 'CO 는 포지션이 없어 BTN 3벳에 타이트하게 — 4벳 폴라(KK+ + A5s 블러프) + 프리미엄 콜.',
  },
  {
    id: 'btn_vs_sb3bet', group: 'vs3bet', label: 'BTN vs SB 3벳', desc: '버튼 오픈 → SB 3벳 — 포지션 우위로 넓게 콜',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s A4s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AQs AQo AJs ATs KQs KJs QJs JJ JTs TT T9s 99 98s 88',
        '0.5': 'AJo A9s A8s KQo KJo KTs QTs J9s 87s 77 76s 66 65s',
      } },
    ],
    note: '포지션이 있어 넓게 콜한다. 4벳은 KK+ 확정 + QQ/AK/A5s 혼합 — 상대가 3벳을 멈추지 못하게 하는 최소 방어.',
  },
  {
    id: 'btn_vs_bb3bet', group: 'vs3bet', label: 'BTN vs BB 3벳', desc: '버튼 오픈 → BB 3벳 — 상대 폴라 3벳을 넓게 콜',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AQs AQo AJs ATs KQs KJs QJs JJ JTs TT T9s 99 98s 88 87s 77',
        '0.5': 'AJo A9s A8s KQo KJo KTs K9s QTs J9s T8s 76s 66 65s 55 54s',
      } },
    ],
    note: 'BB 3벳은 블러프가 많은 폴라라, 포지션 있는 버튼은 아주 넓게 콜해 플랍에서 활용한다.',
  },
];

export const RANGE_SCENARIOS: RangeScenario[] = [...RFI6, ...RFI9, ...DEFEND, ...THREEBET, ...VS3BET];

export const RANGE_GROUPS: { id: RangeScenario['group']; label: string; desc: string }[] = [
  { id: 'rfi6', label: '오픈 (6맥스)', desc: '앞에 아무도 없을 때 — 포지션별 오픈 레이즈' },
  { id: 'rfi9', label: '오픈 (9인 얼리)', desc: '9인 테이블 추가 얼리 3자리 (이후는 6맥스와 동일)' },
  { id: 'defend', label: '블라인드 수비', desc: '상대 오픈에 BB·SB의 3벳·콜 (전 포지션)' },
  { id: 'threebet', label: '3벳', desc: '상대 오픈에 리레이즈 — 직선형 vs 양극형' },
  { id: 'vs3bet', label: 'vs 3벳', desc: '내 오픈이 3벳을 맞았을 때 — 4벳·콜' },
];
