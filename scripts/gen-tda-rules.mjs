// scripts/gen-tda-rules.mjs — src/data/tdaRules.ts → supabase/functions/tda-assist/rules.json
//
// 왜 필요한가(2026-09-11): TDA 질의 AI 를 `tda-assist` 전용 엣지 함수로 옮기면서, **서버가 규칙 원문을
// 조립**하게 만들었다(클라이언트는 질문과 규칙 키만 보낸다). 그래야 클라이언트가 프롬프트 본문에
// 임의 문자열을 실어 보낼 수 없다 — 종전 범용 gemini 프록시의 구조적 구멍이 그것이었다.
// 그러려면 엣지 함수도 canonical 규칙을 들고 있어야 하고, 그 사본이 원본과 어긋나면
// '없는 조항을 인용'하는 최악의 실패가 난다. 그래서 ① 이 스크립트가 유일한 생성 경로이고
// ② src/lib/tdaRulesSync.test.ts 가 원본과 사본의 일치를 매 테스트마다 잠근다.
//
// 사용: node scripts/gen-tda-rules.mjs           (생성)
//       node scripts/gen-tda-rules.mjs --check   (일치만 확인 — CI/테스트용)
//
// TS 를 파싱하지 않는다: vite 의 esbuild 로 트랜스파일해 실제로 import 한다(값이 곧 진실).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'vite';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src/data/tdaRules.ts');
const OUT = join(ROOT, 'supabase/functions/tda-assist/rules.json');

/** 규칙의 안정 키 — 클라이언트가 서버에 보내는 유일한 식별자. (section, no, title) 조합은 원문에서 유일하다. */
export const ruleKey = (r) => `${r.section}|${r.no === null ? '' : r.no}|${r.title}`;

async function loadRules() {
  // vite 를 라이브러리 모드로 한 번 돌려 데이터 모듈만 ESM 으로 뽑는다(별도 의존성 없이 TS 를 값으로 만든다).
  const res = await build({
    root: ROOT,
    logLevel: 'error',
    build: {
      write: false,
      lib: { entry: SRC, formats: ['es'], fileName: 'tdaRules' },
      rollupOptions: { output: { entryFileNames: 'tdaRules.mjs' } },
    },
  });
  const chunk = (Array.isArray(res) ? res[0] : res).output.find((o) => o.type === 'chunk');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
  return { rules: mod.TDA_RULES, version: mod.TDA_VERSION };
}

const { rules, version } = await loadRules();

// 키 유일성은 이 데이터의 전제다 — 깨지면 서버가 엉뚱한 규칙을 조립한다.
const keys = new Set();
for (const r of rules) {
  const k = ruleKey(r);
  if (keys.has(k)) { console.error(`[tda] 중복 키: ${k}`); process.exit(1); }
  keys.add(k);
}

// 서버가 쓰는 필드만 싣는다(keywords 는 클라이언트 검색 전용 — 서버는 조립만 한다).
const payload = {
  version,
  generatedFrom: 'src/data/tdaRules.ts',
  rules: rules.map((r) => ({ key: ruleKey(r), no: r.no, section: r.section, title: r.title, body: r.body, page: r.page })),
};
const text = JSON.stringify(payload, null, 2) + '\n';

if (process.argv.includes('--check')) {
  if (!existsSync(OUT)) { console.error('[tda] rules.json 이 없다 — node scripts/gen-tda-rules.mjs 를 돌려라'); process.exit(1); }
  if (readFileSync(OUT, 'utf-8') !== text) {
    console.error('[tda] rules.json 이 src/data/tdaRules.ts 와 다르다 — node scripts/gen-tda-rules.mjs 로 재생성하라');
    process.exit(1);
  }
  console.log(`[tda] --check OK — ${rules.length}개 규칙이 원본과 일치한다`);
} else {
  writeFileSync(OUT, text);
  console.log(`[tda] rules.json 생성 — ${rules.length}개 규칙 (${version})`);
}
