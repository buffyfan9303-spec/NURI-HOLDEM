// src/components/features/clock/ClockStage.tsx
// 클락 보드 **한 벌** — 매장 TV(ClockDisplay)와 운영자 화면(TournamentClock)이 같은 마크업을 쓴다.
//
// 왜 파일이 따로 생겼나 (2026-09-11 물리적 단일화)
//   테마·크기 체계·16:9 계약은 이미 맞춰져 있었지만 **마크업이 두 벌**이었다.
//   TV 는 아우라 v3 보드(총 프라이즈 히어로 · 상태 알약 · 중앙 프레임 · 하단 칩 경제 레일)를,
//   운영자 미리보기는 그보다 오래된 보드(작은 프라이즈 표 · 우측 Stat 열)를 그렸다.
//   그래서 '미리보기 = TV 축소판' 이라는 약속이 화면에서는 거짓이었고, 보드를 고칠 때마다
//   두 곳을 고쳐야 했다(실제로 한쪽만 고쳐진 채로 나간 적이 있다 — 스테이지 container-type 누락).
//   이제 보드는 여기 하나뿐이다. 호출처가 다른 것은 **데이터 출처와 머리말 우측 슬롯뿐**이다.
//
// 크기 단위: 전부 **cqmin**(스테이지 자신의 짧은 변) 이다. cqmin 이 아니다.
//   · 매장 TV — 스테이지 루트가 뷰포트를 꽉 채우는 컨테이너라 cqmin === cqmin, 픽셀 동일하다.
//   · 운영자 16:9 박스 — cqmin = 박스의 짧은 변. 그래서 같은 마크업이 박스 안에서 그대로 축소된다.
//   뷰포트 기준(vmin·md:·landscape:)으로 돌아가면 둘 중 하나가 반드시 틀린다(2026-09-11 실측 2회).
//   폭·방향 분기도 같은 이유로 Tailwind 변형이 아니라 `.clk-*` 컨테이너 쿼리(src/index.css)를 쓴다.
import { memo, useEffect, useState, type ReactNode } from 'react';
import { effectiveLevel, type ClockState } from '../../../api/clock';
import { clockPhase, CLOCK_PHASE_TV, gameLabel, levelNumberAt, msToNextBreak } from '../../../lib/clockLevel';
import { msToRegClose } from '../../../lib/regStatus';
import {
  PRIZES_PER_PAGE, PRIZE_LEFT_ROWS, PRIZE_GUTTER_CQ, pickPrizeLayout, prizePlaceText, type PrizeRow,
} from './prizeFit';

