// src/components/features/scheduleFormat.test.ts
// 일정 표시 계약 — 목록 카드·그리드·PC 표·상세가 **같은 포맷터**를 쓴다는 것을 잠근다.
// 잠그는 것 3가지(2026-09-12 실행문 §6-1):
//   ① 금액은 반올림되지 않는다(55,000 → '6만' 금지)
//   ② '상금 보장'과 '예상 상금'의 의미가 섞이지 않고, 데이터가 없으면 0·확정값을 만들지 않는다
//   ③ '마감 임박'을 예약 인원만으로 표시하지 않는다(정원·마감 시각 데이터가 없다)
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { formatPrize, buyInText, regCloseText, prizeText, prizeMainText } from './ScheduleCard';
import { pickLiveClock } from './ScheduleDetailModal';
import { buildRegInfoMap, msToRegClose } from '../../lib/regStatus';
import { effectiveLevel } from '../../lib/clockLevel';
import type { ClockState } from '../../api/clock';
import type { Schedule } from '../../api/schedules';

const base = {
  guaranteed: false, prizePool: undefined, prizePercent: undefined,
  regCloseTime: undefined, structure: undefined,
} as unknown as Schedule;

describe('formatPrize — 반올림하지 않는다', () => {
  it('만 단위로 정확히 떨어질 때만 만/억을 쓴다', () => {
    expect(formatPrize(10_000_000)).toBe('1,000만');
    expect(formatPrize(5_500_000)).toBe('550만');
    expect(formatPrize(100_000_000)).toBe('1억');
    expect(formatPrize(150_000_000)).toBe('1억 5,000만');
  });
  it('🔴 55,000원을 "6만"으로 반올림하지 않는다 — 원 단위 전액을 적는다', () => {
    expect(formatPrize(55_000)).toBe('55,000');
    expect(formatPrize(1_234_567)).toBe('1,234,567');
    expect(formatPrize(105_000_000)).toBe('1억 500만');
  });
  it('값이 없거나 0이면 확정값을 만들지 않는다', () => {
    expect(formatPrize(0)).toBe('-');
    expect(formatPrize(Number.NaN)).toBe('-');
  });
});

describe('buyInText — 참가비는 "알 수 없음"과 "0/무료"를 구분한다', () => {
  it('미입력(0·undefined)은 무료가 아니라 정보 없음', () => {
    expect(buyInText(0)).toBe('—');
    expect(buyInText(undefined)).toBe('—');
  });
  // 🔴 2026-09-18 오너: "참가비 100,000 이거 빼 10T 이런식으로 변경". 1T = 1만원.
  //   ⚠ 핵심은 **가격을 반올림하지 않는 것**이다 — §28 은 참가비를 상품 가격 정보로 본다.
  //     T 로 정확히 떨어지는 금액만 T 로 적고, 나머지는 원 그대로 둔다.
  it('T 로 정확히 표현되는 금액은 T 로 적는다', () => {
    expect(buyInText(100_000)).toBe('10T');
    expect(buyInText(60_000)).toBe('6T');
    expect(buyInText(55_000)).toBe('5.5T');   // 0.1T = 1,000원까지는 정확하다
    expect(buyInText(5_000)).toBe('0.5T');
  });
  it('🔴 T 로 깎이는 금액은 원 단위 전액을 그대로 적는다 — 가격을 바꿔 적지 않는다', () => {
    // 123.5T 로 적으면 그건 1,234,567원이 아니다. 반올림은 가격 고지 위반이다.
    expect(buyInText(1_234_567)).toBe('1,234,567원');
    expect(buyInText(55_500)).toBe('55,500원');
  });
});

describe('regCloseText — 쉬운 한국어 "등록 마감"', () => {
  it('레벨이 있으면 레벨, 없으면 시각, 둘 다 없으면 null', () => {
    expect(regCloseText({ ...base, regCloseTime: '16LV 00:12' })).toBe('등록 마감 16레벨');
    expect(regCloseText({ ...base, regCloseTime: '00:12' })).toBe('등록 마감 00:12');
    expect(regCloseText({ ...base, structure: { lateRegLevels: 14 } })).toBe('등록 마감 14레벨');
    expect(regCloseText(base)).toBeNull();
  });
});

describe('prizeText — 상금 보장과 예상 상금의 의미를 섞지 않는다', () => {
  // 2026-09-18 오너: "'상금 보장' 이라는 문구도 GTD로 변경".
  //   ⚠ '예상 상금'은 **그대로 둔다** — GTD 는 '보장'이라는 뜻이라, 엔트리 비례 금액까지 GTD 로 적으면
  //     보장되지 않은 금액을 보장처럼 말하게 된다. 두 말의 의미를 섞지 않는 것이 이 함수의 존재 이유다.
  it('보장은 "GTD", 엔트리 비례는 "예상 상금" — 의미를 섞지 않는다', () => {
    expect(prizeText({ ...base, guaranteed: true, prizePool: 10_000_000 })).toBe('GTD 1,000만');
    expect(prizeText({ ...base, guaranteed: false, prizePercent: 50 })).toBe('예상 상금 50%');
  });
  it('데이터가 없으면 null — 0 이나 확정값을 만들지 않는다', () => {
    expect(prizeText(base)).toBeNull();
    expect(prizeMainText({ guaranteed: true })).toBe('-');
  });
});

