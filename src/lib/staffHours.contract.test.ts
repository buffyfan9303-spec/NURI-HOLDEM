// 소스 계약 — 근무 시간 'Xh' 는 src/lib/staffPay.ts 한 곳에서 센다 (2026-10-04, R3-03 재발 · HANDOVER-2026-09-23 §3-G)
//
// 왜: 급여 표는 staffPay(계획 전 출근 제외·휴게 공제)로, 출근일지·내 출근 관리는 로컬 hours(),
//     딜러 스케줄은 hoursBetween(), 딜러 근무 모달 행은 workedMinutes(휴게 전)로 따로 셌다.
//     같은 근무를 급여 표 8.0h · 일지/스케줄 9.5h 로 말했다(audit3-regress-connect-1004.md#R3-03).
// 보는 것: ① shiftMinutes 정의 단일성 ② 소비처 4곳 배선 앵커(import + 호출 + 매장 설정 usePayRules)
//          ④ 지문 — 자정 넘김 보정(+= 1440 / += 24 * 60)·'/ 60).toFixed(' 시간 포맷·workedMinutes 직접 호출이 staffPay 밖에 없다
//          + 옛 복제 이름(hours / hoursBetween / hoursOf) 정의 0.
// 못 보는 것: 이름도 지문도 다르게 쓴 재구현(예: getHours() 차이로 계산), 객체·클래스 멤버로 심은 복제,
//          src 밖(api/·e2e/)과 테스트 파일 안의 재구현. 값의 정오는 staffHours.test.ts 가 본다.
// 음성 대조: StaffSchedule 에 옛 hoursBetween(+= 24 * 60) 을 되살리면 ①은 통과하고 ②(호출 0)·④(지문)가 빨개진다.
//          DealerShiftsModal 의 minutesOf 를 workedMinutes(dealerWageShift(s)) 로 되돌리면 ②·④가 빨개진다.
// 실행: npx vitest run src/lib/staffHours.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
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
const FILES = walk(SRC).map((p) => ({ file: relative(SRC, p).replace(/\\/g, '/'), code: strip(readFileSync(p, 'utf-8')) }));
const hits = (re: RegExp) => FILES.map((f) => ({ file: f.file, n: count(f.code, re) })).filter((x) => x.n > 0);
const code = (file: string) => FILES.find((f) => f.file === file)!.code;

describe('shiftMinutes — 정의는 src/lib/staffPay.ts 하나뿐이다', () => {
  it('🔴 ① 정의하는 파일은 lib/staffPay.ts 뿐이고, 거기서도 한 번이다', () => {
    expect(hits(/\b(?:function\s+shiftMinutes\s*[(<]|(?:const|let|var)\s+shiftMinutes\s*=)/),
      '복제본이 생겼다 — lib/staffPay 에서 import 하라').toEqual([{ file: 'lib/staffPay.ts', n: 1 }]);
  });
  it('🔴 옛 복제 이름(hours · hoursBetween · hoursOf)을 다시 정의하지 않는다', () => {
    // `const hours = [0..23]`(시각 선택 칸 — DateTimePicker·PosterFormModal)은 계산이 아니라 목록이라 함수 형태만 본다.
    expect(hits(/\b(?:function\s+(?:hours|hoursBetween|hoursOf)\s*\(|(?:const|let|var)\s+(?:hoursBetween|hoursOf)\s*=)/)).toEqual([]);
  });
});

// ② 배선 앵커 — 'Xh' 를 그리는 소비처가 실제로 정본을 부르는가(단위 테스트는 아무도 안 부르는 함수도 통과시킨다).
const CONSUMERS: Record<string, number> = {
  'components/features/StaffPayroll.tsx': 2,       // 출근일지(StaffWorkLog) · 내 출근 관리(StaffSelfAttendance)
  'components/features/StaffSchedule.tsx': 2,      // 직원별 집계 · 선택 날짜 행
  'components/features/DealerShiftsModal.tsx': 1,  // 딜러 근무 행
};
describe('소비처 배선', () => {
  for (const [file, calls] of Object.entries(CONSUMERS)) {
    it(`🔴 ② ${file}: staffPay 에서 shiftMinutes 를 import 하고 ${calls}곳에서 부르며, 매장 설정(usePayRules)으로 센다`, () => {
      const c = code(file);
      expect(count(c, /^import \{[^}]*\bshiftMinutes\b[^}]*\} from '\.\.\/\.\.\/lib\/staffPay';$/m)).toBe(1);
      expect(count(c, /\bshiftMinutes\(/), '호출 수가 바뀌었다 — 새 표시면 숫자를, 재구현이면 정본을 써라').toBe(calls);
      expect(count(c, /\bshiftMinutes\([^)]*\brules\b/)).toBe(calls);
      expect(count(c, /^import \{ usePayRules \} from '\.\.\/\.\.\/api\/payrollRules';$/m)).toBe(1);
    });
  }
});

describe('지문 — 시간 계산·포맷은 staffPay 밖에 없다', () => {
  it('🔴 ④ 자정 넘김 보정(+= 1440 / += 24 * 60)을 직접 하지 않는다', () => {
    expect(hits(/\+=\s*(?:1440|24\s*\*\s*60)\b/), '근무 시간 재구현이다 — staffPay.shiftMinutes 를 부르라').toEqual([]);
  });
  it('🔴 ④ 분→시간 포맷 \'/ 60).toFixed(\' 는 staffPay.hoursText 하나뿐이다', () => {
    expect(hits(/\/\s*60\)\.toFixed\(/), '시간 포맷 복제 — staffPay.hoursText 를 쓰라').toEqual([{ file: 'lib/staffPay.ts', n: 1 }]);
    // 딜러 모달이 쓰던 0.1h 반올림('8h' vs '8.0h') — 같은 시간을 다른 글자로 말한다.
    expect(hits(/\/\s*6\)\s*\/\s*10\b/), '시간 포맷 복제 — staffPay.hoursText 를 쓰라').toEqual([]);
  });
  it('🔴 ④ workedMinutes(휴게 전 체류)를 화면이 직접 부르지 않는다', () => {
    expect(hits(/\bworkedMinutes\(/).filter((x) => x.file !== 'lib/staffPay.ts'),
      '체류를 그대로 보이면 급여 표와 갈린다 — shiftMinutes(...).net 을 쓰라').toEqual([]);
  });
  it('🔴 평균 출·퇴근 시각(dummy-1003 D1)도 정의 한 벌 — avgClockHm', () => {
    expect(hits(/\b(?:function\s+avgClockHm\s*[(<]|(?:const|let|var)\s+avgClockHm\s*=)/)).toEqual([{ file: 'lib/staffPay.ts', n: 1 }]);
  });
});