const pad = (n: number) => String(Math.floor(n)).padStart(2, '0');
const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${pad(s / 60)}:${pad(s % 60)}`; };
const hms = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return s >= 3600 ? `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}` : `${pad(s / 60)}:${pad(s % 60)}`; };

// levelNumberAt · msToNextBreak · msToRegClose 는 위 import 의 lib 한 곳뿐이다.
//
// ⚠ 2026-09-13 병합에서 실제로 되돌아왔던 자리다. 이 파일이 생기기 전(2026-09-11) 네 화면에 흩어져 있던
//   복제본을 lib 로 통합했는데, ClockStage 로 보드를 한 벌로 만들며 **로컬 사본 3개가 다시 들어왔다.**
//   그중 `msToRegClose` 에는 F2 가드(`if (target <= 0) return null;`)가 빠져 있었다 —
//   등록 마감 레벨을 **비워 둔** 대회에서 `0 >= 0` 이 참이 되어 손님이 보는 TV 보드가 '마감' 을 단언한다.
//   이 파일이 이제 TV·운영자 보드의 **단일 마크업**이라 그 오판이 두 화면에 동시에 나간다.
//   clockLevel.contract.test.ts · regStatus.contract.test.ts 가 이 복제를 잡아 여기까지 왔다.
//   로컬 사본을 다시 만들지 마라 — 두 계약이 빨간불로 막는다.
//
// 로컬 사본에는 또 `lv[i].minutes * 60_000`(널 가드 없음)이 있었는데 lib 은 `(minutes ?? 0)` 이다.
// 분 값이 비면 로컬본은 NaN 을 퍼뜨린다.
/**
 * 총 진행 시간 — 지난 레벨들의 길이 합 + 현재 레벨에서 지나간 시간.
 *
 * 왜 이렇게 구하나: clock_states 에 '시작 시각' 필드가 없다. 그런데 레퍼런스(루나 1200 GTD)의
 * TOTAL TIME 이 보여주는 값은 **클락이 돈 시간**이지 벽시계 경과가 아니다 — 일시정지·중단을 빼야
 * 맞는 숫자다. 레벨 구조에서 계산하면 정확히 그 값이 나오고, 새 컬럼도 마이그레이션도 필요 없다.
 * (브레이크도 대회 시간의 일부라 함께 센다 — 레퍼런스와 같은 정의.)
 */
function elapsedMs(s: ClockState, index: number, remaining: number): number {
  const lv = s.config?.levels ?? [];
  let acc = 0;
  for (let i = 0; i < index && i < lv.length; i++) acc += (lv[i].minutes ?? 0) * 60_000;
  const cur = lv[index];
  if (cur) acc += Math.max(0, (cur.minutes ?? 0) * 60_000 - remaining);
  return acc;
}


/** 한국어 라벨 — 흐린 흰색·자간 살짝. 영문 대문자 관례는 ANTE 하나만(오너 지시) */
const LABEL = 'font-bold tracking-[0.08em]';
const DIM = { color: 'var(--clk-ink-dim, rgba(255,255,255,.45))' } as const;
const SOFT = { color: 'var(--clk-ink-soft, rgba(255,255,255,.5))' } as const;


export interface ClockStageProps {
  /** 그릴 클락 한 벌. 운영자 화면은 자기 파생(liveStats·title)을 얹은 사본을 넘긴다. */
  g: ClockState;
  /** 상태 바 좌측 매장명. 없으면 '홀덤 라이브'. */
  venueName?: string;
  /** 상태 바 우측 슬롯 — TV 는 게임 선택·전체화면·닫기, 운영자 미리보기는 비운다. */
  headerRight?: ReactNode;
  /** 하단 좌측 참가 QR(data URL). 없으면 자리만 비운다. */
  qr?: string | null;
  /** 하단 우측 스폰서 배너(운영자 등록 광고). */
  sponsor?: string | null;
  /** 스폰서 배너 크기(운영자 설정). */
  adSize?: 'sm' | 'md' | 'lg';
}

/**
 * 보드 본체 — 상태 바 / 본문 3열 / 하단 레일.
 * 데이터를 읽지 않는다(구독·폴링·저장 0). 받은 ClockState 를 그리기만 한다.
 */
export default function ClockStage({ g, venueName, headerRight, qr, sponsor, adSize = 'sm' }: ClockStageProps) {
  const lvls = g.config?.levels ?? [];
  // 손님 기기라 DB 를 고치지 않고 '지금 진짜 레벨' 을 계산해 표시한다(DB 전진은 운영자 화면 책임).
  const eff = effectiveLevel(g);
  const curIdx = eff.index;
  const ls = g.liveStats ?? {
    entries: g.adjEntries, rebuys: g.adjRebuys, earlies: g.adjEarlies, addons: g.adjAddons,
    alive: Math.max(0, g.adjEntries - g.eliminations), eliminations: g.eliminations, totalStack: 0, avgStack: 0, buyInAmount: null,
  };
  const prizes = (g.config?.prizes ?? []).filter((p) => p.amount > 0);
  const totalPrize = prizes.reduce((sum, p) => sum + p.amount, 0);
  const hasCounts = !!g.liveStats
    || (ls.entries > 0 || ls.alive > 0 || ls.rebuys > 0 || ls.earlies > 0 || ls.addons > 0 || ls.eliminations > 0);
  // BB 병기 — 브레이크 중엔 직전 플레이 레벨의 BB
  let curBB = 0;
  for (let i = curIdx; i >= 0; i--) { const l = lvls[i]; if (l && l.kind === 'level' && l.bb > 0) { curBB = l.bb; break; } }
  const buyIn = ls.buyInAmount ?? 0;
  const regLevel = g.config?.regCloseLevel ?? 0;
  // 리바이·애드온·얼리는 **각자** 판정한다(예전엔 셋이 한 조건에 묶여 '리바이 · 애드온' 한 줄이었고 얼리는 아예 없었다).
  //   오너 2026-09-17: "에드온, 얼리는 꼭 포함해야해".
  //   ⚠ 값이 0이어도 **그 대회가 그 규칙을 쓰면** 보여 준다 — 0 은 정보다("아직 아무도 안 했다").
  //     반대로 규칙 자체가 없는 대회에 0 을 띄우면 빈 칸만 늘어 글자가 작아진다.
  const showRebuy = hasCounts && (ls.rebuys > 0 || g.config?.rebuyStack > 0);
  const showAddon = hasCounts && (ls.addons > 0 || !!g.config?.isAddon || (g.config?.addonStack ?? 0) > 0);
  const showEarly = hasCounts && (ls.earlies > 0 || (g.config?.earlyDoubleLevel ?? 0) > 0 || (g.config?.earlySingleLevel ?? 0) > 0);
  const extras = [
    showRebuy && { k: 'rebuy', label: '리바이', v: ls.rebuys ?? 0 },
    showAddon && { k: 'addon', label: '애드온', v: ls.addons ?? 0 },
    showEarly && { k: 'early', label: '얼리', v: ls.earlies ?? 0 },
  ].filter(Boolean) as { k: string; label: string; v: number }[];

  return (
    <>
      {/* ── 상태 바 — 좌: 매장·대회명 / 중앙: LEVEL + 진행 상태 / 우: 총 진행 + 호출처 슬롯 ──
          높이를 고정한다(h-[8cqmin]). 대회명이 길어도 두 번째 줄을 만들지 않고 말줄임 —
          예전엔 이 줄이 자라면 아래 타이머가 통째로 밀렸다.
          3열 그리드 — 가운데 칸이 스테이지 정중앙이다. flex + ml-auto 로 하면 제목 길이에 따라
          가운데가 좌우로 흔들린다(실측: 알약이 우측으로 밀려 있었다). */}
      <header className="grid h-[8cqmin] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-[1.5cqmin] px-[3cqmin]">
        <div className="flex min-w-0 items-center gap-[1.5cqmin]">
          <span className={`h-[1.2cqmin] w-[1.2cqmin] shrink-0 rounded-full ${g.running ? 'bg-emerald-400' : 'bg-amber-400'}`} aria-hidden />
          <p className="min-w-0 truncate text-[2.6cqmin] font-extrabold tracking-tight">
            {venueName || '홀덤 라이브'}
            {(g.title || g.config?.title) && <span className="ml-[1.2cqmin] font-medium" style={SOFT}>{g.title || g.config?.title}</span>}
          </p>
        </div>

        {/* 중앙 — LEVEL 과 상태만 알약. 나머지 정보는 알약으로 만들지 않는다. */}
        <div className="flex justify-center"><StatusPills g={g} /></div>

        <div className="flex shrink-0 items-center justify-end gap-[1.6cqmin]">
          <RunningTime g={g} />
          {headerRight}
        </div>
      </header>

          {/* ── 본문 3열: 프라이즈 | 타이머 히어로 | 지표 ─────────────────────────────
              레퍼런스 두 종(루나 1200 GTD · KK X ROYCE)이 공통으로 쓰는 골격이다. 둘 다
              **프라이즈를 독립 열**로 크게 두고 **지표를 세로 레일**로 세운다 — 대회 보드에서
              "얼마가 걸렸나"와 "지금 몇 명 남았나"는 타이머 다음으로 자주 보는 값이라
              가로 한 줄에 눌러 담으면 10m 거리에서 안 읽힌다.
              ⚠ 레이아웃 안정 계약: 중앙 열만 hero(flex-1) + 블라인드(고정 높이) 구조를 갖는다.
                 좌우 열은 각자 세로 중앙 정렬이라 프라이즈 줄 수·지표 개수가 달라져도
                 타이머 y 를 밀지 않는다(clock-visual.spec 이 6개 상태에서 y 동일을 강제). */}
          {/* 2026-09-11: 좌/중/우 3열 조건이 `md:`(폭) → `md:landscape:`(넓고 **가로**) → **컨테이너 쿼리**로 왔다.
              ① 폭만 보던 시절: 세로 TV(1080×1920) 는 폭이 1080 이라 md 를 넘겨 3열이 됐는데, 글자 크기는
                 cqmin(= 짧은 변 = 폭 1080) 기준이라 중앙 열(2.5/4.5 ≈ 600px)을 가로로 뚫고 나갔다 —
                 실측: 타이머가 우측 지표를 덮고 CURRENT 와 NEXT 가 서로 겹쳤다.
              ② `md:landscape:` 로 바꿔 그건 고쳤지만, 뷰포트 기준이라 **같은 보드 한 벌이 두 곳에서 산다**는
                 사실과 어긋났다: 세로 태블릿에서 운영자 화면의 **16:9 미리보기**(가로 박스)가 뷰포트 orientation 만
                 보고 1열로 접혔다. 판정 기준은 뷰포트가 아니라 **스테이지 자신의 크기**여야 한다.
              ③ 그래서 `.clk-*`(src/index.css) 컨테이너 쿼리로 옮겼다. 경계값 768px·landscape 는 종전과 같은 값이라
                 **TV 렌더는 픽셀 동일**하고, 미리보기만 자기 박스 기준으로 바르게 펼쳐진다.
                 전제: 두 호출처 모두 스테이지 루트에 `[container-type:size]` 가 있다(TournamentClock). */}
          <div className="clk-cols min-h-0 flex-1 gap-[2cqmin] px-[3cqmin]">

            {/* 좌 — 프라이즈. 없으면 열 자체를 그리지 않는다(빈 칸을 남기지 않는다). */}
            {prizes.length > 0 ? <PrizeColumn prizes={prizes} totalPrize={totalPrize} mysteryBounty={g.config?.mysteryBounty ?? 0} /> : <span className="clk-wide-land" />}

            {/* 중앙 — 타이머 히어로 + 블라인드. **스택 전체를 중앙 정렬**한다.
                예전엔 히어로가 flex-1 로 남는 공간을 다 먹어서 타이머와 CURRENT/NEXT 사이에
                죽은 띠가 생겼다(레퍼런스는 둘이 한 덩어리로 붙어 있다).
                ⚠ 그래도 계약은 유지된다: 블라인드 행이 **고정 높이(22cqmin)** 라 ANTE 유무와 무관하게
                   스택 총높이가 상수다 → 통째로 중앙 정렬해도 타이머 y 가 움직이지 않는다. */}
            <div className="relative flex min-h-0 flex-col items-center justify-center gap-[2.5cqmin]">
              {/* 2026-09-15 오너 지시 #12: 타이머·블라인드를 감싸던 이중 기하 프레임(NURI Aura Clock Frame)을 삭제했다.
                  "클락 중앙에 네모 테두리 있는데 이거 삭제" — 1920x1080 캡처로 이 요소임을 확인한 뒤 지웠다.
                  레이아웃 영향 0: 그 프레임은 `absolute inset-x-[7%] top-[13%] bottom-[14%]` 장식이라
                  형제(CenterPanel·BlindsRow)의 폭·높이를 전혀 먹지 않았다(삭제 전후 타이머 rect 동일 — 실측).
                  타이머 뒤 약한 radial bloom(CenterPanel 안)은 테두리가 아니라 남긴다. */}
              <CenterPanel g={g} />
              <div className="h-[22cqmin] w-full shrink-0">
                <BlindsRow g={g} />
              </div>
            </div>

            {/* 우 — 지표 세로 레일. 라벨 작게 위, 숫자 크게 아래(레퍼런스 공통 문법). */}
            <aside data-testid="clk-rails" className="clk-col min-h-0 flex-col justify-center gap-[1.5cqmin]">
              <Rail label="생존 / 엔트리" value={hasCounts ? String(ls?.alive ?? 0) : '—'} sub={hasCounts ? `/ ${ls?.entries ?? 0}` : undefined} lead />
              {/* 리바이 · 애드온 · 얼리 — **한 줄 안에서** 각자 라벨과 숫자를 갖는다.
                  줄을 세 개로 늘리지 않는 이유: 이 열은 세로로 꽉 차 있어 줄이 늘면 clamp 가 글자를 줄이고,
                  그러면 10m 거리에서 가장 중요한 '생존 / 엔트리'까지 같이 작아진다(바로 아래 2026-09-11 주석의 그 사고).
                  한 줄에 묶어도 각 값은 제 라벨을 갖고 숫자 크기는 일반 Rail 과 같은 급이다. */}
              {extras.length > 0 && <GroupRail items={extras} />}
              {buyIn > 0 && <Rail label="바이인" value={buyIn.toLocaleString()} />}
              {/* 2026-09-11: 총 칩·평균 스택은 **하단 레일**로 내렸다(아래 BottomMetrics).
                  우측 열에 7줄이 몰려 글자가 작아지는 동안 화면 하단 중앙이 통째로 비어 있었다 —
                  레퍼런스 보드처럼 '칩 경제'는 아래 가로줄, '사람 수'는 오른쪽 세로줄로 나눈다. */}
              {/* 초당 갱신이 필요한 줄은 별도 컴포넌트에 가둔다 — 여기서 틱을 돌리면 화면 전체가 매초 다시 그려진다 */}
              <TimeRails g={g} regLevel={regLevel} />
            </aside>
          </div>

          {/* ── 하단 — QR · 스폰서 · Powered by. 지표가 우측 열로 올라가서 이 줄은 보조만 남는다. ── */}
          {/* 12cqmin: 하단이 이제 보조가 아니라 **지표 레일**이다(총 칩·평균 스택·다음 휴식).
              8cqmin 이면 clamp 대형 숫자가 눌려 잘린다 — 실측 후 올린 값이다. */}
          <div className="flex h-[12cqmin] shrink-0 items-center gap-[2cqmin] border-t border-white/[0.07] px-[3cqmin]">
            {qr ? (
              <div className="flex min-w-0 items-center gap-[1cqmin]">
                <img src={qr} alt="참가 바인요청 QR" className="shrink-0 rounded-[0.6cqmin] bg-white" style={{ width: 'clamp(34px, 5cqmin, 78px)', height: 'auto' }} />
                <div className="min-w-0">
                  <p className={`${LABEL} text-[1.2cqmin]`} style={SOFT}>바인 QR</p>
                  <p className="text-[1.3cqmin] leading-snug" style={DIM}>찍으면 {gameLabel(g)} 바인 요청</p>
                </div>
              </div>
            ) : <span />}
            {/* 하단 중앙 — 칩 경제 3종. QR(좌)·스폰서(우) 사이의 빈 폭을 실제 정보로 채운다. */}
            <BottomMetrics g={g} curBB={curBB} />
            <div className="flex shrink-0 items-center gap-[2cqmin]">
              {sponsor && <img src={sponsor} alt="스폰서" className="w-auto object-contain opacity-80" style={{ maxHeight: adSize === 'lg' ? '9cqmin' : adSize === 'md' ? '7.2cqmin' : '5.5cqmin' }} />}
              {/* 세로 화면에서는 접는다 — 장식이 총 칩·평균 스택의 폭을 뺏으면 숫자가 줄바꿈된다 */}
              <p className="clk-land-only shrink-0 text-[1.2cqmin] font-extrabold uppercase tracking-[0.18em]" style={DIM}>
                Powered by <span style={{ color: 'var(--clk-accent, #818CF8)' }}>NURI HOLDEM</span>
              </p>
            </div>
          </div>

          {/* 모바일 폭(세로 폰 관전) — 우측 보조가 숨으니 레지·휴식만 아래에 한 줄 */}
          <div className="clk-narrow-only shrink-0 grid-cols-2 gap-[1.2cqmin] border-t border-white/[0.06] px-[3cqmin] py-[1.4cqmin]">
            <HeaderTimes g={g} regLevel={regLevel} compact />
          </div>
    </>
  );
}

/** 한 장이 머무는 시간. 두 경계에 끼어 있다 — 실측으로 7초를 골람다.
 *  · 위: 멀티게임 자동 순환이 15초다(ClockDisplay.tsx:146). 2장짜리(21~40등) 대회에서 한 게임이
 *    송출되는 동안 두 장이 다 보이려면 `2 × (머무름 + 전환) ≤ 15,000` → 머무름 ≤ 7,100ms.
 *  · 아래: 20줄을 눈으로 훑는 데 필요한 시간. 자기 등수를 찾는 읽기라 줄당 0.3초 ≈ 6초가 바닥이다.
 *  7,000 + 400 = 7,400 → 2장 14.8초(15초 안) · 200등(10장) 한 바퀴 74초. */
const PRIZE_PAGE_MS = 7_000;
/** 가로 전환 시간. 짧고 단호하게 — 글자가 흐르는 동안은 읽을 수 없으니 머무름(7초)에 비해 무시할 만해야 한다. */
const PRIZE_SLIDE_MS = 400;

/**
 * PrizeColumn — 총 프라이즈 + 순위별 표. 한 장 **20줄(좌단 1~10 · 우단 11~20)**, 넘으면 **옆으로 밀린다**.
 *
 * 왜 잘라내지 않나: 종전에는 `prizes.slice(0, 12)` 라 13등부터는 TV 에 **영원히 안 나왔다**.
 *   상금 구조를 200등까지 잡은 대회에서 참가자가 "내 등수는 얼마인가"를 확인할 방법이 화면에 없었다.
 *   자르는 것은 '안 보이는 것'이고 넘기는 것은 '늦게 보이는 것'이라 정보 손실이 다르다.
 *
 * 2026-09-15 오너 지시 #13 — 세로 교체를 **가로 슬라이드**로 바꾸고 한 장을 20줄로 늘렸다.
 *   ① 모든 장을 가로로 늘어놓고 트랙을 translateX 로 민다 → 장마다 높이가 흔들리지 않는다
 *      (예전의 빈 줄 채우기 pad 가 필요 없어졌다 — 가장 긴 장이 높이를 정한다).
 *   ② **2단 × 10줄**이라 20줄을 넣고도 글자를 거의 안 줄인다. 1단 20줄은 세로가 195px 모자라
 *      글자를 17% 줄여야 했는데, 이 열은 폭 401px 중 잉크가 150px 뿐이라 **가로가 놀고 있었다**.
 *   ③ 규격은 `pickPrizeLayout` 이 **상금 자릿수·등수 자릿수로 계산해서** 고른다(prizeFit.ts).
 *      어떤 규격으로도 2단이 안 되면 **1단 20줄로 떨어진다** — 잘림은 구조적으로 나오지 않는다.
 *
 * ⚠ 읽는 순서는 **위→아래, 좌→우**다(좌단 1~10등 · 우단 11~20등). 좌우로 번갈아 가면 안 된다.
 * ⚠ 접근성: `motion-reduce:transition-none` — 모션을 줄인 환경에서는 **즉시** 전환된다.
 *   멈추지는 않는다. 멈추면 21등 아래가 그 기기에서 영영 안 보여 기능 소실이 되기 때문이다.
 *
 * 초당 틱이 아니라 7초 인터벌이고, 장이 하나면 인터벌 자체를 걸지 않는다(언마운트·장 수 변화에서 정리).
 */
function PrizeColumn({ prizes, totalPrize, mysteryBounty }: { prizes: PrizeRow[]; totalPrize: number; mysteryBounty: number }) {
  const pages = Math.ceil(prizes.length / PRIZES_PER_PAGE);
  const [page, setPage] = useState(0);
  useEffect(() => {
    if (pages <= 1) { setPage(0); return; }
    const t = setInterval(() => setPage((p) => (p + 1) % pages), PRIZE_PAGE_MS);
    return () => clearInterval(t);
  }, [pages]);
  // 표가 짧아져 장 수가 줄면 현재 장이 범위를 벗어난다 — 빈 화면 대신 첫 장으로.
  const cur = Math.min(page, pages - 1);
  const { spec, twoCol } = pickPrizeLayout(prizes);
  const sheets = Array.from({ length: pages }, (_, i) => prizes.slice(i * PRIZES_PER_PAGE, (i + 1) * PRIZES_PER_PAGE));
  const cq = (n: number) => `${n}cqmin`;

  /** 한 단. `from` 은 전체 표에서의 시작 번호 — 1등 줄(큰 글자)을 그것으로 판정한다. */
  const column = (rows: PrizeRow[], from: number, hidden: boolean) => (
    <ul className={twoCol ? 'min-w-0 flex-1' : 'w-full'} aria-hidden={hidden ? true : undefined}>
      {rows.map((p, i) => {
        // 1등만 한 단계 크게 — **전체 1등**이지 '이 단의 첫 줄'이 아니다(우단 11등이 커지면 거짓말이 된다).
        const lead = from + i === 0;
        return (
          // min-h 로 줄 높이를 고정한다 — 1등만 글자가 큰데, 그 줄이 있는 장과 없는 장의 높이가
          //   달라지면 세로 중앙 정렬 때문에 장이 바뀔 때마다 총액이 위아래로 튄다(실측 3.7px).
          <li key={from + i} className="flex items-baseline justify-between gap-[1.2cqmin] leading-tight"
            style={{ minHeight: cq(spec.minH), marginTop: i === 0 ? undefined : cq(spec.gap) }}>
            <span className="shrink-0 font-bold tabular-nums" style={{ fontSize: cq(lead ? spec.leadPlace : spec.place), ...DIM }}>
              {prizePlaceText(p.place)}
            </span>
            <span className="font-extrabold tabular-nums"
              style={{ fontSize: cq(lead ? spec.leadAmount : spec.amount), color: 'var(--clk-prize, #F5C451)' }}>
              {p.amount.toLocaleString()}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <aside data-testid="clk-prizes" className="clk-col min-h-0 flex-col justify-center">
      <p className={`${LABEL} text-[1.5cqmin]`} style={SOFT}>총 프라이즈</p>
      <p className="mt-[0.3cqmin] font-black leading-none tabular-nums"
        style={{ fontSize: 'clamp(22px, 4.6cqmin, 76px)', color: 'var(--clk-prize, #F5C451)' }}>
        {totalPrize.toLocaleString()}
      </p>
      {/* 가로 뷰포트 — 트랙이 여기서 잘린다. 세로는 자르지 않는다(잘리면 줄이 반만 보인다). */}
      <div className="mt-[1.4cqmin] overflow-x-hidden border-t border-white/[0.08] pt-[1.2cqmin]">
        <div data-testid="clk-prize-track" className="flex transition-transform ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${cur * 100}%)`, transitionDuration: `${PRIZE_SLIDE_MS}ms` }}>
          {sheets.map((rows, pi) => {
            const from = pi * PRIZES_PER_PAGE;
            const hidden = pi !== cur;
            return (
              // 장 한 벌. e2e 는 `[data-prize-sheet]:not([aria-hidden])` 로 **보이는 장**을 잡는다.
              <div key={pi} data-prize-sheet={pi} aria-hidden={hidden ? true : undefined}
                className="w-full shrink-0" style={twoCol ? { display: 'flex', gap: cq(PRIZE_GUTTER_CQ) } : undefined}>
                {twoCol
                  ? (<>
                      {column(rows.slice(0, PRIZE_LEFT_ROWS), from, hidden)}
                      {column(rows.slice(PRIZE_LEFT_ROWS), from + PRIZE_LEFT_ROWS, hidden)}
                    </>)
                  : column(rows, from, hidden)}
              </div>
            );
          })}
        </div>
      </div>
      {/* 미스터리 바운티 — 03cd8bb 에서 옛 보드가 사라지며 **함께 사라졌던** 값이다.
          설정 입력란(TournamentClock)은 그대로 남아 있어서, 없으면 '써도 아무 데도 안 나오는 죽은 컨트롤' 이 된다. */}
      {mysteryBounty > 0 && (
        <div data-testid="clk-mystery" className="mt-[1.2cqmin] border-t border-white/[0.08] pt-[1cqmin]">
          <p className={`${LABEL} text-[1.4cqmin]`} style={SOFT}>미스터리 바운티</p>
          <p className="mt-[0.2cqmin] font-extrabold leading-none tabular-nums text-white" style={{ fontSize: 'clamp(16px, 2.6cqmin, 44px)' }}>
            {mysteryBounty.toLocaleString()}
          </p>
        </div>
      )}
      {pages > 1 && (
        <p data-testid="clk-prize-page" className="mt-[1cqmin] text-right text-[1.5cqmin] font-bold tabular-nums" style={DIM}>
          {cur + 1} / {pages}
        </p>
      )}
    </aside>
  );
}

