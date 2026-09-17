// 탭바에 있는 탭인데 **청크를 안 데워 두는 것** 재발 방지 계약 (2026-09-17)
//
// 무엇을 막는가
//   App.tsx 는 idle 에 ① 탭 청크를 `import()` 로 데우고(`warm()`) ② 핵심 탭을 숨김 마운트한다(`seq`).
//   둘 다에 등록된 탭은 사용자가 처음 눌러도 **재방문 경로**(스냅샷 뒤 flushSync)로 들어가 즉시 바뀐다.
//   목록에서 빠진 탭만 클릭 순간에 청크를 처음 받으므로, 그 왕복 동안 **화면이 그대로 멈춘다.**
//
// 실측 근거 (2026-09-17 · 라이브 프로덕션 nuriholdem.com · 390×844 · 로그아웃)
//   → 라이브   18ms   → 커뮤니티 21ms   → **캘린더(첫 진입) 261ms**   → 캘린더(재방문) 17ms
//   긴 작업 0개 · 최장 프레임 9ms 였다 — CPU 가 버벅인 게 아니라 네트워크 대기였다.
//   같은 청크가 캐시에 있는 두 번째 방문은 17ms(transferSize 0) 였다. 청크 크기 27,084B(br 전송).
//   오너 리포트: "다른 메뉴에서 캘린더로 이동하는 경우 다른 메뉴 이동하는 것과 다르게 버벅임이 있다."
//
// 🔴 `lazyModalOpener.contract.test.ts` 의 "청크를 데워도 소용없다" 와 **모순이 아니다.** 조건이 다르다.
//   그쪽은 **트랜지션이 아닌 setState 로 여는 오버레이** 이야기다 — 그 경로는 lazy 첫 렌더에서 반드시
//   서스펜드하고 리액트가 폴백을 커밋해 ~300ms 를 붙잡으므로, 캐시가 있어도 증상이 남는다.
//   탭 전환은 `commitTab` 이 `startTabTransition`(= startTransition)으로 커밋한다 → **폴백을 커밋하지 않는다.**
//   그래서 탭에서는 남는 비용이 네트워크뿐이고, 데우면 실제로 사라진다(위 17ms 가 그 증거다).
//   👉 둘을 한 규칙으로 합치지 마라. "어떻게 여는가" 가 다르면 처방도 다르다.
//
// 이 검사가 못 보는 것
//   · 데운 뒤에도 남는 **마운트 비용**(컴포넌트가 무거우면 프리마운트가 그걸 idle 로 옮길 뿐이다).
//   · import 경로를 변수로 조립하는 경우(정적 문자열만 본다).
//   · 탭이 아닌 진입점(헤더 아이콘·모달) — 그건 위 lazyModalOpener 계약의 몫이다.
// 실행: npx vitest run src/components/tabChunkWarm.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/App.tsx', 'utf8');

/** 탭 id → 그 탭이 그리는 lazy 청크 모듈명.
 *  ⚠ 탭을 새로 만들면 **여기에 한 줄 추가**해야 한다 — 그게 이 계약의 목적이다.
 *  home·browse 는 정적 import(첫 화면)라 데울 대상이 아니다. market 은 커뮤니티 서브탭이다. */
const TAB_CHUNK: Record<string, string> = {
  live: 'LiveGamesTab',
  community: 'CommunityTab',
  tools: 'ToolsPanel',
  calendar: 'CalendarPanel',
  'my-store': 'VenueManageTab',
  admin: 'AdminTab',
};

/** idle 프리로드 블록(`const warm = () => {` ~ `]).then(`) 만 잘라 본다.
 *  파일 전체에서 찾으면 **상단의 lazyWithReload 선언**이 걸려 항상 통과한다(공허한 참). */
function warmBlock(): string {
  const start = SRC.indexOf('const warm = () => {');
  expect(start, 'App.tsx 의 warm() 블록을 못 찾았다 — 앵커가 바뀌었으면 이 계약을 같이 고쳐라').toBeGreaterThan(-1);
  const end = SRC.indexOf(']).then(', start);
  expect(end, 'warm() 의 끝(`]).then(`)을 못 찾았다').toBeGreaterThan(start);
  return SRC.slice(start, end);
}

/** 프리마운트 순서 배열(`const seq: TabId[] = [` ~ 그 문장의 `];`). */
function premountSeq(): string {
  const start = SRC.indexOf('const seq: TabId[] = [');
  expect(start, 'App.tsx 의 프리마운트 seq 를 못 찾았다').toBeGreaterThan(-1);
  const end = SRC.indexOf('];', start);
  return SRC.slice(start, end);
}

describe('탭 청크 프리워밍 계약', () => {
  it('탭바에 뜨는 모든 탭의 청크를 idle 에 데운다', () => {
    const warm = warmBlock();
    for (const [tab, chunk] of Object.entries(TAB_CHUNK)) {
      expect(
        warm.includes(`features/${chunk}'`),
        `탭 '${tab}' 의 청크(${chunk})가 warm() 목록에 없다 — 첫 진입에서 화면이 멈춘다(캘린더 실측 261ms)`,
      ).toBe(true);
    }
  });

  it('탭바에 뜨는 모든 탭을 idle 에 숨김 마운트한다', () => {
    const seq = premountSeq();
    for (const tab of Object.keys(TAB_CHUNK)) {
      expect(
        seq.includes(`'${tab}'`),
        `탭 '${tab}' 이 프리마운트 seq 에 없다 — 첫 진입만 VT 마스킹을 못 받는다`,
      ).toBe(true);
    }
  });

  it('역할 전용 청크는 게이트 뒤에 있다 — 손님에게 업주 스위트를 내려보내지 않는다', () => {
    const warm = warmBlock();
    // VenueManageTab·AdminTab 은 반드시 조건부 spread 안에 있어야 한다(무게 306KB+ · 155KB).
    for (const chunk of ['VenueManageTab', 'AdminTab']) {
      const i = warm.indexOf(`features/${chunk}'`);
      const line = warm.slice(warm.lastIndexOf('\n', i) + 1, i);
      expect(line.includes('...('), `${chunk} 가 무조건 프리로드되고 있다 — 역할 게이트가 사라졌다`).toBe(true);
    }
    // 캘린더는 반대 방향 게이트다 — 매장 보유자에겐 이 칸이 '내 매장'이라 캘린더 판 자체가 없다.
    const ci = warm.indexOf("features/CalendarPanel'");
    const cline = warm.slice(warm.lastIndexOf('\n', ci) + 1, ci);
    expect(cline.includes('...('), '캘린더가 업주·직원·관리자에게도 내려가고 있다').toBe(true);
  });
});
