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

/** 액션 축 **텍스트 전용** 색. 위 ACTION_COLORS 는 차트 fill 용 도메인 고정 스냅샷이라
 *  글자로 재사용하면 대비가 무너진다(실측: 다크 raise 3.63:1 · fold 3.53:1, 라이트 call 2.54:1 — AA 미달).
 *  fill 은 그대로 두고 '글자로 쓰이는 지점'만 이 변수로 분리한다. hue·채도는 보존, 명도만 테마별 보정.
 *  값 정의는 src/index.css `--gto-txt-*`(다크 기본 + html.light 오버라이드). */
export const ACTION_TEXT_COLORS = {
  raise: 'var(--gto-txt-raise)',
  call: 'var(--gto-txt-call)',
  fourbet: 'var(--gto-txt-fourbet)',
  fold: 'var(--gto-txt-fold)',
} as const;

export interface RangeAction {
  key: 'raise' | 'call' | 'allin' | 'fourbet';
  label: string;
  spec: RangeSpec;
}
/** 테이블 포지션 축 — 시나리오 선택 UI(내 포지션 x 상대 포지션 2단 좁히기)의 데이터 근거.
 *  라벨 문자열을 파싱해 추측하지 않는다(라벨은 카피라 언제든 바뀐다). */
export type TablePos = 'UTG' | 'UTG+1' | 'MP' | 'LJ' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';

export interface RangeScenario {
  id: string;
  group: 'rfi6' | 'rfi9' | 'defend' | 'threebet' | 'vs3bet';
  /** 내 포지션 */
  hero: TablePos;
  /** 상대(오픈·3벳한 사람) 포지션 — RFI 처럼 상대가 특정되지 않으면 생략 */
  vs?: TablePos;
  label: string;
  /** 상황 설명 한 줄 — 초보가 "언제 보는 표인지" 바로 알게 */
  desc: string;
  actions: RangeAction[];
  note?: string;
}