/**
 * StatusPills — LEVEL 과 진행 상태만. 상태 바에서 알약을 쓰는 유일한 곳이다.
 * 초당 갱신이 필요 없다(레벨·running 은 g 가 바뀔 때만 변한다) — 부모 리렌더에 얹혀간다.
 * ⚠ '일시정지'를 여기에 둔 이유: 예전엔 타이머 **아래**에 붙어서, 일시정지 상태가 되면
 *    중앙 블록이 길어지고 세로 중앙 정렬 때문에 타이머가 30px 위로 올라갔다(실측).
 */
function StatusPills({ g }: { g: ClockState }) {
  const lvls = g.config?.levels ?? [];
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  const isBreak = lv?.kind === 'break';
  // 2026-09-11: 운영자·리모컨과 **같은 파생**을 쓴다(lib/clockLevel.clockPhase).
  //   예전엔 `g.running ? 'RUNNING' : 'PAUSED'` 라, 아직 시작 안 한 클락이 TV 에 'PAUSED'(일시정지)로 떴다.
  //   이제 시작 전은 READY(중립 회색) — 진행(emerald)·브레이크(sky)·일시정지(amber)와 색으로도 갈린다.
  const phase = clockPhase(g);
  const state = CLOCK_PHASE_TV[phase];
  const tone = phase === 'break'
    ? { color: '#7dd3fc', bg: 'rgba(125,211,252,0.14)', bd: 'rgba(125,211,252,0.45)' }
    : phase === 'running'
      ? { color: '#6ee7b7', bg: 'rgba(110,231,183,0.12)', bd: 'rgba(110,231,183,0.40)' }
      : phase === 'paused'
        ? { color: '#fbbf24', bg: 'rgba(251,191,36,0.14)', bd: 'rgba(251,191,36,0.45)' }
        : { color: 'rgba(255,255,255,0.62)', bg: 'rgba(255,255,255,0.07)', bd: 'rgba(255,255,255,0.22)' };
  return (
    <div className="flex shrink-0 items-center gap-[1.2cqmin]">
      <span data-testid="clk-level" className="rounded-full border px-[2.2cqmin] py-[0.6cqmin] text-[2.1cqmin] font-extrabold tracking-[0.14em]"
        style={{
          color: 'var(--clk-accent, #818CF8)',
          borderColor: 'color-mix(in srgb, var(--clk-accent, #818CF8) 55%, transparent)',
          background: 'color-mix(in srgb, var(--clk-accent, #818CF8) 14%, transparent)',
        }}>
        {isBreak ? '휴식' : `레벨 ${levelNumberAt(lvls, eff.index)}`}
      </span>
      <span className="rounded-full border px-[1.8cqmin] py-[0.6cqmin] text-[1.8cqmin] font-extrabold tracking-[0.16em]"
        style={{ color: tone.color, background: tone.bg, borderColor: tone.bd }}>
        {state}
      </span>
    </div>
  );
}

