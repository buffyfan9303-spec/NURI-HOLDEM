// 머니인 점수 임계(100만원 = 100T = 1점)의 계약 게이트 — 클라 상수 두 개와 서버 함수 본문이 한 값인지 못 박는다.
//
// 왜: 점수 계산은 서버 moneyin_points() 에만 있고(rankverify.ts:92 — 클라 재계산 금지), 클라는
//   MONEYIN_UNIT_WON(rankverify.ts)·TICKET_WON(lib/units) 두 상수로 "100T 부터 1점"을 설명만 한다.
//   셋 중 하나만 바뀌면(누군가 moneyin_points 를 create or replace 로 다시 쓰거나 1T 가치를 손대면)
//   화면 설명과 실제 점수가 조용히 어긋난다 — 2026-09-05 오전에 1T=10만 으로 갔다가 폐기된 이력이 있다.
//   기존 테스트는 1T·10T·30T 까지만 있어 100T 환산과 100만원 경계는 어디에도 고정돼 있지 않았다.
//
// DB 실측표(2026-09-09, select moneyin_points(n) — 읽기 전용):
//   999,999 → 0 · 1,000,000 → 1 · 1,999,999 → 1 · 2,000,000 → 2
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MONEYIN_UNIT_WON } from './rankverify';
import { parsePrizeMan, TICKET_MAN } from './rankings';
import { TICKET_WON, manToWon, rankingPrizeWon } from '../lib/units';

describe('티켓 환산 — 1T = 1만원 (20260905f)', () => {
  it.each([
    [1, 10_000],
    [10, 100_000],
    [100, 1_000_000],
  ])('%iT = %i원', (t, won) => {
    expect(rankingPrizeWon({ amount: t, unit: 'T' })).toBe(won);
    expect(manToWon(parsePrizeMan(`${t}T`))).toBe(won); // 서버 parse_prize_man 과 같은 파서 경로
    expect(t * TICKET_WON).toBe(won);
  });

  it('TICKET_WON 과 TICKET_MAN 은 한 값이다', () => {
    expect(TICKET_WON).toBe(TICKET_MAN * 10_000);
  });
});

describe('머니인 점수 임계 — 100만원(100T)당 1점', () => {
  it('MONEYIN_UNIT_WON = 100T', () => {
    expect(MONEYIN_UNIT_WON).toBe(100 * TICKET_WON);
    expect(MONEYIN_UNIT_WON).toBe(1_000_000);
  });

  // 서버 규칙 floor(원 / 1,000,000) 을 클라 상수로 적어 경계값을 고정한다.
  // (클라에 계산 함수를 만들지 않는다 — rankverify.ts:92 원칙. 여기의 산식은 사양 서술이다.)
  it.each([
    [999_999, 0],
    [1_000_000, 1],
    [1_999_999, 1],
    [2_000_000, 2],
  ])('%i원 → %i점', (won, pts) => {
    expect(Math.floor(won / MONEYIN_UNIT_WON)).toBe(pts);
  });
});

// ── 서버 본문 계약 — 마이그레이션에서 마지막으로 정의된 moneyin_points 가 같은 임계를 쓰는지 ──
// eventTicketRule.test.ts 와 같은 방식: 뒤 파일이 앞 파일을 덮으므로 "마지막 정의"를 본다.
const DIR = join(process.cwd(), 'supabase', 'migrations');
const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

function lastDefinitionOf(fn: string): { file: string; body: string } | null {
  let hit: { file: string; body: string } | null = null;
  for (const f of files) {
    const t = readFileSync(join(DIR, f), 'utf8');
    const m = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, 'i').exec(t);
    if (m) hit = { file: f, body: t.slice(m.index) };
  }
  return hit;
}

describe('서버 moneyin_points 본문 — 클라 상수와 같은 임계', () => {
  it('마지막 정의의 나눗셈 상수가 MONEYIN_UNIT_WON 과 같다', () => {
    const def = lastDefinitionOf('moneyin_points');
    expect(def, 'moneyin_points 정의를 찾을 수 없다 — 함수명이 바뀌었는지 확인하라').toBeTruthy();
    const m = /floor\(coalesce\(p_won,\s*0\)::numeric\s*\/\s*(\d+)\)/i.exec(def!.body);
    expect(m, `${def!.file}: floor(coalesce(p_won, 0)::numeric / N) 꼴의 본문이 아니다 — 규칙이 바뀌었으면 클라 상수·설명도 같이 바꿔라`).toBeTruthy();
    expect(Number(m![1]), `${def!.file}: 서버 임계 ${m![1]}원 ≠ 클라 MONEYIN_UNIT_WON ${MONEYIN_UNIT_WON}원`).toBe(MONEYIN_UNIT_WON);
  });

  it('마지막 COMMENT 가 100T 환산으로 설명한다(20260906d) — DB 를 보는 사람이 옛 10T 를 읽지 않게', () => {
    let last: { file: string; text: string } | null = null;
    for (const f of files) {
      const t = readFileSync(join(DIR, f), 'utf8');
      const re = /comment\s+on\s+function\s+public\.moneyin_points\(bigint\)\s+is\s*'([^']*)'/gi;
      for (let m = re.exec(t); m; m = re.exec(t)) last = { file: f, text: m[1] };
    }
    expect(last, 'moneyin_points COMMENT 를 찾을 수 없다').toBeTruthy();
    expect(last!.text, `${last!.file}: 설명이 100T 환산이 아니다`).toContain('100만원(100T)당 1점');
  });
});