// ── 6맥스 오픈(RFI) ─────────────────────────────────────────────
const RFI6: RangeScenario[] = [
  {
    id: 'rfi_lj', group: 'rfi6', hero: 'LJ', label: 'LJ (UTG)', desc: '6맥스 첫 포지션 · 앞에 아무도 없을 때 오픈 레이즈',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '55+ A9s+ A5s A4s KTs+ QTs+ JTs T9s 98s ATo+ KQo',
      '0.5': '44 33 22 A3s A2s K9s Q9s J9s 87s 76s KJo',
    } }],
    note: '뒤에 5명. 가장 타이트하게. 수딧 커넥터 하단·낮은 페어는 절반 빈도.',
  },
  {
    id: 'rfi_hj', group: 'rfi6', hero: 'HJ', label: 'HJ', desc: '하이잭 오픈 레이즈',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '44+ A7s+ A5s-A2s K9s+ Q9s+ J9s+ T9s 98s 87s ATo+ KJo+ QJo',
      '0.5': '33 22 A6s K8s Q8s T8s 76s 65s A9o KTo',
    } }],
  },
  {
    id: 'rfi_co', group: 'rfi6', hero: 'CO', label: 'CO', desc: '컷오프 오픈 레이즈',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '22+ A2s+ K8s+ Q9s+ J9s+ T8s+ 97s+ 87s 76s 65s A9o+ KTo+ QTo+ JTo',
      '0.5': 'K7s K6s K5s Q8s J8s 54s A8o A7o K9o Q9o T9o',
    } }],
  },
  {
    id: 'rfi_btn', group: 'rfi6', hero: 'BTN', label: 'BTN', desc: '버튼 오픈 레이즈. 가장 넓다',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '22+ A2s+ K4s+ Q6s+ J7s+ T7s+ 97s+ 86s+ 75s+ 65s 54s A4o+ K9o+ Q9o+ J9o+ T8o+ 98o',
      '0.5': 'K3s K2s Q5s Q4s J6s J5s T6s 96s 85s 74s 64s 53s 43s A3o A2o K8o Q8o J8o T7o 97o 87o 76o',
    } }],
    note: '뒤에 블라인드 둘뿐. 포지션 우위로 절반은 “아무거나 그럴듯한” 핸드까지 연다.',
  },
  {
    id: 'rfi_sb', group: 'rfi6', hero: 'SB', label: 'SB', desc: '스몰블라인드 레이즈 퍼스트 인',
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
    id: 'rfi_utg9', group: 'rfi9', hero: 'UTG', label: 'UTG (9인)', desc: '9인 테이블 첫 포지션 · 뒤에 8명',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '77+ ATs+ KJs+ QJs JTs AQo+',
      '0.5': '66 55 A9s A5s KTs QTs T9s AJo KQo',
      '0.25': '44 33 22 A4s 98s',
    } }],
    note: '라이브 9인 기준. 뒤에 8명이 남아 프리미엄 위주. 여기서 넓히면 좋은 핸드로 3벳을 맞는다.',
  },
  {
    id: 'rfi_utg1', group: 'rfi9', hero: 'UTG+1', label: 'UTG+1', desc: '9인 두 번째 포지션',
    actions: [{ key: 'raise', label: '오픈', spec: {
      '1': '66+ A9s+ KTs+ QTs+ JTs T9s AJo+ KQo',
      '0.5': '55 44 A5s A4s 98s ATo',
      '0.25': '33 22 A3s A2s 87s',
    } }],
  },
  {
    id: 'rfi_mp9', group: 'rfi9', hero: 'MP', label: 'MP', desc: '9인 미들 포지션 (LJ 직전)',
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
//
// 🔒 BB 표의 잔여 규약(2026-08-30) — **3벳 혼합의 잔여 빈도는 전부 콜이다.**
//   vs 3벳 그룹과 달리 여기엔 '잔여 폴드' 가 없다: BB 는 이미 1bb 를 넣어 팟오즈가 좋고,
//   3벳에 넣을 만한 핸드는 예외 없이 콜 임계 위에 있다. 그래서 3벳 '0.5' 는 콜 '0.5' 로,
//   3벳 '0.25' 는 콜 '0.75' 로 받아 continue 를 100% 로 채운다.
//   예전엔 그 잔여가 통째로 비어 있었다 — QJs 가 3벳 0.25 뒤 폴드로 끝나 Q9s(콜 100%)보다
//   덜 수비하고, JJ·TT 가 50% 인데 77 은 100% 인 도미네이션 역전이 다섯 표 전부에 있었다.
//   ranges.test.ts 의 도미네이션 단조성이 이 구멍을 잠근다.
const DEFEND: RangeScenario[] = [
  {
    id: 'bb_vs_lj', group: 'defend', hero: 'BB', vs: 'LJ', label: 'BB vs LJ 오픈', desc: 'LJ(UTG)가 2.5bb 오픈 · 얼리 오픈은 강해서 타이트하게 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo AQs',
        '0.5': 'JJ TT AJs KQs A5s A4s KJo AQo',
        '0.25': '99 KJs A3s A2s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AJo ATs ATo A9s A8s A7s A6s KQo KTs QJs QJo QTs JTs JTo J9s T9s 98s 88 87s 77 76s 66 65s 55 54s 44 33 22',
        // 3벳 혼합의 잔여는 전부 여기로 — BB 는 이미 1bb 를 넣어 팟오즈가 좋고, 3벳 레인지 전체가 콜 임계 위다.
        '0.75': '99 KJs A3s A2s',
        '0.5': 'JJ TT AJs KQs A5s A4s KJo AQo KTo K9s K8s QTo Q9s Q8s J8s T9o T8s 97s 86s 75s 64s',
      } },
    ],
    note: '얼리 포지션 오픈 레인지는 강하다. 3벳은 프리미엄 위주(5.2%), 콜은 뒤로 잘 놀 수 있는 수딧·페어 중심. 총 수비 23.5%. JJ·TT·AJs·KQs 는 3벳 절반 + 콜 절반, 99·KJs 는 3벳 1/4 + 콜 3/4 로 continue 100% 를 채운다.',
  },
  {
    id: 'bb_vs_hj', group: 'defend', hero: 'BB', vs: 'HJ', label: 'BB vs HJ 오픈', desc: '하이잭이 2.5bb 오픈 · 조금 더 넓게 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo AQs A5s',
        '0.5': 'JJ TT AJs KQs KJs A4s A3s A2s KJo AQo',
        '0.25': '99 KTs QJs A9o',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AJo ATs ATo A9s A8s A7s A6s KQo K9s QJo QTs Q9s JTs JTo J9s T9s 98s 88 87s 77 76s 66 65s 55 54s 44 33 22',
        '0.75': '99 KTs QJs A9o',
        '0.5': 'JJ TT AJs KQs KJs A4s A3s A2s KJo AQo KTo K8s K7s QTo Q9o Q8s JTo J8s T9o T8s 98o 97s 86s 75s 64s 53s',
      } },
    ],
    note: 'HJ 오픈은 LJ보다 약간 넓다. 3벳에 A5s~A2s 블러프를 더하고 콜 레인지도 확장(총 수비 25.9%). 3벳 혼합의 잔여는 전부 콜이라 QJs·KTs·A9o 도 continue 100% 다.',
  },
  {
    id: 'bb_vs_co', group: 'defend', hero: 'BB', vs: 'CO', label: 'BB vs CO 오픈', desc: '컷오프가 2.5bb 오픈 · 넓은 오픈이라 넓게 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo AQs A5s A4s',
        '0.5': 'JJ TT AJs KQs KJs A3s A2s AQo AJo ATo KJo A9o',
        '0.25': '99 88 ATs KTs K9s QJs QTs JTs T9s 98s A8o A7o',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'A9s A8s A7s A6s KQo QJo Q9s JTo J9s T9o T8s 97s 87s 77 76s 66 65s 55 54s 44 33 22',
        '0.75': '99 88 ATs KTs K9s QJs QTs JTs T9s 98s A8o A7o',
        '0.5': 'JJ TT AJs KQs KJs A3s A2s AQo AJo ATo KJo A9o KTo K8s K7s K6s QTo Q9o Q8s Q7s J9o J8s J7s T7s 98o 96s 87o 86s 75s 64s 53s 43s',
      } },
    ],
    note: 'CO 오픈은 꽤 넓어(≈27%) BB 가 폴라 3벳(8.2%)을 늘리고 콜도 크게 벌린다. 총 수비 30.3%.',
  },
  {
    id: 'bb_vs_btn', group: 'defend', hero: 'BB', vs: 'BTN', label: 'BB vs BTN 오픈', desc: '버튼이 2.5bb 오픈 · 가장 넓은 오픈, 가장 넓은 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo AQs AJs KQs',
        '0.5': 'JJ TT 99 88 ATs KJs KTs A5s A4s A3s A2s AQo AJo ATo A9o A8o A7o',
        '0.25': 'K9s K8s QJs QTs JTs T9s 98s 87s 76s 65s A6o A5o',
      } },
      { key: 'call', label: '콜', spec: {
        // 3벳에 들어간 핸드는 콜에서 나머지 빈도만(합계 ≤ 1 — 테스트로 보증).
        // (2026-08-30) 예전엔 그 '나머지'가 아예 비어 있었다 — QJs·T9s 가 3벳 0.25 뒤 폴드로 끝나
        // Q9s·T8s(콜 100%)보다 덜 수비하는 도미네이션 역전. KQo 는 표에서 통째로 빠져 있었다.
        '1': 'KQo A9s A8s A7s A6s KJo KTo K7s K6s K5s QJo QTo Q9s Q8s Q7s Q6s JTo J9s J8s J7s T9o T8s T7s 98o 97s 96s 86s 85s 77 75s 74s 66 64s 55 54s 53s 44 43s 33 22',
        '0.75': 'K9s K8s QJs QTs JTs T9s 98s 87s 76s 65s A6o A5o',
        '0.5': 'JJ TT 99 88 ATs KJs KTs A5s A4s A3s A2s AQo AJo ATo A9o A8o A7o A4o A3o A2o K9o K8o K4s Q9o Q8o Q5s J9o J8o J6s T8o T6s 97o 87o 76o 65o 63s 52s 42s',
      } },
    ],
    note: '버튼은 아무 두 장으로 벌리므로(≈45%) BB 는 거의 절반(42.8%)을 수비한다. 3벳은 밸류(QQ+)와 블러프(A2s~A5s·A9o류)의 폴라 구조(9.4%). 3벳 혼합의 잔여를 콜로 받아 QJs·T9s·87s 까지 continue 100%. 예전엔 이 잔여가 비어 있어 Q9s·T8s 보다 덜 수비했다.',
  },
  {
    id: 'bb_vs_sb', group: 'defend', hero: 'BB', vs: 'SB', label: 'BB vs SB 오픈', desc: 'SB가 3bb 오픈 · 헤즈업, 포지션 우위로 가장 공격적으로 수비',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'TT+ AQs+ AJs A5s A4s A3s A2s AQo+',
        '0.5': '99 88 77 ATs KQs KJs QJs JTs T9s K9s Q9s KJo AJo KQo ATo A9o A8o',
        '0.25': '66 KTs QTs J9s 98s 87s 76s 65s K8s A7o A6o',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'A9s A8s A7s A6s KTo K7s K6s K5s QJo QTo Q8s Q7s JTo J8s J7s T9o T8s T7s 98o 97s 96s 86s 85s 75s 64s 55 54s 53s 44 33 22',
        '0.75': '66 KTs QTs J9s 98s 87s 76s 65s K8s A7o A6o',
        '0.5': '99 88 77 ATs KQs KJs QJs JTs T9s K9s Q9s KJo AJo KQo ATo A9o A8o A5o A4o A3o A2o K9o K8o K4s Q9o Q8o Q6s J9o J6s T8o T6s 97o 87o 76o 74s 65o 63s 52s 43s',
      } },
    ],
    note: 'SB 는 넓게 열고(≈40%) BB 는 포지션 우위(포스트플랍 마지막 액션)로 매우 넓게(41.2%) 수비한다. 3벳 12.0% + 콜 29.2%.',
  },
  {
    id: 'sb_vs_btn', group: 'defend', hero: 'SB', vs: 'BTN', label: 'SB vs BTN 오픈', desc: 'BTN 오픈에 SB의 수비 · 뒤에 BB가 남아 콜보다 3벳 중심',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': '99+ ATs+ A5s A4s KQs KJs QJs AJo+ KQo',
        // ⚠ sb_3bet_btn(threebet 그룹)과 **문자열까지 동일해야 한다** — 같은 스팟(SB, BTN 오픈 상대)이
        //    두 그룹에 있어서, 어긋나면 앱 안에서 같은 질문에 두 답이 뜬다. 콤보 수가 같으면
        //    폭 테스트로는 영원히 안 잡히므로 ranges.test.ts 가 맵 동등성으로 잠근다.
        //    (2026-08-30 정정: 여기만 A5o 였고 저기는 ATo 였다. 두 note 가 모두 '리니어'라 하므로
        //     폴라 성격의 A5o 를 빼고 ATo 로 통일했다.)
        '0.5': '88 77 A9s A8s A3s A2s KTs K9s QTs JTs T9s 98s ATo KJo',
      } },
      { key: 'call', label: '콜', spec: {
        // ATo 는 위 3벳에서 0.5 를 쓰므로 여기서 나머지 0.5 만 받는다(합 1.0 = 100% 수비).
        '1': 'A7s A6s Q9s J9s T8s 87s 76s 66 65s 55 44 33 22',
        // 88·77·A9s·A8s·KTs·QTs·JTs·T9s·98s 는 3벳 절반의 '나머지 절반' — 여기서 채워 총 100% 수비.
        // (2026-08-30) 이게 없으면 **가장 넓게 여는 BTN 을 상대로 CO 보다 좁게 수비**하는 역전이 난다:
        // sb_vs_co 는 같은 아홉 핸드를 3벳 0.5 + 콜 0.5 로 1.0 을 채우는데 여기선 0.5 에서 끊겼다.
        // 총합 단조성(8.9<10.6<14.1<21.6)만 보면 안 보이고 핸드 단위로만 드러나는 종류의 오류라
        // ranges.test.ts 에 핸드 단위 단조성 테스트를 함께 뒀다.
        '0.5': '88 77 A9s A8s KTs QTs JTs T9s 98s ATo KTo K8s K7s QJo QTo Q8s J8s 97s 86s 75s 54s',
      } },
    ],
    note: 'SB 는 콜하면 뒤의 BB 가 스퀴즈로 압박한다. 그래서 콜은 좁게, 3벳(리니어) 중심으로 수비한다. 3벳을 절반만 섞는 핸드(88·A9s·KTs·T9s류)는 나머지 절반을 콜로 받아 총 21.6% 를 수비한다. 상대가 가장 넓게 여는 자리라 접는 쪽이 손해다.',
  },
  // ── SB 수비 확장(2026-08-30) — 기존 sb_vs_btn 하나뿐이던 축을 LJ·HJ·CO 까지 완성 ──
  // 콜의 실질 임계는 상대가 누구든 고정이다: 추가 2bb into 팟 4bb → 필요 에퀴티 33.3%,
  // 여기에 OOP 실현계수 0.8 과 '뒤의 BB 스퀴즈' 리스크가 겹쳐 41.7%. 달라지는 건 상대 레인지뿐이라
  // 수비 확장은 콜이 아니라 3벳 축으로 간다(CO 구간에서 전략 클래스가 밸류온리 → 리니어로 전환).
  {
    id: 'sb_vs_lj', group: 'defend', hero: 'SB', vs: 'LJ', label: 'SB vs LJ 오픈', desc: 'LJ(UTG)가 2.5bb 오픈. 뒤에 BB가 남아 콜이 비싸다',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo A5s',
        '0.5': 'JJ TT AQs AJs KQs AQo',
      } },
      { key: 'call', label: '콜', spec: {
        '1': '99 88 77 66 ATs KJs QJs JTs',
        '0.5': 'JJ TT AQs AJs KQs A9s KTs QTs T9s 98s',
      } },
    ],
    note: '콜 임계 41.7%(팟오즈 33.3% + OOP 실현 0.8 + BB 스퀴즈)를 vs LJ 15.8% 상대로 넘는 건 중간 페어·수딧 브로드웨이뿐. 그래서 콜이 4.7%로 극히 좁다. AQo 는 접지 않고 3벳 절반으로 처리한다: LJ 의 continue 안에서 AK·AQ 에 도미네이트당하는 게 문제라면 답은 폴드가 아니라 **콜을 건너뛰는 것**이고, A9s(같은 스팟에서 100% 콜이던 핸드)보다 vs LJ 에퀴티가 8%p 높은 핸드를 0% 로 두면 표 자체가 거꾸로다. 대신 A9s 는 절반으로 낮춰 그 자리를 비웠다. 3벳은 OOP 4x(알파 75%) 역산의 QQ+/AK 밸류 + A5s 블로커 + AQo 절반 = 4.2%.',
  },
  {
    id: 'sb_vs_hj', group: 'defend', hero: 'SB', vs: 'HJ', label: 'SB vs HJ 오픈', desc: '하이잭이 2.5bb 오픈. 상대가 약해진 만큼만 3벳을 넓힌다',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'QQ+ AKs AKo AQs A5s',
        '0.5': 'JJ TT AJs ATs KQs KJs QJs A4s A3s AQo',
      } },
      { key: 'call', label: '콜', spec: {
        '1': '99 88 77 66 A9s KTs QTs JTs T9s',
        '0.5': 'JJ TT AJs ATs KQs KJs QJs 55 A8s K9s Q9s J9s 98s',
      } },
    ],
    note: 'HJ(20.5%)가 LJ(15.8%)보다 약한 만큼 같은 핸드의 에퀴티가 2~3%p 오른다. 딱 그 폭만큼 55·A8s·K9s·Q9s를 절반으로 추가. 3벳은 HJ 의 MDF continue 가 LJ 대비 30% 넓어진 만큼만 확장(AQs 밸류 승격 + A3s + AQo 절반 = 5.1%). 수딧 커넥터를 3벳에 안 넣은 건 포지션이 없으면 "콜당해도 실현된다"가 성립하지 않기 때문. btn_3bet_hj 와의 대조군이다.',
  },
  {
    id: 'sb_vs_co', group: 'defend', hero: 'SB', vs: 'CO', label: 'SB vs CO 오픈', desc: '컷오프가 2.5bb 오픈 · 콜이 아니라 3벳으로 반응을 바꾸는 전환점',
    actions: [
      { key: 'raise', label: '3벳', spec: {
        '1': 'TT+ AJs+ A5s KQs AJo+ KQo',
        '0.5': '99 88 ATs A4s A3s KJs QJs JTs T9s A9s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': '77 66 A8s A7s KTs QTs 98s 87s',
        '0.5': '99 88 ATs A9s KJs QJs JTs T9s 55 A6s K9s Q9s J9s 76s',
      } },
    ],
    note: '3벳 스펙은 threebet 그룹의 sb_3bet_co 와 의도적으로 완전히 동일하다(같은 스팟이 두 그룹에 있는데 폭이 어긋나면 앱 안에서 같은 질문에 두 답이 생긴다). 여기서는 콜 축만 신설했다. 3벳 목표는 CO 의 MDF continue(27.8% x 25%)라 상대 오픈 폭에 비례해 커지고, 콜이 vs HJ 보다 오히려 좁은 건 넓어진 3벳이 ATs·AJs·KQs 상단을 흡수했기 때문.',
  },
];

