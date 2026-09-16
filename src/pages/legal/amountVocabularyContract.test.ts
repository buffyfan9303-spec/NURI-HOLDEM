// §28 금액 어휘 계약 — 화면 카피 (2026-09-16)
//
// 왜 지금 생겼나
//   오너가 참조 디자인(매장 'DIRECTOR HUD' 목업)을 주며 "적극 적용해서 리디자인" 을 요청했다.
//   그 목업의 시각·정보 구조에는 배울 것이 있지만, **카피에는 §28 이 금지한 어휘가 그대로 들어 있다**:
//     '본사 정산 **환전** 신청' · '시드권 **시세표**' · '(**평가액** ₩14,200,000)' ·
//     '수수료율 / **순정산**' · 'K-HOLDEM FEDERATION **에스크로** 보증' · '실시간 **자산 연동**'
//   디자인을 이식할 때 카피는 **같이 따라오기 쉽다.** 그래서 코드 쪽에 영구 차단을 둔다.
//
// §28 의 경계(CLAUDE.md)
//   · 허용 — 참가비(바이인)·GTD·프라이즈풀·상금은 **상품 가격 정보**다. 전자상거래법상 고지 의무와도 정합.
//   · 금지 — 이용권·시드권을 **환금 가능한 자산**처럼 말하는 프레이밍. '환전·현금·수익' 계열.
//
// 🔴 단순 금지어 검사를 하면 안 된다 — 거짓 양성이 난다.
//   이 저장소의 '환전'·'현금화' 는 전부 **금지를 서술하는 문맥**이다:
//     AuthModal '불법 환전·사행성 행위 금지 서약' · BusinessFooter '도박·환전·사행행위와도 무관' ·
//     CustomerDashboardPage '환불·현금화·유저 간 거래가 불가합니다'
//   그래서 **목업이 실제로 쓴 '제공' 어휘만** 좁게 막는다. 금지 서술은 그대로 살아 있어야 한다(아래 양성 대조).
//
// 기존 §28 검사와의 관계: `legalStaticConsistency.test.ts` 는 **법정 정적 HTML 본문**만 본다.
//   컴포넌트 카피는 그 검사 범위 밖이었다 — 이 파일이 그 빈칸을 메운다.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..');

/** 줄끝 정규화 — core.autocrlf=true 라 체크아웃마다 작업트리 줄끝이 다르다. */
const eol = (s: string) => s.split('\r\n').join('\n');

/** 주석을 지운 **화면에 실제로 나가는 텍스트만**. 설명문에 적은 단어가 계약을 오탐시키면 안 된다
 *  (이 저장소는 그 부류를 이미 세 번 밟았다 — Tailwind 주석 스캔 · SQL 롤백 주석 · 금지 클래스명). */
function uiText(s: string): string {
  return eol(s)
    .replace(/\/\*[\s\S]*?\*\//g, '')      // 블록 주석 ( {/* … */} 의 내부 포함 )
    .split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { walk(p, out); continue; }
    if (!/\.(ts|tsx)$/.test(e)) continue;
    if (/\.test\.tsx?$/.test(e)) continue;          // 계약 파일 자신들은 제외
    out.push(p);
  }
  return out;
}

const FILES = walk(SRC);

/** 목업에서 그대로 옮겨온 금지 어휘. 전부 '환금 가능한 자산' 프레이밍이다. */
const FORBIDDEN = ['환전 신청', '환전신청', '현금화 신청', '시세표', '평가액', '순정산', '에스크로', '자산 연동'];

describe('§28 금액 어휘 — 화면 카피에 환금성 프레이밍을 들이지 않는다', () => {
  it('🔴 재는 대상이 실제로 있다 — src 아래 소스 파일이 잡힌다', () => {
    expect(FILES.length, 'src 스캔 결과가 비었다 — 이 계약은 아무것도 못 잡는다').toBeGreaterThan(100);
  });

  it('🔴 금지 어휘가 화면 카피에 없다', () => {
    const hits: string[] = [];
    for (const p of FILES) {
      const text = uiText(readFileSync(p, 'utf-8'));
      const lines = text.split('\n');
      lines.forEach((line, i) => {
        for (const w of FORBIDDEN) {
          if (line.includes(w)) hits.push(`${p.slice(SRC.length + 1)}:${i + 1}  「${w}」  ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(
      hits,
      '§28 금지 어휘가 화면 카피에 들어왔다. 이용권·시드권을 환금 가능한 자산처럼 말하면 안 된다 —\n' +
        "참가비·상금·이용권 어휘로 바꿔라(예: '환전 신청' → '정산 요청', '평가액' → 쓰지 않는다).\n" +
        hits.join('\n'),
    ).toEqual([]);
  });

  it('🔴 양성 대조 — 금지를 **서술하는** 문구는 그대로 살아 있다(과잉 차단이 아니다)', () => {
    const all = FILES.map((p) => uiText(readFileSync(p, 'utf-8'))).join('\n');
    expect(all, "'불법 환전…금지 서약' 문구가 사라졌다 — 동의 게이트가 깨졌을 수 있다").toContain('불법 환전');
    expect(all, "이용권의 '환불·현금화 불가' 고지가 사라졌다").toContain('현금화');
  });
});
