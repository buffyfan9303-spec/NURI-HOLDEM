// UI-08 — 순위 보드(TierLeaderboard)·상점·업적·명예의 전당의 "실패를 없음으로 위장" 과 계정 경계 결함 (2026-09-13).
//
// 왜 소스 계약인가: vitest 환경이 node 라 컴포넌트 렌더 테스트가 없다. 동작은 아래 세 단위 테스트가 잠그고,
//   여기서는 그 동작이 화면에 **배선되어 있는가**만 본다.
//   · src/lib/scopedLoad.test.ts            — 계정 A→B 경계: A 의 늦은 응답이 B 의 상태를 덮지 못한다(실계정 없이 deferred promise 로 증명)
//   · src/lib/loyalty.session.test.ts       — 세션 읽기 실패 ≠ 비로그인(업적 0개/미션 0회/미장착 위장 금지)
//   · src/api/rankverify.session.test.ts    — 세션 읽기 실패 ≠ 신청 이력 없음
//
// 음성 대조(각 줄만 되돌렸다가 즉시 복원 — `git stash` 금지):
//   · TierLeaderboard 의 `import { scopedLoad, bumpScope }` 를 지우고 직접 .then 으로 바꾸면 UI-08-1 이 실패한다
//   · loyalty.ts getMonthlyHall 의 `if (error) throw error;` 를 지우면 UI-08-4(hall) 이 실패한다
//   · community.ts getLiveShouts 의 `if (error) throw error;` 를 `if (error) return [];` 로 되돌리면 옵션 항목이 실패한다
//
// 실행: npx vitest run src/components/features/rankingBoards.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// eslint-disable-next-line security/detect-non-literal-fs-filename
const read = (p: string) => readFileSync(resolve(__dirname, p), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
/** 주석을 뺀 코드만 — 옛 패턴을 "예전엔 …" 하고 설명하는 주석이 부정 계약에 걸리면 안 된다. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/(^|[^:'"`])\/\/(?![^'"`\n]*['"`]).*$/gm, '$1');
const TL = read('./TierLeaderboard.tsx');
const TLC = stripComments(TL);
const LOY = read('../../lib/loyalty.ts');
const COM = read('../../api/community.ts');
const RV = read('../../api/rankverify.ts');
const ADMIN = read('./AdminTab.tsx');

/** 함수 본문(다음 `export` 까지)을 잘라 그 안만 본다 — 파일 전체 검색은 다른 함수의 throw 에 묻힌다. */
function bodyOf(src: string, name: string): string {
  const i = src.indexOf(`export async function ${name}(`);
  expect(i, `${name} 가 있어야 한다`).toBeGreaterThan(-1);
  const rest = src.slice(i + 1);
  const j = rest.search(/\nexport /);
  return rest.slice(0, j === -1 ? undefined : j);
}

describe('UI-08-1 · 계정 경계 — key 리마운트 없이 요청 스탬프로 A→B 를 가른다', () => {
  it('🔴 모든 보드 조회가 scopedLoad 를 지나고, 계정이 바뀌면 bumpScope 로 이전 계정의 응답을 무효화한다', () => {
    expect(TL).toContain("import { scopedLoad, bumpScope } from '../../lib/scopedLoad';");
    expect(TL).toMatch(/bumpScope\(scopeRef, user\?\.id \?\? 'anon'\);/);
    // 계정 경계 effect **본문 안에서** null 가드(=== null / === undefined)가 잠그는 상태를 전부 초기화해야 B 계정에서 다시 조회한다.
    // (음성 대조 2026-09-13: 파일 전체에서 찾으면 재시도 버튼의 setBadgeStats(null) 이 대신 걸려 경계 리셋을 지워도 초록이었다.)
    const bStart = TLC.indexOf("bumpScope(scopeRef, user?.id ?? 'anon');");
    const bEnd = TLC.indexOf('}, [user?.id]);', bStart);
    expect(bStart, '계정 경계 effect').toBeGreaterThan(-1);
    expect(bEnd, '계정 경계 effect 는 [user?.id] 에만 걸린다').toBeGreaterThan(bStart);
    const boundary = TLC.slice(bStart, bEnd);
    for (const s of ['setBadgeStats(null)', 'setMissions(null)', 'setMissionsErr(null)', 'setMyVerifs(null)', 'setEquippedMark(undefined)', 'setOwned(null)', 'setMyCosmetics(null)', 'setSeasonBuyable(null)', 'setSeasonOwned(null)', 'setBalance(null)', 'setBoardErr({})']) {
      expect(boundary, `계정 경계 effect 안에서 ${s} 로 초기화`).toContain(s);
    }
    // 보드 조회는 전부 scopedLoad — 직접 .then(setX) 로 상태를 만지는 보드 조회가 남아 있으면 안 된다.
    for (const fn of ['getMyBadgeStats', 'getHallOfFame', 'myRankVerifications', 'getMyEquippedMark', 'getShopSkus', 'getMyOwnedMarks', 'getMyCosmetics', 'getBuyableSeasonBadges', 'getMySeasonBadges', 'getMyPointBalance']) {
      // eslint-disable-next-line security/detect-non-literal-regexp
      expect(TLC, `${fn} 는 scopedLoad 로만`).not.toMatch(new RegExp(`${fn}\\([^)]*\\)\\s*\\.then\\(`));
      // eslint-disable-next-line security/detect-non-literal-regexp
      expect(TLC, `${fn} 가 scopedLoad 안에 있어야 한다`).toMatch(new RegExp(`scopedLoad\\([\\s\\S]{0,40}${fn}\\(`));
    }
    // key={user?.id} 같은 리마운트 우회를 쓰지 않는다(스크롤·입력·busy 가 전부 날아간다).
    expect(TLC).not.toMatch(/key=\{user\?\.id/);
  });
});

describe('UI-08-2/3 · 세션 읽기 실패를 비로그인으로 위장하지 않는다(currentUserStrict)', () => {
  it('🔴 loyalty.ts 의 본인 조회 4곳과 rankverify.myRankVerifications 가 currentUserStrict 를 쓴다', () => {
    for (const fn of ['getMissionProgress', 'getMyBadgeStats', 'getMyEquippedMark']) {
      expect(bodyOf(LOY, fn), `${fn}`).toContain('currentUserStrict()');
    }
    expect(bodyOf(RV, 'myRankVerifications')).toContain('currentUserStrict()');
    // 새 currentUser 변형을 만들지 않는다 — 이미 있는 _session.currentUserStrict 를 쓴다(UI-08-3).
    expect(LOY).toContain("import { currentUser, currentUserStrict } from '../api/_session';");
  });
  it('🔴 업적 통계는 쿼리 오류를 던진다 — 예전엔 error 를 읽지 않아 스피너가 영원했다', () => {
    expect(bodyOf(LOY, 'getMyBadgeStats')).toMatch(/for \(const r of \[vr, ck, pf\][^\n]*\) if \(r\.error\) throw r\.error;/);
    expect(bodyOf(LOY, 'getMissionProgress')).toMatch(/for \(const r of \[ck, po, cl\][^\n]*\) if \(r\.error\) throw r\.error;/);
  });
});

describe('UI-08-4 · 실패 ≠ 없음 — LoadErrorCard 패턴을 보드 전부로 넓힌다', () => {
  it('🔴 getMonthlyHall 이 던지고, 같은 커밋에서 화면의 "기록 없음" 폴백이 사라졌다', () => {
    expect(bodyOf(LOY, 'getMonthlyHall')).toContain('if (error) throw error;');
    expect(TLC).not.toMatch(/\.catch\(\(\) => setHall\(/);
    // 카드는 **그 오류가 있을 때** 그려져야 한다 — 음성 대조 2026-09-13: `false ? <LoadErrorCard …` 로 바꿔도 태그만 찾으면 초록이었다.
    expect(TLC).toMatch(/boardErr\.hall != null \? <LoadErrorCard error=\{boardErr\.hall\} what="명예의 전당"/);
  });
  it('🔴 상점 API 6개가 error 를 던진다(빈 배열/ null 로 위장 금지)', () => {
    for (const fn of ['getMyPointBalance', 'getShopSkus', 'getMyOwnedMarks', 'getMyCosmetics', 'getBuyableSeasonBadges', 'getMySeasonBadges']) {
      const b = bodyOf(COM, fn);
      expect(b, `${fn} throw`).toContain('if (error) throw error;');
      expect(b, `${fn} 에 옛 위장이 없다`).not.toMatch(/if \(error(?: \|\| !r)?\) return (?:\[\]|null);/);
    }
  });
  it('🔴 화면은 보드별 오류를 boardErr 로 들고 LoadErrorCard 로 그린다 — 옛 조용한 catch 가 없다', () => {
    expect(TL).toMatch(/type BoardErrKey = 'badges' \| 'hall' \| 'verifs' \| 'skus' \| 'owned' \| 'cosmetics' \| 'season' \| 'balance' \| 'equip';/);
    for (const old of ['.catch(() => setMyVerifs([]))', '.catch(() => setOwned([]))', '.catch(() => setMyCosmetics([]))', '.catch(() => setSeasonBuyable([]))', '.catch(() => setSeasonOwned([]))', '.catch(() => setSkus([]))', '.catch(() => setBalance(null))', '.catch(() => setBadgeStats(']) {
      expect(TLC, `옛 위장 ${old}`).not.toContain(old);
    }
    expect(TLC).toMatch(/boardErr\.badges != null \? <LoadErrorCard error=\{boardErr\.badges\} what="업적"/);
    expect(TLC).toMatch(/\{boardErr\.verifs != null && \(\s*<LoadErrorCard error=\{boardErr\.verifs\} what="신청 이력"/);
    expect(TLC).toMatch(/\{shopErr != null && \(\s*<LoadErrorCard error=\{shopErr\} what="상점 정보"/);
    // 신청 이력 실패 카드는 '중복 제출' 을 막는 힌트를 단다(실패를 없음으로 보고 다시 제출하는 것이 실제 피해).
    expect(TL).toMatch(/hint="접수한 신청이 있어도 지금은 보이지 않을 수 있습니다/);
  });
  it('AdminTab 은 getMonthlyHall 의 PostgrestError 를 msgOf 로 옮긴다(원문 SQL 노출 금지)', () => {
    expect(ADMIN).toContain("import { msgOf } from '../../lib/dbError';");
    expect(ADMIN).toMatch(/toast\.show\(msgOf\(e, '지난달 자동 집계를 불러오지 못했습니다'\), 'error'\)/);
  });
});

describe('UI-08-5/6 · 지키는 것 — 상점 게이트·잔액 보호·레일은 그대로', () => {
  it('상점 캔버스 게이트 `{frameSku && (` 를 느슨하게 풀지 않았다(가격표 없이 그리지 않는다)', () => {
    expect(TL).toContain('{frameSku && (');
  });
  it('잔액 실패는 누적 점수로 대체하지 않는다 — balance 는 null(미도착) 그대로, 오류는 boardErr.balance', () => {
    expect(TL).toMatch(/scopedLoad\(scopeRef, getMyPointBalance\(\), \(b\) => \{ setBalance\(b\); clearErr\('balance'\); \}, fail\('balance'\)\)/);
    expect(TL).not.toMatch(/setBalance\(\{[^}]*activityPoints/);
  });
  it('고아 스토리지 정리 같은 클라이언트 삭제 로직을 넣지 않았다(삭제 정책은 관리자만)', () => {
    expect(TL).not.toMatch(/storage\s*\.\s*from\([^)]*\)\s*\.\s*remove\(/);
  });
});

describe('옵션 · getLiveShouts 도 실패를 [] 로 위장하지 않는다', () => {
  it('🔴 `if (error) return [];` 가 없고 던진다', () => {
    const b = bodyOf(COM, 'getLiveShouts');
    expect(b).toContain('if (error) throw error;');
    expect(b).not.toContain('if (error) return [];');
  });
});
