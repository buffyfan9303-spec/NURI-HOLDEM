// NURI 가드 — 2026-08-26 정책 변경: 하드 제약 전면 해제(사장님 지시).
//
// 새 정책
//  ✅ 라이브러리·스택 자유 (framer-motion·아이콘 라이브러리·Tailwind v4 등 전부 허용)
//  🚫 웹사이트의 '내용'(기능·데이터·카피)은 보존 — 있던 걸 없애지 말 것
//  🚫 기존에 있던 오류는 재발 금지
//
// 그래서 이 훅은 더 이상 차단(exit 2)하지 않는다. 대신 "예전에 왜 그렇게 했는지"의
// 제도적 기억만 stderr로 알려준다 — 같은 버그를 다시 만들지 않게.
import { readFileSync } from 'node:fs';

const BSLASH = String.fromCharCode(92); // 셸 이스케이프 함정 회피

let raw = '';
try { raw = readFileSync(0, 'utf8'); } catch { process.exit(0); }
let data;
try { data = JSON.parse(raw); } catch { process.exit(0); }

const ti = data.tool_input || {};
const file = String(ti.file_path || '').split(BSLASH).join('/');

// 소스(src/)의 코드/스타일 파일만 대상 — 절대·상대경로 모두
if (!/(^|\/)src\//.test(file)) process.exit(0);
if (!/\.(ts|tsx|js|jsx|css)$/.test(file)) process.exit(0);

let content = ti.content ?? ti.new_string ?? '';
if (Array.isArray(ti.edits)) content += '\n' + ti.edits.map((e) => e?.new_string ?? '').join('\n');
if (!content) process.exit(0);

const notes = []; // 2026-09-07 라이브러리 훈수 제거 — 도입은 전적으로 자유다.

// ── 진짜 위험(기존 오류 재발 방지) — 제약 해제와 무관하게 계속 알림 ───────────
const hazards = [
  {
    re: /@keyframes\s+[\w-]*(fade-in|slide-up|slide-down|scale-in)/,
    msg: '⚠️ 진입 애니메이션 키프레임 — 탭 keep-alive(언마운트 없이 display 토글) 구조상 .tab-pane 내부에서는 탭 재방문마다 다시 재생되어 깜빡입니다. src/index.css의 무효화 :is(...) 목록과 prefers-reduced-motion 목록에 새 클래스를 함께 등록하세요.',
  },
  {
    re: /position:\s*fixed[\s\S]{0,200}bottom:\s*0|className=["'][^"']*fixed[^"']*bottom-0/,
    msg: '⚠️ 하단 고정 요소 — 모바일 탭바(App.tsx MobileTabBar)와 겹칠 수 있습니다. --tabbar-safe / --tabbar-float 기준선을 쓰고 env(safe-area-inset-bottom)을 빠뜨리지 마세요.',
  },
];

const hit = [...notes, ...hazards].filter((n) => n.re.test(content));
if (hit.length) {
  console.error('ℹ️ NURI 참고 (' + file + '):\n' + hit.map((h) => '  - ' + h.msg).join('\n'));
}
process.exit(0); // 차단하지 않음 — 정보 제공만
