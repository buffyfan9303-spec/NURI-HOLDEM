// 외부 반출 기능 제거 회귀 게이트 — 오너 지시(2026-09-09):
//   "외부 반출 기능은 제거한다 — CSV 다운로드·XLSX/JSON 내보내기·전체 일정 ICS·Google Calendar 보내기".
//   유지: 공유 링크·단건 상세 링크·백업·법적 데이터 제공.
//
// 왜 소스 스캔인가: 이 기능들은 전부 클라이언트 Blob/URL 조립이라 API·DB 흔적이 없다.
//   되살아나는 경로는 딱 하나 — 누군가 파일을 다시 만들고 import 한다. 그래서 import 경로와
//   MIME/도메인 문자열이 0건임을 파일 텍스트로 잠근다(legalConsistency.test.ts 와 같은 방식).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(SRC, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(SRC).map((p) => ({ rel: path.relative(ROOT, p).split(path.sep).join('/'), text: fs.readFileSync(p, 'utf-8') }));
const hits = (re: RegExp) => files.filter((f) => re.test(f.text)).map((f) => f.rel);

describe('외부 반출 기능 제거(EXP-01·02·03 · DEAD-01)', () => {
  it('CSV·엑셀 유틸 파일이 없고, 아무도 import 하지 않는다', () => {
    expect(fs.existsSync(path.join(SRC, 'lib/csv.ts')), 'src/lib/csv.ts 가 되살아났다').toBe(false);
    expect(fs.existsSync(path.join(SRC, 'lib/ledgerExport.ts')), 'src/lib/ledgerExport.ts 가 되살아났다').toBe(false);
    // NuriPosLedger 의 import 는 WP8 소유 — 그쪽이 지우면 이 줄이 초록이 된다.
    expect(hits(/lib\/(csv|ledgerExport)['"]/), 'lib/csv·lib/ledgerExport import 잔존').toEqual([]);
  });

  it('CSV·엑셀·캘린더 반출 MIME/도메인 문자열이 src 에 없다', () => {
    for (const re of [/text\/csv/, /vnd\.ms-excel/, /calendar\.google\.com/, /text\/calendar/]) {
      expect(hits(re), `${re} 잔존`).toEqual([]);
    }
  });

  it('calendar.ts 는 shareOrCopy 만 export 하고, import 하는 곳은 ToolsPanel 뿐이다', () => {
    const src = read('src/lib/calendar.ts');
    const exported = [...src.matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm)].map((m) => m[1]);
    expect(exported).toEqual(['shareOrCopy']);
    expect(hits(/lib\/calendar['"]/)).toEqual(['src/components/features/ToolsPanel.tsx']);
  });
});

describe('카피·도움말 정합(S28-02 · T1-10)', () => {
  it('변동성 시뮬레이터에 "수익" 어휘가 없다(icm.ts 규약 — 기대수익 프레이밍 금지)', () => {
    expect(read('src/components/features/tools/StackCalcs.tsx')).not.toContain('수익');
  });

  it('업주 매뉴얼이 티켓을 T(1T=1만원)로 설명하고, CSV·엑셀·구글캘린더 안내가 없다', () => {
    const manual = read('public/guide/manual.html');
    expect(manual).toContain('1T=1만원');
    expect(manual).not.toContain('CSV');
    expect(manual).not.toContain('엑셀 내보내기');
    expect(read('public/guide/owner.html')).not.toContain('구글캘린더');
  });
});