// ── 소스 배선 — 값 테스트로는 못 잡는 계약(9번 함정: 함수가 있는 것과 화면이 부르는 것은 다르다) ──
/** 주석을 걷어낸 **실제 코드**만 본다 — 지워진 이유를 설명하는 주석('마감 임박을 지웠다')이
 *  스캔에 걸려 거짓 실패를 내기 때문. 두 파일 모두 문자열 안에 '//'(URL 등)가 없어 안전하다. */
function codeOf(src: string): string {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // 안전장치: '//' 를 담은 문자열 리터럴이 새로 들어오면 이 스캔은 더 이상 못 믿는다
  if (/['"`][^'"`\n]*:\/\//.test(src)) throw new Error('URL 리터럴이 생겼다 — codeOf 주석 제거를 다시 짜라');
  return stripped;
}
const CARD = codeOf(readFileSync(new URL('./ScheduleCard.tsx', import.meta.url), 'utf8'));
const TABLE = codeOf(readFileSync(new URL('./ScheduleTable.tsx', import.meta.url), 'utf8'));

describe('🔴 근거 없는 긴박감 — 예약 인원만으로 "마감 임박"을 붙이지 않는다', () => {
  it('일정 카드 소스에 "마감 임박" 문자열이 없다', () => {
    // Schedule 에는 정원(capacity)도 예약 마감 시각도 없다 — 10명은 그냥 10명이다.
    expect(CARD).not.toContain('마감 임박');
  });
  it('상태 배지가 예약자 수를 인자로 받지 않는다', () => {
    const sig = CARD.match(/function statusBadge\([^)]*\)/);
    expect(sig, 'statusBadge 정의를 찾지 못했다').not.toBeNull();
    expect(sig![0]).not.toContain('reserveCount');
  });
});

describe('표시 정본 재사용 — PC 표가 자기 포맷터를 따로 만들지 않는다', () => {
  it('ScheduleTable 이 ScheduleCard 의 포맷터를 가져다 쓴다', () => {
    expect(TABLE).toContain("from './ScheduleCard'");
    expect(TABLE).toContain('regCloseText');
    expect(TABLE).toContain('buyInText');
  });
  it('표에 반올림 코드(Math.round(... / 10000))가 남아 있지 않다', () => {
    expect(TABLE).not.toMatch(/Math\.round\([^)]*10000/);
  });
});

describe('숨은 가로 스크롤 — 등록 마감·참가비를 스크롤 안에 감추지 않는다', () => {
  it('목록 카드 메타 줄이 overflow-x-auto 를 쓰지 않는다', () => {
    expect(CARD).not.toContain('overflow-x-auto');
  });
});

// ── F4(2026-09-13): 상세 라이브 패널이 고른 클락 = App 이 그 포스터에 붙인 클락 ──────────────
// 예전에는 `getVenueClocks()` 결과를 `find(matchClockSchedule(g, 1건짜리 스텁))` 로 훑어,
// 같은 날·같은 매장이면 제목이 달라도 전부 매칭됐다. ORDER BY 가 없는 조회라 승자는 배열 순서였고,
// 멀티 클락 매장에서 포스터 상단의 남은 시간·블라인드·PLAYERS 가 다른 게임 것일 수 있었다.
describe('F4 · LiveClockPanel 의 클락 선택은 결정적이고 App(buildRegInfoMap)과 같은 클락으로 수렴한다', () => {
  const LV = (minutes: number) => ({ kind: 'level' as const, minutes, sb: 100, bb: 200, ante: 0 });
  const clock = (over: Record<string, unknown> = {}): ClockState => ({
    venueId: 'v1', gameSeq: 1, sessionDate: '2026-09-13', title: '데일리 6만',
    config: { title: '데일리 6만', levels: [LV(20), LV(20), LV(20), LV(20)], regCloseLevel: 3 },
    currentIndex: 0, running: false, endsAt: null, remainingMs: 5 * 60_000,
    adjEntries: 0, adjRebuys: 0, adjEarlies: 0, adjAddons: 0, eliminations: 0,
    ...over,
  } as unknown as ClockState);
  const poster = (over: Record<string, unknown> = {}): Schedule => ({
    id: 's1', venueId: 'v1', date: '2026-09-13', title: '데일리 6만', startTime: '19:00',
    ...over,
  } as unknown as Schedule);
  /** 패널이 실제로 만드는 1건짜리 스텁과 같은 모양 */
  const stubOf = (s: Schedule) => [{ id: s.id, venueId: s.venueId, date: s.date, title: s.title } as Schedule];

  it('패널이 실제로 pickLiveClock 을 부른다 — 규칙이 두 벌이 되지 않는다', () => {
    // ⚠ 이 줄이 없으면 위 단위 테스트들은 **쓰이지도 않는 함수**를 검증하게 된다
    //   (2026-09-13 음성 대조 N1 실측: 호출부만 옛 find 로 되돌려도 단위 테스트는 전부 통과했다).
    // codeOf 는 못 쓴다 — 이 파일엔 URL 리터럴이 있어 그쪽 안전장치가 던진다.
    // 블록/줄 주석만 지운다(옛 코드가 주석 속 설명으로 남아 있어 그대로 스캔하면 오탐).
    const MODAL = readFileSync(new URL('./ScheduleDetailModal.tsx', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(MODAL).toMatch(/\.then\(\(gs\) => \{ if \(alive\) setClock\(pickLiveClock\(gs, stub\)\); \}\)/);
    expect(MODAL).not.toMatch(/gs\.find\(/);   // 배열 순서에 기대는 옛 선택이 되살아나지 않는다
  });

  it('배열 순서가 뒤집혀도 같은 클락을 고른다 (getVenueClocks 에 ORDER BY 가 없다)', () => {
    const main = clock({ gameSeq: 1, running: true });
    const side = clock({ gameSeq: 2, running: true, title: '데일리 6만 사이드2' });
    expect(pickLiveClock([main, side], stubOf(poster()))?.gameSeq).toBe(1);
    expect(pickLiveClock([side, main], stubOf(poster()))?.gameSeq).toBe(1);
  });

  it('정지된 게임이 진행 중인 게임을 이기지 않는다 (App 의 후보는 running 뿐이다)', () => {
    const stopped = clock({ gameSeq: 1, running: false });
    const live = clock({ gameSeq: 3, running: true, title: '데일리 6만 사이드3' });
    expect(pickLiveClock([stopped, live], stubOf(poster()))?.gameSeq).toBe(3);
  });

  it('제목은 타이브레이크일 뿐 탈락 조건이 아니다 — 제목이 달라도 타이머가 사라지지 않는다', () => {
    const only = clock({ gameSeq: 2, running: true, title: '한 글자 다른 제목', config: { title: '한 글자 다른 제목', levels: [LV(20)], regCloseLevel: 1 } });
    expect(pickLiveClock([only], stubOf(poster()))?.gameSeq).toBe(2);
  });

  it('제목이 정확히 맞는 쪽이 낮은 gameSeq 를 이긴다 (buildRegInfoMap 의 확신도 순위와 같은 축)', () => {
    const seq1 = clock({ gameSeq: 1, running: true, title: '사이드', config: { title: '사이드', levels: [LV(20)], regCloseLevel: 1 } });
    const seq2 = clock({ gameSeq: 2, running: true, title: '데일리 6만' });
    expect(pickLiveClock([seq1, seq2], stubOf(poster()))?.gameSeq).toBe(2);
  });

  it('다른 매장·다른 날짜의 클락은 후보가 아니다 (없는 데이터를 붙이지 않는다)', () => {
    expect(pickLiveClock([clock({ venueId: 'v2', running: true })], stubOf(poster()))).toBeNull();
    expect(pickLiveClock([clock({ sessionDate: '2026-09-12', running: true })], stubOf(poster()))).toBeNull();
  });

  it('⑥ 상세가 고른 클락의 레지 상태 = App 이 같은 포스터에 붙인 regInfo (다른 게임 값이 뜨지 않는다)', () => {
    const p = poster();
    const main = clock({ gameSeq: 1, running: true, remainingMs: 5 * 60_000 });
    const side = clock({ gameSeq: 2, running: true, title: '데일리 6만 사이드2', remainingMs: 17 * 60_000, config: { title: '데일리 6만 사이드2', levels: [LV(20), LV(20), LV(20)], regCloseLevel: 2 } });
    const stopped = clock({ gameSeq: 5, running: false, remainingMs: 99 * 60_000 });
    // App: getRunningClocks() → running 만 본다. 상세: getVenueClocks() → 정지 게임까지 섞여 온다.
    const appInfo = buildRegInfoMap([side, main], [p], 0).get(p.id)!;
    const picked = pickLiveClock([stopped, side, main], stubOf(p))!;
    const eff = effectiveLevel(picked, 0);
    expect(picked.gameSeq).toBe(1);
    expect(msToRegClose(picked, eff.index, eff.remainingMs)).toBe(appInfo.msLeft);
    expect(picked.running).toBe(appInfo.running);
    // 음성 대조용 — 사이드 값(다른 게임)과는 실제로 다르다(같으면 이 테스트가 아무것도 못 잠근다).
    const sideEff = effectiveLevel(side, 0);
    expect(msToRegClose(side, sideEff.index, sideEff.remainingMs)).not.toBe(appInfo.msLeft);
  });
});
