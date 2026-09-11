// 제재 게이트가 댓글·쪽지·구인글까지 덮는가 — **서버(SQL)** 계약 (20260911n, 2026-09-11)
//
// 왜 마이그레이션 텍스트를 테스트하나
//   변경이 전부 DB 트리거·정책 DDL 이라 단위 테스트가 실행으로 검증할 수 없고, e2e 는 운영 DB 에
//   쓰기를 못 한다(e2e/write-guard.spec.ts 가 비-GET 을 네트워크 단에서 끊는다).
//   실행 검증은 적용 시 마이그레이션 하단 DO 블록이 맡는다 — 어긋나면 전체 롤백.
//
// 이 테스트가 잡는 회귀: 테이블을 하나 빠뜨리는 것 · 고객센터/신고까지 막아 이의제기를 봉쇄하는 것 ·
// 함수를 CREATE OR REPLACE 해 ACL 을 날리는 것 · comments UPDATE 게이트를 전체 UPDATE 로 넓혀
// 훗날 시스템 UPDATE 를 오폭하게 만드는 것 · 작성자 위조를 막는 WITH CHECK 을 빼는 것 ·
// 클라이언트가 RLS 원문을 그대로 토스트하게 되는 것.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260911n_sanction_gate_comments.sql'),
  'utf-8',
);
const API = readFileSync(join(__dirname, 'community.ts'), 'utf-8');

/** 머리말 주석이 통과시켜 주는 착시를 막는다 — 첫 DDL 이후만 본다(20260911i 테스트와 같은 관행). */
const DDL = SQL.slice(SQL.indexOf('drop trigger if exists trg_require_active_comment '));

const GATED: [string, string][] = [
  ['comment', 'comments'], ['live', 'live_wall'],
  ['dealer_post', 'dealer_posts'], ['dealer_app', 'dealer_applications'],
  ['group_post', 'group_posts'], ['group_msg', 'group_messages'],
  ['venue_msg', 'venue_messages'], ['listing_msg', 'listing_messages'],
  ['user_msg', 'user_messages'],
];

