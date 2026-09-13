// 바인 요청 승인의 경합 방어 계약 — 마이그레이션이 조용히 되돌리는 것을 막는다 (V01 / P1).
//
// 왜 필요한가:
//   `approve_buyin_request` 는 돈(ledger_buyins)과 이용권을 **함께** 움직인다.
//   요청 행을 잠그지 않고 읽으면 다음이 실제로 가능하다(READ COMMITTED, connection 2개):
//     ① A: approve 가 pending 을 읽는다.
//     ② B: reject 가 CAS 로 'rejected' 로 바꾸고 이용권을 active 로 복원한 뒤 커밋.
//     ③ A: 그대로 진행해 바인을 INSERT 하고 status 를 'approved' 로 덮는다.
//   → **active 이용권과 확정 바인이 동시에 남는다.**
//   approve ↔ approve 면 요청 1건에 확정 바인이 2건 생긴다.
//
//   `reject_buyin_request`(20260911b)는 이미 CAS 가 있는데 approve 에만 없었다 —
//   그래서 "거절이 승인을 덮는" 방향만 막히고 반대 방향은 열려 있었다.
//
// ⚠ 이 파일은 **마이그레이션 텍스트의 계약**만 검사한다. 실제 두 connection 경합 실행은
//   운영 DB 권한이 필요해 여기서 하지 않는다 — 그 부분은 여전히 **미검증**이다.
//   함수를 다시 정의하면서 가드를 빠뜨리는 흔한 회귀는 이것으로 잡힌다.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort(); // 파일명 = 적용 순서

/** 마이그레이션 본문은 파일당 한 번만 읽는다 — it() 마다 200개를 다시 읽으면 부하 시 타임아웃이 난다. */
const TEXT = new Map<string, string>();
const sql = (f: string): string => {
  let t = TEXT.get(f);
  if (t === undefined) { t = readFileSync(join(DIR, f), 'utf8'); TEXT.set(f, t); }
  return t;
};

/** 그 함수를 **마지막으로** 정의한 마이그레이션의 본문(뒤 파일이 앞 파일을 덮는다). */
function lastDefinitionOf(fn: string): { file: string; body: string } | null {
  let hit: { file: string; body: string } | null = null;
  for (const f of files) {
    const t = sql(f);
    const m = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i').exec(t);
    if (m) hit = { file: f, body: t.slice(m.index) };
  }
  return hit;
}

/** 함수 본문만 — 뒤따라오는 다른 함수 정의는 잘라낸다. */
function bodyOnly(fn: string): { file: string; body: string } {
  const hit = lastDefinitionOf(fn);
  if (!hit) throw new Error(`${fn} 정의를 찾을 수 없다 — 함수명이 바뀌었는지 확인하라`);
  const next = /create\s+or\s+replace\s+function\s+public\./i.exec(hit.body.slice(1));
  return { file: hit.file, body: next ? hit.body.slice(0, next.index + 1) : hit.body };
}

describe('바인 요청 승인 — 경합 방어 계약', () => {
  it('마이그레이션 폴더를 실제로 읽었다 — 경로가 바뀌면 조용히 통과하는 것을 막는다', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('🔴 승인은 요청 행을 for update 로 잠그고 읽는다', () => {
    const { file, body } = bodyOnly('approve_buyin_request');
    const read = /select\s+\*\s+into\s+r\s+from\s+(?:public\.)?ledger_buyin_requests\s+where\s+id\s*=\s*p_request_id([^;]*);/i
      .exec(body);
    expect(read, `${file}: 요청 행을 읽는 구문을 찾을 수 없다`).toBeTruthy();
    expect(read![1], `${file}: for update 가 없다 — 부수효과(바인 INSERT) 전에 경합을 막지 못한다`)
      .toMatch(/for\s+update/i);
  });

  it('🔴 승인의 상태 전이에 pending 술어가 있다 — 거절을 덮지 못한다', () => {
    const { file, body } = bodyOnly('approve_buyin_request');
    const upd = /update\s+(?:public\.)?ledger_buyin_requests\s+set\s+status\s*=\s*'approved'[\s\S]*?;/i.exec(body);
    expect(upd, `${file}: approved 전이 구문을 찾을 수 없다`).toBeTruthy();
    expect(upd![0], `${file}: where 에 status='pending' 이 없다 — 이미 거절된 요청을 승인으로 덮는다`)
      .toMatch(/status\s*=\s*'pending'/i);
  });

  it('🔴 전이가 0행이면 예외를 던진다 — 조용히 성공으로 끝내지 않는다', () => {
    const { file, body } = bodyOnly('approve_buyin_request');
    const tail = body.slice(body.search(/update\s+(?:public\.)?ledger_buyin_requests\s+set\s+status\s*=\s*'approved'/i));
    expect(tail, `${file}: approved 전이 뒤에 not found 확인이 없다`).toMatch(/if\s+not\s+found\s+then\s+raise/i);
  });

  it('거절도 같은 계약을 유지한다 — 한쪽만 지키면 반대 순서가 열린다', () => {
    const { file, body } = bodyOnly('reject_buyin_request');
    const upd = /update\s+(?:public\.)?ledger_buyin_requests\s+set\s+status\s*=\s*'rejected'[\s\S]*?;/i.exec(body);
    expect(upd, `${file}: rejected 전이 구문을 찾을 수 없다`).toBeTruthy();
    expect(upd![0], `${file}: 거절의 CAS 가 사라졌다`).toMatch(/status\s*=\s*'pending'/i);
  });

  it('승인 RPC 의 실행 권한은 public 에서 회수돼 있다 — anon 만 빼면 무효다', () => {
    // CREATE OR REPLACE 는 ACL 을 초기화하므로, 마지막 정의 파일이 REVOKE 를 다시 써야 한다.
    const { file } = bodyOnly('approve_buyin_request');
    const t = sql(file);
    const rev = /revoke\s+all\s+on\s+function\s+public\.approve_buyin_request[^;]*;/i.exec(t);
    expect(rev, `${file}: 함수를 재정의하고 REVOKE 를 다시 쓰지 않았다 — ACL 이 초기화된 채 남는다`).toBeTruthy();
    expect(rev![0], `${file}: from public 이 없다 — from anon 만으로는 PUBLIC 기본 GRANT 때문에 무효다`)
      .toMatch(/from\s+public/i);

    const grant = /grant\s+execute\s+on\s+function\s+public\.approve_buyin_request[^;]*;/i.exec(t);
    expect(grant, `${file}: 회수만 하고 재부여가 없다 — 운영자가 승인할 수 없게 된다`).toBeTruthy();
    expect(grant![0]).toMatch(/authenticated/i);
  });

  it('승인 함수는 search_path 를 고정한다 — SECURITY DEFINER 하이재킹 방지', () => {
    const { file, body } = bodyOnly('approve_buyin_request');
    expect(body.slice(0, 600), `${file}: set search_path = public, pg_temp 가 없다`)
      .toMatch(/set\s+search_path\s*=\s*public\s*,\s*pg_temp/i);
  });

  it('요청 1건은 확정 바인 1건만 가질 수 있다 — 함수 밖 저장 구조도 경합을 막는다', () => {
    const t = sql('20260912a_buyin_request_approve_race.sql');
    expect(t).toMatch(/create\s+unique\s+index\s+if\s+not\s+exists\s+ledger_buyins_request_uniq/i);
    expect(t).toMatch(/on\s+public\.ledger_buyins\s*\(request_id\)\s*where\s+request_id\s+is\s+not\s+null/i);
    expect(t).toMatch(/ABORT: request_id 중복/);
  });
});
