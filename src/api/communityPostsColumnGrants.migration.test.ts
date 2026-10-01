// community_posts 는 20261001e 부터 '칸 단위' 쓰기 권한이다 (2026-10-01 · 20261001e)
//
// 왜 이 테스트가 있나
//   20261001e 는 클라이언트가 blinded_source(숨김 출처)를 못 쓰게 하려고 anon·authenticated 의 **표 단위**
//   INSERT/UPDATE 를 거두고, blinded_source 를 뺀 기존 칸에만 칸 단위로 다시 줬다.
//   그 결과 **앞으로 이 표에 칸을 더하면 앱(클라이언트) 쓰기가 자동으로 막힌다** — 글쓰기 화면이 새 칸을 실으면
//   `permission denied` 로 조용히 깨진다. 반대로 누군가 표 단위 GRANT 를 다시 주면 blinded_source 가 다시 열린다.
//
// 이 테스트가 잡는 회귀
//   ① 20261001e 의 회수·칸 단위 재부여 문장이 사라지는 것
//   ② 20261001e 뒤 마이그레이션이 community_posts 에 칸을 더하면서 클라이언트 GRANT 도, '서버 전용' 표시도 없는 것
//   ③ 20261001e 뒤 마이그레이션이 anon·authenticated 에 표 단위 INSERT/UPDATE 를 다시 주는 것(blinded_source 재개방)
// 새 칸을 서버만 쓴다면 같은 파일에 `-- server-only column: <칸>` 한 줄을 남겨라.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');
const BASE = '20261001e_report_dismiss_server_judge.sql';
const BASE_SQL = readFileSync(join(DIR, BASE), 'utf-8');

/** 주석(-- …)을 지운 SQL — 주석에 적힌 문장이 통과시켜 주는 착시를 막는다. */
const code = (sql: string) => sql.replace(/--[^\n]*/g, '');

/** 한 마이그레이션 텍스트에서 위반을 찾는다(순수 함수 — 아래 음성 대조가 이 함수 자체를 시험한다). */
export function findColumnGrantViolations(sql: string): string[] {
  const out: string[] = [];
  const c = code(sql);
  const addRe = /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?community_posts\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi;
  for (const m of c.matchAll(addRe)) {
    const col = m[1];
    const serverOnly = new RegExp(`--\\s*server-only column:\\s*${col}\\b`, 'i').test(sql);
    const granted = new RegExp(
      `grant\\s+[^;]*\\b(insert|update)\\s*\\([^)]*\\b${col}\\b[^)]*\\)[^;]*on\\s+(?:table\\s+)?(?:public\\.)?community_posts\\b`,
      'i',
    ).test(c);
    if (!serverOnly && !granted) out.push(`칸 ${col}: 클라이언트 GRANT 도 server-only 표시도 없다`);
  }
  const tableGrant = /grant\s+([^;(]*?)\s+on\s+(?:table\s+)?(?:public\.)?community_posts\s+to\s+([^;]+);/gi;
  for (const m of c.matchAll(tableGrant)) {
    const privs = m[1].toLowerCase();
    const roles = m[2].toLowerCase();
    if (/\b(insert|update|all)\b/.test(privs) && /\b(anon|authenticated|public)\b/.test(roles)) {
      out.push(`표 단위 ${privs.trim()} 재부여 → blinded_source 가 다시 열린다`);
    }
  }
  return out;
}

const LATER = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql') && f > BASE)
  .sort();

describe('20261001e — community_posts 쓰기 권한은 칸 단위다', () => {
  it('20261001e 가 표 단위 INSERT/UPDATE 를 거두고 blinded_source 를 뺀 칸만 다시 준다', () => {
    const c = code(BASE_SQL);
    expect(c).toContain("execute format('revoke insert, update on public.community_posts from %I', r);");
    expect(c).toContain("execute format('grant insert (%s), update (%s) on public.community_posts to %I', v_cols, v_cols, r);");
    expect(c).toMatch(/column_name <> 'blinded_source'/);
    expect(c).toMatch(/array\['anon', 'authenticated'\]/);
    // 자가검사가 blinded_source 회수와 기존 칸 유지(글쓰기 기능)를 둘 다 본다
    expect(c).toContain("has_column_privilege('authenticated', 'public.community_posts', 'blinded_source', 'insert')");
    expect(c).toContain("has_column_privilege('authenticated', 'public.community_posts', 'content', 'insert')");
  });

  it('20261001e 뒤 마이그레이션은 칸을 더할 때 GRANT 를 함께 두고, 표 단위 GRANT 를 다시 주지 않는다', () => {
    const bad = LATER.flatMap((f) => findColumnGrantViolations(readFileSync(join(DIR, f), 'utf-8')).map((v) => `${f}: ${v}`));
    expect(bad).toEqual([]);
  });

  describe('판정기 음성·양성 대조', () => {
    it('음성: 칸만 더하고 GRANT 가 없으면 잡는다', () => {
      expect(findColumnGrantViolations('alter table public.community_posts add column if not exists mood text;'))
        .toEqual(['칸 mood: 클라이언트 GRANT 도 server-only 표시도 없다']);
    });
    it('음성: 표 단위 INSERT 재부여를 잡는다', () => {
      expect(findColumnGrantViolations('grant insert, update on public.community_posts to authenticated;')).toHaveLength(1);
    });
    it('음성: 주석에만 GRANT 가 적혀 있으면 통과시키지 않는다', () => {
      const sql = 'alter table public.community_posts add column mood text;\n-- grant insert (mood) on public.community_posts to authenticated;';
      expect(findColumnGrantViolations(sql)).toHaveLength(1);
    });
    it('양성: 칸 단위 GRANT 를 함께 두면 통과', () => {
      const sql = 'alter table public.community_posts add column mood text;\ngrant insert (mood), update (mood) on public.community_posts to anon, authenticated;';
      expect(findColumnGrantViolations(sql)).toEqual([]);
    });
    it('양성: 서버 전용 표시가 있으면 통과', () => {
      const sql = '-- server-only column: score\nalter table public.community_posts add column score int;';
      expect(findColumnGrantViolations(sql)).toEqual([]);
    });
    it('양성: 다른 표의 칸 추가·표 단위 GRANT 는 상관없다', () => {
      expect(findColumnGrantViolations('alter table public.comments add column x text;\ngrant insert on public.comments to authenticated;')).toEqual([]);
    });
  });
});
