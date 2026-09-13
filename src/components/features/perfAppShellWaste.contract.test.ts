// §5-B(2026-09-12) — App.tsx(전역 셸) 쪽 낭비 4건.
//
// App.tsx 는 렌더 트리 테스트로 잡기 어렵다(auth·supabase·lazy 청크·4팀 공용).
// §5-A 가 쓴 소스 계약 테스트(perfHiddenTabGates.contract.test.ts)와 같은 결로 잠근다.
//
// ⚠ §5-A 의 교훈을 여기서도 강제한다: **게이트는 재동기화와 한 쌍이어야 한다.**
//   게이트만 넣으면 숨은 동안 온 쪽지가 배지에서 사라지고, 그것은 개선이 아니라 기능 소실이다.
//
// 실행: npx vitest run src/components/features/perfAppShellWaste.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const APP = strip(readFileSync(join(__dirname, '..', '..', 'App.tsx'), 'utf-8'));

// ⚠ 2026-09-12 독립 검증에서 이 파일의 **한계가 드러났다**: 정규식은 "그 문장이 있는가" 만 본다.
//   "그 문장에 **도달하는가**", "그것 말고 **다른 경로가 없는가**" 는 못 본다.
//   실제로 흉내 변조 5종이 전부 통과했다 — 게이트는 그대로 두고 `setInterval` 을 **한 줄 더** 달거나,
//   재동기화를 `if (forUid === '__never__')` 같은 **죽은 분기**에 넣으면 16건이 모두 초록이었다.
//   그래서 아래는 '문장 존재' 대신 **개수와 도달 가능성**을 함께 본다. 그래도 근본 한계는 남는다 —
//   §5-A 검증이 쓴 **런타임 하네스**(keep-alive 흉내 + 목킹)가 진짜 답이다.
describe('§5-B ① 쪽지 미읽음 90초 폴링은 숨은 탭에서 돌지 않는다 + 복귀 재동기화', () => {
  /** 폴링 이펙트 본문만 잘라 본다. */
  const pollBody = (() => {
    const i = APP.indexOf('const load = () => myUnreadMessageCount()');
    return i > -1 ? APP.slice(i, i + 1400) : '';
  })();

  it('폴링 이펙트를 찾을 수 있다', () => {
    expect(pollBody, '쪽지 미읽음 폴링 이펙트를 찾지 못했다').not.toBe('');
  });

  // ⚠ '게이트 문장이 있는가' 로는 부족하다. 독립 검증이 `load();` 를 게이트 **앞으로** 옮기는 변조(M5)로
  //   숨은 탭 폴링을 완전히 되살리면서 16건을 전부 통과시켰다 — HEAD 보다 나쁜 상태인데 초록이었다.
  //   그래서 **틱 본문을 통째로** 못박아 실행 순서까지 고정한다.
  it('🔴 틱 본문이 "게이트 먼저, load 는 그 뒤" 순서다 — 순서가 뒤집히면 숨은 탭 폴링이 부활한다', () => {
    expect(pollBody, '게이트가 없거나 load 가 게이트 앞에 있으면 백그라운드 탭이 사용자당 시간당 40요청을 문다')
      .toMatch(/setInterval\(\(\) => \{\s*\n\s*if \(document\.hidden\) \{ missedTick = true; return; \}\s*\n\s*load\(\);\s*\n\s*\}, 90_000\);/);
  });

  // M8 대응: 조건의 **극성**을 뒤집으면(`if (!user)` → `if (user)`) 로그인 사용자는 폴링이 아예 안 돈다(배지 영구 0).
  it('🔴 비로그인일 때만 0 으로 두고 빠진다 — 극성이 뒤집히면 배지가 영영 0 이다', () => {
    const i = APP.indexOf('const load = () => myUnreadMessageCount()');
    const before = APP.slice(Math.max(0, i - 400), i);
    expect(before, '비로그인 조기 반환 형태가 아니다').toMatch(/if \(!user\) \{ setUnreadMsgs\(0\); return; \}/);
  });

  // M3·M4 대응: 등록 **직후 해제**하거나, `onShow` **앞에** 플래그를 끄는 리스너를 하나 더 달면
  //   재동기화가 영영 돌지 않는데 두 정규식은 각각 매칭돼 통과했다. 개수로 막는다.
  it('🔴 visibilitychange 리스너는 등록 1회·해제 1회뿐이다 — 하나 더 달면 재동기화가 죽는다', () => {
    const add = (pollBody.match(/addEventListener\('visibilitychange'/g) ?? []).length;
    const rm = (pollBody.match(/removeEventListener\('visibilitychange'/g) ?? []).length;
    expect(add, `등록이 ${add}회다 — 다른 리스너가 먼저 missedTick 을 끄면 onShow 가 항상 early-return 한다`).toBe(1);
    expect(rm, `해제가 ${rm}회다 — 등록 직후 해제하면 재동기화가 영영 돌지 않는다`).toBe(1);
  });

  // M1 대응: 게이트를 둔 채 `setInterval` 을 하나 더 달면 백그라운드 폴링이 그대로 부활한다.
  //
  // ⚠ 독립 검증이 이 검사의 **구조적 한계**를 찔렀다(N1): 두 번째 폴러를 앵커에서 1400자 **밖**에
  //   심으면 슬라이스 창에 안 들어와 그냥 통과했다 — 판정 기준이 '버그 유무'가 아니라 '앵커로부터의 거리'였다.
  //   그래서 창이 아니라 **파일 전체 불변식**으로 올린다.
  //
  // 📌 2026-09-13 — 이 단언을 **의식적으로 갱신했다**(F3, 연결 감사).
  //   추가된 두 번째 타이머: `regNow` 틱(30초). 홈의 '마감까지 N분' 이 memo 평가 시점의 now 로 얼어붙어
  //   **이미 마감된 대회가 '지금 등록 가능 · 마감까지 70분'** 으로 남던 것을 고친다(App.tsx: regInfoBySchedule 위).
  //   주기 작업 없이는 못 고친다 — 홈에 머무는 동안 liveClocks·schedules 가 둘 다 안 바뀌므로 memo 를
  //   깨울 다른 신호가 없고, 대안(스케줄에 절대 마감시각을 박고 벽시계로 빼기)은 **일시정지 클락을
  //   벽시계로 깎아 '마감' 이라 거짓말**한다(src/lib/regStatus.test.ts 의 F3 describe 가 그쪽을 잠근다).
  //
  //   ⚠ 숫자만 올리지 않았다. 원래 이 검사가 지키려던 것은 '개수'가 아니라 **"게이트 없는 주기 작업이
  //     숨은 탭에서 돌지 않는다"** 이므로, 검사를 개수에서 **구조 불변식**으로 올린다:
  //     App.tsx 의 모든 setInterval 은 **첫 문장이 `if (document.hidden)` 게이트**여야 한다.
  //     이건 종전 '개수 1' 보다 강하다 — 세 번째 타이머를 게이트 없이 달면 개수를 안 세도 걸린다.
  //     (틱 본문의 정확한 형태·복귀 재동기화는 이 파일 ①과 homeLiveFreshness.contract.test.ts 가 각각 못박는다.)
  it('🔴 App.tsx 의 모든 setInterval 은 첫 문장이 document.hidden 게이트다 — 하나라도 없으면 백그라운드 폴링이 부활한다', () => {
    const all = [...APP.matchAll(/setInterval\(\(\) => \{([\s\S]{0,200}?)\n\s*\}, /g)];
    const n = (APP.match(/setInterval\(/g) ?? []).length;
    expect(all.length, `setInterval ${n}개 중 ${all.length}개만 "() => { … }" 형태다 — 나머지는 이 검사를 빠져나간다`).toBe(n);
    expect(n, `App.tsx 에 setInterval 이 ${n}개다 — 늘릴 때는 이 파일에 근거를 적어라`).toBe(2);
    for (const m of all) {
      const first = m[1].trim().split('\n')[0].trim();
      expect(first, `게이트 없는 주기 작업이 있다 — 첫 문장이 "${first}" 다`).toMatch(/^if \(document\.hidden\)/);
    }
  });

  it('그 하나가 이 폴링 이펙트의 것이다', () => {
    const n = (pollBody.match(/setInterval\(/g) ?? []).length;
    expect(n, '유일한 setInterval 이 쪽지 폴링 이펙트 밖으로 옮겨졌다').toBe(1);
  });

  it('🔴 건너뛴 틱을 기억한다 — 기억하지 않으면 복귀 때 메울 근거가 없다', () => {
    expect(pollBody, 'missedTick 플래그가 없다').toMatch(/let missedTick = false;/);
  });

  // 🔴 이 배치의 핵심 회귀. 독립 검증이 실브라우저로 재현했다:
  //   재동기화를 useVisibilityRefresh(20초 스로틀)에 얹으면, 20초 안에 두 번 오가고 그 사이 틱이
  //   숨은 채 지나갈 때 **복귀 재조회가 스로틀에 삼켜져** 배지가 94초 더 낡았다(최대 90초 → 180초).
  it('🔴 복귀 재동기화가 스로틀 없는 자체 리스너다 — 스로틀에 얹으면 배지가 180초까지 낡는다', () => {
    expect(pollBody, '복귀 리스너가 없다 — 숨은 동안 온 쪽지가 배지에서 사라진다(기능 소실)')
      .toMatch(/document\.addEventListener\('visibilitychange', onShow\);/);
    expect(pollBody, '리스너를 정리하지 않는다')
      .toMatch(/document\.removeEventListener\('visibilitychange', onShow\);/);
  });

  // M2 대응: 재동기화가 **도달 가능한** 조건 뒤에 있어야 한다. 죽은 분기에 넣어도 문자열은 남는다.
  // ⚠ 여기서 `missedTick = false; load();` 가 **있는지**만 보면 부족하다.
  //   독립 검증이 `if (String(user.id) === '__never__') { missedTick = false; load(); }` 로
  //   **죽은 분기에 옮겨** 넣었더니 그대로 통과했다 — 문자열은 남고 재동기화는 영영 안 돈다.
  //   그래서 **위치**를 못박는다: 가드 바로 다음에, 아무 조건 없이, 함수 끝까지.
  it('🔴 복귀 리스너는 "건너뛴 적이 있을 때만" 발사하고, 그 뒤는 무조건 실행된다(죽은 분기 금지)', () => {
    expect(pollBody, '가드가 없으면 같은 복귀에 두 번 조회한다')
      .toMatch(/if \(document\.hidden \|\| !missedTick\) return;/);
    expect(pollBody, '재동기화가 가드 바로 뒤의 무조건 실행이 아니다 — 죽은 분기에 숨어 있을 수 있다')
      .toMatch(/if \(document\.hidden \|\| !missedTick\) return;[^\n]*\n\s*missedTick = false;\s*\n\s*load\(\);\s*\n\s*\};/);
  });

  it('🔴 useVisibilityRefresh 쪽에는 쪽지 재조회가 남아 있지 않다 — 남으면 복귀마다 두 번 조회한다', () => {
    const i = APP.indexOf('useVisibilityRefresh(() => {');
    expect(i, 'useVisibilityRefresh 호출부를 찾지 못했다').toBeGreaterThan(-1);
    const body = APP.slice(i, i + 1200);
    expect(body, '폴링 이펙트와 중복으로 쪽지 수를 받고 있다').not.toMatch(/myUnreadMessageCount\(/);
  });

  it('폴링은 계정 경계를 지킨다 — 늦게 온 A 의 카운트가 B 배지를 덮지 않는다', () => {
    expect(pollBody).toMatch(/if \(alive\) setUnreadMsgs\(n\)/);
  });
});

describe('§5-B ② 알림 realtime 구독은 계정이 바뀔 때만 재연결한다', () => {
  it('deps 가 [user] 객체가 아니라 [user?.id] 다', () => {
    const idx = APP.indexOf("supabase\n      .channel(`notif:${user.id}`)");
    const i = idx > -1 ? idx : APP.indexOf('.channel(`notif:${user.id}`)');
    expect(i, '알림 realtime 채널 생성부를 찾지 못했다').toBeGreaterThan(-1);
    const after = APP.slice(i, i + 600);
    expect(after, '[user] 이면 포인트 갱신마다 채널 teardown→재연결 + getMyNotifications() 재발사다')
      .toMatch(/return \(\) => \{ alive = false; supabase\.removeChannel\(ch\); \};\s*\}, \[user\?\.id\]\);/);
  });
});

describe('§5-B ③ 상주 컴포넌트 CustomerDashboardPage 가 매 렌더 재렌더되지 않는다', () => {
  it('unread 가 매 렌더 새 배열이 아니라 useMemo 결과다', () => {
    expect(APP).not.toMatch(/unread=\{notifications\.filter/);
    expect(APP).toMatch(/const unreadNotifList = useMemo\(\(\) => notifications\.filter\(\(n\) => !n\.read\), \[notifications\]\);/);
    expect(APP).toMatch(/unread=\{unreadNotifList\}/);
  });

  it('🔴 마운트부의 prop 이 전부 안정 참조다 — 인라인 화살표가 하나라도 남으면 memo 가 무력화된다', () => {
    const i = APP.indexOf('<CustomerDashboardPage key=');
    expect(i, 'CustomerDashboardPage 마운트부를 찾지 못했다').toBeGreaterThan(-1);
    const jsx = APP.slice(i, APP.indexOf('/>', i) + 2);
    expect(jsx, `마운트부에 인라인 화살표가 남아 있다:\n${jsx}`).not.toMatch(/=\{\(/);
    expect(jsx).not.toMatch(/=\{\s*\w*\s*=>/);
    for (const p of ['onClose={closeMeCb}', 'onOpenNotification={handleMeOpenNotification}',
      'onOpenSchedule={handleMeOpenSchedule}', 'onOpenPost={handleMeOpenPost}',
      'onOpenLegal={handleMeOpenLegal}', 'onOpenSupport={handleMeOpenSupport}',
      'onOpenMarket={handleMeOpenMarket}', 'onOpenRanking={handleMeOpenRanking}']) {
      expect(jsx, `${p} 가 없다`).toContain(p);
    }
  });

  it('알림 핸들러는 notifications 를 ref 로 읽어 참조가 고정된다(동작은 동일)', () => {
    expect(APP).toMatch(/const notificationsRef = useRef\(notifications\);/);
    expect(APP).toMatch(/const n = notificationsRef\.current\.find\(\(x\) => x\.id === id\);/);
  });

  it('소비처가 memo 로 잠겨 있다 — 안정 prop 만으로는 아무 효과가 없다', () => {
    const code = strip(readFileSync(join(__dirname, 'CustomerDashboardPage.tsx'), 'utf-8'));
    expect(code).toMatch(/export default memo\(CustomerDashboardPage\);/);
    expect(code).not.toMatch(/export default function CustomerDashboardPage/);
  });
});

describe('§5-B ⑤ 예약자 수는 소비처(일정 탐색)가 마운트된 뒤에만 읽는다', () => {
  it('게이트가 있다 — 홈만 보는 사용자에게 수백 UUID 를 RPC 본문에 실어 보내지 않는다', () => {
    const i = APP.indexOf('getReservationCounts(resIdsKey.split(');
    expect(i, 'getReservationCounts 호출부를 찾지 못했다').toBeGreaterThan(-1);
    const before = APP.slice(Math.max(0, i - 260), i);
    expect(before, '게이트가 없다').toMatch(/if \(!resCountsWanted\) return;/);
  });

  it("🔴 sticky 다 — 일정 탐색을 한 번이라도 열면 계속 최신화된다(keep-alive 라 끄면 숫자가 낡는다)", () => {
    expect(APP).toMatch(/const \[resCountsWanted, setResCountsWanted\] = useState\(false\);/);
    expect(APP).toMatch(/useEffect\(\(\) => \{ if \(activeTab === 'browse'\) setResCountsWanted\(true\); \}, \[activeTab\]\);/);
  });

  it('게이트가 켜지는 순간 재조회한다 — deps 에 resCountsWanted 가 들어 있다', () => {
    const i = APP.indexOf('getReservationCounts(resIdsKey.split(');
    const after = APP.slice(i, i + 260);
    expect(after, '게이트가 deps 에 없으면 일정 탐색을 열어도 숫자가 비어 있다')
      .toMatch(/\}, \[resCountsWanted, resIdsKey, resVersion\]\);/);
  });
});
