// 결정 결과 알림(20261002b · audit-link-1002 L-04)의 link → 화면·아이콘 해석.
//   생산자(마이그레이션이 만드는 link)와 소비자(App 라우터·알림 목록)가 같은 해석을 쓰는지까지 본다.
// 실행: npx vitest run src/lib/notifLink.test.ts --maxWorkers=4
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStoreLink, notifGlyph, needsStoreAccess } from './notifLink';

const VID = '615376fa-ffc4-420b-85a0-b9847520c12f';
const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf-8');

describe('parseStoreLink — 내 매장 목적지', () => {
  it('종전 링크는 그대로 같은 섹션으로 간다(기능 보존)', () => {
    expect(parseStoreLink('/my-store/ledger')).toEqual({ section: 'ledger', venueId: null });
    expect(parseStoreLink('/my-store/partners')).toEqual({ section: 'partners', venueId: null });
    expect(parseStoreLink('/staff-schedule')).toEqual({ section: 'attendance', venueId: null });
  });
  it('?venue= 를 매장 id 로 읽는다(L-04: 다매장 운영자)', () => {
    expect(parseStoreLink(`/my-store/ledger?venue=${VID}`)).toEqual({ section: 'ledger', venueId: VID });
    expect(parseStoreLink(`/my-store/staff?venue=${VID}`)).toEqual({ section: 'staff', venueId: VID });
    expect(parseStoreLink(`/my-store/voucher?venue=${VID}`)).toEqual({ section: 'voucher', venueId: VID });
    expect(parseStoreLink(`/my-store/event?venue=${VID}`)).toEqual({ section: 'event', venueId: VID });
    expect(parseStoreLink(`/my-store?venue=${VID}`)).toEqual({ section: 'dashboard', venueId: VID });
  });
  it('매장 id 가 uuid 가 아니면 버린다(섹션 이동만)', () => {
    expect(parseStoreLink('/my-store/ledger?venue=../../x')).toEqual({ section: 'ledger', venueId: null });
  });
  it('내 매장이 아니거나 모르는 섹션이면 null — 호출부 종전 처리로 떨어진다', () => {
    for (const l of [null, undefined, '', '/', '/my-storey', '/my-store/unknown', '/rank', '/support', '/community/x', '//my-store/ledger'])
      expect(parseStoreLink(l)).toBeNull();
  });
});

describe('notifGlyph — 알림 목록 아이콘', () => {
  it('결정 결과 알림은 link 로 구분된 아이콘을 쓴다', () => {
    expect(notifGlyph({ type: 'system', link: `/my-store/staff?venue=${VID}` })).toBe('users');
    expect(notifGlyph({ type: 'approval', link: `/my-store/voucher?venue=${VID}` })).toBe('ticket');
    expect(notifGlyph({ type: 'system', link: `/my-store/event?venue=${VID}` })).toBe('megaphone');
    expect(notifGlyph({ type: 'system', link: `/my-store/ledger?venue=${VID}` })).toBe('notebook');
    expect(notifGlyph({ type: 'approval', link: `/my-store?venue=${VID}` })).toBe('store');
    expect(notifGlyph({ type: 'approval', link: '/rank' })).toBe('trophy');
    expect(notifGlyph({ type: 'system', link: `/community/${VID}` })).toBe('store');
  });
  it('link 가 없거나 모르는 link 는 종전 type 아이콘', () => {
    expect(notifGlyph({ type: 'system', link: null })).toBe('info');
    expect(notifGlyph({ type: 'approval', link: '/admin' })).toBe('check-circle');
    expect(notifGlyph({ type: 'comment' })).toBe('comment');
    expect(notifGlyph({ type: 'reminder', link: '/support' })).toBe('clock');
  });
});

