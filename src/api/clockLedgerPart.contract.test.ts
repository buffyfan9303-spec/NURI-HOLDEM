// K3(오너 결정 클락 #2, 2026-09-29) — 장부 몫 식 **한 벌** 계약.
// 서버 트리거(supabase/migrations/20260929t_clock_ledger_stats_trigger.sql `_clock_ledger_part`)가 장부가 바뀔 때 live_stats.ledger 를 쓰고,
// 화면(TournamentClock·NuriPosLedger)은 즉시 표시를 위해 같은 값을 JS(deriveClockCounts + earlyUnitTotal)로 계산한다.
// 두 식이 어긋나면 TV 와 PC 클락이 다른 인원을 말한다 — 그래서 공용 픽스처(clockLedgerPart.fixtures.json)의 expect 를 두 쪽이 모두 내야 한다.
//   · JS 쪽: 이 테스트가 매 실행 확인한다.
//   · SQL 쪽: 이 파일의 `SQL_BODY_SHA` 가 R1 리허설(픽스처 전 케이스를 함수 본문 그대로 SELECT 로 돌려 expect 와 jsonb = 비교)을
//     통과한 본문의 해시다. 본문이나 픽스처를 바꾸면 해시가 달라져 빨개진다 — 다시 R1 을 돌리고 해시를 갱신하라
//     (재실행 절차: 보고서 logic-report.md 'K3 R1' · 스크립트 scratchpad/k3sql.cjs).
// 음성 대조: ledger.ts ledgerCounts 의 `.trim()` 을 빼면 '이름 공백' 케이스가, chipRules.earlyTierIndexAt 의 `mins < min` 을 `<=` 로 되돌리면
//   'W-27 반열림' 케이스가, clock.ts rebuyOrdOf 의 trim 을 빼면 'W-10 계단' 케이스가 빨개진다.
// 2026-09-30 KW-1a: SQL 정본이 20260930e(얼리 단계·반열림·계단 스택)로 옮겨졌다. JS 쪽은 화면 작성기와 **같은 함수**(ledgerLiveStats)로 잰다.
// 2026-10-09 roti-1009 C-1: SQL 정본이 20261009s(시작 전 도착 = 가장 이른 얼리 단계)로 옮겨졌다. 픽스처 18케이스(+3 · case 2 기대값 뒤집음).
// 실행: npx vitest run src/api/clockLedgerPart.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ledgerLiveStats, emptyClockState, defaultClockConfig, sameLedgerPart, type ClockConfig, type ClockLiveStats } from './clock';
import type { EarlyTierWindow } from '../lib/chipRules';
import type { LedgerBuyin, EarlyType } from './ledger';
import fx from './clockLedgerPart.fixtures.json';

type Row = { player_name: string | null; entry_no: number; buyin_at: string; early_override: string | null; addon_method: string | null };
type Sess = { early_double_min: number; early_single_min: number; tournament_start: string | null; opened_at: string | null; early_tiers?: EarlyTierWindow[] | null } | null;

// DB 행 → 화면 모델(rowToBuyin 과 같은 칸만)
const toBuyin = (r: Row, i: number): LedgerBuyin => ({
  id: `r${i}`, venueId: 'v', sessionDate: '2026-09-29', gameSeq: 1, playerName: r.player_name ?? '', entryNo: r.entry_no,
  paymentMethod: 'cash', isUnpaid: false, buyinAt: r.buyin_at, isSplit: false, cashAmount: 0, cardAmount: 0, transferAmount: 0,
  ticketCount: 0, unpaidAmount: 0, discountLevel: 0, discountIndex: 0, earlyOverride: (r.early_override ?? null) as EarlyType | null,
  addonMethod: (r.addon_method ?? null) as LedgerBuyin['addonMethod'], addonUnpaid: false, addonAmount: 0,
});
// 화면 작성기와 같은 창: 세션 행이 없으면 getLedgerSession 의 빈 세션(분 0 · 시작 시각 없음)
const toWindow = (s: Sess) => ({
  earlyDoubleMin: s?.early_double_min ?? 0, earlySingleMin: s?.early_single_min ?? 0,
  tournamentStart: s?.tournament_start ?? null, openedAt: s?.opened_at ?? null, earlyTiers: s?.early_tiers ?? null,
});

export function jsLedgerPart(buyins: Row[], session: Sess, config: Partial<ClockConfig>) {
  const cfg = { ...defaultClockConfig(), ...config } as ClockConfig;
  return ledgerLiveStats({ ...emptyClockState('v', cfg, 1), sessionDate: '2026-09-29' }, buyins.map(toBuyin), toWindow(session)).ledger;
}

