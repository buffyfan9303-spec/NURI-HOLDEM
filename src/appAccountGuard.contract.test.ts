// 🔴 R3-01(2026-10-04) — App.tsx 의 **계정 범위 응답**은 전부 `forAccount` 한 관문을 지난다.
//
// 재발 이력: N01(2026-09-12)이 알림 조회 5곳 중 3곳에만 손으로 가드를 달았다. online 복귀·창 복귀 재조회 2곳과
//   바인 요청 배너·가 본 매장·오늘 예약이 무가드로 남아, 로그아웃 → 다른 계정 로그인 사이에 도착한
//   이전 계정 응답이 새 계정 화면(알림 패널·배지·바인 배너·이어서 하기)을 덮을 수 있었다.
//   원문: C:\Users\buffy\Documents\누리홀덤_영상분석_0930\audit3-regress-connect-1004.md#R3-01
//
// 그래서 열거가 아니라 **조회 함수 쪽에서** 잠근다 — 계정 범위 조회가 새로 생기거나 옮겨져도
//   그 체인이 forAccount 를 안 지나면 여기서 깨진다. 실제 경합은 e2e/account-isolation.spec.ts 'R3-01' 이 브라우저에서 잰다.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const raw = readFileSync(join(process.cwd(), 'src/App.tsx'), 'utf8');
// 주석을 지우되 줄 수는 보존한다 — 실패 메시지의 App.tsx:줄 번호가 실제 줄을 가리키게.
const src = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/^[ \t]*\/\/.*$/gm, ' ');

/** 계정마다 결과가 다른 조회 — 응답이 화면 state 로 들어간다. 최소 등장 횟수는 빈 검사 방지용. */
const FETCHERS: [RegExp, number][] = [
  [/getMyNotifications\(\)/g, 5],
  [/getMyBuyinRequestsToday\(\)/g, 4],
  [/myVisitedVenues\(\)/g, 1],
  [/myUnreadMessageCount\(\)/g, 1],
  [/getMyReservations\(/g, 1],
  [/listAllUsers\(\)/g, 1],
];
const SETTERS = ['setNotifications', 'setMyBuyinReqs', 'setVisitedVenues', 'setUnreadMsgs', 'setMyTodayRes', 'setUsers', 'setUsersErr'];

describe('R3-01 — 계정 범위 응답은 forAccount 를 지난다', () => {
  it('uidRef 는 렌더 본문에서 동기로 갱신된다(이펙트 안이면 먼저 선언된 이펙트에서 null 이다)', () => {
    const decl = src.indexOf('const uidRef = useRef<string | null>(null);');
    expect(decl, 'uidRef 선언을 못 찾았다').toBeGreaterThan(0);
    expect(src.slice(decl, decl + 200)).toMatch(/\n\s*uidRef\.current = user\?\.id \?\? null;/);
    // 그 밖에서 uidRef 에 쓰는 곳이 없어야 한다(이펙트 안 재대입이 되살아나면 타이밍 갭이 돌아온다)
    expect(src.match(/uidRef\.current =[^=]/g)?.length).toBe(1);
  });

  it('forAccount 는 감싸는 순간의 계정을 찍고, 도착 시 다르면 버린다', () => {
    const body = /const forAccount = useCallback\(([\s\S]*?)\}, \[\]\);/.exec(src)?.[1] ?? '';
    expect(body, 'forAccount 정의를 못 찾았다').not.toBe('');
    expect(body).toMatch(/const owner = uidRef\.current;/);
    expect(body).toMatch(/if \(uidRef\.current === owner\) set\(v\);/);
  });

  it.each(FETCHERS)('%s 체인마다 forAccount 가 붙어 있다', (re, min) => {
    const hits = [...src.matchAll(re)];
    expect(hits.length, `${re} 가 ${min}곳 이상이어야 한다 — 이름이 바뀌면 이 검사가 빈 통과가 된다`).toBeGreaterThanOrEqual(min);
    for (const h of hits) {
      // 체인 끝(.catch 또는 다음 문장)까지 — 그 안에 .then(forAccount( 가 있어야 한다
      const tail = src.slice(h.index!, h.index! + 220);
      const chain = tail.split(/\.catch\(|;\s*\n/)[0];
      const line = src.slice(0, h.index!).split('\n').length;
      expect(chain, `App.tsx:${line} ${h[0]} 응답이 계정 가드 없이 state 로 들어간다`).toMatch(/\.then\(forAccount\(/);
    }
  });

  it.each(SETTERS)('%s 에 벌거벗은 .then/.catch 배선이 없다', (s) => {
    expect(src).not.toMatch(new RegExp(`\\.(then|catch)\\(${s}\\b`));
  });

  it('오늘 예약은 실패(catch)도 가드한다 — 낡은 오류 배너가 새 계정 홈에 남지 않게', () => {
    const at = src.indexOf('getMyReservations(30)');
    expect(src.slice(at, at + 400)).toMatch(/\.catch\(forAccount\(/);
  });
});
