// src/api/signupRoleWhitelist.migration.test.ts
//
// 가입 트리거(handle_new_user)가 가입자가 보낸 역할을 믿지 않는다는 계약을 CI 에 고정한다(2026-10-01 A-01·R1).
//
// 🔴 이 파일이 하는 일과 안 하는 일
//   한다  : 가입 트리거를 정의한 **가장 최근** 마이그레이션이 역할을 허용 목록(venue_owner 하나)으로만 정하는지,
//           옛 형태(메타데이터 role 을 user_role 로 그대로 캐스트)가 돌아오지 않았는지 본다.
//   안 한다: DB 행동 검증. 그건 라이브 롤백 리허설이 했다(20261001a·b 머리말 참고). 초록 ≠ 라이브 동작.
//
// ⚠ 이 부류 테스트의 위험은 거짓 통과다 — 대상 파일을 못 찾으면 검사가 0개가 된다. 그래서 앵커부터 단언한다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = resolve(__dirname, '../../supabase/migrations');

/** 주석(`-- …`)을 지운 SQL — 설명문의 글자가 계약을 거짓 통과시키지 않게. */
function codeOnly(sql: string): string {
  return sql.split('\n').map((l) => { const i = l.indexOf('--'); return i < 0 ? l : l.slice(0, i); }).join('\n');
}

/** handle_new_user 를 정의하는 마이그레이션 중 파일명순 마지막 = 라이브 정본 후보. */
function latestDefinition(): { file: string; code: string } {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const hits = files.filter((f) => /create\s+or\s+replace\s+function\s+public\.handle_new_user\s*\(/i
    .test(codeOnly(readFileSync(resolve(DIR, f), 'utf8'))));
  const file = hits[hits.length - 1];
  return { file, code: codeOnly(readFileSync(resolve(DIR, file), 'utf8')) };
}

describe('가입 트리거 역할 허용 목록 (20261001a·b)', () => {
  it('앵커: 가입 트리거 정의 파일을 찾았고 20261001b 이후다', () => {
    const { file, code } = latestDefinition();
    expect(file, '가입 트리거 정의 마이그레이션이 없다').toBeTruthy();
    expect(file >= '20261001b', `가장 최근 정의가 ${file} — 허용 목록 이전 판으로 돌아갔다`).toBe(true);
    expect(code.replace(/\s/g, '').length).toBeGreaterThan(1500);
  });

  it('메타데이터 role 을 user_role 로 그대로 캐스트하지 않는다(가입만으로 admin 이 되던 형태)', () => {
    const { code } = latestDefinition();
    expect(code).not.toMatch(/coalesce\s*\(\s*\(\s*new\.raw_user_meta_data\s*->>\s*'role'\s*\)\s*::\s*user_role/i);
    expect(code).not.toMatch(/\(\s*new\.raw_user_meta_data\s*->>\s*'role'\s*\)\s*::\s*user_role/i);
  });

  it("역할은 venue_owner 하나만 허용하고 나머지는 'user' 다", () => {
    const { code } = latestDefinition();
    expect(code).toMatch(/new\.raw_user_meta_data\s*->>\s*'role'\s*=\s*'venue_owner'/i);
    expect(code).toMatch(/else\s+'user'\s*::\s*user_role/i);
    expect(code, "가입으로 admin 을 줄 수 있는 문자열이 있다").not.toMatch(/'admin'\s*::\s*user_role/i);
  });

  it('쓰이지 않는 직원 가입 분기(임의 venue_id 로 남의 매장에 붙던 것)가 없다', () => {
    const { code } = latestDefinition();
    // 함수 본문만 본다 — 파일 끝 자가검사 블록이 'venue_staff' 문자열을 '없어야 한다' 는 뜻으로 담고 있다.
    const m = code.match(/as\s+\$function\$([\s\S]*?)\$function\$\s*;/i);
    expect(m, '함수 본문($function$ … $function$)을 못 찾았다').not.toBeNull();
    const body = m?.[1] ?? '';
    expect(body.length).toBeGreaterThan(1000);
    expect(body).not.toMatch(/'venue_staff'/i);
    expect(body).not.toMatch(/raw_user_meta_data\s*->>\s*'venue_id'/i);
  });

  it('트리거 함수 실행 권한을 클라이언트에서 회수한다', () => {
    const { code } = latestDefinition();
    expect(code).toMatch(/revoke\s+all\s+on\s+function\s+public\.handle_new_user\(\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i);
  });
});