describe('생산자 → 소비자 계약', () => {
  const sql = read('supabase/migrations/20261002b_decision_notifications.sql');
  const app = read('src/App.tsx');

  it('마이그레이션이 만드는 내 매장 link 는 전부 라우터가 아는 섹션이다', () => {
    const links = [...sql.matchAll(/'(\/my-store[^']*)'\s*\|\|/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThanOrEqual(5);
    for (const l of links) {
      const parsed = parseStoreLink(l + VID);
      expect(parsed, l).not.toBeNull();
      expect(parsed!.venueId, l).toBe(VID);
    }
  });
  it('그 밖의 link(/rank · /support · /community/)는 App 라우터에 처리기가 있다', () => {
    expect(sql).toContain("'/rank'");
    expect(app).toMatch(/link === '\/rank'/);
    expect(sql).toContain("'/support'");
    expect(app).toMatch(/link === '\/support'/);
    expect(sql).toContain("'/community/' ||");
    expect(app).toMatch(/link\.match\(\/\^\\\/community\\\/\(\.\+\)\$\/\)/);
  });
  it('App 라우터와 알림 목록이 같은 해석기를 쓴다', () => {
    expect(app).toMatch(/const store = parseStoreLink\(link\)/);
    expect(app).toMatch(/setMyStoreDeepVenue\(store\.venueId\)/);
    const panel = read('src/components/features/NotificationPanel.tsx');
    expect(panel).toMatch(/notifGlyph\(n\)/);
    expect(panel).not.toMatch(/TYPE_GLYPH\[/);
  });
  it('내 매장 탭은 deepVenueId 를 받아 섹션 이동보다 먼저 매장을 바꾼다', () => {
    const tab = read('src/components/features/VenueManageTab.tsx');
    expect(app).toMatch(/deepVenueId=\{myStoreDeepVenue\}/);
    expect(tab).toMatch(/if \(!deepSection \|\| !permsLoaded \|\| deepVenueId\) return;/);
    expect(tab).toMatch(/setMemberVenueId\(deepVenueId\)/);
    expect(tab).toMatch(/event: 'event'/);
  });
});

// F-1 (review-notify-1002): approval + /rank 가 매장 판정에 먼저 걸려 일반 회원이 순위 화면으로 못 가던 결함.
describe('needsStoreAccess — 알림 목적지가 업주/직원 탭을 요구하는가 (link·type·admin → 판정)', () => {
  type T = 'approval' | 'system' | 'qna' | 'comment' | 'reminder';
  const table: Array<[T, string | null, boolean, boolean]> = [
    // [type, link, isAdmin, 매장 권한 필요]
    ['approval', '/rank', false, false], // F-1 — 순위 인증 승인: 일반 회원도 순위로
    ['system', '/rank', false, false], // 순위 인증 반려
    ['approval', '/wallet', false, false],
    ['approval', '/support', false, false],
    ['approval', '/', false, false],
    ['approval', '/my-store/ledger', false, true], // 매장 경로는 그대로 매장
    ['approval', `/my-store/voucher?venue=${VID}`, false, true],
    ['system', '/my-store/partners', false, true],
    ['system', '/staff-schedule', false, true], // 출근 관리
    ['system', '/my-store/ledger', true, true], // admin 이어도 매장 경로는 매장 탭
    ['approval', '/admin', false, true], // 포스터 승인 — 업주
    ['system', '/admin', false, true],
    ['approval', '/admin', true, false], // admin 본인은 admin 탭
    ['approval', null, false, true], // link 없는 approval = 종전대로 매장
    ['approval', '', false, true],
    ['approval', '/my-store/xyz', false, true], // 모르는 섹션도 종전대로
    ['approval', null, true, false],
    ['system', null, false, false],
    ['qna', '/community/abc', false, false],
    ['comment', null, false, false],
    ['reminder', '/support', false, false],
  ];
  it.each(table)('%s · %s · admin=%s → %s', (type, link, isAdmin, expected) => {
    expect(needsStoreAccess({ type, link }, isAdmin)).toBe(expected);
  });

  it('App 라우터는 매장 판정을 이 함수 한 곳에서 한다(approval 타입을 따로 보지 않는다)', () => {
    const app = read('src/App.tsx');
    expect(app).toContain('needsStoreAccess({ type: n.type, link }, isAdmin)');
    expect(app).not.toMatch(/const storeDest = [^;]*n\.type === 'approval'/);
  });
});
