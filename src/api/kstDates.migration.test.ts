// 날짜 판정이 KST 인가 — 서버 SQL · 엣지 함수 (2026-09-11)
//
// 왜 이런 테스트가 필요한가
//   Supabase 서버 TimeZone 은 UTC 라 `current_date` 는 **한국시간 00:00~08:59 동안 전날**이다.
//   같은 부류를 이미 세 번 고쳤다 — 20260818f(장부 영업일) · 20260911e(배너 게재창) · 20260911f(이 파일).
//   전부 DB·엣지에 적용해야만 도는 코드라 단위 테스트가 실행으로 검증할 수 없다.
//   그래서 **조건이 소스 안에 실제로 적혀 있는지**를 잠근다(ads.migration.test.ts 와 같은 방식).
//
// 이 테스트가 잡는 회귀: 누가 KST 판정을 UTC 로 되돌리는 것.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const SQL = readFileSync(join(root, 'supabase', 'migrations', '20260911f_kst_date_defaults_and_season_window.sql'), 'utf-8');
const KST = "(now() at time zone 'Asia/Seoul')::date";

// ⚠ 앵커는 **머리말 주석과 겹치지 않는 문구**로 잡는다. 머리말에도 '① date 컬럼 default' 가 있어서
//   그걸로 자르면 슬라이스가 주석부터 시작해 아래 검사가 전부 무의미해진다(실제로 걸렸다 — 20260911e 때도 같은 실수).
/** 앵커를 찾아 자른다. 못 찾거나 순서가 뒤집히면 **조용히 빈 문자열이 되어 아래 검사가 전부 통과해 버리므로**
 *  여기서 먼저 터뜨린다(빈 슬라이스에 not.toContain 을 걸면 늘 초록이다 — 가장 위험한 종류의 통과). */
const cut = (from: string, to: string) => {
  const a = SQL.indexOf(from), b = SQL.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error(`슬라이스 앵커가 잘못됐다: ${from} → ${to} (${a}, ${b})`);
  return SQL.slice(a, b);
};
/** ① DDL 구간만 — alter table 6줄. */
const DDL = cut('-- ── ① date 컬럼 default → KST', '-- ── ② 시즌 뱃지 기간 판정 → KST');
/** ② 함수 3개 블록만 — 적용 시 자가검사가 prosrc 를 grep 하므로 여기엔 옛 표현이 한 글자도 없어야 한다. */
const FUNCS = cut('create or replace function public.buy_season_badge', '-- ACL 재선언');
/** 실행되는 전체 — 머리말·롤백 주석 제외. */
const RUN = DDL + FUNCS;

describe('20260911f — date default 6곳이 KST 다', () => {
  const COLS: [string, string][] = [
    ['venue_rankings', 'ranking_date'],
    ['bankroll_entries', 'entry_date'],
    ['ledger_buyins', 'session_date'],
    ['ledger_players', 'session_date'],
    ['ledger_sessions', 'session_date'],
    ['ledger_buyin_requests', 'session_date'],
  ];

  it.each(COLS)('%s.%s 의 default 가 KST 다', (table, col) => {
    expect(RUN).toContain(`alter table public.${table}\n  alter column ${col} set default ${KST};`);
  });

  it('🔴 실행 구간에 UTC 날짜가 한 글자도 남지 않았다', () => {
    expect(RUN.toLowerCase()).not.toContain('current_date');
  });

  it('컬럼 타입이나 데이터를 건드리지 않는다 — default 만 바꾼다(기존 행 영향 0)', () => {
    // DDL 구간만 본다. 시즌 뱃지 함수 본문에는 원래 update public.profiles 가 있고 그건 정상이다.
    expect(DDL).not.toMatch(/alter\s+column\s+\w+\s+type\b/i);
    expect(DDL).not.toMatch(/\b(drop\s+table|drop\s+column|truncate)\b/i);
    expect(DDL).not.toMatch(/^\s*(delete|update)\s+/im);
    expect(DDL.match(/alter table public\./g)).toHaveLength(6);
  });
});

