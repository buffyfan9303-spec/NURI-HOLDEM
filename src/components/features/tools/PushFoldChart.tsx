import { CHIP_HIT } from '../gto/chip';
import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import RangeMatrix13, { type MatrixAction } from './RangeMatrix13';
import SourceBadge from './SourceBadge';
import { ACTION_COLORS } from '../../../lib/ranges.data';
import { freqFromArray } from '../../../lib/ranges';
import { HAND_ORDER, NASH_BIG_ANTE, NASH_STACKS, hasNashRange, nashRange, isNashQuarantined, isNashApprox } from '../../../lib/nash.data';
import SegmentedTabs from '../../atoms/SegmentedTabs';

// 푸시·폴드 차트 — 자체 계산 Nash 균형(fictitious play)로 전면 교체.
// 예전 버전은 스택 6구간×비율 1개(총 6개 숫자)짜리 근사에 포지션 축도, 콜 레인지도 없었다.
// 이제: 포지션 8자리 × 스택 12구간 × 셔브/콜(BB·SB) 실계산 데이터.
// 2026-09-17 오너 지시: 스택은 한 줄(슬라이더) · 토글은 행동 말로 · **빅 앤티 고정**(앤티 없음 선택지·앤티 설명 제거).
//   ante=off 데이터는 nash.data.ts 에 그대로 있다(스팟 분석이 입력 앤티로 고른다) — 이 화면만 ante=on 으로 고정한다.

const POSITIONS: { k: number; label: string; desc: string }[] = [
  { k: 8, label: 'UTG(9인)', desc: '뒤에 8명' },
  { k: 7, label: 'UTG+1', desc: '뒤에 7명' },
  { k: 6, label: 'UTG+2', desc: '뒤에 6명' },
  { k: 5, label: 'LJ', desc: '뒤에 5명' },
  { k: 4, label: 'HJ', desc: '뒤에 4명' },
  { k: 3, label: 'CO', desc: '뒤에 3명' },
  { k: 2, label: 'BTN', desc: '뒤에 블라인드 2명' },
  { k: 1, label: 'SB', desc: 'BB와 헤즈업' },
];

type View = 'shove' | 'callBB' | 'callSB';
/** 토글 문구 — 알약은 **4글자 이내 + nowrap**(오너 2026-09-17: '빅블라인드가 콜' 이 두 줄로 쪼개졌다).
 *  뜻은 차트 바로 위 한 줄 문장(VIEW_SENTENCE)이 말한다 — 알약 안에 설명을 넣지 않는다.
 *  문장은 **9글자 이내·세 갈래 같은 길이**: '빅블라인드(BB)가 콜할 수 있는 핸드' 는 320px 에서 두 줄(38px)이 되어
 *  알약을 누를 때마다 판이 튀었다(오너 2026-09-17 "연결성이 없다"). 약어는 알약과 같은 말을 쓴다 — 되풀이 풀이 없음. */
const VIEW_LABEL: Record<View, string> = { shove: '올인', callBB: 'BB 콜', callSB: 'SB 콜' };
const VIEW_SENTENCE: Record<View, string> = { shove: '내가 올인하는 핸드', callBB: 'BB가 콜하는 핸드', callSB: 'SB가 콜하는 핸드' };

