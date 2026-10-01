// L-03 (audit-link-1002) — 서버만 고쳐졌던 관리자 화면 호출부 3곳이 서버 함수 경로를 **계속** 쓰는가(소스 계약).
// 동작 쪽(실제로 나간 호출)은 src/api/adminWire1002.test.ts 가 mock 으로 본다. 여기는 **옛 경로가 되살아나지 않게** 잠근다.
//  ① 가입 거절은 adminRejectSignup — 거절 핸들러에 status:'banned' 를 싣지 않는다(CI 재가입 차단 부작용).
//  ② 매장 삭제는 removeOrArchiveVenue 한 통로 — 두 화면이 deleteVenue 를 직접 부르지 않는다.
//  ③ 광고 순서 교환은 RPC 한 번 — swapAdSlots 본문에 직접 쓰기(update/upsert)가 없다.
// 실행: npx vitest run src/components/features/adminWire1002.contract.test.ts --maxWorkers=4
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf-8').replace(/\r\n/g, '\n');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
/** `const NAME = async () => {` 부터 같은 들여쓰기의 닫는 `};` 까지 */
function arrowBody(src: string, name: string): string {
  const at = src.indexOf(`const ${name} = `);
  expect(at, `${name} 없음`).toBeGreaterThan(-1);
  const end = src.indexOf('\n  };', at);
  expect(end, `${name} 의 끝을 못 찾음`).toBeGreaterThan(at);
  return src.slice(at, end);
}

describe('① 가입 거절 — 일반 회원으로 되돌린다(영구 정지 아님)', () => {
  const src = stripComments(read('./UserManagementTab.tsx'));
  const reject = arrowBody(src, 'reject');
  it('reject 는 adminRejectSignup 을 부른다', () => {
    expect(reject).toMatch(/await adminRejectSignup\(user\.id/);
  });
  it("reject 는 banned 를 저장하지 않고 onUpdate(profiles 직접 저장) 경로를 타지 않는다", () => {
    expect(reject).not.toMatch(/banned/);
    expect(reject).not.toMatch(/run\(|onUpdate\(/);
  });
  it('adminRejectSignup 은 auth API 에서 가져온다', () => {
    expect(src).toMatch(/import \{[^}]*adminRejectSignup[^}]*\} from '\.\.\/\.\.\/api\/auth'/);
  });
});

describe('② 매장 삭제 — 기록이 있으면 숨김(보관)으로 안내', () => {
  for (const f of ['./AdminTab.tsx', './VenueManagement.tsx']) {
    it(`${f} 는 removeOrArchiveVenue 를 쓰고 deleteVenue 를 직접 부르지 않는다`, () => {
      const src = stripComments(read(f));
      expect(src).toMatch(/await removeOrArchiveVenue\(/);
      expect(src).not.toMatch(/\bdeleteVenue\b/);
    });
  }
  it('통로는 서버 보관 RPC 래퍼(adminSetVenueArchived)로 간다', () => {
    const src = stripComments(read('../../lib/venueRemove.ts'));
    expect(src).toMatch(/adminSetVenueArchived\(/);
    expect(src).toMatch(/isVenueHasRecordsError\(/);
  });
});

describe('③ 광고 순서 — swap_community_ad_slots 한 번', () => {
  const src = stripComments(read('../../api/ads.ts'));
  const at = src.indexOf('export async function swapAdSlots');
  const body = src.slice(at, src.indexOf('\n}\n', at));
  it("본문이 rpc('swap_community_ad_slots') 를 부른다", () => {
    expect(body).toMatch(/\.rpc\('swap_community_ad_slots'/);
  });
  it('옛 두 요청(community_ads 직접 update/upsert)이 없다', () => {
    expect(body).not.toMatch(/\.from\('community_ads'\)/);
    expect(body).not.toMatch(/\.update\(|\.upsert\(/);
  });
});