// ── 3벳 ─────────────────────────────────────────────────────────
// IP(포지션 있음) 3벳은 폴라(최상위 밸류 + 블로커 블러프), OOP 3벳은 리니어(좋은 핸드를 죽 늘림).
const THREEBET: RangeScenario[] = [
  {
    id: 'co_3bet_lj', group: 'threebet', hero: 'CO', vs: 'LJ', label: 'CO 3벳 vs LJ', desc: 'LJ 오픈에 컷오프의 3벳 · 얼리 오픈 상대라 타이트 폴라',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'QQ+ AKs AKo A5s',
      '0.5': 'JJ TT AQs AJs KQs A4s KJs',
    } }],
    note: '얼리 포지션 오픈은 강해서 3벳을 좁게. 밸류 위주 + A5s/A4s 블로커 소량.',
  },
  {
    id: 'btn_3bet_lj', group: 'threebet', hero: 'BTN', vs: 'LJ', label: 'BTN 3벳 vs LJ', desc: 'LJ 오픈에 버튼의 3벳',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'QQ+ AKs AKo A5s A4s',
      '0.5': 'JJ TT AQs AJs KQs KJs A3s',
    } }],
    note: '포지션이 있어도 얼리 오픈 상대라 타이트하게. 밸류 + 수딧 휠 에이스 블러프.',
  },
  {
    id: 'btn_3bet_co', group: 'threebet', hero: 'BTN', vs: 'CO', label: 'BTN 3벳 vs CO', desc: '컷오프 오픈에 버튼의 3벳 · 폴라(양극) 구조',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'TT+ AQs+ AKo A5s A4s A3s',
      '0.5': '99 88 AJs ATs KQs KJs QJs JTs T9s 98s A2s AQo KQo KJo',
    } }],
    note: 'CO 오픈은 넓어(≈27%) 3벳을 벌린다. 최상위 밸류 + A2s~A5s·수딧 커넥터 블러프의 폴라 구조(7.8%). KQo 가 빠져 있어 KJo(절반 3벳)가 KQo(0%)를 지배하는 역전이 있었다. 같은 하이카드에서 키커만 높은 핸드가 덜 공격받는 표는 틀린 표다.',
  },
  {
    id: 'sb_3bet_btn', group: 'threebet', hero: 'SB', vs: 'BTN', label: 'SB 3벳 vs BTN', desc: '버튼 오픈에 SB의 3벳 · 리니어(직선형) 구조',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': '99+ ATs+ A5s A4s KQs KJs QJs AJo+ KQo',
      '0.5': '88 77 A9s A8s A3s A2s KTs K9s QTs JTs T9s 98s ATo KJo',
    } }],
    note: 'SB 는 포지션이 나빠 콜보다 3벳 중심(3벳 아니면 폴드). 넓은 BTN 오픈을 상대하므로 좋은 핸드를 직선형으로 늘린다.',
  },
  {
    id: 'sb_3bet_co', group: 'threebet', hero: 'SB', vs: 'CO', label: 'SB 3벳 vs CO', desc: '컷오프 오픈에 SB의 3벳 · 리니어',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'TT+ AJs+ A5s KQs AJo+ KQo',
      // ⚠ 이 스펙 문자열은 sb_vs_co 의 3벳과 **문자까지 동일해야** 한다(같은 스팟이 두 그룹에 있다).
      //   예전엔 여기 끝에 KQo 가 하나 더 붙어 있었다 — '1' 의 KQo 와 중복이라 콤보 %는 우연히 같았지만
      //   그건 buildFreq 의 '첫 지정 우선' + JS 키 순서에 기댄 우연이다. 우연을 스펙으로 두지 않는다.
      '0.5': '99 88 ATs A4s A3s KJs QJs JTs T9s A9s',
    } }],
    note: 'CO 오픈 상대 SB 3벳. BTN 상대보다 조금 좁게, 여전히 리니어 중심. 스펙은 defend 그룹의 sb_vs_co 3벳과 완전히 동일하다(테스트가 맵 단위로 잠근다).',
  },
  // ── 콜드 3벳 확장(2026-08-30) — 스퀴즈 노출(뒤에 남은 인원)이 폭의 상한을 정한다 ──
  {
    id: 'hj_3bet_lj', group: 'threebet', hero: 'HJ', vs: 'LJ', label: 'HJ 3벳 vs LJ', desc: 'LJ 오픈에 하이잭의 콜드 3벳. 뒤에 4명이 남아 가장 좁다',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'QQ+ AKs AKo A5s',
      '0.5': 'JJ TT AQs AJs KQs',
    } }],
    note: '콜드 3벳의 스퀴즈 노출은 뒤에 남은 인원수에 단조 증가한다(HJ 뒤 4명 · CO 뒤 3명 · BTN 뒤 2명). 데드머니만 세는 알파 역산은 이걸 모델링하지 못해 co_3bet_lj 보다 넓어져 버린다. 그래서 HJ < CO < BTN 단조성을 지켜 3.8%. 블러프를 A5s 하나로 끊은 건 넷이 남은 상태에서 블러프 지분을 늘리면 폴드에퀴티를 얻기 전에 밟히기 때문. sb_vs_lj 의 3벳(4.2%)과 이 표가 갈리는 지점이 AQo 다. SB 는 자기 0.5bb 가 이미 팟에 있고 뒤에 BB 하나만 남아 데드머니 대비 리스크가 낮다. 뒤에 넷이 남은 HJ 는 같은 AQo 로 3벳하면 스퀴즈에 노출된다.',
  },
  {
    id: 'co_3bet_hj', group: 'threebet', hero: 'CO', vs: 'HJ', label: 'CO 3벳 vs HJ', desc: '하이잭 오픈에 컷오프의 3벳. 상대가 넓어진 만큼 밸류 하단이 내려온다',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'QQ+ AKs AKo AQs A5s',
      '0.5': 'JJ TT AJs KQs KJs A4s A3s',
    } }],
    note: '알파는 vs LJ 와 같은 65.2%(같은 IP 3x·같은 데드머니)라 달라지는 건 상대뿐. HJ 의 MDF continue(7.1%)가 LJ(5.5%)보다 넓다. 상대 continue 가 넓으면 (a) 내 밸류가 그 안에서 50% 선을 더 쉽게 넘고 (b) 폴드를 노린 블러프 콤보를 더 담을 수 있다 → AQs 밸류 승격 + A4s·A3s 절반, 두 방향으로만 확장.',
  },
  {
    id: 'btn_3bet_hj', group: 'threebet', hero: 'BTN', vs: 'HJ', label: 'BTN 3벳 vs HJ', desc: '하이잭 오픈에 버튼의 3벳. 포지션이 수딧 커넥터를 블러프 자격으로 만든다',
    actions: [{ key: 'raise', label: '3벳', spec: {
      '1': 'QQ+ AKs AKo AQs A5s A4s',
      '0.5': 'JJ TT 99 AJs ATs KQs KJs QJs JTs A3s A2s',
    } }],
    note: 'btn_3bet_lj(4.4%)와 btn_3bet_co(7.8%) 사이를 상대 오픈 폭에 비례해 채운다. 3벳 블러프의 정당화는 "블로커" 또는 "콜당해도 실현" 중 하나면 성립한다. QJs·JTs 는 블로커 값이 거의 없고 오직 포지션 실현으로만 정당화되므로, 포지션이 없는 sb_vs_hj 에는 같은 핸드를 넣지 않았다(두 표의 차이가 그 원리의 대조군). T9s 는 더 넓은 btn_3bet_co 의 몫이라 여기선 제외.',
  },
];

