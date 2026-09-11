// 커뮤니티 광고 노출 조건이 **서버(SQL)** 에 있는가 (2026-09-11)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   광고 노출 판정(활성·게재 창·글 존재·블라인드 아님)은 종전에 전부 클라이언트에 있었다.
//   그래서 기기 시계를 되돌리면 만료 광고가 계속 보였고, anon 키만으로 꺼진 광고 문구까지 읽혔다.
//   이번에 그 판정을 community_ads_public() 안으로 옮겼는데, 이건 DB 에 적용해야만 도는 코드라
//   단위 테스트가 실행으로 검증할 수 없다. 그래서 **조건이 SQL 안에 실제로 적혀 있는지**를 잠근다.
//   (실행 검증은 e2e/community-ads.spec.ts 가 RPC 응답을 라우팅해서, 그리고 적용 시 마이그레이션
//    하단의 검증 SQL 이 맡는다.)
//
// 이 테스트가 잡는 회귀: 누가 조건 한 줄을 지우거나 클라이언트로 되돌리는 것.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911a_community_ads_promoted_posts.sql'),
  'utf-8',
);
/** RPC 본문만 — 주석에 적힌 예시가 통과시켜 주는 착시를 막는다. */
const body = SQL.slice(SQL.indexOf('create or replace function public.community_ads_public'), SQL.indexOf('comment on function'));

describe('20260911a — 광고 노출 조건은 서버가 판정한다', () => {
  it('슬롯 ↔ 게시글 관계를 만들고, 글이 지워지면 연결만 끊는다', () => {
    expect(SQL).toContain('add column if not exists post_id uuid references public.community_posts(id) on delete set null');
  });

  it('꺼진 광고는 나가지 않는다', () => {
    expect(body).toMatch(/where\s+a\.active/);
  });

  it('게시글이 연결되지 않은 슬롯은 나가지 않는다 (빈 AD 행이 생길 수 없다)', () => {
    expect(body).toContain('a.post_id is not null');
    // join 이라 글이 삭제(=post_id NULL)되면 행 자체가 사라진다
    expect(body).toContain('join public.community_posts p on p.id = a.post_id');
  });

  it('블라인드된 글은 광고로 나가지 않는다', () => {
    expect(body).toContain("coalesce(p.blinded, false) = false");
  });

  it('게재 창(시작·종료)을 서버의 KST 로 판정한다 — 기기 시계로 우회할 수 없다', () => {
    expect(body).toContain("a.starts_at  <= (now() at time zone 'Asia/Seoul')::date");
    expect(body).toContain("a.expires_at >= (now() at time zone 'Asia/Seoul')::date");
  });

  it('슬롯 순서가 안정적이다', () => {
    expect(body).toContain('order by a.slot');
  });

  it('같은 글이 두 활성 슬롯에 들어갈 수 없다', () => {
    expect(SQL).toContain('create unique index if not exists community_ads_active_post_uidx');
    expect(SQL).toContain('where (post_id is not null and active)');
  });

  it('종료일이 시작일보다 빠른 입력은 데이터로 남지 않는다', () => {
    expect(SQL).toContain('check (starts_at is null or expires_at is null or expires_at >= starts_at)');
  });

  it('SECURITY DEFINER 는 search_path 를 고정하고, 읽기 RPC 라 anon 에만 실행 권한을 준다', () => {
    expect(body).toContain('security definer');
    expect(body).toContain('set search_path = public, pg_temp');
    expect(SQL).toContain('revoke execute on function public.community_ads_public() from public;');
    expect(SQL).toContain('grant execute on function public.community_ads_public() to anon, authenticated, service_role;');
  });

  it('옛 문구 컬럼을 파괴적으로 지우지 않는다 (롤백·이력 보존)', () => {
    expect(SQL).not.toMatch(/drop\s+column\s+if\s+exists\s+(title|link_url|advertiser)/i);
    for (const col of ['title', 'link_url', 'advertiser']) {
      expect(SQL).toContain(`comment on column public.community_ads.${col} is`);
    }
  });

  it('미연결 광고는 active 만 끄고 내용은 남긴다', () => {
    expect(SQL).toContain('set active = false');
    expect(SQL).toContain('where post_id is null and active and btrim(coalesce(title, \'\')) <> \'\'');
    // update 문이 title/link_url/advertiser 를 건드리지 않는다
    const upd = SQL.slice(SQL.indexOf('update public.community_ads'), SQL.indexOf('-- ── §4'));
    expect(upd).not.toMatch(/set[\s\S]*\btitle\s*=/);
  });

  it('테이블 읽기 축소(§5)는 앱 배포 뒤 실행하도록 주석으로 분리돼 있다', () => {
    const tail = SQL.slice(SQL.indexOf('§5 원본 테이블 공개 읽기 축소'));
    expect(tail).toContain('community_ads_read_admin');
    // 실행문이 아니라 주석이어야 한다 — 지금 돌리면 옛 번들이 광고를 못 읽는다
    for (const line of tail.split('\n')) {
      if (line.includes('create policy') || line.includes('drop policy')) {
        expect(line.trimStart().startsWith('--'), `§5 는 주석이어야 한다: ${line}`).toBe(true);
      }
    }
  });
});

