// 2026-09-13 연결 감사 F3 · F5 — "한 화면이 스스로를 반박하지 않는다" 를 잠근다.
//
// 왜 소스 계약인가: 두 결함 모두 **App.tsx(4팀 공용 셸)의 배선**이 원인이고, 렌더 트리 테스트로는
//   auth·supabase·lazy 청크 때문에 세울 수 없다. 게다가 IS_MOCK 에서 `getRunningClocks` 는 `[]` 라
//   목 환경의 e2e 는 배지도 본문도 0 이라 **양쪽이 늘 일치**한다 — F5 를 원리적으로 못 잡는다.
//   그래서 §5-A/§5-B 가 쓴 것과 같은 결의 소스 계약으로 내린다.
//   ⚠ 이 파일의 한계는 §5-B 파일에 적힌 것과 같다: "문장이 있는가" 는 보지만 "도달하는가" 는 못 본다.
//     그래서 아래는 값이 **어디서 오는지**(같은 배열인지)와 **개수**를 함께 못박는다.
//
// 실행: npx vitest run src/components/features/homeLiveFreshness.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const APP = strip(readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf-8'));
const LIVE = strip(readFileSync(join(__dirname, 'LiveGamesTab.tsx'), 'utf-8'));

describe('🔴 F3 — 홈의 레지 판정이 memo 평가 시점에 얼어붙지 않는다', () => {
  it('buildRegInfoMap 이 now 를 **주입받는다** — 기본값 Date.now() 를 쓰면 memo 가 안 돌 때 그대로 언다', () => {
    expect(APP, 'regInfoBySchedule 이 세 번째 인자(now)를 넘기지 않는다')
      .toMatch(/const regInfoBySchedule = useMemo\(\(\) => buildRegInfoMap\(liveClocks, schedules, regNow\), \[liveClocks, schedules, regNow\]\);/);
  });

  it('🔴 그 now 가 실제로 갱신된다 — 상태로 들고 있지 않으면 memo 는 재실행될 이유가 없다', () => {
    expect(APP).toMatch(/const \[regNow, setRegNow\] = useState\(\(\) => Date\.now\(\)\);/);
  });

  // 틱 본문을 통째로 못박는다(§5-B 가 배운 것: '게이트 문장이 있는가' 로는 순서를 못 본다).
  const tickBody = (() => {
    const i = APP.indexOf('const [regNow, setRegNow]');
    return i > -1 ? APP.slice(i, i + 900) : '';
  })();

  it('🔴 홈에 **보이는 동안만** 돈다 — 다른 탭에서 도는 틱은 §5-A 게이트 위반이다', () => {
    expect(tickBody, "activeTab 게이트가 없다").toMatch(/if \(activeTab !== 'home'\) return;/);
  });

  it('🔴 숨은 탭에서는 틱이 아무 일도 하지 않는다 — 게이트가 먼저, bump 는 그 뒤다', () => {
    expect(tickBody, '순서가 뒤집히면 백그라운드에서 30초마다 App 전체가 재렌더된다')
      .toMatch(/setInterval\(\(\) => \{\s*\n\s*if \(document\.hidden\) return;\s*\n\s*bump\(\);\s*\n\s*\}, 30_000\);/);
  });

  it('🔴 게이트와 재동기화가 한 쌍이다 — 복귀 순간에 다시 읽지 않으면 숨어 있던 만큼 낡은 채로 보인다', () => {
    expect(tickBody, '복귀 리스너가 없다').toMatch(/document\.addEventListener\('visibilitychange', onShow\);/);
    expect(tickBody, '리스너를 정리하지 않는다').toMatch(/document\.removeEventListener\('visibilitychange', onShow\);/);
    expect(tickBody, 'clearInterval 이 없다 — 탭을 오갈 때마다 타이머가 쌓인다').toMatch(/clearInterval\(t\);/);
  });

  it('🔴 스케줄에 절대 마감시각을 박는 방식으로 가지 않았다 — 일시정지 클락은 벽시계로 깎이면 안 된다', () => {
    // 판정은 여전히 클락(effectiveLevel)이 한다. 홈이 자체 마감시각을 계산해 들고 있으면 그 순간
    // 정지된 대회를 벽시계로 깎게 된다(회귀 본체는 src/lib/regStatus.test.ts 의 F3 describe).
    const home = strip(readFileSync(join(__dirname, 'HomeTab.tsx'), 'utf-8'));
    expect(home, '홈이 자체 마감시각(Date 연산)으로 레지를 판정하고 있다')
      .not.toMatch(/regClose|closeAt|deadlineAt/);
  });
});

