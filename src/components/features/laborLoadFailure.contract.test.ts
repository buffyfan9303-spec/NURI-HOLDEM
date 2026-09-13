// F3·F6(2026-09-13) — 인건비 화면이 '출근 기록/딜러 근무 조회 실패' 를 **'0원'·'기록 없음'** 으로 그리던 결함의 배선 계약.
//
// F3  StaffPayroll 의 StaffSettlement·StaffWorkLog·StaffSelfAttendance 가 `getStaffSchedule(...).then(setShifts).catch(() => {})`
//     라 실패 시 shifts=[] → rows=[] → 총 인건비 '0원' 이 정상 숫자로 보이고 '{month} 출근 기록이 없습니다.' 로 끝났다.
//     wageErr(시급 경로)만 갈라 놓았지 스케줄 실패는 아무 분기도 못 켰다.
// F6  api/dealerShifts.getDealerShifts 가 `error` 를 구조분해조차 안 해 실패가 [] 로 resolve 됐다(값 검사는
//     src/api/dealerShifts.errorPropagation.test.ts). 던지게만 고치면 호출부의 죽은 catch 가 살아나 빈 배열을 세팅한다 —
//     그래서 **호출부 두 곳(StaffPayroll·StoreDashboard)이 dealerErr 를 들어야** 증상이 사라진다. 둘을 같이 잠근다.
//
// 못 보는 것: 문장의 존재만 본다. 렌더는 e2e 몫. 이름 바꾼 복제본은 못 잡는다.
// 음성 대조: StaffPayroll.tsx 세 컴포넌트 중 하나의 `.catch((e) => setShiftErr(` 를 `.catch(() => {})` 로 되돌리면 그 컴포넌트 검사가,
//   `payErr ? '—'` 를 `wageErr ? '—'` 로 되돌리면 합계 검사가, StoreDashboard.tsx 의 `setDealerErr(true)` 를 지우면 대시보드 검사가 실패한다.
// 실행: npx vitest run src/components/features/laborLoadFailure.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const strip = (s: string) => s.replace(/(^|[\s{(])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');
const SP = strip(readFileSync(join(__dirname, 'StaffPayroll.tsx'), 'utf-8'));
const SD = strip(readFileSync(join(__dirname, 'StoreDashboard.tsx'), 'utf-8'));

/** `export function <name>(` 부터 다음 `export function` 직전까지 */
function component(src: string, name: string): string {
  const s = src.indexOf(`export function ${name}(`);
  expect(s, `${name} 을 찾지 못했다`).toBeGreaterThan(-1);
  const e = src.indexOf('\nexport function ', s + 1);
  return src.slice(s, e < 0 ? undefined : e);
}