/**
 * RunningTime — 총 진행 시간. 상태 바 우측(레퍼런스 두 종 모두 이 자리에 둔다).
 * 초당 틱은 이 컴포넌트 안에만 — 부모(화면 전체) 리렌더 0.
 */
function RunningTime({ g }: { g: ClockState }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const eff = effectiveLevel(g);
  const run = elapsedMs(g, eff.index, eff.remainingMs);
  return (
    <p className="clk-wide-only shrink-0 text-right">
      <span className={`${LABEL} block text-[1.3cqmin]`} style={DIM}>총 진행</span>
      <span className="text-[2.1cqmin] font-extrabold tabular-nums text-white">{hms(run)}</span>
    </p>
  );
}

/**
 * TimeRails — 등록 마감 · 다음 휴식. 지표 열의 마지막 두 줄.
 * ⚠ 예전엔 이 둘이 상태 바에서 자리를 다퉈 **하나만** 보였다(둘 다 띄우면 상태 바가 정보 나열이 된다).
 *   지표 레일로 내리면 둘 다 자기 자리를 갖는다 — 등록 마감은 레벨 번호까지 함께(레퍼런스 REG CLOSE Lv16 문법).
 * 초당 틱은 여기 안에만.
 */
function TimeRails({ g, regLevel }: { g: ClockState; regLevel: number }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const eff = effectiveLevel(g);
  const reg = regLevel > 0 ? msToRegClose(g, eff.index, eff.remainingMs) : null;
  // 다음 휴식은 하단 레일(BottomMetrics)로 옮겼다 — 여기서는 등록 마감만 남는다.
  return (
    <>
      {reg !== null && (
        <Rail label="등록 마감" value={reg === 0 ? '마감' : hms(reg)} sub={reg === 0 ? undefined : `Lv ${regLevel}`} danger={reg === 0} />
      )}
    </>
  );
}

