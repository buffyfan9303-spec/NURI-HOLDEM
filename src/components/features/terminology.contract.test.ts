// 용어 통일 계약 (2026-09-17 오너 "통일해라") — 같은 것을 화면마다 다른 이름으로 부르지 않는다.
//
//   정본: 대회(≠토너먼트·포스터·게임) · 참가비(손님) / 바인(업주 장부·클락) · 출석(≠체크인·출석 도장·방문 체크)
//         · 순위(≠랭킹) · 상금(≠프라이즈)
//   화면에 보이는 **문구만** 본다 — 주석·DB 컬럼·API 필드·타입 이름은 대상이 아니다(주석은 벗기고 검사).
//   예외는 아래 ALLOW 에 **이유와 함께** 적는다. 이유 없는 예외는 넣지 않는다.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = __dirname;

/** 주석을 벗긴 실행 코드만 — 주석에 옛 표기가 남아 있는 것은 화면 문구가 아니다. */
const code = (src: string) => src
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, (m) => m.replace(/[^\n]/g, ' '))  // 줄 수를 보존해 L번호가 소스와 맞게
  .replace(/^\s*\/\/.*$/gm, ' ')
  .replace(/\s\/\/.*$/gm, ' ')            // 줄 끝 주석(https:// 같은 URL 은 앞에 공백이 없어 살아남는다)
  .replace(/keywords:\s*'[^']*'/g, ' ');  // ToolsPanel 검색 동의어 — 유저가 '토너먼트' 라고 쳐도 찾혀야 하므로 화면 문구가 아니다

/** 금지 표기 → 정본. */
const BANNED: { re: RegExp; canon: string }[] = [
  { re: /토너먼트/g, canon: '대회' },
  { re: /바이인/g,   canon: '참가비(손님) · 바인(업주 장부·클락)' },
  { re: /랭킹/g,     canon: '순위' },
  { re: /프라이즈/g, canon: '상금' },
  { re: /체크인/g,   canon: '출석' },
  { re: /출석 도장/g, canon: '출석' },
  { re: /방문 체크/g, canon: '출석' },
];

/** 예외 — file 은 features/ 기준 상대 경로, phrase 가 그 파일에서 허용되는 정확한 표기. */
const ALLOW: { file: RegExp; phrase: RegExp; why: string }[] = [
  { file: /^BusinessFooter\.tsx$/, phrase: /토너먼트/, why: '법적 고지문(국민체육진흥법 마인드 스포츠) — 오너 지시로도 코드에서 빼지 않는 읽기 전용 문구' },
  { file: /^LegalDocsModal\.tsx$/, phrase: /체크인|랭킹/, why: '개인정보처리방침 원문 — 법적 문서는 이 커밋의 편집 범위 밖(읽기 전용)' },
  { file: /^(AuthModal|ConsentGateModal)\.tsx$/, phrase: /랭킹 프로필 공개/, why: '선택 동의 라벨 — src/pages/legal/PrivacyPolicy.tsx 의 "랭킹 프로필 공개 동의" 와 글자가 같아야 하는 동의 문구(법적 문서 쪽을 함께 바꿀 때 같이 바꾼다)' },
  { file: /^gto\/(NuriSpotPanel|SpotDetails)\.tsx$/, phrase: /토너먼트/, why: '2026-09-24 오너 지시(G2) — NURI SPOT 의 게임 종류 표기는 "토너먼트 / 캐시". 포커 게임 형식 이름이지 대회 일정(상품)이 아니다. 저장값 mtt 는 그대로' },
  { file: /^gto\/TdaRulesTool\.tsx$/, phrase: /토너먼트 디렉터/, why: 'TDA(Tournament Directors Association) 고유 직함 — 규칙 원문 출처 표기' },
  { file: /^VenueManageTab\.tsx$/, phrase: /토너먼트 디렉터/, why: '인쇄 양식의 TD SIGN 칸 — TDA 고유 직함' },
  { file: /^tools\/StackCalcs\.tsx$/, phrase: /바이인/, why: '뱅크롤 계산기의 단위(캐시게임 바이인 N배) — 참가비(상품 가격)와 다른 개념이고 "참가비 20회분" 은 캐시게임에서 틀린 말' },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

describe('용어 통일 — 사용자 노출 문구', () => {
  const files = walk(ROOT);
  it('features/ 아래 .tsx 를 실제로 훑는다', () => { expect(files.length).toBeGreaterThan(100); });

  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    it(rel, () => {
      const src = code(readFileSync(file, 'utf8'));
      const hits: string[] = [];
      src.split('\n').forEach((line, i) => {
        for (const { re, canon } of BANNED) {
          re.lastIndex = 0;
          if (!re.test(line)) continue;
          const allowed = ALLOW.some((a) => a.file.test(rel) && a.phrase.test(line));
          if (!allowed) hits.push(`  L${i + 1} [${re.source} → ${canon}] ${line.trim().slice(0, 120)}`);
        }
      });
      expect(hits, `${rel}: 금지 표기가 화면 문구에 남아 있습니다 — 정본으로 바꾸거나 ALLOW 에 이유와 함께 넣으세요\n${hits.join('\n')}`).toEqual([]);
    });
  }

  it('예외 목록의 파일이 실제로 존재하고 그 표기를 정말 쓴다(죽은 예외 방지)', () => {
    for (const a of ALLOW) {
      const hit = files.find((f) => a.file.test(relative(ROOT, f).replace(/\\/g, '/')));
      expect(hit, `${a.file} 가 없습니다 — 예외를 지우세요`).toBeTruthy();
      expect(a.phrase.test(code(readFileSync(hit!, 'utf8'))), `${a.file} 에 ${a.phrase} 가 더는 없습니다 — 예외를 지우세요`).toBe(true);
    }
  });
});