describe('F3 · 출근 기록 조회 실패는 "기록 없음" 이 아니다', () => {
  for (const name of ['StaffSettlement', 'StaffWorkLog', 'StaffSelfAttendance'] as const) {
    it(`🔴 ${name}: getStaffSchedule 실패가 shiftErr(msgOf) 에 남고 빈 catch 가 없다`, () => {
      const c = component(SP, name);
      expect(c).toMatch(/const \[shiftErr, setShiftErr\] = useState<string \| null>\(null\);/);
      expect(c, '빈 catch 가 남아 있다').not.toMatch(/\.catch\(\(\) => \{\}\)/);
      expect(c).toMatch(/getStaffSchedule\(venueId, from, to\)\s*\.then\([\s\S]*?setShiftErr\(null\);[\s\S]*?\)\s*\.catch\(\(e\) => setShiftErr\(msgOf\(e, '출근 기록을 불러오지 못했습니다'\)\)\)/);
      // 재시도 틱이 effect deps 에 있어야 '다시 시도' 가 실제로 조회를 다시 낸다.
      expect(c).toMatch(/const \[shiftTick, setShiftTick\] = useState\(0\);/);
      expect(c).toMatch(/\}, \[venueId, from, to, shiftTick(, user)?\]\);/);
      expect(c).toMatch(/onClick=\{\(\) => setShiftTick\(\(t\) => t \+ 1\)\}/);
      expect(c).toMatch(/role="alert"/);
    });
  }

  it('🔴 StaffSettlement: 총 인건비·총 근무시간이 시급·출근·딜러 셋 중 하나라도 실패면 — 이고 0원을 그리지 않는다', () => {
    const c = component(SP, 'StaffSettlement');
    expect(c).toContain('const payErr = wageErr ?? shiftErr ?? dealerErr;');
    expect(c).toMatch(/\{payErr\s*\? <p className="text-base font-extrabold text-danger-light">—<\/p>/);
    expect(c).not.toMatch(/\{wageErr\s*\? <p className="text-base font-extrabold text-danger-light">—<\/p>/);
    expect(c).toMatch(/\{shiftErr \|\| dealerErr\s*\? <p className="text-base font-extrabold text-danger-light">—<\/p>/);
    // 분해 줄·시급 없음 경고도 payErr 로 잠근다(실패 중 '직원 0 · 딜러 0' 이 뜨면 안 된다).
    expect(c).toMatch(/\{!payErr && dealerPay > 0 &&/);
    expect(c).toMatch(/\{!payErr && noWage\.length > 0 &&/);
    // '기록 없음' 문구는 실패가 아닐 때만.
    expect(c).toMatch(/shiftErr \? null : rows\.length === 0 \?/);
  });
});

describe('F6 · 딜러 근무 조회 실패를 호출부가 든다(throw 만 하면 죽은 catch 가 살아나 [] 를 세팅한다)', () => {
  // 후속 ①(2026-09-13): getDealerShifts 소비처는 StaffPayroll·StoreDashboard·DealerShiftsModal 셋뿐이다(grep 실측).
  // DealerShiftsModal 의 `.catch(() => {})` 는 F6 throw 로 **죽은 코드에서 실행되는 코드**가 됐고, 실패 시 목록이 갱신되지 않은 채
  // 조용히 남았다(예전엔 [] 로 비었다). F3·F6 과 같은 관용구(msgOf 문자열 상태 + role="alert" + 다시 시도)로 맞춘다.
  it('🔴 DealerShiftsModal: 실패가 loadErr(msgOf) 에 남고 빈 catch 가 없다, 목록 자리에 role="alert" + 다시 시도', () => {
    const DM = strip(readFileSync(join(__dirname, 'DealerShiftsModal.tsx'), 'utf-8'));
    expect(DM).toMatch(/const \[loadErr, setLoadErr\] = useState<string \| null>\(null\);/);
    expect(DM).not.toMatch(/getDealerShifts\(venueId, s, e\)\.then\(setList\)\.catch\(\(\) => \{\}\)/);
    expect(DM).toMatch(/getDealerShifts\(venueId, s, e\)\s*\.then\(\(l\) => \{ setList\(l\); setLoadErr\(null\); \}\)\s*\.catch\(\(err\) => setLoadErr\(msgOf\(err, '딜러 근무 기록을 불러오지 못했습니다'\)\)\)/);
    expect(DM).toMatch(/\{loadErr \? \(\s*<div role="alert"/);
    expect(DM).toMatch(/onClick=\{\(\) => reload\(month\)\}/);
    // 급여 명세 합계도 실패 중에는 그리지 않는다(부분 목록 합계가 '이번 달 합계' 로 읽힌다).
    expect(DM).toMatch(/\{!loadErr && payroll\.length > 0 &&/);
  });

  it('getDealerShifts 소비처가 세 파일뿐이다 — 새 소비처가 생기면 dealerErr 관용구를 같이 붙여야 한다', () => {
    const files = ['StaffPayroll.tsx', 'StoreDashboard.tsx', 'DealerShiftsModal.tsx', 'NuriPosLedger.tsx', 'VenueManageTab.tsx', 'LedgerStatsPanel.tsx', 'LedgerSettlementPanel.tsx', 'StaffSchedule.tsx'];
    const users = files.filter((f) => readFileSync(join(__dirname, f), 'utf-8').includes('getDealerShifts('));
    expect(users.sort()).toEqual(['DealerShiftsModal.tsx', 'StaffPayroll.tsx', 'StoreDashboard.tsx']);
  });

  it('🔴 StaffSettlement: dealerErr 상태 + 실패를 msgOf 로 받고 빈 배열로 위장하지 않는다', () => {
    const c = component(SP, 'StaffSettlement');
    expect(c).toMatch(/const \[dealerErr, setDealerErr\] = useState<string \| null>\(null\);/);
    expect(c).not.toMatch(/\.catch\(\(\) => setDealers\(\[\]\)\)/);
    expect(c).toMatch(/getDealerShifts\(venueId, from, to\)\s*\.then\(\(ds\) => \{ setDealers\(ds\); setDealerErr\(null\); \}\)\s*\.catch\(\(e\) => setDealerErr\(msgOf\(e, '딜러 근무 기록을 불러오지 못했습니다'\)\)\)/);
  });

  // 독립 검증(2026-09-13) B: 출근(getStaffSchedule) 실패는 그대로 삼켜져 딜러 인건비만의 값이 '총 인건비 N만원' 으로 떴다.
  it('🔴 StoreDashboard: 출근 조회 실패도 shiftErr 로 들고 총 인건비·오늘 출근이 실패를 말한다', () => {
    expect(SD).toMatch(/const \[shiftErr, setShiftErr\] = useState\(false\);/);
    expect(SD).not.toMatch(/getStaffSchedule\(venueId, d, d\)\.then\(guard\(setShifts\)\)\.catch\(\(\) => \{\}\)/);
    expect(SD).not.toMatch(/getStaffSchedule\(venueId, mr\.start, mr\.end\)\.then\(guard\(setMonthShifts\)\)\.catch\(\(\) => \{\}\)/);
    expect(SD).toMatch(/getStaffSchedule\(venueId, d, d\)\.then\(guard\(\(ss: StaffShift\[\]\) => \{ setShifts\(ss\); setShiftErr\(false\); \}\)\)\.catch\(guard\(\(\) => \{ setShifts\(\[\]\); setShiftErr\(true\); \}\)\)/);
    expect(SD).toMatch(/getStaffSchedule\(venueId, mr\.start, mr\.end\)\.then\(guard\(\(ss: StaffShift\[\]\) => \{ setMonthShifts\(ss\); setShiftErr\(false\); \}\)\)\.catch\(guard\(\(\) => \{ setMonthShifts\(\[\]\); setShiftErr\(true\); \}\)\)/);
    expect(SD).toContain('const laborErr = wageErr || dealerErr || shiftErr;');
    expect(SD).toMatch(/\{shiftErr && <p className="text-\[11px\] text-danger-light">출근 기록을 불러오지 못해/);
    // '오늘 출근' 카드도 실패를 '배정 없음' 으로 그리지 않는다
    expect(SD).toMatch(/shifts\.length === 0 && !shiftErr \?/);
  });

  // 독립 검증 C: @supabase/postgrest-js 2.112.3 의 PostgrestError 는 extends Error 라 `e instanceof Error ? e.message` 가 DB 원문을 그대로 토스트한다.
  it('🔴 DealerShiftsModal: 추가·삭제 토스트가 msgOf 를 쓴다(원문 SQL 노출 없음)', () => {
    const DM = strip(readFileSync(join(__dirname, 'DealerShiftsModal.tsx'), 'utf-8'));
    expect(DM).not.toMatch(/e instanceof Error \? e\.message/);
    expect(DM).toMatch(/toast\.show\(msgOf\(e, '추가 실패'\), 'error'\)/);
    expect(DM).toMatch(/toast\.show\(msgOf\(e, '삭제 실패'\), 'error'\)/);
  });

  it('🔴 StoreDashboard: dealerErr 를 세대 가드 안에서 세우고, 총 인건비가 wageErr || dealerErr 로 — 가 된다', () => {
    expect(SD).toMatch(/const \[dealerErr, setDealerErr\] = useState\(false\);/);
    expect(SD).toMatch(/getDealerShifts\(venueId, mr\.start, mr\.end\)\.then\(guard\(\(ds: DealerShift\[\]\) => \{ setMonthDealers\(ds\); setDealerErr\(false\); \}\)\)\.catch\(guard\(\(\) => \{ setMonthDealers\(\[\]\); setDealerErr\(true\); \}\)\)/);
    expect(SD).not.toMatch(/\.catch\(guard\(\(\) => setMonthDealers\(\[\]\)\)\)/);
    expect(SD).toMatch(/const laborErr = wageErr \|\| dealerErr( \|\| shiftErr)?;/);
    expect(SD).toMatch(/<Stat label="총 인건비" value=\{laborErr \? '—' : wonToMan\(laborTotal\)\} unit=\{laborErr \? '' : '만원'\} gold \/>/);
    expect(SD).toMatch(/\{dealerErr && <p className="text-\[11px\] text-danger-light">딜러 근무 기록을 불러오지 못해/);
    expect(SD).toMatch(/\{!laborErr && dealerPay > 0 &&/);
  });
});