// ── vs 3벳 ──────────────────────────────────────────────────────
// 내 오픈이 3벳을 맞았을 때. 포지션 있으면(BTN이 SB/BB 3벳 상대) 넓게 콜, 없으면 타이트 4벳/폴드.
//
// 🔒 이 그룹의 표기 규약(2026-08-30 확정) — **4벳 혼합의 잔여 빈도는 그 핸드의 성격이 정한다.**
//   한 노드 안에 두 종류가 공존한다. 대칭 규약(전부 콜 / 전부 폴드)은 어느 쪽이든 역전을 만든다.
//
//   ① 밸류 4벳(QQ · AKs · AKo) — **잔여는 콜.** 상대 3벳 레인지 상대로 쇼다운 가치가 충분하다.
//      그래서 콜 '0.5' 에 QQ·AKs·AKo 를 반드시 함께 적는다(continue 100%).
//   ② 블러프 4벳(A5s · A4s) — **잔여는 폴드.** 블로커 목적이라 4벳을 안 할 거면 콜할 가치가 없다.
//      그래서 콜 스펙에 절대 적지 않는다(continue = 4벳 빈도 그대로).
//
//   이 구분을 두 번 뒤집어 본 뒤에 확정했다:
//   · 1차 — A5s 를 콜에도 적어 4벳 0.5 + 콜 0.5 = **A5s 가 100% continue**, AQo·99·JTs 는 0%.
//     "블러프가 절대 안 접히는" 역전.
//   · 2차 — 그걸 고치려고 '4벳 스펙 전부를 콜에서 뺐더니' 이번엔 **QQ·AK 가 50% continue** 인데
//     77·87s·T9s 는 100%. 같은 역전의 거울상.
//   개별 사례를 막는 테스트로는 또 뚫린다. ranges.test.ts 의 **도미네이션 단조성**
//   (A 가 B 를 지배하면 continue(A) ≥ continue(B))이 두 방향을 동시에 잠그고,
//   블러프 4벳은 그 불변식의 **명시 예외 목록**으로만 통과한다.
// 📐 폭의 근거: continue(= 4벳% + 콜%) ÷ 내 오픈% ≈ 상대 3벳 사이즈가 강요하는 MDF **하한**.
//   OOP 4x → 알파 75% → MDF 25% / IP 3x → 알파 65% → MDF 34.8%.
//   MDF 는 "이만큼은 계속해야 착취당하지 않는다"는 하한이지 상한이 아니다 — 밸류 4벳 잔여를
//   콜로 받으면 실제 continue 는 하한을 노드마다 0.8%p 안팎 상회한다. 테스트가 전 노드 24~40% 로 잠근다.
const VS3BET: RangeScenario[] = [
  {
    id: 'lj_vs_3bet', group: 'vs3bet', hero: 'LJ', label: 'LJ vs 3벳', desc: 'LJ 오픈 → 뒤에서 3벳 · 얼리라 매우 타이트하게 continue',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AQs JJ TT',
        '0.5': 'QQ AKs AKo AQo AJs KQs QJs JTs T9s 99',
      } },
    ],
    note: '얼리 오픈이 3벳을 맞으면 레인지가 이미 강해도 좁게 continue. 4벳은 KK+ 중심, 콜은 프리미엄. continue 5.4%(오픈 15.8% 대비 34.0%). QQ·AK 는 4벳 절반 + 콜 절반이라 접지 않고, A5s 는 4벳 절반 + 폴드 절반이다.',
  },
  {
    id: 'co_vs_btn3bet', group: 'vs3bet', hero: 'CO', vs: 'BTN', label: 'CO vs BTN 3벳', desc: 'CO 오픈 → BTN 3벳 · 포지션 없이 continue',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s A4s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AQs AQo AJs AJo ATs KQs KQo KJs QJs QTs JJ JTs TT T9s 99 88',
        '0.5': 'QQ AKs AKo A9s 98s 87s',
      } },
    ],
    note: 'CO 는 포지션이 없어 BTN 3벳에 타이트하게. 4벳 폴라(KK+ + A5s·A4s 블러프) + 프리미엄 콜. 폭의 기준은 BTN 의 3x(IP) 가 강요하는 MDF **하한** 34.8% 다: 27.8% x 34.8% ≈ 9.7% 가 하한이고 실제 continue 는 10.6%(38.0%). 하한을 넘는 1%p 는 QQ·AKs·AKo 의 4벳 잔여를 폴드가 아니라 콜로 받기 때문이다. 예전 8.0%(28.8%)는 같은 BTN 3x 를 맞는 hj_vs_btn3bet 보다 좁아 **더 넓게 연 쪽이 덜 수비하는** 역전이었다. BTN 은 CO 를 상대로 더 넓게(7.8%) 3벳하므로 방향이 반대여야 한다(현재 CO 38.0% > HJ 36.8%).',
  },
  {
    id: 'btn_vs_sb3bet', group: 'vs3bet', hero: 'BTN', vs: 'SB', label: 'BTN vs SB 3벳', desc: '버튼 오픈 → SB 3벳 · 포지션 우위로 넓게 콜',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s A4s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AQs AQo AJs ATs KQs KJs QJs JJ JTs TT T9s 99 98s 88',
        '0.5': 'QQ AKs AKo AJo A9s A8s KQo KJo KTs QTs J9s 87s 77 76s 66 65s',
      } },
    ],
    note: '포지션이 있어 넓게 콜한다(continue 11.3%, 오픈 44.5% 대비 25.4%). 4벳은 KK+ 확정 + QQ/AK/A5s·A4s 혼합. 상대가 3벳을 멈추지 못하게 하는 최소 방어. QQ·AK 는 4벳하지 않는 절반을 콜로 받고(continue 100%), 블로커 블러프인 A5s·A4s 는 그 절반을 접는다.',
  },
  {
    id: 'btn_vs_bb3bet', group: 'vs3bet', hero: 'BTN', vs: 'BB', label: 'BTN vs BB 3벳', desc: '버튼 오픈 → BB 3벳 · 상대 폴라 3벳을 넓게 콜',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'AQs AQo AJs ATs KQs KJs QJs JJ JTs TT T9s 99 98s 88 87s 77',
        '0.5': 'QQ AKs AKo AJo A9s A8s KQo KJo KTs K9s QTs J9s T8s 76s 66 65s 55 54s',
      } },
    ],
    note: 'BB 3벳은 블러프가 많은 폴라라, 포지션 있는 버튼은 아주 넓게 콜해 플랍에서 활용한다. continue 12.2%(오픈 44.5% 대비 27.5%)로 vs 3벳 15노드 중 가장 넓다.',
  },
  // ── vs 3벳 확장(2026-08-30) — 15노드 매트릭스의 빈칸 메우기 ──
  // 4벳 폭은 '상대 3벳이 폴라냐 리니어냐'로 갈린다: 폴라(BB) 상대는 4벳에 대량 폴드하므로
  // 블러프 4벳의 폴드에퀴티가 커 A4s 까지 넓히고, 리니어(SB) 상대는 접을 핸드가 적어 A5s 하나로 좁힌다.
  // (블로커 특이도만 보고 반대로 넓히면 상대가 안 접어 블러프 4벳이 그대로 진다.)
  {
    id: 'sb_vs_bb3bet', group: 'vs3bet', hero: 'SB', vs: 'BB', label: 'SB vs BB 3벳', desc: 'SB 오픈 → BB 3벳 · 6맥스에서 가장 자주 나오는 vs 3벳',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'JJ TT 99 AQs AJs ATs KQs KJs QJs JTs AQo',
        '0.5': 'QQ AKs AKo 88 77 66 55 A9s A8s A7s A6s KTs QTs T9s 98s 87s 76s KQo AJo ATo',
      } },
    ],
    note: '블라인드 배틀 3연결(SB 오픈 → BB 3벳 → SB 의 4벳/콜)의 마지막 다리. BB 의 OOP 4x → 알파 75% → SB 의 MDF 하한 25% → 38.5% x 25% ≈ 9.6% 가 하한이고 실제 continue 는 10.9%(28.2%). 예전 6.1%(폴드 84%)는 **BB 가 아무 두 장으로 3벳해도 이득**인 수치였다. 같은 파일의 bb_vs_sb 가 BB 3벳을 12.0%(블러프 다수 폴라)로 정의하는데 SB 의 continue 가 그 절반(0.51배)이면 블러프가 공짜로 통과한다. 지금은 0.91배로, BB 3벳을 맞는 다른 노드(CO 0.94 · HJ 1.01 · BTN 1.31)와 같은 대역이다. 넓게 연 대가는 "그래서 많이 접는다"가 아니라 "낮은 SPR 에서 실현되는 핸드로 넓게 받는다"로 치른다. 그래서 콜 하단이 중간 페어·수딧 커넥터까지 내려간다. 4벳을 KK+ 단독으로 두지 않는 것도 같은 이유다(12콤보 0.9%면 BB 가 3벳을 공짜로 계속한다).',
  },
  {
    id: 'co_vs_bb3bet', group: 'vs3bet', hero: 'CO', vs: 'BB', label: 'CO vs BB 3벳', desc: 'CO 오픈 → BB 3벳 · 상대 폴라 3벳이라 4벳 블러프를 넓게',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s A4s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'JJ TT AQs AJs KQs QJs JTs',
        '0.5': 'QQ AKs AKo 99 88 ATs A9s KJs KTs QTs T9s 98s AQo KQo',
      } },
    ],
    note: 'BB 의 OOP 4x(10bb) 3벳 → 데드머니 3.0·리스크 9.0 → 알파 75%, CO 의 MDF 하한 25% → 27.8% x 25% = 6.95% 가 하한이고 실제 continue 는 7.7%(27.7%). 상대가 폴라라 4벳 블러프의 폴드에퀴티가 커 A4s 까지 넓혔다. 그 A5s·A4s 의 나머지 절반은 **폴드**다(콜에 다시 적으면 블로커 블러프가 프리미엄보다 잘 안 접히는 역전이 난다). 반대로 밸류 4벳인 QQ·AKs·AKo 의 나머지 절반은 **콜**이다. 이 둘을 같은 규약으로 묶으면 어느 쪽으로든 역전이 난다. 콜에 QTs·T9s·98s 가 들어오는 건 CO 가 IP 라 낮은 SPR 에서도 무료 카드·무저항 팟 옵션이 살아 실현율이 회복되기 때문.',
  },
  {
    id: 'co_vs_sb3bet', group: 'vs3bet', hero: 'CO', vs: 'SB', label: 'CO vs SB 3벳', desc: 'CO 오픈 → SB 3벳 · 상대가 리니어라 오히려 좁게 continue',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'JJ TT AQs AJs KQs QJs',
        '0.5': 'QQ AKs AKo 99 88 ATs A9s KJs JTs QTs T9s 98s AQo',
      } },
    ],
    note: 'MDF 하한만 보면 이쪽이 더 넓어야 한다(SB 는 죽은 BB 의 1bb 까지 노리느라 알파 73.1% → 하한 7.5%). 그런데 최종은 co_vs_bb3bet 보다 좁다. SB 는 포지션이 나빠 3벳을 리니어(밸류 위주)로 짜므로 마주하는 평균 강도가 높고, 하한을 문자 그대로 채우면 실현 에퀴티가 따라오지 않는다(보정 0.8 → 6.0%, 실제 continue 6.8% = 24.5%). 이 표와 co_vs_bb3bet(7.7%) 의 차이는 오직 상대 3벳 구조만으로 생긴 폭이다. 같은 CO 오픈, 같은 4벳 스펙, 다른 상대.',
  },
  {
    id: 'hj_vs_bb3bet', group: 'vs3bet', hero: 'HJ', vs: 'BB', label: 'HJ vs BB 3벳', desc: 'HJ 오픈 → BB가 4x 3벳 · vs 3벳 매트릭스에서 가장 좁은 노드',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'JJ TT AQs AJs KQs QJs',
        '0.5': 'QQ AKs AKo 99 ATs KJs JTs AQo',
      } },
    ],
    note: 'BB 의 OOP 4x → 알파 75%, HJ 의 MDF 하한 25% → 20.5% x 25% = 5.13% 가 하한이고 실제 continue 는 6.0%(29.0%). HJ 오픈(20.5%)이 CO(27.8%)보다 강해 continue 비율은 비슷해도 절대량이 작아지고, 그래서 콜이 프리미엄 여섯 종 + 절반 여덟 종에서 끊긴다. ATs·KJs 를 절반으로만 남긴 게 경계. ATs 는 폴라 3벳에 콜당했을 때 A블로커가 겹쳐 도미네이트 리스크가 크다. 4벳 블러프인 A5s 의 나머지 절반은 폴드라 A5s 의 continue 는 50% 에서 멈춘다. 여기에 A5s 를 콜로 또 적으면 A5s 만 100% 가 되어 A9s·A8s(0%)를 뛰어넘는 역전이 난다(1차 버그). 반대로 밸류인 QQ·AKs·AKo 를 콜에서 빼면 이번엔 QQ 가 50% 인데 99·JTs 가 100% 인 거울상 역전이 난다(2차 버그).',
  },
  {
    id: 'hj_vs_btn3bet', group: 'vs3bet', hero: 'HJ', vs: 'BTN', label: 'HJ vs BTN 3벳', desc: 'HJ 오픈 → BTN이 3x 3벳 · 상대가 포지션 우위인데 내가 더 넓게 수비하는 역설',
    actions: [
      { key: 'fourbet', label: '4벳', spec: {
        '1': 'KK+',
        '0.5': 'QQ AKs AKo A5s A4s',
      } },
      { key: 'call', label: '콜', spec: {
        '1': 'JJ TT AQs AJs ATs KQs QJs JTs',
        '0.5': 'QQ AKs AKo 99 88 KJs KTs QTs T9s AQo KQo',
      } },
    ],
    note: 'BTN 은 포지션이 있어 3벳이 3x(7.5bb)로 작고 데드머니가 4.0 이라 알파 65.2% → HJ 의 MDF 하한이 34.8% 로 뛴다(20.5% x 34.8% = 7.13% 하한, 실제 continue 7.5% = 36.8%). 같은 HJ 가 BB 의 4x 를 맞을 때(6.0%)보다 1.6%p 넓게 수비하는 원인은 오직 3벳 사이즈다. 이 두 표를 나란히 두는 것이 "누가 3벳했는지"를 구분하지 않는 표가 왜 부정확한지의 직접 증거다. 같은 BTN 3x 를 맞는 co_vs_btn3bet 은 38.0% 로 이쪽(36.8%)보다 넓다. BTN 이 CO 를 상대로 더 넓게(7.8% vs 5.4%) 3벳하기 때문이고, 반대로 뒤집히면 표가 틀린 것이다. 밸류 4벳 잔여를 콜로 받는 규약이 두 노드를 함께 밀어 올렸는데, 분모가 작은 HJ 쪽이 더 크게 올라 이 순서가 한 번 뒤집혔다. 그래서 77·A9s 를 콜에서 뺐다(7.9% → 7.5%).',
  },
];

