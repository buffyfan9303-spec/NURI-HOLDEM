// 배너 게재 창의 날짜 기준이 **서버·클라이언트 한 곳**인가 (2026-09-11)
//
// 왜 이런 테스트가 필요한가
//   노출 판정이 두 겹이다: 서버 RLS(home_banners_read_public)가 먼저 거르고, homeBannerFeed 가 한 번 더 거른다.
//   두 겹이면 **좁은 쪽이 이긴다** — 서버가 안 준 행은 클라이언트가 되살릴 수 없다.
//   그런데 서버는 `current_date`(UTC), 클라이언트는 기기 로컬 날짜를 써서 기준이 셋이었다.
//   Supabase 서버 TimeZone 이 UTC 라 **한국시간 00:00~08:59 동안 current_date 는 전날**이고,
//   그 9시간 동안 '오늘부터' 예약한 배너가 안 보였다(업주에겐 등록 실패로 읽힌다).
//
//   RLS 는 DB 에 적용해야만 도는 코드라 단위 테스트가 실행으로 검증할 수 없다.
//   그래서 **조건이 SQL 안에 실제로 적혀 있는지**를 잠근다 — ads.migration.test.ts 와 같은 방식.
//   (실행 검증은 마이그레이션 하단의 do $$ 자가검사가 적용 시점에 맡는다.)
//
// 이 테스트가 잡는 회귀: 누가 KST 판정을 UTC 로 되돌리거나, 클라이언트를 기기 로컬 날짜로 되돌리는 것.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { kstToday } from '../lib/kst';
import { homeBannerFeed, type HomeBanner } from './homeBanners';

const root = join(__dirname, '..', '..');
const SQL = readFileSync(join(root, 'supabase', 'migrations', '20260911e_home_banners_kst_window.sql'), 'utf-8');
/** 정책 본문만 — 머리말 주석에 적힌 '옛 코드'와 롤백 SQL 이 통과시켜 주는 착시를 막는다.
 *  ⚠ '\ncreate policy' 로 찾는다: 롤백 주석의 같은 문장은 `--   create policy ...` 라 줄 첫 칸이 아니다.
 *     그냥 indexOf 로 잡으면 **주석 안의 옛 정책**부터 슬라이스가 시작돼 current_date 검사가 늘 실패한다(실제로 실패했다). */
const policy = SQL.slice(
  SQL.indexOf('\ncreate policy home_banners_read_public'),
  SQL.indexOf('comment on policy'),
);

const KST = "(now() at time zone 'Asia/Seoul')::date";

