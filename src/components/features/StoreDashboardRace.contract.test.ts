// 매장 대시보드 — 예약 realtime race (C08, 2026-09-12 재현/고정)
//
// 렌더 트리 테스트로 잡기 어렵다(auth·supabase·수많은 api 를 다 채워야 한다) — 저장소가 이미 쓰는
// 소스 계약 테스트 방식으로 잠근다(NuriPosLedgerRace.contract.test.ts 와 같은 결).
// 실행: npx vitest run src/components/features/StoreDashboardRace.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, 'StoreDashboard.tsx'), 'utf-8');
const code = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('C08 · reload 의 예약 id 목록이 최신 schedules 를 반영한다(구독 콜백의 낡은 목록 회귀 방지)', () => {
  it('reload 의 ids 계산이 props schedules 를 직접 읽지 않는다(스캔 콜백 시점에 낡은 클로저를 굳힌다)', () => {
    // deps 에 reloadRange 가 붙었다(F14) — 목록 자체가 아니라 '본문'을 보는 테스트라 꼬리는 느슨하게 잡는다.
    const m = code.match(/const reload = useCallback\(\(\) => \{([\s\S]*?)\}, \[venueId, d[^\]]*\]\);/);
    expect(m, 'reload 정의를 찾지 못했다').not.toBeNull();
    const body = m![1];
    // schedules(prop) 를 reload 본문에서 직접 filter 하면 useCallback 의 [venueId, d] 의존성 배열 아래서
    // 마운트 당시 schedules 로 영원히 고정된다 — schedulesRef.current 를 읽어야 매 호출마다 최신값이다.
    expect(body).not.toMatch(/\bschedules\.filter\(/);
    expect(body).toMatch(/schedulesRef\.current\.filter\(/);
  });

  it('schedulesRef 가 매 렌더 본문에서 동기로 갱신된다(useEffect 가 아니다 — 타이밍 갭 방지)', () => {
    expect(code).toMatch(/const schedulesRef = useRef\(schedules\);\s*\n\s*schedulesRef\.current = schedules;/);
  });

  it('예약 realtime 구독이 전체 reload 대신 좁은 reloadReservations 를 부른다(급여·28일 집계까지 재조회하지 않는다)', () => {
    const m = code.match(/useEffect\(\(\) => \{ if \(active\) return subscribeReservations\(([^,]+), upcomingIds\); \}/);
    expect(m, 'subscribeReservations 구독을 찾지 못했다').not.toBeNull();
    expect(m![1].trim()).toBe('reloadReservations');
  });

  it('reloadReservations 는 getReservationCounts 하나만 부른다(급여·클락·28일 range 를 함께 부르지 않는다)', () => {
    const m = code.match(/const reloadReservations = useCallback\(\(\) => \{([\s\S]*?)\}, \[venueId, d\]\);/);
    expect(m, 'reloadReservations 정의를 찾지 못했다').not.toBeNull();
    const body = m![1];
    expect(body).toContain('getReservationCounts(');
    expect(body).not.toMatch(/getStaffWages|getLedgerRange|getVenueWeeklyFunnel|getDealerShifts/);
  });
});

describe('C08 보완 · 예약 인원 조회 실패를 0명과 분리한다', () => {
  it('resCountsErr 상태가 있고, 실패 시 setResCounts({}) 로 뭉개지 않는다', () => {
    expect(code).toMatch(/const \[resCountsErr, setResCountsErr\] = useState/);
    const m = code.match(/const reloadReservations = useCallback\(\(\) => \{([\s\S]*?)\}, \[venueId, d\]\);/);
    const body = m![1];
    // §9-1 로 catch 안에 세대 가드(if (rFresh()))가 들어갔다 — 이 테스트가 잠그는 것은
    // '실패 경로가 오류만 기록하고 카운트를 {} 로 뭉개지 않는다' 이므로 그 계약만 본다.
    const cat = body.match(/\.catch\(\([a-zA-Z]+\) => \{[^}]*setResCountsErr\(/);
    expect(cat, 'catch 에서 resCountsErr 를 기록하지 않는다').not.toBeNull();
    expect(body.slice(body.indexOf('.catch('))).not.toMatch(/setResCounts\(/);
  });

  it('배지·행이 실패일 때 0명이 아니라 실패 표시를 보여준다', () => {
    expect(code).toMatch(/예약 \{resCountsErr \? '—' : totalRes\}/);
    expect(code).toMatch(/예약 \{resCountsErr \? '—' : \(resCounts\[g\.id\] \?\? 0\)\}명/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F14(2026-09-13) — getLedgerRange 실패를 빈 값으로 삼켜 '데이터 없음'·0장으로 위장하던 것.
// 회귀 ⑦ 실패가 '0 / 데이터 없음'이 아니라 오류+재시도로 갈린다 · ⑧ 실패한 재조회가 갱신 시각을 올리지 않는다.
// ⚠ 소스 계약 테스트는 "그 문장이 있는가"만 본다 — **개수와 위치(순서)** 까지 못박아 도달 가능성을 좁힌다.
const reloadBody = () => {
  const m = code.match(/const reload = useCallback\(\(\) => \{([\s\S]*?)\n {2}\}, \[venueId, d[^\]]*\]\);/);
  expect(m, 'reload 정의를 찾지 못했다').not.toBeNull();
  return m![1];
};
const reloadRangeBody = () => {
  const m = code.match(/const reloadRange = useCallback\(\(\) => \{([\s\S]*?)\n {2}\}, \[venueId, d\]\);/);
  expect(m, 'reloadRange 정의를 찾지 못했다').not.toBeNull();
  return m![1];
};

describe('F14 ⑦ · 14일 장부 조회 실패를 "데이터 없음"·0장과 갈라놓는다', () => {
  it('rangeErr 상태가 wageErr·resCountsErr 와 같은 모양으로 있다', () => {
    expect(code).toMatch(/const \[rangeErr, setRangeErr\] = useState<unknown>\(null\);/);
  });

  it('reload 는 getLedgerRange 를 직접 부르지 않는다(실패를 삼키던 자리 — reloadRange 경유)', () => {
    const body = reloadBody();
    expect(body).not.toMatch(/getLedgerRange\(/);
    expect(body).toMatch(/reloadRange\(\)/);
  });

  it('reloadRange 는 getLedgerRange 를 정확히 1번 부르고 실패를 setRangeErr 로 올린다(.catch(() => {}) 금지)', () => {
    const body = reloadRangeBody();
    expect((body.match(/getLedgerRange\(/g) ?? []).length).toBe(1);
    expect(body).not.toMatch(/catch\(\(\) => \{\}\)/);
    expect(body).toMatch(/setRangeErr\(e\)/);
    expect(body).toMatch(/setRange\(r\);\s*setRangeErr\(null\)/); // 성공하면 지난 실패를 반드시 내린다
  });

  it('실패 표시가 "데이터가 없습니다"보다 **먼저** 판정된다(실패는 빈 값이라 뒤에 두면 영원히 도달 못 한다)', () => {
    for (const empty of ['최근 7일 장부 데이터가 없습니다.', '비교할 장부 데이터가 없습니다.']) {
      const iEmpty = code.indexOf(empty);
      expect(iEmpty, `${empty} 문구를 찾지 못했다`).toBeGreaterThan(-1);
      const iErr = code.lastIndexOf('rangeErr ?', iEmpty);
      expect(iErr, `${empty} 앞에 rangeErr 분기가 없다`).toBeGreaterThan(-1);
      // 같은 카드 안(수백 자 이내)에서 갈려야 한다 — 멀리 있는 다른 카드의 분기를 주워 오면 무효.
      expect(iEmpty - iErr).toBeLessThan(400);
    }
  });

  it('이용권 7일 두 칸은 실패 시 0장이 아니라 —(오늘 두 칸은 core 값이라 그대로)', () => {
    expect(code).toMatch(/label="7일 발행" value=\{rangeErr \? '—' : `\$\{weekVoucher\}`\}/);
    // 2026-09-25 #9 — T 는 소수라 fmtT(소수 1자리+천단위)로 감싼다. 계약의 핵심(실패 시 —)은 그대로다.
    expect(code).toMatch(/label="7일 회수" value=\{rangeErr \? '—' : fmtT\(weekTicket\)\}/);
    expect(code).toMatch(/label="오늘 발행" value=\{`\$\{todayVoucher\}`\}/);
  });

  it("'오늘 게임' 표가 실패 때 통째로 사라지지 않는다(섹션 게이트가 rangeErr 를 포함)", () => {
    expect(code).toMatch(/\{caps\.ledger && \(todayGames\.length > 0 \|\| !!rangeErr\) && \(/);
  });

  it('실패한 카드마다 재시도 경로가 붙어 있다(4곳: 7일 추세·전주 대비·이용권·오늘 게임)', () => {
    expect((code.match(/<LoadFailRow /g) ?? []).length).toBe(4);
    expect((code.match(/onRetry=\{reloadRange\}/g) ?? []).length).toBe(4);
    expect(code).toMatch(/function LoadFailRow\(/);
  });
});

describe('F14 ⑧ · 실패한 재조회는 "HH:MM 기준"을 올리지 않는다', () => {
  it('setRefreshedAt 은 파일에서 단 한 곳, 그리고 성공 플래그 아래에 있다', () => {
    expect((code.match(/setRefreshedAt\(new Date\(\)\)/g) ?? []).length).toBe(1);
    expect(code).toMatch(/if \(ok\) setRefreshedAt\(new Date\(\)\);/);
  });

  it('range 실패와 core 실패가 그 플래그를 내린다(옛 숫자에 새 시각이 붙지 않는다)', () => {
    const body = reloadBody();
    expect(body).toMatch(/let ok = true;/);
    expect(body).toMatch(/reloadRange\(\)\.then\(\(good\) => \{ if \(!good\) ok = false; \}\)/);
    expect(body).toMatch(/if \(err\) ok = false;/);
  });
});

describe('N01 · 매장 전환 세대 보호가 데이터·오류·로딩·갱신 시각에 같이 걸린다', () => {
  it('owner 는 venueId#d 이고 렌더 본문에서 동기로 갱신된다', () => {
    expect(code).toMatch(/ownerRef\.current = `\$\{venueId\}#\$\{d\}`;/);
    expect(code).toMatch(/import \{ isStaleResponse, type RequestStamp \} from '\.\.\/\.\.\/lib\/staleResponse';/);
  });

  it('reload 의 완료부(로딩·갱신 시각)와 오류 기록이 같은 세대 가드를 통과해야 실행된다', () => {
    const body = reloadBody();
    expect(body).toMatch(/const fresh = \(\) => !isStaleResponse\(stamp, \{ seq: genRef\.current, owner: ownerRef\.current \}\);/);
    // 완료부: **마지막 Promise.all 의 then 첫 줄**이 가드여야 한다.
    // ⚠ indexOf('if (!fresh()) return;') 로만 보면 위쪽 core 오류 핸들러의 같은 문장을 주워
    //   완료부 가드를 통째로 지워도 통과한다(2026-09-13 음성 대조 N5 에서 실측).
    expect(body).toMatch(/\]\)\.then\(\(\) => \{\s*\r?\n\s*if \(!fresh\(\)\) return;/);
    const iGuard = body.search(/\]\)\.then\(\(\) => \{\s*\r?\n\s*if \(!fresh\(\)\) return;/);
    const iLoading = body.indexOf('setLoading(false)');
    expect(iLoading).toBeGreaterThan(iGuard);
    // 오류도 같은 세대로 — 낡은 응답이 남의 매장 화면에 오류 배너를 남기지 않는다
    expect(body).toMatch(/\(e\) => \{ if \(!fresh\(\)\) return;/);
  });

  it('reloadRange 도 자기 세대(rangeGenRef)로 낡은 응답을 버린다', () => {
    const body = reloadRangeBody();
    expect(body).toMatch(/rangeGenRef\.current = stamp\.seq;/);
    expect((body.match(/if \(stale\(\)\) return true;/g) ?? []).length).toBe(2); // 성공·실패 **둘 다**
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F12(2026-09-13) — 5단계 '정산' 칩의 판정 범위가 그 칩이 여는 판(날짜 단위 정산)과 달랐다.
describe('F12 · 정산 칩만 하루 전체 범위로 판정한다', () => {
  const stepInfo = () => {
    const m = code.match(/const stepInfo = useMemo<StoreStepMap \| null>\(\(\) => \{([\s\S]*?)\n {2}\}, \[/);
    expect(m, 'stepInfo 정의를 찾지 못했다').not.toBeNull();
    return m![1];
  };

  it('settle.done 이 오늘 **전 게임**의 마감·미수를 본다', () => {
    expect(stepInfo()).toMatch(/done: closed && fin\.unpaid === 0 && todayGames\.every\(\(g\) => g\.sx\.closed && g\.unpaid === 0\)/);
  });

  it('나머지 네 단계는 단일(메인) 세션 기준 그대로다 — todayGames 는 settle 줄에만 등장한다', () => {
    const lines = stepInfo().split('\n').filter((l) => l.includes('todayGames'));
    expect(lines.length).toBe(1);
    for (const key of ['posters:', 'ledger:', 'clock:', 'ranking:']) {
      const line = stepInfo().split('\n').find((l) => l.trim().startsWith(key));
      expect(line, `${key} 줄을 찾지 못했다`).toBeTruthy();
      expect(line!).not.toContain('todayGames');
    }
  });

  it('todayGames 가 stepInfo 보다 **앞**에 정의된다(뒤에 있으면 TDZ 로 화면이 죽는다)', () => {
    const iGames = code.indexOf('const todayGames = useMemo(');
    const iStep = code.indexOf('const stepInfo = useMemo<');
    expect(iGames).toBeGreaterThan(-1);
    expect(iStep).toBeGreaterThan(-1);
    expect(iGames).toBeLessThan(iStep);
    expect((code.match(/const todayGames = useMemo\(/g) ?? []).length).toBe(1); // 두 벌로 갈라지지 않는다
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §9-1(2026-09-13) — 매장 전환 세대 가드를 **남은 setter 전부**로 넓힌다.
// N01 은 완료부(로딩·갱신 시각)와 core 오류만 잠갔다. 그 사이의 데이터 setter 12개는 무가드라
// 매장 A 의 늦은 응답이 B 화면에 숫자로 남았다. 여기서는 '빠진 setter 가 없다'를 열거가 아니라
// **잔여물 0** 으로 잠근다 — guard(…) 로 감싼 콜백을 통째로 지우고 남는 setter 가 허용 목록과
// 정확히 같아야 한다. 새 setter 를 무가드로 추가하면 목록이 달라져 이 테스트가 깨진다.
/** `guard( … )` 로 감싼 인자를 괄호 균형으로 찾아 통째로 지운다. */
function stripGuarded(src: string): string {
  let out = ''; let i = 0;
  for (;;) {
    const at = src.indexOf('guard(', i);
    if (at < 0) return out + src.slice(i);
    out += src.slice(i, at);
    let depth = 0; let j = at + 'guard'.length;
    for (; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') { depth--; if (depth === 0) { j++; break; } }
    }
    i = j;
  }
}
const settersIn = (src: string) => (src.match(/\bset[A-Z]\w*\(/g) ?? []).map((s) => s.slice(0, -1));

describe('§9-1 · reload 안의 모든 setter 가 세대 가드를 통과한다 (빠진 setter 0)', () => {
  it('guard 헬퍼가 fresh() 로 정의돼 있다 — 감싸면 곧 세대 검사다', () => {
    expect(reloadBody()).toMatch(/const guard = <T,>\(fn: \(v: T\) => void\) => \(v: T\) => \{ if \(fresh\(\)\) fn\(v\); \};/);
  });

  it('guard 로 감싸지 않은 setter 는 **명시적으로 fresh() 를 검사하는 4자리뿐**이다', () => {
    const rest = stripGuarded(reloadBody());
    // ① ids 가 없을 때의 **동기** 초기화(응답을 기다리지 않으므로 항상 이 세대다)
    // ②③ core 성공/실패의 loadErr — 각각 if (fresh()) · if (!fresh()) return 을 자기 줄에서 한다
    // ④ 완료부 로딩·갱신 시각 — N01 이 위치까지 못박는다
    expect(settersIn(rest)).toEqual([
      'setResCounts', 'setResCountsErr',
      'setLoadErr', 'setLoadErr',
      'setLoading', 'setRefreshedAt',
    ]);
  });

  it('데이터 setter 들이 실제로 guard 를 지나간다 (감싼 자리가 최소 17곳)', () => {
    const n = (reloadBody().match(/\bguard\(/g) ?? []).length - 1; // 1개는 헬퍼 정의
    expect(n).toBeGreaterThanOrEqual(17);
  });

  it('성공만이 아니라 **실패 경로**(catch)의 setter 도 감싼다 — 남의 매장 실패값이 남지 않는다', () => {
    const body = reloadBody();
    expect(body).toMatch(/\.catch\(guard\(\(\) => \{ setWages\(\[\]\); setWageErr\(true\); \}\)\)/);
    // F6(2026-09-13): 딜러 근무 실패는 dealerErr 로도 남긴다 — 두 setter 모두 같은 guard 안에 있어야 한다.
    expect(body).toMatch(/\.catch\(guard\(\(\) => \{ setMonthDealers\(\[\]\); setDealerErr\(true\); \}\)\)/);
    expect(body).toMatch(/\.catch\(guard\(\(e: unknown\) => \{ ok = false; setResCountsErr\(e\); \}\)\)/);
    // 벌거벗은 `.then(setX)` 이 하나라도 남으면 그 줄이 무가드다
    expect(body).not.toMatch(/\.then\(set[A-Z]/);
    expect(body).not.toMatch(/\.catch\(\(\) => set[A-Z]/);
  });
});

describe('§9-1 · 좁은 재조회와 1회성 effect 도 같은 소유자 축을 쓴다', () => {
  it('reloadReservations(realtime 이 부른다)가 자기 세대(resGenRef)로 데이터·오류를 둘 다 막는다', () => {
    const m = code.match(/const reloadReservations = useCallback\(\(\) => \{([\s\S]*?)\n {2}\}, \[venueId, d\]\);/);
    expect(m, 'reloadReservations 정의를 찾지 못했다').not.toBeNull();
    const body = m![1];
    expect(body).toMatch(/resGenRef\.current = stamp\.seq;/);
    expect(body).toMatch(/\.then\(\(c\) => \{ if \(rFresh\(\)\) \{ setResCounts\(c\); setResCountsErr\(null\); \} \}\)/);
    expect(body).toMatch(/\.catch\(\(e\) => \{ if \(rFresh\(\)\) setResCountsErr\(e\); \}\)/);
  });

  it('매장당 1회 로드(생일·요일 평균·지난 회차)도 ownerOnly 로 소유자를 확인한다', () => {
    expect(code).toMatch(/getUpcomingBirthdays\(venueId\)\.then\(ownerOnly\(owner, setBdays\)\)/);
    expect(code).toMatch(/getLedgerRange\(venueId, d28\[0\], d28\[27\]\)\.then\(ownerOnly\(owner, /);
    expect(code).toMatch(/getLastClosedRound\(venueId, d\)\.then\(ownerOnly\(owner, setLastRound\)\)/);
    expect((code.match(/const owner = `\$\{venueId\}#\$\{d\}`;/g) ?? []).length).toBe(3);
  });

  it('ownerRef 가 그 1회성 effect 들보다 **앞**에 선언된다(뒤면 TDZ 로 화면이 죽는다)', () => {
    const iOwner = code.indexOf('const ownerRef = useRef(');
    const iFirst = code.indexOf('getUpcomingBirthdays(venueId)');
    expect(iOwner).toBeGreaterThan(-1);
    expect(iFirst).toBeGreaterThan(-1);
    expect(iOwner).toBeLessThan(iFirst);
    expect((code.match(/const ownerRef = useRef\(/g) ?? []).length).toBe(1);
  });
});
