// fail-open 가드 재발 방지 계약 (2026-09-15)
//
// 무엇을 막는가
//   `my_role() <> 'admin'` 은 profiles 행이 없는 세션에서 **NULL** 이 되고, plpgsql 의 `if NULL then` 은
//   거짓처럼 **건너뛴다** → 가드가 통째로 열린다(fail-open). CLAUDE.md 보안 표준 2번이 `IS DISTINCT FROM` 을
//   요구하는 이유이고, 2026-08-20 에 실제로 사고가 났던 자리다.
//   도달 경로도 실재한다: `profiles_id_fkey … ON DELETE CASCADE` 때문에 대시보드에서 사용자를 지우면
//   프로필이 연쇄 삭제되는데 그 사용자의 액세스 토큰은 **만료까지 계속 통과**한다.
//
// 왜 이 테스트가 생겼나 — 20260913a 의 은퇴를 대신한다
//   `20260913a_null_safe_admin_guards.sql` 은 라이브 함수 본문을 정규식으로 다시 쓰는 752줄짜리 마이그레이션이었다.
//   그 파일의 위험은 전부 '판정기'(주석·문자열·CASE 식을 코드와 가르는 정규식)에서 나왔고,
//   nuri-migration §5-2 는 "판정기 자체의 결함은 파일이 스스로 못 본다"고 적어 두었다.
//   그런데 2026-09-14 의 20260914c·20260914d 가 **남아 있던 대상을 전부 직접 고치면서** 그 파일의
//   대상 집합이 비었다. 2026-09-15 라이브 전수 스캔(plpgsql·sql 함수 + RLS 정책, 주석·문자열 제거 후)
//   결과 **0건**이라, 적용해도 바뀌는 것이 없고 판정기 위험만 남는다 → 적용하지 않고 은퇴시켰다.
//   대신 **재발을 소스에서 막는** 것이 이 파일이다.
//
// 이 테스트가 못 보는 것
//   · 라이브 DB 의 실제 함수 본문(vitest 는 DB 에 붙지 않는다). 라이브 확인은 리드가 적용 때마다 쿼리로 한다.
//   · 마이그레이션이 아닌 경로로 만들어진 함수(대시보드 직접 편집 등).
// 실행: npx vitest run src/api/nullSafeAdminGuard.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '..', '..', 'supabase', 'migrations');

/** 주석(줄·블록)과 문자열 리터럴을 지운다 — 설명문에 적힌 `my_role() <>` 를 코드로 오인하지 않게.
 *  (nuri-migration §5-2 가 기록한 함정: 정규식만으로는 코드와 주석·문자열을 가를 수 없다.) */
const codeOnly = (sql: string): string =>
  sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'([^']|'')*'/g, ' ');

const VULNERABLE = /my_role\(\)\s*(<>|!=)/;

/** 이미 저장소에 있던 파일들 — 전부 **이후 파일이 다시 정의해** 라이브는 0건이다(2026-09-15 실측).
 *  과거 파일을 고치면 적용된 마이그레이션의 이력이 사실과 달라지므로 그대로 둔다.
 *  ⚠ 이 목록에 **새 이름을 추가하지 마라.** 새 마이그레이션은 처음부터 `is distinct from` 으로 쓴다. */
const HISTORICAL = new Set([
  '20260614b_voucher_quota.sql',
  '20260817a_accrue_voucher_quota_deduction.sql',
  '20260817b_columns_expiry_grade_geo.sql',
  '20260817d_notification_wiring.sql',
  '20260818f_ledger_business_day_and_close_seal.sql',
  '20260818g_ledger_atomic_player_ops.sql',
  '20260829j_community_shouts.sql',
  '20260830a_point_sink_economy.sql',
  '20260830c_refund.sql',
  '20260830d_refund_hardening.sql',
  // 은퇴한 파일 자신 — 고치려던 패턴을 예시로 들고 있다(적용하지 않는다).
  '20260913a_null_safe_admin_guards.sql',
]);

describe('fail-open 관리자 가드가 새 마이그레이션으로 다시 들어오지 않는다', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql'));

  it('마이그레이션 디렉터리를 실제로 읽었다(앵커가 비면 이 테스트는 아무것도 안 본다)', () => {
    expect(files.length, 'supabase/migrations 에서 .sql 을 하나도 못 읽었다').toBeGreaterThan(100);
  });

  it('과거 목록 밖의 파일에는 `my_role() <>` 가 없다', () => {
    const offenders = files.filter(
      (f) => !HISTORICAL.has(f) && VULNERABLE.test(codeOnly(readFileSync(join(DIR, f), 'utf-8'))),
    );
    expect(
      offenders,
      `fail-open 가드다. NULL 세션에서 if 를 통째로 건너뛴다 — \`is distinct from\` 을 써라(CLAUDE.md 보안 §2).\n대상: ${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('과거 목록이 현실과 맞다 — 이미 고쳐진 파일이 목록에 남아 있지 않다', () => {
    // 목록은 '면제'라서 넓어지면 검사가 조용히 헐거워진다. 실제로 패턴이 있는 파일만 남아 있어야 한다.
    const stale = [...HISTORICAL].filter(
      (f) => !files.includes(f) || !VULNERABLE.test(codeOnly(readFileSync(join(DIR, f), 'utf-8'))),
    );
    expect(stale, `면제 목록에 불필요한 항목이 있다 — 지워야 검사가 좁아진다: ${stale.join(', ')}`).toEqual([]);
  });

  it('은퇴한 20260913a 가 스스로 적용 금지를 밝힌다', () => {
    const sql = readFileSync(join(DIR, '20260913a_null_safe_admin_guards.sql'), 'utf-8');
    expect(sql, '20260913a 에 은퇴 표시가 없다 — 다음 사람이 적용할 수 있다').toMatch(/은퇴|적용하지 않는다|대상 집합이 비었다/);
  });
});