describe('🔴 F5 — 라이브 탭 배지 수와 본문 게임 수는 같은 배열에서 나온다', () => {
  it('배지(liveCount)와 판정 원본(liveClocks)을 갈라 놓는 setter 가 없다 — 항상 같은 응답에서 함께 쓴다', () => {
    const counts = APP.match(/setLiveCount\(/g) ?? [];
    const clocks = APP.match(/setLiveClocks\(/g) ?? [];
    expect(counts.length, `setLiveCount 가 ${counts.length}회다`).toBe(clocks.length);
    // 두 setter 는 반드시 **한 문장 안에서 같은 배열**을 읽는다. 갈라지는 순간 배지와 본문이 어긋난다.
    // 부팅 배치는 `kr.value`, 재조회는 `cs` — 이름은 달라도 **같은 식**이어야 한다(점 표기 허용).
    const pairs = APP.match(/setLiveCount\(([\w.]+)\.length\); setLiveClocks\(\1\);/g) ?? [];
    expect(pairs.length, `같은 배열에서 함께 쓰는 자리가 ${pairs.length}곳이다 — setLiveCount 총 ${counts.length}회와 달라졌다`)
      .toBe(counts.length);
  });

  it('🔴 라이브 탭 진입에서 클락을 다시 받는다 — 이게 없으면 배지가 부팅값으로 얼어붙는다', () => {
    const i = APP.indexOf('const changeTab = useCallback(');
    expect(i, 'changeTab 을 찾지 못했다').toBeGreaterThan(-1);
    const body = APP.slice(i, i + 700);
    expect(body, "탭 전환에 라이브 클락 재조회가 없다 — 라이브 탭에 앉아 있으면 본문만 갱신된다")
      .toMatch(/if \(t === 'live'\) refreshClocksRef\.current\?\.\(\);/);
  });

  it('🔴 전역 구독을 App 으로 승격하지 않았다 — subscribeRunningClocks 는 필터 없는 전역 구독이다', () => {
    expect(APP, 'App.tsx 가 clock_states 를 전역 구독하고 있다').not.toMatch(/subscribeRunningClocks/);
  });

  it('본문의 숫자는 여전히 자기 조회 결과 그대로다(배지에 맞추려고 본문을 고치지 않았다)', () => {
    expect(LIVE).toMatch(/진행 중 게임 \{games \? <span className="text-accent-200 text-grad-keep">\{games\.length\}<\/span> : null\}/);
    expect(LIVE, '본문 조회원이 getRunningClocks 가 아니다 — 두 숫자의 출처가 갈라졌다')
      .toMatch(/const load = \(\) => getRunningClocks\(\)/);
  });
});

describe('🔴 §11 — 홈은 조회 실패를 "없어요" 로 위장하지 않는다', () => {
  const HOME = strip(readFileSync(join(__dirname, 'HomeTab.tsx'), 'utf-8'));

  it('App 이 schedulesError 를 홈으로 내린다', () => {
    expect(APP).toMatch(/schedulesError=\{schedulesError\}/);
    expect(APP, '재시도가 인라인 화살표면 매 렌더 prop 참조가 바뀐다').toMatch(/onRetrySchedules=\{retrySchedulesCb\}/);
    expect(APP).toMatch(/const retrySchedulesCb = useCallback\(\(\) => \{ setSchedulesLoaded\(false\); reloadSchedules\(\); \}, \[reloadSchedules\]\);/);
  });

  it('🔴 로딩 · 진짜 빈 상태 · 조회 실패 **세 갈래**가 있다', () => {
    expect(HOME, '실패 판정이 없다').toMatch(/const failed = !!schedulesError && schedules\.length === 0;/);
    expect(HOME, "실패 갈래가 '오늘·내일 일정' 섹션에 없다 — 0건 빈 상태가 실패를 삼킨다")
      .toMatch(/\) : failed \? \(\s*\n[\s\S]{0,400}?<LoadErrorCard compact error=\{schedulesError\} what="대회 목록" onRetry=\{onRetrySchedules\} \/>/);
    expect(HOME, '세 번째 갈래가 빈 상태보다 **뒤에** 있으면 영원히 도달하지 않는다')
      .toMatch(/failed \? \([\s\S]*?\) : upcoming\.length === 0 \? \(/);
  });

  it('🔴 실패했을 때 "오늘 대회 0개" 라고 말하지 않는다', () => {
    expect(HOME).toMatch(/failed\s*\n?\s*\? <>오늘 대회 정보를 불러오지 못했어요<\/>/);
    expect(HOME, "실패 중에 '지금 등록 가능 N' 을 적으면 같은 거짓말이 한 줄 더 는다")
      .toMatch(/\{loaded && !failed && clocksLoaded && \(/);
  });
});