describe('20260911n — 제재 게이트를 댓글·쪽지·구인글까지 넓힌다', () => {
  it('선행 마이그레이션을 머리말에 못박는다', () => {
    expect(SQL).toContain('20260820e');
  });

  it.each(GATED)('%s: BEFORE INSERT 트리거가 %s 에 붙고 멱등하다', (name, table) => {
    expect(DDL).toContain(`drop trigger if exists trg_require_active_${name} on public.${table};`);
    expect(DDL).toContain(
      `create trigger trg_require_active_${name} before insert on public.${table}\n` +
      `  for each row execute function public.require_active_author();`,
    );
  });

  it('comments 는 내용 바꿔치기(UPDATE)도 막되 컬럼을 못박는다 — 전체 UPDATE 로 넓히지 않는다', () => {
    expect(DDL).toContain(
      'create trigger trg_require_active_comment_edit before update of content, post_id on public.comments',
    );
    expect(DDL).not.toMatch(/before update on public\./);
    expect((DDL.match(/before update of/g) ?? []).length).toBe(1);
  });

  // 🔴 트리거만으로는 20260726c 가 지적한 구멍이 안 닫힌다 — 그건 '제재 계정'만 막기 때문이다.
  //    정상 회원의 작성자 위조(user_id 바꿔치기)는 정책 WITH CHECK 이 막는다.
  it('comments_update_self 에 WITH CHECK 을 붙여 작성자 위조를 닫는다', () => {
    expect(SQL).toContain(
      "alter policy comments_update_self on public.comments with check (user_id = (select auth.uid()))",
    );
    expect(SQL).toContain('ABORT: comments_update_self 에 WITH CHECK 이 없다');
    // USING 은 건드리지 않는다 — 조회·realtime 과 무관해야 한다
    expect(SQL).not.toMatch(/alter policy comments_update_self[^\n]*using/i);
    expect(DDL).not.toMatch(/create policy|drop policy/i);
  });

  it('나머지 8개는 INSERT 만 건다 — 읽음 처리·마감 처리(UPDATE)를 막으면 기능이 죽는다', () => {
    for (const t of ['user_messages', 'listing_messages', 'dealer_posts', 'live_wall',
                     'group_messages', 'group_posts', 'venue_messages', 'dealer_applications']) {
      expect(DDL).not.toContain(`update of content, post_id on public.${t}`);
    }
  });

  it('이의제기·신고·차단은 열어 둔다 — 트리거를 걸지 않고, 실수로 걸리면 적용이 ABORT 한다', () => {
    for (const t of ['support_inquiries', 'reports', 'user_blocks']) {
      expect(DDL).not.toMatch(new RegExp(`create trigger \\S+ before \\w+ on public\\.${t}\\b`));
    }
    expect(SQL).toContain("c.relname in ('support_inquiries', 'reports', 'user_blocks')");
    expect(SQL).toContain('ABORT: 이의제기·신고·차단 경로까지 막혔다');
  });

  it('함수를 다시 만들지 않는다 — CREATE OR REPLACE 는 ACL 을 초기화한다', () => {
    expect(SQL).not.toContain('create or replace function');
    expect(SQL).toContain(
      'revoke execute on function public.require_active_author() from public, anon, authenticated;',
    );
    expect(SQL).toContain('grant execute on function public.require_active_author() to service_role;');
    // 읽기 RPC 인 is_account_active 는 건드리지 않는다(e2e/_fixtures.ts 허용목록)
    expect(SQL).not.toMatch(/revoke[^\n]*is_account_active/);
  });

  // 🔴 '제재'만이 아니라 status='pending'(승인 대기 업주)도 막힌다는 사실을 머리말에 남겨 둔다.
  //    이 한 줄이 사라지면 다음 사람이 같은 함정을 다시 밟는다.
  it('pending(승인 대기 업주)도 막힌다는 사실이 머리말에 적혀 있다', () => {
    expect(SQL).toContain('pending');
    expect(SQL).toContain("role='venue_owner' and approved and status <> 'active'");
  });

  it('자가검사가 기존 3개까지 함께 전수로 본다 — 다음에 누가 하나를 떼면 적용이 멈춘다', () => {
    // 자가검사의 VALUES 목록을 잘라 그 안에서만 본다 — 첫 항목에는 타입 캐스트가 붙으므로
    // `('community_posts')` 처럼 통짜로 찾으면 SQL 이 맞는데도 실패한다(실제로 걸렸다).
    const list = SQL.slice(SQL.indexOf("('community_posts'"), SQL.indexOf('ABORT: 제재 게이트(작성)가 빠진 테이블'));
    for (const t of ['community_posts', 'venue_reviews', 'marketplace_listings', 'comments']) {
      expect(list, `자가검사 목록에 ${t} 가 없다`).toContain(`'${t}'`);
    }
    expect(SQL).toContain('ABORT: 제재 게이트(작성)가 빠진 테이블');
    expect(SQL).toContain('ABORT: comments 내용 바꿔치기 게이트(UPDATE)가 없다');
    expect(SQL).toContain('ABORT: 제재 판정 함수가 없거나 SECURITY DEFINER·search_path 고정이 아니다');
    // BEFORE(2)·INSERT(4)·UPDATE(16) 비트를 실제로 확인한다 — 이름만 보면 AFTER 로 바뀌어도 통과한다
    expect(SQL).toContain('(g.tgtype & 2) <> 0');
    expect(SQL).toContain('(g.tgtype & 4) <> 0');
    expect(SQL).toContain('(g.tgtype & 16) <> 0');
    // search_path 고정까지 본다(prosecdef 만 보면 search_path 를 잃은 재정의를 놓친다)
    expect(SQL).toContain("like '%search_path=%'");
  });

  it('데이터를 건드리지 않는다', () => {
    expect(DDL).not.toMatch(/\b(drop table|truncate|delete from)\b/i);
    expect(DDL).not.toMatch(/alter table/i);
    expect(DDL).not.toMatch(/update public\./i);
  });

  it('클라이언트는 서버 사유만 올리고 RLS 원문은 뭉갠다(보안표준 6)', () => {
    expect(API).toContain(
      "if (error) throw new Error(error.code === 'P0001' ? error.message : '댓글 등록에 실패했습니다');",
    );
  });
});