/**
 * BottomMetrics — 화면 하단 가로 지표 레일(총 칩 · 평균 스택 · 다음 휴식).
 *
 * 왜 아래인가: 이 셋은 '지금 이 판의 칩 경제'라 한 줄에 나란히 놓으면 비교가 된다.
 * 우측 세로 레일에 같이 두면 7줄이 되어 글자가 작아지고, 정작 화면 하단은 QR·스폰서만 남아 비었다.
 * 다음 휴식만 초당 갱신이라 이 컴포넌트에 틱을 가둔다 — 보드 전체를 매초 다시 그리지 않는다.
 */
function BottomMetrics({ g, curBB }: { g: ClockState; curBB: number }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const ls = g.liveStats;
  const eff = effectiveLevel(g);
  const brk = msToNextBreak(g, eff.index, eff.remainingMs);
  /** 값 없음(—)과 실제 0 을 구분한다 — 장부가 아직 안 붙은 클락에서 '총 칩 0' 은 거짓이다. */
  const num = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString());
  // whitespace-nowrap + 낮춘 clamp: 세로 화면(1080×1920)에서 cqmin 이 폭 기준이라 4.2cqmin=45px 가 되고,
  //   'QR + 3칸 + Powered by' 가 1080px 를 넘겨 **숫자가 두 줄로 쪼개졌다**(1,512,0 / 00 실측).
  //   숫자는 어떤 폭에서도 한 줄이어야 한다 — 줄이 바뀌면 자릿수를 잘못 읽는다.
  const cell = (label: string, value: string, sub?: string, tone?: string) => (
    <div className="min-w-0 text-center">
      <p className={`${LABEL} text-[1.3cqmin]`} style={SOFT}>{label}</p>
      <p className="mt-[0.2cqmin] whitespace-nowrap leading-none">
        <span className="font-extrabold tabular-nums" style={{ fontSize: 'clamp(18px, 3.4cqmin, 70px)', color: tone ?? '#FFFFFF' }}>{value}</span>
        {sub && <span className="ml-[0.8cqmin] text-[1.7cqmin] font-semibold tabular-nums" style={DIM}>{sub}</span>}
      </p>
    </div>
  );
  return (
    <div className="clk-metrics flex min-w-0 flex-1 items-center justify-center gap-[2.5cqmin]">
      {cell('총 칩', num(ls?.totalStack))}
      {cell('평균 스택', num(ls?.avgStack), ls?.avgStack && curBB > 0 ? `${Math.round(ls.avgStack / curBB)} BB` : undefined)}
      {/* 휴식이 없는 구성이면 칸을 만들지 않는다 — 빈 '—' 로 자리를 채우지 않는다 */}
      {brk !== null && cell('다음 휴식', hms(brk), undefined, 'var(--clk-timer-break, #7dd3fc)')}
    </div>
  );
}