// ── 반환 컬럼 계약 ───────────────────────────────────────────────────────────
// 왜 이걸 잠그나: 광고도 일반 피드와 **같은 rowToPost** 를 탄다(src/api/community.ts).
//   그 매핑은 없는 컬럼을 `?? 0` / `?? null` 로 접으므로, RPC 가 한 칸 빠뜨려도 타입도 테스트도
//   조용히 통과하고 **광고 카드만 값이 빈다**. 실제로 badbeat_count·goodrun_count 가 빠져
//   승격된 글의 추천·비추천이 항상 0 이었고, PostRowCard 는 둘 다 0 이면 그 줄을 통째로 감춰
//   일반 목록에서 보이던 '▲12 ▼3' 이 광고 자리에서 사라졌다(2026-09-11).
const COMMUNITY = readFileSync(join(__dirname, 'community.ts'), 'utf-8');
/** rowToPost 본문만 — 다른 매핑(댓글 등)이 읽는 컬럼까지 끌어오지 않는다. */
const MAPPING = COMMUNITY.slice(
  COMMUNITY.indexOf('export const rowToPost'),
  COMMUNITY.indexOf('export async function getPostsByUser'),
);
/** returns table(...) 선언부에서 SQL 주석을 걷어 낸 것 — 주석에 적힌 이름이 통과시키면 안 된다. */
const DECLARED = body
  .slice(body.indexOf('returns table('), body.indexOf('language sql'))
  .replace(/--[^\n]*/g, '');

/** RPC 가 **일부러** 안 싣는 컬럼과 그 이유. 여기 없는 누락은 실패다. */
const INTENTIONAL: Record<string, string> = {
  blinded: '서버가 where 로 이미 거른다 — 블라인드 글은 애초에 안 온다(rowToPost 가 false 로 접는 것이 맞다)',
};

describe('20260911a — 광고 행은 일반 피드와 같은 모양이다', () => {
  it('rowToPost 가 읽는 컬럼을 RPC 가 전부 싣는다', () => {
    const read = [...new Set([...MAPPING.matchAll(/\br\.([a-z_]+)/g)].map((m) => m[1]))];
    expect(read.length, 'rowToPost 본문을 못 잘랐다 — 슬라이스 기준 문자열을 확인하라').toBeGreaterThan(10);
    const missing = read.filter((c) => !INTENTIONAL[c] && !new RegExp(`\\b${c}\\b`).test(DECLARED));
    expect(missing, `RPC 가 안 싣는데 rowToPost 가 읽는다 → ?? 로 접혀 광고만 값이 빈다: ${missing.join(', ')}`).toEqual([]);
  });

  it('추천·비추천이 실제로 실린다', () => {
    // 위 계약이 일반적으로 막지만, 실제로 터졌던 두 칸은 이름으로 한 번 더 못박는다.
    expect(DECLARED).toMatch(/\bbadbeat_count\b/);
    expect(DECLARED).toMatch(/\bgoodrun_count\b/);
    expect(body).toMatch(/coalesce\(p\.badbeat_count/);
    expect(body).toMatch(/coalesce\(p\.goodrun_count/);
  });
});