// ── 9인 풀 테이블 보강(오너 지시 2026-09-02: "국내 라이브는 9인인데 3자리만 나온다 · 3벳 포함 세분화") ──
// ① 9인 오픈은 얼리 3자리만 있고 나머지는 "6맥스와 동일" 이라는 말로 숨어 있었다 — 유저는 9인 그룹에서
//    LJ/HJ/CO/BTN/SB 를 찾을 수 없었다. 같은 표를 9인 그룹에도 **그 이름으로** 올린다(스펙 공유 · 중복 서술 없음).
// ② 얼리(UTG·UTG+1·MP) 오픈에 대한 3벳·수비·vs 3벳이 통째로 없었다. 9인에서 가장 자주 서는 스팟이다.
//    원칙: 얼리 오픈은 좁으니 3벳은 밸류 위주 + 휠 에이스 블러프 소량, 뒤 포지션일수록 조금씩 넓힌다.
const LATE_LABEL: Record<string, string> = { LJ: 'LJ (9인)', HJ: 'HJ (9인)', CO: 'CO (9인)', BTN: 'BTN (9인)', SB: 'SB (9인)' };
const RFI9_LATE: RangeScenario[] = RFI6.map((s) => ({
  ...s,
  id: `${s.id}9`,
  group: 'rfi9',
  label: LATE_LABEL[s.hero] ?? s.label,
  desc: `9인 테이블 ${s.hero} · ${s.desc.replace(/^6맥스 첫 포지션 · /, '')}`,
  note: s.note ? `${s.note} (6맥스와 같은 표 — 앞에서 다 접고 나에게 왔다면 남은 인원이 같다)` : '앞에서 다 접고 나에게 왔다면 6맥스와 같은 상황 — 같은 표를 쓴다.',
}));

