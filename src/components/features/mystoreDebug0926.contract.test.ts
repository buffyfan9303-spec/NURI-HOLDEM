// 내 매장 전체 디버깅(2026-09-26, 모바일 우선) 계약 — 실측은 scratch 하네스(전/후 빌드)로 했고, 여기서는 되돌림만 막는다.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf8').split('\r\n').join('\n');

describe('내 매장 전체 디버깅 2026-09-26', () => {
  it('#3 전체화면 동안 배경을 inert 로 막고, 해제 때 내가 막은 것만 푼다', () => {
    const s = read('clock/TournamentClock.tsx');
    const m = s.match(/useEffect\(\(\) => \{\n\s+if \(!fs\) return;\n\s+const made: HTMLElement\[\] = \[\];[\s\S]*?\}, \[fs\]\);/);
    expect(m, 'fs inert effect 가 없다').not.toBeNull();
    expect(m![0]).toMatch(/sib\.inert = true/);
    expect(m![0]).toMatch(/s\.inert = false/);
  });

  it('#5 권한 미부여 배지는 ink-muted(라이트 4.39:1)가 아니다', () => {
    const s = read('VenueManageTab.tsx');
    const tone = s.match(/const toneOf = [\s\S]*?;\n/)![0];
    expect(tone).toMatch(/'bg-surface-float text-ink-secondary border-border-default'/);
    expect(tone).not.toMatch(/'bg-surface-float text-ink-muted/);
  });

  it('#6 출근 관리의 지금 출근·지금 퇴근·월 이동은 44px', () => {
    const s = read('StaffPayroll.tsx');
    for (const k of ["'checkIn', nowHm())} className=\"min-h-[44px]", "'checkOut', nowHm())} className=\"min-h-[44px]"]) expect(s).toContain(k);
    expect(s.match(/shiftMonth\(m, [-]?1\)\)\} className="h-\[44px\] w-\[44px\]/g)?.length).toBe(2);
  });

  it('#7 승인 대기 업주는 직원 화면이 아니라 승인 안내를 본다', () => {
    const s = read('VenueManageTab.tsx');
    expect(s).toMatch(/\{isOwner && user\.approved !== true \? <OwnerPendingCard \/> : \(\s*<StoreDashboardM /);
    expect(s).toContain('관리자 승인 후 운영 기능이 열립니다');
  });

  it('#8 이용권 발급 안내에 §28 금지 계열 단어(현금)가 없다', () => {
    const s = read('VoucherManageModal.tsx');
    const i = s.indexOf('data-testid="voucher-issue-scope"');
    expect(i).toBeGreaterThan(0);
    const para = s.slice(i, s.indexOf('</p>', i));
    expect(para).toContain('금전적 가치가 없습니다');
    expect(para).not.toMatch(/현금|환전|수익/);
  });
});