/**
 * HeaderTimes — 레지 마감 · 휴식까지 중 **지금 더 중요한 하나**만 상태 바 우측에 둔다.
 * (둘 다 띄우면 상태 바가 정보 나열이 된다 — 우선순위: 등록 마감이 남아 있으면 그것, 아니면 다음 휴식.)
 * 초당 틱은 여기 안에만(부모 리렌더 0). compact = 모바일 폭 하단 한 줄.
 */
function HeaderTimes({ g, regLevel, compact }: { g: ClockState; regLevel: number; compact?: boolean }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const eff = effectiveLevel(g);
  const reg = regLevel > 0 ? msToRegClose(g, eff.index, eff.remainingMs) : null;
  const brk = msToNextBreak(g, eff.index, eff.remainingMs);
  const regText = reg === null ? null : reg === 0 ? '마감' : `Lv ${regLevel} · ${hms(reg)}`;
  if (compact) {
    return (
      <>
        <MiniStat label="레지 마감" value={regText ?? '—'} tone={reg === 0 ? 'rose' : undefined} />
        <MiniStat label="휴식까지" value={brk === null ? '—' : hms(brk)} tone={brk === null ? undefined : 'rose'} />
      </>
    );
  }
  // 등록 마감이 아직 남아 있으면 그게 더 급하다. 마감됐거나 없으면 다음 휴식을 보여준다.
  const show: { label: string; text: string; urgent: boolean } | null =
    regText !== null && reg !== 0 ? { label: '등록 마감', text: regText, urgent: false }
      : brk !== null ? { label: '다음 휴식', text: hms(brk), urgent: false }
        : regText !== null ? { label: '등록', text: regText, urgent: true }
          : null;
  if (!show) return null;
  return (
    <p className="clk-wide-only shrink-0 text-right">
      <span className={`${LABEL} block text-[1.3cqmin]`} style={DIM}>{show.label}</span>
      <span className={`text-[2.1cqmin] font-extrabold tabular-nums ${show.urgent ? 'text-rose-400' : 'text-white'}`}>{show.text}</span>
    </p>
  );
}

/** 진행률 레일 세그먼트 수 — 전광판 느낌을 내되 TV 거리에서 셀 수 있는 정도. */
const RAIL_SEGMENTS = 24;

/**
 * CenterPanel — 대형 타이머 + 진행률 레일. 초당 setInterval 틱을 이 안에 가둔다
 * (1분 방치 → 타이머 노드 외 리렌더 0회). memo: g 참조가 같으면 건너뛴다.
 * data-testid clk-timer 는 e2e 앵커 — 문구를 바꿔도 이 id 는 유지한다.
 */