// 3벳 vs 얼리 오픈 — 오픈 포지션 3단(UTG 12% · UTG+1 13% · MP 15%) × 내 포지션. 폭은 오픈이 넓을수록·내가 뒤일수록 조금 넓게.
const early3bet = (hero: TablePos, vs: TablePos, wide: 0 | 1 | 2): RangeScenario => {
  const spec = wide === 0
    ? { '1': 'QQ+ AKs AKo', '0.5': 'JJ AQs A5s A4s' }
    : wide === 1
      ? { '1': 'JJ+ AKs AKo AQs', '0.5': 'TT AQo AJs KQs A5s A4s A3s' }
      : { '1': 'TT+ AKs AKo AQs', '0.5': '99 AQo AJs KQs A5s A4s A3s' };
  const vsName = vs === 'UTG' ? 'UTG(12%)' : vs === 'UTG+1' ? 'UTG+1(13%)' : 'MP(15%)';
  return {
    id: `${hero.toLowerCase().replace('+', '')}_3bet_${vs.toLowerCase().replace('+', '')}`,
    group: 'threebet', hero, vs,
    label: `${hero} 3벳 vs ${vs}`,
    desc: `9인 · ${vsName} 오픈에 ${hero}에서 리레이즈`,
    actions: [{ key: 'raise', label: '3벳', spec }],
    note: wide === 0
      ? '얼리 오픈은 좁다 — 3벳은 밸류(QQ+·AK) 위주, 블러프는 A 블로커 휠 에이스만 소량. AQo·TT 로 3벳하면 도미네이트당한다.'
      : '오픈이 조금 넓어졌거나 내가 뒤라 3벳 폭도 한 단계 넓힌다. 그래도 얼리 상대에겐 JJ·AQs 까지가 밸류의 하한이다.',
  };
};
const THREEBET_EARLY: RangeScenario[] = [
  // vs UTG
  early3bet('UTG+1', 'UTG', 0), early3bet('MP', 'UTG', 0), early3bet('LJ', 'UTG', 0), early3bet('HJ', 'UTG', 0),
  early3bet('CO', 'UTG', 1), early3bet('BTN', 'UTG', 1),
  // vs UTG+1
  early3bet('MP', 'UTG+1', 0), early3bet('LJ', 'UTG+1', 0), early3bet('HJ', 'UTG+1', 1),
  early3bet('CO', 'UTG+1', 1), early3bet('BTN', 'UTG+1', 1),
  // vs MP
  early3bet('LJ', 'MP', 1), early3bet('HJ', 'MP', 1), early3bet('CO', 'MP', 2), early3bet('BTN', 'MP', 2),
];