describe('20260911e — 배너 게재 창을 서버가 KST 로 판정한다', () => {
  it('시작·종료 양쪽을 KST 로 본다', () => {
    expect(policy).toContain(`starts_at <= ${KST}`);
    expect(policy).toContain(`ends_at   >= ${KST}`);
  });

  it('🔴 정책 본문에 UTC current_date 가 한 글자도 남지 않았다', () => {
    expect(policy.toLowerCase()).not.toContain('current_date');
  });

  it('나머지 노출 조건(활성·이미지 있음)을 잃지 않았다 — 20260904g 가 좁혀 둔 범위 유지', () => {
    expect(policy).toContain('active');
    expect(policy).toContain("coalesce(btrim(image_url), '') <> ''");
    expect(policy).toContain('for select to anon, authenticated');
  });

  it('관리자 정책을 건드리지 않는다 — 예약·만료 배너는 관리 화면에서 보여야 한다', () => {
    // drop 은 public 정책 하나만
    const drops = SQL.split('\n').filter((l) => l.trimStart().startsWith('drop policy'));
    expect(drops).toHaveLength(1);
    expect(drops[0]).toContain('home_banners_read_public');
    expect(SQL).not.toMatch(/^\s*create policy home_banners_read_admin/m);
  });

  it('적용 뒤 스스로 검사하고 아니면 중단한다 (20260818f 와 같은 방식)', () => {
    const check = SQL.slice(SQL.indexOf('do $$'));
    expect(check).toContain('from pg_policies');
    expect(check).toContain("not like '%Asia/Seoul%'");
    expect(check).toContain("upper(v_src) like '%CURRENT_DATE%'");
    expect(check).toContain('home_banners_read_admin');
    expect(check).toMatch(/raise exception 'ABORT:/);
  });

  it('데이터를 파괴하지 않는다 — 이 파일은 정책 하나만 바꾼다', () => {
    expect(SQL).not.toMatch(/\b(drop|alter)\s+table\b/i);
    expect(SQL).not.toMatch(/^\s*(delete|update|truncate)\s/im);
    expect(SQL).not.toMatch(/drop\s+function/i);
  });

  it('PostgREST 가 새 정책을 집도록 스키마 리로드를 알린다', () => {
    expect(SQL).toContain("notify pgrst, 'reload schema'");
  });
});

// ── 클라이언트가 같은 기준을 쓰는가 ────────────────────────────────────
const banner = (over: Partial<HomeBanner> = {}): HomeBanner => ({
  id: 'b1', title: '', subtitle: '', imageUrl: 'https://x/y.webp', linkUrl: '', sortOrder: 0,
  startsAt: null, endsAt: null, active: true, ...over,
});

describe('클라이언트도 KST 로 본다 — 기준이 갈리면 좁은 쪽이 이긴다', () => {
  it('src/api/homeBanners.ts 는 기기 로컬 날짜를 쓰지 않는다', () => {
    const src = readFileSync(join(__dirname, 'homeBanners.ts'), 'utf-8');
    expect(src).toContain("from '../lib/kst'");
    // 호출을 금지하는 것이지 주석에서 언급하는 것까지 막지는 않는다(왜 안 쓰는지는 적혀 있어야 한다).
    expect(src).not.toContain('new Date().toLocaleDateString');
  });

  it('관리 화면 뱃지도 같은 기준이다 — 관리자엔 게재중인데 손님 홈엔 없는 상태를 막는다', () => {
    const src = readFileSync(join(root, 'src', 'components', 'features', 'HomeBannersCard.tsx'), 'utf-8');
    expect(src).toContain('kstToday()');
    expect(src).not.toContain('new Date().toLocaleDateString');
  });

  it('🔴 자정 경계 — 한국 0시 1분에 "오늘 시작" 배너가 곧바로 게재된다', () => {
    // 2026-09-10 15:01Z = KST 2026-09-11 00:01. 이 시각 UTC 날짜는 아직 09-10 이다.
    const t = kstToday(Date.UTC(2026, 8, 10, 15, 1));
    expect(t).toBe('2026-09-11');

    const rows = [banner({ id: 'today', startsAt: '2026-09-11' })];
    expect(homeBannerFeed(rows, t, false).banners.map((b) => b.id)).toEqual(['today']);

    // 옛 동작(UTC 날짜)이었다면 같은 순간에 한 장도 안 보였다 — 이게 업주가 겪던 증상이다.
    expect(homeBannerFeed(rows, '2026-09-10', false).banners).toEqual([]);
  });

  it('🔴 자정 경계 — 어제 끝난 배너는 한국 0시 1분에 이미 내려가 있다', () => {
    const t = kstToday(Date.UTC(2026, 8, 10, 15, 1));   // KST 09-11 00:01
    const rows = [banner({ id: 'ended', endsAt: '2026-09-10' })];
    expect(homeBannerFeed(rows, t, false).banners).toEqual([]);

    // 옛 동작이었다면 아침 9시까지 만료 배너가 그대로 서 있었다.
    expect(homeBannerFeed(rows, '2026-09-10', false).banners.map((b) => b.id)).toEqual(['ended']);
  });

  it('한국 오전 9시 이후에는 UTC 와 KST 가 같은 날이라 차이가 없다 (회귀 없음 확인)', () => {
    // 2026-09-11 01:00Z = KST 10:00
    expect(kstToday(Date.UTC(2026, 8, 11, 1, 0))).toBe('2026-09-11');
  });
});
