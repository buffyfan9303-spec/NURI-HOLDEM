// 오늘(2026-09-18) 라이브 DB 까지 적용된 **신규 화면 2쌍**의 배선을 잠근다.
//   ① 이용권 발행 한도 증액: 업주 요청(VoucherManageModal) ↔ 운영자 승인(AdminTab)
//   ② 이벤트 개설 신청·제안: 업주 신청(VenueEventRequestPanel) ↔ 운영자 승인(VenueEventAdminCard)
//
// 🔴 왜 필요한가 — 오늘 실제로 난 사고:
//   한도 증액의 **요청 화면만 만들고 승인 화면을 안 만들었다.** 마이그레이션까지 적용한 뒤라
//   업주 요청이 '검토 중'에서 영원히 멈추는 막다른 길이 됐다(전수 점검이 잡았다).
//   RPC 도 살아 있고 클라이언트 함수도 있는데 **부르는 화면이 0곳** — 타입·린트·테스트 어느 것도
//   빨개지지 않았다. 그 구멍을 여기서 막는다.
//
// 무엇을 보나(소스 스캔 — rankverify·noExternalExport 계약과 같은 방식):
//   "요청을 만드는 함수가 화면에 있으면, **그 요청을 처리하는 함수도 화면에 있어야 한다.**"
//   한쪽만 있으면 그게 막다른 길이다.
//
// 못 보는 것: 버튼이 실제로 눌리는지·권한 분기·렌더 결과(브라우저 몫).
//   여기서는 **배선이 끊겼는지**만 본다 — 그것만으로 오늘의 사고는 막힌다.
//
// 실행: npx vitest run src/components/features/venueEventWiring.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f)) out.push(p);
  }
  return out;
}

const SOURCES = new Map(walk(SRC).map((p) => [p, readFileSync(p, 'utf8')]));

/** 경로 구분자를 `/` 로 통일.
 *  ⚠ 이게 없으면 이 검사는 **영원히 통과한다.** Windows 의 `p` 는 역슬래시 구분자라
 *    `p.endsWith('api/vouchers.ts')` 가 늘 false 가 되고, 그러면 정의 파일 자신이 호출부로
 *    잡혀 "호출부 0곳" 이 성립하지 않는다. 음성 대조(승인 호출을 지우고 돌리기)로 실제로 잡았다 —
 *    지웠는데도 초록이었다. 계약 테스트가 거짓 통과하는 전형적인 자리다. */
const norm = (p: string) => p.split('\\').join('/');

/** 함수가 **정의 파일 밖**에서 호출되는 파일 목록. */
function callSites(fn: string, defFile: string): string[] {
  const out: string[] = [];
  for (const [p, s] of SOURCES) {
    if (norm(p).endsWith(norm(defFile))) continue;
    // import 만 있고 호출이 없는 경우를 거른다 — 여는 괄호가 따라붙는 형태만 센다.
    if (new RegExp(`\\b${fn}\\s*\\(`).test(s)) out.push(norm(p).replace(norm(SRC), ''));
  }
  return out;
}

/** 요청 쪽 ↔ 처리 쪽이 **둘 다** 화면에 연결돼 있어야 하는 짝 */
const PAIRS = [
  {
    name: '이용권 발행 한도 증액',
    request: { fn: 'requestVoucherQuota', def: 'api/vouchers.ts' },
    decide: { fn: 'adminDecideVoucherQuota', def: 'api/vouchers.ts' },
  },
  {
    name: '이벤트 개설 신청·제안',
    request: { fn: 'requestVenueEvent', def: 'api/venueEvents.ts' },
    decide: { fn: 'adminDecideVenueEvent', def: 'api/venueEvents.ts' },
  },
];

describe('신청↔승인 배선 — 막다른 길 금지', () => {
  it('🔴 검사가 실제로 무언가를 스캔하고 있다', () => {
    // 경로·정규식이 깨지면 조용히 빈 결과를 통과시킨다. 그쪽이 빨간 것보다 나쁘다.
    expect(SOURCES.size, 'src 를 하나도 못 읽었다 — walk 가 깨졌다').toBeGreaterThan(200);
    expect(norm('a\\b\\c.ts'), '경로 정규화가 안 된다').toBe('a/b/c.ts');
  });

  for (const p of PAIRS) {
    it(`🔴 ${p.name}: 요청하는 화면이 있으면 **승인하는 화면도** 있다`, () => {
      const req = callSites(p.request.fn, p.request.def);
      const dec = callSites(p.decide.fn, p.decide.def);
      expect(req.length, `${p.request.fn} 를 부르는 화면이 없다 — 업주가 요청할 방법이 없다`).toBeGreaterThan(0);
      expect(
        dec.length,
        `🔴 ${p.decide.fn} 를 부르는 화면이 **0곳**이다.\n`
        + `  업주는 ${req.join(', ')} 에서 요청을 보낼 수 있는데 운영자가 처리할 화면이 없다 —\n`
        + "  요청이 '검토 중'에서 영원히 멈추는 막다른 길이다(2026-09-18 에 실제로 냈던 사고).\n"
        + '  요청을 받는 화면과 처리하는 화면은 **반드시 같은 작업에서** 만든다.',
      ).toBeGreaterThan(0);
    });
  }

  it('운영자 승인 카드가 관리자 화면에 실제로 마운트돼 있다', () => {
    // 컴포넌트를 만들어 두고 **어디에도 붙이지 않는** 것도 같은 부류의 막다른 길이다.
    const admin = readFileSync(join(SRC, 'components', 'features', 'AdminTab.tsx'), 'utf8');
    for (const c of ['VoucherQuotaAdminCard', 'VenueEventAdminCard']) {
      expect(admin, `${c} 가 AdminTab 에서 렌더되지 않는다 — 만들어 놓고 안 붙인 것이다`)
        .toMatch(new RegExp(`<${c}\\s*/?>`));
    }
  });

  it('업주 신청 화면이 내 매장에 실제로 마운트돼 있고 갈 길도 있다', () => {
    const store = readFileSync(join(SRC, 'components', 'features', 'VenueManageTab.tsx'), 'utf8');
    expect(store, 'VenueEventRequestPanel 이 내 매장에서 렌더되지 않는다').toMatch(/<VenueEventRequestPanelM\s/);
    expect(store, '이벤트 신청 섹션이 사이드바 목록(available)에 없다 — 화면은 있는데 갈 길이 없다')
      .toMatch(/id:\s*'event',\s*label:/);
  });
});