// 블라인드 수비 vs 얼리 오픈 — BB 는 3벳+콜(콜은 A6s+ 를 0.5 로 받아 휠 에이스 블러프가 지배 역전을 만들지 않는다),
// SB 는 3벳-or-폴드(레이크·포지션 불리로 콜 없음).
const bbVsEarly = (vs: TablePos, wide: boolean): RangeScenario => ({
  id: `bb_vs_${vs.toLowerCase().replace('+', '')}`, group: 'defend', hero: 'BB', vs,
  label: `BB 수비 vs ${vs}`, desc: `9인 · ${vs} 오픈(2.5x)에 BB 에서 3벳·콜`,
  actions: [
    { key: 'raise', label: '3벳', spec: wide
      ? { '1': 'QQ+ AKs AKo', '0.5': 'JJ AQs A5s A4s A3s' }
      : { '1': 'QQ+ AKs AKo', '0.5': 'JJ AQs A5s A4s' } },
    { key: 'call', label: '콜', spec: wide
      ? { '1': 'TT-22 AQo AJs ATs KQs KJs KTs QJs QTs JTs T9s 98s 87s 76s 65s 54s', '0.5': 'JJ AQs A9s A8s A7s A6s AJo KQo J9s T8s 97s' }
      : { '1': 'TT-22 AQo AJs ATs KQs KJs QJs JTs T9s 98s 87s 76s', '0.5': 'JJ AQs A9s A8s A7s A6s KTs QTs 65s' } },
  ],
  note: '얼리 오픈엔 BB 도 콜 폭을 줄인다 — 수딧 커넥터·중간 페어는 남기고 오프수트 브로드웨이는 접는다. 3벳 블러프는 휠 에이스만.',
});
const sbVsEarly = (vs: TablePos): RangeScenario => ({
  id: `sb_vs_${vs.toLowerCase().replace('+', '')}`, group: 'defend', hero: 'SB', vs,
  label: `SB 수비 vs ${vs}`, desc: `9인 · ${vs} 오픈에 SB 는 3벳 아니면 폴드`,
  actions: [{ key: 'raise', label: '3벳', spec: { '1': 'JJ+ AKs AKo AQs', '0.5': 'TT AQo AJs KQs A5s A4s' } }],
  note: 'SB 콜은 포지션·레이크 둘 다 불리 — 얼리 오픈엔 3벳-or-폴드. 밸류 JJ+·AK·AQs, 블러프 휠 에이스.',
});
const DEFEND_EARLY: RangeScenario[] = [
  bbVsEarly('UTG', false), bbVsEarly('UTG+1', false), bbVsEarly('MP', true),
  sbVsEarly('UTG'), sbVsEarly('UTG+1'), sbVsEarly('MP'),
];