describe('20260911f — 시즌 뱃지 기간 판정 3곳이 KST 다', () => {
  it('buy_season_badge — 시작일 아침에 "진행 중인 시즌이 없어요" 로 거절하지 않는다', () => {
    expect(FUNCS).toContain(`     and ${KST} between s.starts_on and s.ends_on\n   order by s.ends_on`);
  });

  it('my_season_badges — ongoing 라벨이 KST 기준이다', () => {
    expect(FUNCS).toContain(`(s.status = 'active' and ${KST} between s.starts_on and s.ends_on)`);
  });

  it('my_buyable_season_badges — 끝난 시즌이 9시간 더 팔리지 않는다', () => {
    expect(FUNCS).toContain(`     and ${KST} between s.starts_on and s.ends_on`);
  });

  it('🔴 함수 본문에 옛 표현이 없다 — prosrc 자가검사가 주석까지 grep 한다', () => {
    // PostgreSQL 의 prosrc 에는 **본문 주석도 들어간다**. 설명하려고 언급만 해도 적용 시 ABORT 로 터진다.
    expect(FUNCS.toLowerCase()).not.toContain('current_date');
  });

  it('원본(20260830n)의 가드를 하나도 잃지 않았다 — 본문을 손으로 옮겨 적다 빠뜨리는 사고 방지', () => {
    for (const guard of [
      "raise exception '로그인이 필요합니다'",
      "raise exception '판매 중인 상품이 아닙니다'",
      "raise exception '단골(팔로우)한 매장의 뱃지만 살 수 있어요'",
      "raise exception '이 매장은 지금 진행 중인 시즌이 없어요'",
      "raise exception '이번 시즌 뱃지는 이미 갖고 있어요'",
      "raise exception '제재 중인 계정은 구매할 수 없습니다'",
      "raise exception '하루 10번까지만 구매할 수 있어요'",
      'for update',
      'daily_purchase_count',
    ]) expect(FUNCS).toContain(guard);
  });

  it('SECURITY DEFINER 셋 다 search_path 를 고정한다', () => {
    expect(FUNCS.match(/security definer/g)).toHaveLength(3);
    expect(FUNCS.match(/set search_path to 'public', 'pg_temp'/g)).toHaveLength(3);
  });

  it('🔴 CREATE OR REPLACE 가 날린 ACL 을 다시 선언한다 — 변이 RPC 가 anon 에 열리면 사고다', () => {
    for (const fn of ['buy_season_badge(uuid)', 'my_season_badges()', 'my_buyable_season_badges()']) {
      expect(SQL).toContain(`revoke all on function public.${fn} from public, anon;`);
      expect(SQL).toContain(`grant execute on function public.${fn} to authenticated, service_role;`);
    }
  });

  it('적용 뒤 스스로 검사하고 아니면 중단한다 (ACL 까지 확인)', () => {
    const check = SQL.slice(SQL.indexOf('do $$'));
    expect(check).toContain('information_schema.columns');
    expect(check).toContain('pg_proc');
    expect(check).toContain("has_function_privilege('anon'");
    expect(check).toContain("has_function_privilege('authenticated'");
    expect(check).toMatch(/raise exception 'ABORT:/);
    expect(SQL).toContain("notify pgrst, 'reload schema'");
  });
});

describe('만 19세 게이트를 한국 달력으로 센다', () => {
  const EDGE = readFileSync(join(root, 'supabase', 'functions', 'verify-identity', 'index.ts'), 'utf-8');

  it('🔴 나이를 KST 로 센다 — 생일 당일 새벽에 만 19세가 18세로 거절되던 것', () => {
    expect(EDGE).toContain('function kstNow()');
    expect(EDGE).toContain('const now = kstNow();');
    expect(EDGE).not.toContain('const now = new Date();');
  });

  it('게이트 자체는 그대로다 — fail-closed(생년 미확인이면 거부)를 약화하지 않았다', () => {
    expect(EDGE).toContain('if (age === null || age < 19)');
    expect(EDGE).toContain('만 19세 이상만 이용할 수 있습니다');
  });
});

describe('KST 로 세면 나이가 낮아지지 않는다 — 미성년이 통과할 길은 생기지 않는다', () => {
  /** 엣지 함수의 ageFrom 과 같은 식(UTC 접근자로 읽는다). */
  const ageAt = (birthIso: string, nowMs: number, kst: boolean) => {
    const b = new Date(birthIso);
    const now = new Date(kst ? nowMs + 9 * 3600_000 : nowMs);
    let age = now.getUTCFullYear() - b.getUTCFullYear();
    const m = now.getUTCMonth() - b.getUTCMonth();
    if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
    return age;
  };

  it('🔴 생일 당일 한국 새벽 2시 — UTC 로는 18세, KST 로는 19세', () => {
    // 2007-09-11 생. 한국시간 2026-09-11 02:00 = UTC 2026-09-10 17:00
    const now = Date.UTC(2026, 8, 10, 17, 0);
    expect(ageAt('2007-09-11', now, false)).toBe(18);   // 옛 동작 — 합법 이용자를 거절했다
    expect(ageAt('2007-09-11', now, true)).toBe(19);    // 고친 동작
  });

  it('만 18세는 KST 로 세도 여전히 18세다 (게이트가 뚫리지 않는다)', () => {
    const now = Date.UTC(2026, 8, 10, 17, 0);           // KST 2026-09-11 02:00
    expect(ageAt('2008-09-12', now, true)).toBe(17);
    expect(ageAt('2008-09-11', now, true)).toBe(18);
  });

  it('한국 오전 9시 이후에는 두 기준이 같다 (회귀 없음)', () => {
    const now = Date.UTC(2026, 8, 11, 3, 0);            // KST 12:00
    expect(ageAt('2007-09-11', now, false)).toBe(ageAt('2007-09-11', now, true));
  });
});
