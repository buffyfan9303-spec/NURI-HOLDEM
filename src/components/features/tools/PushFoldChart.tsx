import { useMemo, useState } from 'react';
import { CalcCard } from './calcUi';
import RangeMatrix13, { type MatrixAction } from './RangeMatrix13';
import SourceBadge from './SourceBadge';
import { ACTION_COLORS } from '../../../lib/ranges.data';
import { freqFromArray } from '../../../lib/ranges';
import { HAND_ORDER, NASH_BIG_ANTE, NASH_STACKS, hasNashRange, nashRange, isNashQuarantined } from '../../../lib/nash.data';
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
  const [stack, setStack] = useState((NASH_STACKS as readonly number[]).includes(initialStack ?? -1) ? initialStack! : 10);
  const [view, setView] = useState<View>(initialView ?? 'shove');
  const pos = POSITIONS.find((p) => p.k === k)!;
  const stackIdx = (NASH_STACKS as readonly number[]).indexOf(stack);

  // SB 콜 레인지는 SB 가 콜러인 상황(k>=2)에서만 존재(k=1 은 SB 가 셔버 본인)
  const effView: View = view === 'callSB' && k < 2 ? 'callBB' : view;
  // 표가 없는 조합은 행렬을 그리지 않는다 — 빈 표를 decode 하면 전부 0(=전부 폴드)이라 틀린 조언이 된다.
  const hasData = hasNashRange(effView, k, stack, NASH_BIG_ANTE);

  const actions = useMemo<MatrixAction[]>(() => {
    const arr = nashRange(effView, k, stack, NASH_BIG_ANTE);
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
        <div className="grid grid-cols-4 gap-1">
          {POSITIONS.map((p) => {
            const on = p.k === k;
            return (
              <button key={p.k} type="button" onClick={() => setK(p.k)} aria-pressed={on} title={p.desc}
                className={['h-8 rounded-input text-2xs font-bold leading-none whitespace-nowrap border transition-colors focus:outline-none',
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
          <p className="text-2xs font-bold text-ink-secondary">내 스택 <span className="font-normal text-ink-muted">(빅블라인드 몇 개분)</span></p>
          <p className="text-sm font-bold tabular-nums text-ink-primary" aria-live="polite">{stack}<span className="text-2xs text-ink-muted"> bb</span></p>
        </div>
        <input type="range" min={0} max={NASH_STACKS.length - 1} step={1} value={stackIdx}
          onChange={(e) => setStack(NASH_STACKS[Number(e.target.value)])}
          aria-label="스택 깊이(bb)" aria-valuetext={`${stack}bb${hasData ? '' : ' — 이 자리는 데이터 없음'}`}
          className="block w-full h-[44px] accent-accent-300 cursor-pointer" />
        {/* 눈금 — 2026-09-19 오너 "10BB 이하로 내려가면 차트가 색이 아무것도 채워져 있지 않아": 격리 구간(2~6bb · 뒤 2명+)의
            눈금이 7~20 과 똑같이 생겨 **고르기 전에는** 데이터가 없는 줄 알 수 없었다. 현재 자리·보기 기준으로 표가 없는 눈금을
            흐리게 + 점선 밑줄로 미리 구분한다(SB 는 2bb 부터 정상이라 자리를 바꾸면 표시도 바뀐다).
            ⚠ 누르지 못하게 막지 않는다 — 눌러야 '왜 없는지' 를 읽는다.
            ⚠ aria-disabled 를 **붙이지 않는다**(실측 2026-09-19): Playwright 의 click 이 aria-disabled 를 '비활성' 으로 보고
              60초 동안 기다리다 죽었다 — 자동화·보조기기가 같은 해석을 한다. 이 눈금은 aria-hidden 컨테이너 안의 장식이고
              보조기기용 상태는 위 슬라이더의 aria-valuetext("… 데이터 없음")가 이미 말한다. */}
        <div className="flex justify-between" aria-hidden="true">
          {NASH_STACKS.map((s) => {
            const on = s === stack;
            const has = hasNashRange(effView, k, s, NASH_BIG_ANTE);
            return (
              <button key={s} type="button" tabIndex={-1} onClick={() => setStack(s)}
                data-stack={s} data-has-data={has ? 'true' : 'false'}
                title={has ? undefined : `${s}bb — 이 자리(${pos.label})는 데이터가 없습니다. 눌러서 이유 보기`}
                className={['h-6 flex-1 min-w-0 rounded-[6px] text-2xs tabular-nums leading-none whitespace-nowrap transition-colors',
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
      <div className="flex justify-center"><SourceBadge kind="nash" note="빅 앤티 · first-in" /></div>
      {hasData
        ? <RangeMatrix13 actions={actions} initialSel={highlight} />
        : (
          // 왜 비었는지가 **첫 줄**이다(2026-09-19 리드): 예전엔 회색 점선 '빈 상태' 모양에 이유가 둘째 문단이라
          // 오너가 "색이 아무것도 없다" 로만 읽었다. 정보 톤(빨강 아님 — 사용자 잘못이 아니다)으로 올린다.
          // 2~6BB 의 뒤 인원 2명 이상은 값이 틀린 것이 확인돼(포지션 단조성 역전) 2026-09-18 에 내렸다 —
          // 틀린 조언보다 빈 칸이 낫다는 판단이다. `nash.data.ts` 의 NASH_ANTE_QUARANTINE 참고.
          <div role="status" data-testid="pushfold-no-data" className="rounded-input border border-aura-300/40 bg-aura-300/10 px-3 py-3 text-left text-xs text-ink-primary">
            {isNashQuarantined(stack, NASH_BIG_ANTE, k, effView) ? (
              <>
                <p className="font-bold break-keep">{pos.label} · {stack}bb — 이 표는 값이 틀린 것이 확인돼 <b className="text-aura-300">일시적으로 내렸습니다</b>.</p>
                <p className="mt-1 text-2xs leading-relaxed text-ink-secondary break-keep">
                  가까운 깊이로 대체하지 않습니다. 눈금에서 점선으로 표시된 깊이(
                  {NASH_STACKS.filter((s) => !hasNashRange(effView, k, s, NASH_BIG_ANTE)).join('·')}bb)가 그 구간이고,
                  <b> SB(뒤 1명)</b>와 <b>{NASH_STACKS.find((s) => hasNashRange(effView, k, s, NASH_BIG_ANTE)) ?? 7}bb 이상</b>은 그대로 쓰실 수 있어요. 표를 다시 만들면 돌아옵니다.
                </p>
              </>
            ) : (
              <p className="font-bold break-keep">{pos.label} · {stack}bb — 이 깊이는 데이터가 없습니다. 가까운 값으로 대체하지 않습니다.</p>
            )}
          </div>
        )}

      {/* 손님용 한 줄만 남긴다(리드 2026-09-19: 알고리즘·에퀴티 회수는 개발자용 설명). '생성기 재현 필요' 는
          e2e(gto-tab-verify)·gtoContract 가 화면에서 보는 문구라 그대로 둔다 — 근거 상세는 nash.data.ts 머리말. */}
      <p className="text-2xs text-ink-muted text-center leading-relaxed">
        ※ 자체 계산 Nash(첫 진입 올인 · 단일 콜러) · 빅 앤티 기준 · 부분 채움 셀 = 그 빈도만큼 올인 · <b>생성기 재현 필요</b>
      </p>
    </CalcCard>
  );
}