const CenterPanel = memo(function CenterPanel({ g }: { g: ClockState }) {
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const lvls = g.config?.levels ?? [];
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  const isBreak = lv?.kind === 'break';
  const remaining = Math.max(0, eff.remainingMs);
  const urgent = !!g.running && remaining <= 60_000 && !isBreak;
  const totalMs = Math.max(1, (lv?.minutes ?? 0) * 60_000);
  const donePct = Math.min(1, Math.max(0, 1 - remaining / totalMs));
  const filled = Math.round(donePct * RAIL_SEGMENTS);
  const timerColor = urgent ? 'var(--clk-timer-urgent, #fb7185)' : isBreak ? 'var(--clk-timer-break, #7dd3fc)' : 'var(--clk-timer, #FFFFFF)';

  return (
    <div className="relative flex w-full flex-col items-center">
      {/* 타이머 뒤 아주 약한 radial bloom **한 겹**. 글자 자체에 네온 외곽선을 두르지 않는다. */}
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[46cqmin] w-[76cqmin] -translate-x-1/2 -translate-y-1/2"
        style={{ background: 'radial-gradient(closest-side, color-mix(in srgb, var(--clk-accent, #818CF8) 16%, transparent), transparent)' }} />

      <p data-testid="clk-timer" className="font-black leading-none tabular-nums"
        style={{ fontSize: 'clamp(84px, 26cqmin, 400px)', letterSpacing: '0.005em', color: timerColor }}>
        {mmss(remaining)}
      </p>

      {/* 진행률 레일 — 지나간 구간 accent, 남은 구간 흰색 7%. 마지막 60초엔 danger.
          width 애니메이션이 아니라 세그먼트의 **색만** 바뀐다(레이아웃 0). reduced-motion 에서도 동일하다. */}
      <div className="mt-[2.4cqmin] flex w-[72cqmin] max-w-full gap-[0.5cqmin]" role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(donePct * 100)} aria-label="현재 레벨 진행률">
        {Array.from({ length: RAIL_SEGMENTS }, (_, i) => (
          <span key={i} className="h-[1.1cqmin] flex-1 rounded-[0.3cqmin]"
            style={{
              background: i < filled
                ? (urgent ? 'var(--clk-timer-urgent, #fb7185)' : isBreak ? 'var(--clk-timer-break, #7dd3fc)' : 'var(--clk-accent, #818CF8)')
                : 'rgba(255,255,255,0.07)',
            }} />
        ))}
      </div>
    </div>
  );
});

/**
 * BlindsRow — CURRENT | NEXT 좌우 대칭. CURRENT 는 밝고 크게, NEXT 는 한 단계 어둡고 작게.
 * 굵은 테두리로 나누지 않고 **여백과 미세한 surface 차이**로 구분한다.
 * 이 행은 부모가 고정 높이를 주고 여기서 세로 중앙 정렬한다 — ANTE 유무가 위 타이머를 밀지 않는다.
 * 브레이크 중에는 CURRENT 자리에 BREAK 를, NEXT 자리에 다음 레벨을 둔다.
 */
const BlindsRow = memo(function BlindsRow({ g }: { g: ClockState }) {
  const lvls = g.config?.levels ?? [];
  const eff = effectiveLevel(g);
  const lv = lvls[eff.index];
  const isBreak = lv?.kind === 'break';
  const next = (() => { for (let i = eff.index + 1; i < lvls.length; i++) if (lvls[i].kind === 'level') return lvls[i]; return null; })();
  const num = (n: number) => n.toLocaleString();
  // 글자 크기를 **칸 폭에도** 묶는다(2026-09-13 검증자 실측 — 폰트 ON 에서 15,000/30,000 이 1920×1080 에서 NEXT 와 8px 겹치고
  //   프라이즈 열을 30px 침범, 200K/400K 는 99px 겹침·세로 TV 68px 잘림. 폴백 폰트에서도 6자리는 24px 겹치던 기존 결함).
  //   cqmin 만으로는 '높이'에만 묶여 자릿수가 늘면 폭을 넘는다. 폭 식은 index.css 의 --clk-half(레이아웃별 반쪽 칸 폭, cq 단위)다.
  //   자릿수→em 폭은 실제 보드 DOM 에서 잰 값(scratchpad glyph-metrics, Pretendard Variable 800 tabular): 숫자 0.668em · 쉼표 0.2915em ·
  //   '/'(0.5em 글리프) ≈0.19em, 그 좌우 여백 mx-[0.6cqmin] 은 em 이 아니라 cqmin 항(1.2cqmin). 폴백 폰트는 더 좁아(0.58em) 같은 식으로 안전.
  //   font ≤ (칸 폭 − 좌우 패딩 4cqmin − '/' 여백 1.2cqmin) / em. 4자리(500/1,000)는 어느 뷰포트에서든 이 상한이 7.2cqmin 보다 커서 그대로다
  //   (1920: 84px > 77.8 · 1080 세로: 85 > 77 · 3440: 160 > 104) — 줄어드는 것은 실제로 넘치던 5~6자리뿐이다. 하한 26px/20px 은 유지.
  const emOf = (a: number, b: number) => {
    const s = num(a) + num(b);
    const digits = s.replace(/\D/g, '').length;
    const commas = s.length - digits;
    return 0.668 * digits + 0.2915 * commas + 0.19;
  };
  const fit = (em: number) => `calc((var(--clk-half, 50cqw) - 5.2cqmin) / ${em.toFixed(3)})`;
  /** 자릿수에 맞춘 크기 — **하한도 fit 을 넘지 못하게** 묶는다.
   *  ⚠ 2026-09-14 실측: 옛 식의 26px 하한이 fit 을 덮어썼다.
   *    운영자 화면의 16:9 미리보기는 스테이지가 570px 뿐이라 `--clk-half`=146px 인데
   *    5자리(20,000/40,000)는 7.45em x 26px = 194px -> CURRENT 와 NEXT 가 22px 겹쳤고,
   *    10만대는 53px(우측 레일 침범), 80만대는 75px, 375 에서는 135px 로 통째로 포개졌다.
   *    TV(1920x1080 / 1080x1920)는 fit 이 커서 하한이 그대로라 **송출 렌더는 픽셀 불변**이다.
   *  min(하한, fit) 이라 좁아질 때만 하한이 따라 내려온다. */
  const fitted = (floor: string, pref: string, ceil: string, em: number) => {
    const f = fit(em);
    return `clamp(min(${floor}, ${f}), min(${pref}, ${f}), ${ceil})`;
  };
  return (
    <div className="grid h-full grid-cols-2 items-center gap-[2cqmin]">
      {/* CURRENT */}
      {/* 2026-09-11 오너 지적 — 카드 배경을 뺐다. 중앙 Aura 프레임(둥근 사각)이 들어오면서
          이 박스의 모서리와 프레임 선이 겹쳐 '사각 안의 사각'이 됐다. 레퍼런스 보드도 블라인드를
          맨 텍스트로 두고(§8 "불필요한 카드 박스가 없는 넓은 TV 레이아웃") 구분은 크기·색으로만 한다.
          가운데 세로 헤어라인 하나로 CURRENT|NEXT 를 가른다 — 면이 아니라 선이라 프레임과 싸우지 않는다. */}
      <div className="flex h-full flex-col items-center justify-center border-r border-white/[0.07] px-[2cqmin]">
        <p className={`${LABEL} text-[1.5cqmin]`} style={SOFT}>{isBreak ? 'BREAK' : 'CURRENT'}</p>
        {isBreak ? (
          <p className="mt-[0.8cqmin] font-extrabold leading-none" style={{ fontSize: 'clamp(24px, 6.4cqmin, 108px)', color: 'var(--clk-timer-break, #7dd3fc)' }}>
            {lv?.label || '휴식 시간'}
          </p>
        ) : (
          <>
            {/* whitespace-nowrap: 자릿수가 커져도 줄바꿈되지 않는다. '/' 는 숫자보다 작게. */}
            <p className="mt-[0.6cqmin] whitespace-nowrap font-extrabold leading-none tabular-nums"
              style={{ fontSize: fitted('26px', '7.2cqmin', '128px', lv ? emOf(lv.sb, lv.bb) : 1), color: 'var(--clk-accent, #818CF8)' }}>
              {lv ? <>{num(lv.sb)}<span className="mx-[0.6cqmin] align-middle text-[0.5em] text-white/30">/</span>{num(lv.bb)}</> : '-'}
            </p>
            {/* ANTE 가 없으면 이 줄 자체를 그리지 않는다(빈 행을 남기지 않는다).
                행 높이는 부모가 고정하므로 이 줄의 유무가 타이머를 밀지 않는다. */}
            {lv && lv.ante > 0 && (
              <p className="mt-[0.8cqmin] flex items-baseline gap-[1cqmin] leading-none">
                <span className="text-[1.7cqmin] font-bold uppercase tracking-[0.18em]" style={DIM}>Ante</span>
                <span className="font-extrabold tabular-nums text-white" style={{ fontSize: 'clamp(16px, 3.4cqmin, 60px)' }}>{num(lv.ante)}</span>
              </p>
            )}
          </>
        )}
      </div>

      {/* NEXT — 한 단계 어둡고 작게 */}
      <div className="flex h-full flex-col items-center justify-center px-[2cqmin]">
        <p className={`${LABEL} text-[1.5cqmin]`} style={DIM}>NEXT</p>
        {next ? (
          <>
            <p className="mt-[0.6cqmin] whitespace-nowrap font-extrabold leading-none tabular-nums text-white/75"
              style={{ fontSize: fitted('20px', '5.4cqmin', '96px', emOf(next.sb, next.bb)) }}>
              {num(next.sb)}<span className="mx-[0.6cqmin] align-middle text-[0.5em] text-white/25">/</span>{num(next.bb)}
            </p>
            {next.ante > 0 && (
              <p className="mt-[0.8cqmin] flex items-baseline gap-[1cqmin] leading-none">
                <span className="text-[1.7cqmin] font-bold uppercase tracking-[0.18em]" style={DIM}>Ante</span>
                <span className="font-extrabold tabular-nums text-white/70" style={{ fontSize: 'clamp(14px, 2.8cqmin, 48px)' }}>{num(next.ante)}</span>
              </p>
            )}
          </>
        ) : (
          <p className="mt-[0.6cqmin] text-[2.4cqmin] font-bold" style={DIM}>마지막 레벨</p>
        )}
      </div>
    </div>
  );
});