// 얼리 오픈이 3벳을 맞았을 때 — 오픈이 좁아 4벳 밸류가 두텁고(KK+·AKs), 콜은 QQ/AKo 잔여 + 중간 페어·AQs.
// width 0 = UTG(KQs 폴드·AJs 반만 — 상대 3벳이 QQ+·AK 중심이라 지배당한다. 블러프 4벳 없음: 10% 오픈은 밸류만으로 MDF 를 채운다)
//       1 = UTG+1 · 2 = MP
const earlyVs3bet = (hero: TablePos, width: 0 | 1 | 2): RangeScenario => ({
  id: `${hero.toLowerCase().replace('+', '')}_vs_3bet`, group: 'vs3bet', hero,
  label: `${hero} vs 3벳`, desc: `9인 · 내 ${hero} 오픈이 3벳을 맞았을 때 · 4벳·콜`,
  actions: [
    { key: 'fourbet', label: '4벳', spec: width === 2 ? { '1': 'KK+ AKs', '0.5': 'QQ AKo A5s A4s' } : width === 1 ? { '1': 'KK+ AKs', '0.5': 'QQ AKo A5s' } : { '1': 'KK+ AKs', '0.5': 'QQ AKo' } },
    { key: 'call', label: '콜', spec: width === 2
      ? { '1': 'JJ TT 99 AQs AJs ATs KQs KJs', '0.5': 'QQ AKo' }
      : width === 1 ? { '1': 'JJ TT AQs AJs KQs', '0.5': 'QQ AKo' } : { '1': 'JJ TT AQs', '0.5': 'QQ AKo AJs' } },
  ],
  note: width === 0
    ? '10% 오픈은 이미 프리미엄이라 4벳은 밸류만(KK+·AKs). QQ·AKo 는 4벳·콜 반반, 상대 3벳이 QQ+·AK 중심이라 KQs 는 접고 AJs 는 반만 콜.'
    : '얼리 오픈은 이미 프리미엄이라 4벳 밸류가 두텁다(KK+·AKs). QQ·AKo 는 4벳·콜 반반, 블러프 4벳은 A 블로커 휠 에이스만.',
});
const VS3BET_EARLY: RangeScenario[] = [earlyVs3bet('UTG', 0), earlyVs3bet('UTG+1', 1), earlyVs3bet('MP', 2)];

export const RANGE_SCENARIOS: RangeScenario[] = [
  ...RFI6, ...RFI9, ...RFI9_LATE, ...DEFEND, ...DEFEND_EARLY, ...THREEBET, ...THREEBET_EARLY, ...VS3BET, ...VS3BET_EARLY,
];

export const RANGE_GROUPS: { id: RangeScenario['group']; label: string; desc: string }[] = [
  { id: 'rfi9', label: '오픈 (9인)', desc: '국내 라이브 표준 · UTG부터 SB까지 8자리 오픈 레이즈' },
  { id: 'rfi6', label: '오픈 (6맥스)', desc: '온라인·숏핸드 · LJ부터 SB까지' },
  { id: 'threebet', label: '3벳', desc: '상대 오픈에 리레이즈 · 얼리(UTG·UTG+1·MP) 오픈 포함' },
  { id: 'defend', label: '블라인드 수비', desc: '상대 오픈에 BB·SB의 3벳·콜 · 얼리 오픈 포함' },
  { id: 'vs3bet', label: 'vs 3벳', desc: '내 오픈이 3벳을 맞았을 때 · 4벳·콜 · 얼리 포함' },
];
