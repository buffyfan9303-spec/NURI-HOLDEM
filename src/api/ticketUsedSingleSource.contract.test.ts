// 소스 계약 — 이용권 사용 T(바인 + 애드온)는 api/ledger.ts ticketUsedT 한 곳에서만 더한다 (2026-09-29, 3-B).
// 왜: 같은 '이용권 사용 T' 를 여섯 곳이 제각각 더해, 대시보드·장부 요약은 바인만 / 통계·CRM 은 바인+애드온을 말했다
//   (docs/handoff-2026-09-29/store-deep.md D2·D3). 오너 결정(docs/HANDOFF-2026-09-29-account-switch.md §5): 한 벌 = 바인+애드온.
// 보는 것: ① 정의 단일성 ② 소비처 여섯 곳의 배선 앵커(정확한 호출 형태) ③ 바꿀 수 없는 필드 토큰(ticketPaid·ticketWon)의
//   파일별 참조 수 ④ 합산 식 지문(ticketPaid + …ticketWon / TICKET_WON)이 정본 밖에 없음.
// 못 보는 것: 값이 맞는가(ledger.ticketUsed.test.ts 몫) · 화면에 실제로 그려지는가(e2e/store-0929-fixes.spec.ts 몫).
// 음성 대조: StoreDashboard.tsx 의 weekTicket 을 `buyinFinance(b, s).ticketPaid` 로 되돌리면 ②·③ 이 빨개진다.
//   LedgerStatsPanel 에 `bf.ticketPaid + a.ticketWon / TICKET_WON` 을 다시 쓰면 ②·④ 가 빨개진다.
// 실행: npx vitest run src/api/ticketUsedSingleSource.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (code: string, re: RegExp) =>
  (code.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length;
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules') walk(p, out); continue; }
    if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}
const files = walk(SRC).map((p) => ({ file: relative(SRC, p).replace(/\\/g, '/'), code: strip(readFileSync(p, 'utf-8')) }));
const code = (f: string) => files.find((x) => x.file === f)!.code;
const perFile = (re: RegExp) => Object.fromEntries(files.map((x) => [x.file, count(x.code, re)]).filter(([, n]) => (n as number) > 0));

describe('ticketUsedT — 이용권 사용 T 는 한 곳에서만 더한다', () => {
  it('🔴 ① 정의는 api/ledger.ts 한 번뿐', () => {
    expect(perFile(/\b(?:function\s+ticketUsedT\s*[(<]|(?:const|let|var)\s+ticketUsedT\s*=)/)).toEqual({ 'api/ledger.ts': 1 });
  });

  it('🔴 ② 소비처 여섯 곳이 정확한 형태로 부른다', () => {
    const L = code('api/ledger.ts');
    expect(count(L, /m\.ticket \+= ticketUsedT\(f, addonFinance\(b\)\);/), 'ledgerMoney(대시보드 KPI·오늘)').toBe(1);
    expect(count(L, /t\.ticket \+= ticketUsedT\(f, a\);/), 'customerLedgerTotals(CRM)').toBe(1);
    const D = code('components/features/StoreDashboard.tsx');
    expect(count(D, /weekTicket \+= ticketUsedT\(buyinFinance\(b, s\), addonFinance\(b\)\);/), '대시보드 7일').toBe(1);
    expect(count(D, /label="오늘 사용" value=\{fmtT\(day\.ticket\)\}/), '대시보드 오늘 = KPI 와 같은 범위(day)').toBe(1);
    expect(count(code('components/features/LedgerStatsPanel.tsx'), /ticketPaid: ticketUsedT\(bf, a\) \}/), '통계').toBe(1);
    expect(count(code('components/features/NuriPosLedger.tsx'), /ticketUsedT\(\{ ticketPaid: stats\.ticket \}, stats\.addon\)/), '장부 요약').toBe(1);
    expect(count(code('components/features/LedgerSettlementPanel.tsx'), /ticketUsedT\(\{ ticketPaid: t\.tender\.ticket \/ TICKET_WON \}, t\.addon\)/), '정산 표시').toBe(1);
    expect(count(code('api/reservations.ts'), /customerLedgerTotals\(/), 'CRM 은 customerLedgerTotals 를 거친다').toBeGreaterThanOrEqual(1);
  });

  it('🔴 ③ 필드 토큰 참조 수 고정 — 새로 더하는 곳이 생기면 사람이 한 번 본다', () => {
    // 재구현이 아니면(표시만 늘었다면) 숫자를 고쳐라. 이용권 사용 T 를 다시 더하는 것이면 ticketUsedT 를 불러라.
    expect(perFile(/\bticketPaid\b/)).toEqual({
      'api/ledger.ts': 6,
      'components/features/LedgerSettlementPanel.tsx': 1,
      'components/features/LedgerStatsPanel.tsx': 2,
      'components/features/NuriPosLedger.tsx': 2,
    });
    expect(perFile(/\bticketWon\b/)).toEqual({
      'api/ledger.ts': 12,
      'components/features/LedgerSettlementPanel.tsx': 5,
      'components/features/NuriPosLedger.tsx': 1,
      'lib/ledgerSettlement.ts': 9,
    });
  });

  it('🔴 ④ 합산 식 지문은 정본에만 있다', () => {
    expect(perFile(/ticketPaid\s*\+\s*[\w.]*ticketWon\s*\/\s*TICKET_WON/)).toEqual({ 'api/ledger.ts': 1 });
  });
});