export default function PushFoldChart({ initialK, initialStack, initialView, highlight }: {
  /** 오답 노트 '차트에서 보기' — 그 포지션·스택·셀(올인 콜 오답은 콜 표)로 바로 진입.
   *  initialAnte 는 예전 호출부 호환용으로 받기만 한다 — 화면은 빅 앤티로 고정이다. */
  initialK?: number; initialStack?: number; initialAnte?: boolean; initialView?: View; highlight?: string;
} = {}) {
  const [k, setK] = useState(POSITIONS.some((p) => p.k === initialK) ? initialK! : 2); // BTN 기본 — 가장 자주 찾는 자리
  // 기본 12bb — **격리 구간을 피한 가장 얕은 깊이**다(빅앤티 k≥2 는 2~10bb 가 격리라 기본 BTN 10bb 면 첫 화면이
  //   빈 상자가 된다: 오너가 원래 항의한 그 증상이 기본값이 되는 것). 격리 하한이 바뀌면 여기도 같이 봐라 —
  //   `nash.data.ts` 의 NASH_ANTE_QUARANTINE. 실측 BTN 12bb 39.0%(2026-09-19).
  //   2026-09-21 부터 2~10bb 는 추정값(NASH_ANTE_APPROX)으로 열렸지만 기본은 여전히 12bb — 첫 화면은 정식 등급 표다.
  const [stack, setStack] = useState((NASH_STACKS as readonly number[]).includes(initialStack ?? -1) ? initialStack! : 12);
  const [view, setView] = useState<View>(initialView ?? 'shove');
  const pos = POSITIONS.find((p) => p.k === k)!;
  const stackIdx = (NASH_STACKS as readonly number[]).indexOf(stack);

  // SB 콜 레인지는 SB 가 콜러인 상황(k>=2)에서만 존재(k=1 은 SB 가 셔버 본인)
  const effView: View = view === 'callSB' && k < 2 ? 'callBB' : view;
  // 표가 없는 조합은 행렬을 그리지 않는다 — 빈 표를 decode 하면 전부 0(=전부 폴드)이라 틀린 조언이 된다.
  // 🔴 2026-09-21 오너 "2bb~10bb 닫혀 있는 부분 계산해서 적용" → 다인 콜 **근사** 값(NASH_ANTE_APPROX)을 차트만 읽는다
  //   (`allowApprox=true`). 드릴·스팟 분석은 여전히 격리다. 추정 구간은 아래 배지가 '추정' 이라고 말한다.
  const hasData = hasNashRange(effView, k, stack, NASH_BIG_ANTE, true);
  const approx = isNashApprox(stack, NASH_BIG_ANTE, k);

  const actions = useMemo<MatrixAction[]>(() => {
    const arr = nashRange(effView, k, stack, NASH_BIG_ANTE, true);
    return [{
      key: effView,
      label: effView === 'shove' ? '올인' : '콜',
      color: effView === 'shove' ? ACTION_COLORS.raise : ACTION_COLORS.call,
      freq: freqFromArray(arr, HAND_ORDER),
    }];
  }, [effView, k, stack]);

  const viewItems = [
    { key: 'shove' as const, label: VIEW_LABEL.shove },
    { key: 'callBB' as const, label: VIEW_LABEL.callBB },
    ...(k >= 2 ? [{ key: 'callSB' as const, label: VIEW_LABEL.callSB }] : []),
  ];

  return (
    // 제목은 전체화면 헤더가 이미 표시 — 카드 안은 설명만(2중 노출 제거)
    <CalcCard>
      {/* 포지션 */}
      <div className="space-y-1">
        <p className="text-2xs font-bold text-ink-secondary">내 자리</p>
        <div data-testid="pushfold-positions" className="grid grid-cols-4 gap-x-1 gap-y-3.5">
          {POSITIONS.map((p) => {
            const on = p.k === k;
            return (
              // grid-cols-4 gap-1(4.25px) — 세로 이웃 간격이 tap-y-44 오버행(위아래 6px씩)보다 좁아
              // 겹치면 아랫줄 버튼이 윗줄 버튼의 탭을 가로챌 수 있다(2026-09-20 실측 확정). 박스 자체를 44px로.
              // 🔴 2026-09-24 G3: 보이는 32px + CHIP_HIT(누르는 44px) · 줄 간격 gap-y-3.5(14.875px) ≥ 확장 7+7 — 겹치지 않는다(gap-y-3 은 1.25px 겹쳐 gto-tab-verify 정수 스캔에서 43 으로 빨개졌다).
              <button key={p.k} type="button" onClick={() => setK(p.k)} aria-pressed={on} title={p.desc}
                className={[CHIP_HIT, 'h-[32px] rounded-input text-2xs font-bold leading-none whitespace-nowrap border transition-colors focus:outline-none',
                  on ? 'bg-accent-300 border-accent-300 text-white' : 'bg-surface-high border-border-default text-ink-muted hover:text-ink-secondary'].join(' ')}>
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 스택(bb) — 오너 지시(2026-09-17) "칩이 크고 두 줄로 깨진다": 12구간을 **한 줄 슬라이더**(44px 트랙)로,
          아래 눈금은 데이터가 실제로 있는 깊이(NASH_STACKS)만 — 눈금도 눌러서 바로 갈 수 있다(flex-1: 375px 에서 26px, 320px 에서 21.6px — 주 과녁은 44px 슬라이더다. min-w-[24px] 는 320px 에서 288>259 로 넘쳤다). */}
      <div className="space-y-1" data-testid="pushfold-stack-picker">
        <div className="flex items-baseline justify-between">
          {/* 🔴 G5(2026-09-20) — **언제 기준의 스택인가**를 결과 가까이에 못박는다.
              푸시·폴드 표는 '앤티·블라인드를 낸 뒤 남은 스택' 기준이라, 그것을 안 적으면 사용자가
              내기 전 스택으로 읽어 한 칸 위 표를 본다(같은 핸드가 셔브/폴드로 갈리는 경계에서 결과가 뒤집힌다). */}
          <p className="text-2xs font-bold text-ink-secondary">내 스택 <span className="font-normal text-ink-muted">(앤티·블라인드를 낸 뒤 남은 빅블라인드 개수)</span></p>
          <p className="text-sm font-bold tabular-nums text-ink-primary" aria-live="polite">{stack}<span className="text-2xs text-ink-muted"> bb</span></p>
        </div>
        <input type="range" min={0} max={NASH_STACKS.length - 1} step={1} value={stackIdx}
          onChange={(e) => setStack(NASH_STACKS[Number(e.target.value)])}
          aria-label="스택 깊이(bb)" aria-valuetext={`${stack}bb${hasData ? '' : ' — 이 자리는 데이터 없음'}`}
          className="block w-full h-[44px] accent-accent-300 cursor-pointer" />
        {/* 눈금 — 2026-09-19 오너 "10BB 이하로 내려가면 차트가 색이 아무것도 채워져 있지 않아": 격리 구간의
            눈금이 나머지와 똑같이 생겨 **고르기 전에는** 데이터가 없는 줄 알 수 없었다. 현재 자리·보기 기준으로 표가 없는 눈금을
            흐리게 + 점선 밑줄로 미리 구분한다(SB 는 2bb 부터 정상이라 자리를 바꾸면 표시도 바뀐다).
            ⚠ 누르지 못하게 막지 않는다 — 눌러야 '왜 없는지' 를 읽는다.
            ⚠ aria-disabled 를 **붙이지 않는다**(실측 2026-09-19): Playwright 의 click 이 aria-disabled 를 '비활성' 으로 보고
              60초 동안 기다리다 죽었다 — 자동화·보조기기가 같은 해석을 한다. 이 눈금은 aria-hidden 컨테이너 안의 장식이고
              보조기기용 상태는 위 슬라이더의 aria-valuetext("… 데이터 없음")가 이미 말한다. */}
        {/* 🔴 2026-09-21 오너 "푸시 폴드 차트도 닫힌 부분 계산해서 적용" — elementFromPoint 9점+세로 스캔 실측(390·320):
            셀 169·눈금 12·자리 8 중 다른 층에 가려진 것 0, 자리 44px, 셀 23.4/18px(13×13 격자 고유), **눈금 25.5px(h-6)** 만 미달.
            → h-8(34px) + tap-y-44(±6px) = 46px. 이 행은 overflow 가 없어 오버행이 안 잘리고, 위 슬라이더 바닥 6px 만
            눈금이 가져간다(슬라이더 주 과녁은 가운데 썸이라 영향 없음). e2e/gto-tab-verify.spec.ts 가 잠근다. */}
        <div className="flex justify-between" aria-hidden="true">
          {NASH_STACKS.map((s) => {
            const on = s === stack;
            const has = hasNashRange(effView, k, s, NASH_BIG_ANTE, true);
            return (
              <button key={s} type="button" tabIndex={-1} onClick={() => setStack(s)}
                data-stack={s} data-has-data={has ? 'true' : 'false'}
                title={has ? undefined : `${s}bb — 이 자리(${pos.label})는 데이터가 없습니다. 눌러서 이유 보기`}
                className={['h-8 tap-y-44 flex-1 min-w-0 rounded-[6px] text-2xs tabular-nums leading-none whitespace-nowrap transition-colors',
                  on ? 'font-bold text-accent-300'
                    : has ? 'text-ink-muted hover:text-ink-secondary'
                      : 'text-ink-muted/45 underline decoration-dotted underline-offset-2 hover:text-ink-muted'].join(' ')}>
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {/* 보기 — 내가 올인하는 쪽인가, 올인을 받는 쪽인가(공용 세그먼트) */}
      <SegmentedTabs items={viewItems} value={effView} onChange={setView} grow className="w-full [&_button]:whitespace-nowrap" />

      {/* 차트 바로 위 한 줄 — 자리·스택·보기 세 축을 문장 하나로 읽는다. 글자를 더 얹지 않는다.
          nowrap: 어떤 자리·보기 조합이든 높이가 같아야 알약을 눌러도 판이 안 튄다(실측 320px·UTG(9인)·SB 콜 = 19px 한 줄). */}
      <p className="text-2xs font-bold leading-relaxed text-ink-primary whitespace-nowrap" data-testid="pushfold-readback">
        {pos.label} · {stack}bb · 빅 앤티 — {VIEW_SENTENCE[effView]}
      </p>

      {/* 자체 산출 Nash 다 — 상용 솔버 표가 아니라는 것이 결과 옆에서 바로 보여야 한다. */}
      {/* 추정 구간(빅앤티 2~10bb · 뒤 2명+)은 배지 문구로 등급을 가른다 — e2e/pushfold-ticks 가 '추정' 유무를 본다. */}
      <div className="flex justify-center" data-testid="pushfold-source" data-approx={approx ? 'true' : 'false'}>
        <SourceBadge kind="nash" note={approx ? '빅 앤티 · first-in · 다인 콜 근사(추정)' : '빅 앤티 · first-in'} />
      </div>
      {hasData
        ? <RangeMatrix13 actions={actions} initialSel={highlight} />
        : (
          // 왜 비었는지가 **첫 줄**이다(2026-09-19 리드): 예전엔 회색 점선 '빈 상태' 모양에 이유가 둘째 문단이라
          // 오너가 "색이 아무것도 없다" 로만 읽었다. 정보 톤(빨강 아님 — 사용자 잘못이 아니다)으로 올린다.
          // 막힌 범위는 **여기 적지 않는다** — `nash.data.ts` 의 NASH_ANTE_QUARANTINE 한 곳만 보고,
          // 화면 문구는 hasNashRange 로 그때그때 계산한다(2026-09-18 '2~6BB' → 2026-09-19 '2~10BB' 로 넓어졌고,
          // 그때 이 주석만 옛 범위를 말하고 있었다. 범위를 주석에 박으면 다음 변경 때 또 어긋난다).
          // 🔴 아래 else 갈래("이 깊이는 데이터가 없습니다")는 **지금 조건으로는 도달하지 않는다.**
          // (구조적 빈칸인 callSB k=1 은 위 `effView` 가 callBB 로 바꿔 버리고, 나머지 빈칸은 전부 격리라
          //  왼쪽 갈래로 간다. 2026-09-19 검증 — 이번 변경 이전에도 같았으니 회귀가 아니다.)
          // **그래도 지우지 마라** — 표가 비는 조합이 생기는 날(깊이 추가·격리 해제·표 유실)의 폴백이다.
          // 도달 불가를 '죽은 코드' 로 읽고 지우면 그날 빈 행렬(전부 0 = 전부 폴드)이 조언으로 나간다.
          <div role="status" data-testid="pushfold-no-data" className="rounded-input border border-aura-300/40 bg-aura-300/10 px-3 py-3 text-left text-xs text-ink-primary">
            {isNashQuarantined(stack, NASH_BIG_ANTE, k, effView) ? (
              <>
                <p className="font-bold break-keep">{pos.label} · {stack}bb — 이 표는 값이 틀린 것이 확인돼 <b className="text-aura-300">일시적으로 내렸습니다</b>.</p>
                <p className="mt-1 text-2xs leading-relaxed text-ink-secondary break-keep">
                  가까운 깊이로 대체하지 않습니다. 눈금에서 점선으로 표시된 깊이(
                  {NASH_STACKS.filter((s) => !hasNashRange(effView, k, s, NASH_BIG_ANTE, true)).join('·')}bb)가 그 구간이고,
                  <b> SB(뒤 1명)</b>와 <b>{NASH_STACKS.find((s) => hasNashRange(effView, k, s, NASH_BIG_ANTE, true)) ?? 7}bb 이상</b>은 그대로 쓰실 수 있어요. 표를 다시 만들면 돌아옵니다.
                </p>
              </>
            ) : (
              <p className="font-bold break-keep">{pos.label} · {stack}bb — 이 깊이는 데이터가 없습니다. 가까운 값으로 대체하지 않습니다.</p>
            )}
          </div>
        )}

      {/* 손님용 한 줄만 남긴다(리드 2026-09-19: 알고리즘·에퀴티 회수는 개발자용 설명).
          '재산출 가능' 은 e2e(gto-tab-verify)·gtoContract 가 화면에서 보는 문구다 — 근거 상세는 nash.data.ts 머리말.
          ⚠ 2026-09-19 까지는 '생성기 재현 필요' 였다. 생성기가 유실돼 사실이었지만 이제 `scripts/gen-nash/` 로
            **이 화면이 읽는 빅 앤티 표는 전부 다시 만들 수 있다** — 그대로 두면 거짓 고지가 된다. */}
      <p className="text-2xs text-ink-muted text-center leading-relaxed">
        ※ 자체 계산 Nash(첫 진입 올인 · {approx ? '콜러 2명까지 근사' : '단일 콜러'}) · 빅 앤티 기준 · 부분 채움 셀 = 그 빈도만큼 올인 · <b>재산출 가능</b>
      </p>
    </CalcCard>
  );
}