const sqlBody = () => {
  const s = readFileSync(join(__dirname, '../../supabase/migrations/20261009s_early_prestart_first_tier.sql'), 'utf8').replace(/\r\n/g, '\n');
  const m = s.match(/_clock_ledger_part\(p_buyins jsonb, p_session jsonb, p_config jsonb\)[\s\S]*?as \$fn\$([\s\S]*?)\$fn\$;/);
  return m?.[1] ?? '';
};
// R1 로 전 케이스 일치를 확인한 본문+픽스처의 해시. 2026-09-29 는 라이브 읽기 전용 SELECT,
//   2026-09-30(KW-1a, 20260930e) 은 PGlite(Postgres 17 WASM) 에 §2 본문 그대로 만들어 15케이스 jsonb = 비교(scratchpad/kw1a/r1-pglite.mjs).
//   2026-10-09(roti-1009 C-1, 20261009s) 는 PGlite 0.5.8(PG 18.3 WASM)로 18/18 · 옛 본문 20260930e 는 같은 픽스처에서 3케이스 diff(음성 대조).
const SQL_BODY_SHA = '9ec428e6330ce25b';

describe('K3 장부 몫 — JS 식 == 픽스처 == SQL 식', () => {
  for (const c of fx.cases as unknown as { name: string; buyins: Row[]; session: Sess; config: Partial<ClockConfig>; expect?: Record<string, unknown> }[]) {
    it(c.name, () => {
      expect(c.expect, '픽스처에 expect 가 없다').toBeTruthy();
      expect(jsLedgerPart(c.buyins, c.session, c.config)).toEqual(c.expect);
    });
  }
  it('SQL 본문·픽스처가 R1 으로 검증된 그대로다(바꾸면 R1 을 다시 돌려 해시를 갱신)', () => {
    const body = sqlBody();
    expect(body.length).toBeGreaterThan(500);
    const h = createHash('sha256').update(body).update(JSON.stringify(fx.cases)).digest('hex').slice(0, 16);
    expect(h).toBe(SQL_BODY_SHA);
  });
  it('서버가 쓴 jsonb(키 순서 다름)와 화면 값이 같으면 같다고 본다 — 헛쓰기 방지', () => {
    const js = { ledger: { entries: 2, rebuys: 0, earlies: 1, doubleEarlies: 0, totalBuyins: 2, addons: 0, earlyUnits: 1 }, buyInAmount: 5 } as unknown as ClockLiveStats;
    const db = { ledger: { addons: 0, rebuys: 0, earlies: 1, entries: 2, earlyUnits: 1, totalBuyins: 2, doubleEarlies: 0 }, buyInAmount: 5 } as unknown as ClockLiveStats;
    expect(sameLedgerPart(js, db)).toBe(true);
    expect(sameLedgerPart(js, { ...db, ledger: { ...db.ledger!, addons: 1 } })).toBe(false);
  });
  it('트리거가 장부 행·세션·클락 행 세 곳에 걸리고 내부 함수는 실행 권한이 회수된다', () => {
    const s = readFileSync(join(__dirname, '../../supabase/migrations/20260929t_clock_ledger_stats_trigger.sql'), 'utf8').replace(/^\s*--.*$/gm, '');
    expect(s).toMatch(/before insert or update of session_date, config, live_stats on public\.clock_states/);
    expect(s).toMatch(/after insert or update or delete on public\.ledger_buyins/);
    expect(s).toMatch(/on public\.ledger_sessions\s+for each row execute function public\._ledger_touch_clock/);
    for (const f of ['_clock_ledger_part(jsonb, jsonb, jsonb)', '_clock_states_ledger_stats()', '_ledger_touch_clock()']) {
      expect(s).toContain(`revoke all on function public.${f} from public, anon, authenticated;`);
    }
    expect(s.match(/security definer\s+set search_path = public, pg_temp/g)?.length).toBe(2);
  });
  it('KW-1a(20260930e): 세션 얼리 단계 변경도 클락을 다시 계산하고, 할인 조건 트리거 함수는 실행 권한이 회수된다', () => {
    const s = readFileSync(join(__dirname, '../../supabase/migrations/20260930e_chip_rules_early_tiers.sql'), 'utf8').replace(/^\s*--.*$/gm, '');
    expect(s).toMatch(/update of early_double_min, early_single_min, early_tiers, tournament_start, opened_at, buyin_amount on public\.ledger_sessions/);
    expect(s).toMatch(/before insert or update of discount_index, entry_no on public\.ledger_buyins/);
    expect(s).toContain('revoke all on function public._ledger_buyin_discount_kind_guard() from public, anon, authenticated;');
    expect(s).toContain('revoke all on function public._clock_ledger_part(jsonb, jsonb, jsonb) from public, anon, authenticated;');
  });
});
