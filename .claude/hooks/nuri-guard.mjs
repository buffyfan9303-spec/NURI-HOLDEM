// NURI 규약 가드 — CLAUDE.md 하드 금지 규칙을 Edit/Write 시점에 차단(PreToolUse).
// src/ 아래 소스 파일에 '금지 라이브러리 import'가 새로 들어오면 exit 2로 도구 호출을 막는다.
// 정밀 매칭(실제 import 문만) — 오탐 최소화. 스크래치패드/문서/설정 파일은 통과.
import { readFileSync } from 'node:fs';

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
let data;
try { data = JSON.parse(raw); } catch { process.exit(0); }

const ti = data.tool_input || {};
const file = String(ti.file_path || '').replace(/\\/g, '/');

// 소스(src/)의 코드/스타일 파일만 검사 — 절대경로(.../src/)·상대경로(src/) 모두 매칭
if (!/(^|\/)src\//.test(file)) process.exit(0);
if (!/\.(ts|tsx|js|jsx|css)$/.test(file)) process.exit(0);

// Write=content, Edit=new_string, MultiEdit=edits[].new_string
let content = ti.content ?? ti.new_string ?? '';
if (Array.isArray(ti.edits)) content += '\n' + ti.edits.map((e) => e?.new_string ?? '').join('\n');
if (!content) process.exit(0);

const banned = [
  {
    re: /from\s+['"](framer-motion|motion\/react)['"]/,
    msg: "framer-motion/motion 금지 — SlidingPill FLIP 또는 CSS 전환을 쓰세요 (CLAUDE.md).",
  },
  {
    re: /from\s+['"](lucide-react|react-icons(\/[^'"]*)?|@heroicons\/[^'"]+|phosphor-react|@phosphor-icons\/[^'"]+|hugeicons[^'"]*|@tabler\/icons[^'"]*)['"]/,
    msg: "새 아이콘 라이브러리 금지 — src/components/atoms/Icon.tsx 의 PATHS 에 한 줄 추가하세요 (CLAUDE.md).",
  },
  {
    re: /@import\s+['"]tailwindcss['"]|from\s+['"]@tailwindcss\/(vite|postcss)['"]/,
    msg: "Tailwind v4 마이그레이션 금지 — v3.4 + tailwind.config.js 유지 (CLAUDE.md).",
  },
];

const hits = banned.filter((b) => b.re.test(content));
if (hits.length) {
  console.error('⛔ NURI 규약 가드 차단 (' + file + '):\n' + hits.map((h) => '  - ' + h.msg).join('\n'));
  process.exit(2); // 도구 호출 차단 + 이유를 모델에 전달
}
process.exit(0);