/**
 * Rail — 우측 지표 열의 한 칸. 라벨(작고 흐리게) 위 / 숫자(밝게) 아래.
 * 레퍼런스 두 종이 공통으로 쓰는 문법이다 — 가로로 눌러 담으면 라벨과 숫자가 같은 줄에서 경쟁해
 * 먼 거리에서 숫자만 남고 무엇의 숫자인지가 사라진다.
 */
function Rail({ label, value, sub, lead, danger }: { label: string; value: string; sub?: string; lead?: boolean; danger?: boolean }) {
  return (
    <div className="min-w-0 border-b border-white/[0.07] pb-[1.1cqmin] last:border-b-0">
      <p className={`${LABEL} text-[1.5cqmin]`} style={SOFT}>{label}</p>
      <p className="mt-[0.2cqmin] flex items-baseline gap-[0.6cqmin] leading-none">
        <span className="font-extrabold tabular-nums"
          style={{ fontSize: lead ? 'clamp(24px, 5.4cqmin, 92px)' : 'clamp(18px, 3.6cqmin, 60px)',
                   color: danger ? 'var(--clk-timer-urgent, #fb7185)' : '#FFFFFF' }}>{value}</span>
        {sub && <span className="text-[1.9cqmin] font-semibold tabular-nums" style={DIM}>{sub}</span>}
      </p>
    </div>
  );
}

/** 한 줄에 2~3개 지표를 나란히 — 각자 라벨 + 숫자. 줄 수를 늘리지 않고 항목을 늘리는 자리.
 *  숫자 크기는 일반 Rail(3.6cqmin)에서 항목 수만큼만 줄인다(2개=3.2 / 3개=2.8) — 라벨은 그대로라 읽는 법이 같다. */
function GroupRail({ items }: { items: { k: string; label: string; v: number }[] }) {
  const size = items.length >= 3 ? '2.8cqmin' : items.length === 2 ? '3.2cqmin' : '3.6cqmin';
  return (
    <div className="min-w-0 border-b border-white/[0.07] pb-[1.1cqmin] last:border-b-0">
      <div className="flex items-end gap-[1.6cqmin]">
        {items.map((it) => (
          <div key={it.k} className="min-w-0 flex-1">
            <p className={`${LABEL} text-[1.35cqmin]`} style={SOFT}>{it.label}</p>
            <p className="mt-[0.2cqmin] font-extrabold tabular-nums leading-none text-white"
               style={{ fontSize: `clamp(15px, ${size}, 48px)` }}>{it.v.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'rose' }) {
  return (
    <div className="text-center">
      <p className={`${LABEL} text-[1.4cqmin]`} style={DIM}>{label}</p>
      <p className={`mt-[0.4cqmin] font-extrabold tabular-nums leading-none ${tone === 'rose' ? 'text-rose-400' : 'text-white'}`} style={{ fontSize: 'clamp(16px, 3.2cqmin, 48px)' }}>{value}</p>
    </div>
  );
}
