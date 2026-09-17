// scripts/gen-licenses.mjs — 오픈소스 라이선스 고지(public/legal/licenses.html)를 node_modules 의 실제 파일에서 생성한다.
//
// 왜 생성인가: MIT·ISC·BSD 는 저작권 고지와 라이선스 전문을, Apache-2.0 은 LICENSE(+NOTICE)를 배포물에 동봉해야 한다.
// 손으로 쓴 목록은 의존성을 올리는 순간 조용히 거짓말이 된다. 그래서 package.json 의 dependencies 에서 시작해
// node 해석 규칙으로 트리를 직접 걷고, 각 패키지의 package.json `license` 필드와 LICENSE/NOTICE 파일을 그대로 싣는다.
// (`npm ls --omit=dev` 는 devDependencies 의 전이 트리를 섞어 뱉어 쓰지 않는다 — 2026-09-17 실측.)
//
// 확인 불가는 확인 불가로 남긴다: license 필드도 LICENSE 파일도 없는 패키지(예: @portone/browser-sdk)는 라이선스를 지어내지 않는다.
// 글꼴(Pretendard·NuriMarks)은 public/fonts/*/OFL.txt 로 이미 동봉돼 있으므로 그 경로만 가리킨다.
// 번들에 안 들어가는 전이 패키지(qrcode 의 CLI 전용 yargs 계열 등)도 싣는다 — 과다 고지는 무해하고, 빼려다 빠뜨리는 쪽이 위험하다.
//
// 실행: `npm run licenses` (생성) · `npm run licenses:check` (파일을 쓰지 않고 커밋본과 비교, 다르면 exit 1)
//       src/pages/legal/licensesNotice.test.ts 가 --check 를 게이트로 쓴다.
// 템플릿(head/CSS/nav/footer)은 scripts/gen-legal.mjs 가 찍은 형제 문서(refund.html)에서 그대로 추출한다 — 두 벌을 만들지 않는다.
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';

const ROOT = process.cwd();
const OUT = resolve(ROOT, 'public', 'legal', 'licenses.html');
const SIBLING = resolve(ROOT, 'public', 'legal', 'refund.html');
const SITE = 'https://nuriholdem.com';
const CHECK = process.argv.includes('--check');
const TITLE = '오픈소스 라이선스 고지';
const DESC = 'NURI HOLDEM 웹앱에 포함된 오픈소스 소프트웨어의 저작권 고지와 라이선스 전문.';

// 글꼴 — npm 패키지가 아니라 public/fonts 의 OFL.txt 가 동봉 원본이다.
const FONTS = [
  ['Pretendard', '/fonts/pretendard/OFL.txt'],
  ['NuriMarks', '/fonts/nuri-marks/OFL.txt'],
];
// npm 으로 설치되지만 번들에 들어가지 않고 글꼴 파일로만 쓰는 패키지 → 글꼴 섹션의 OFL.txt 를 가리킨다.
const FONT_PKGS = { pretendard: '/fonts/pretendard/OFL.txt' };

// ── 1) 런타임 의존성 트리 수집 ────────────────────────────────────────────────
function resolvePkg(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const cand = join(dir, 'node_modules', name);
    if (existsSync(join(cand, 'package.json'))) return cand;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function collect(root) {
  const rootPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const seen = new Map();
  const order = [];
  const visit = (name, fromDir, depth) => {
    const dir = resolvePkg(name, fromDir);
    if (!dir) throw new Error(`의존성 '${name}' 을 node_modules 에서 찾지 못했다 — npm ci 후 다시 실행하라`);
    if (seen.has(dir)) return;
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const files = readdirSync(dir).filter((f) => /^(LICEN[CS]E|COPYING|NOTICE)/i.test(f)).sort();
    const rec = {
      name: pkg.name, version: pkg.version, depth,
      license: pkg.license ?? (Array.isArray(pkg.licenses) ? pkg.licenses.map((l) => l.type || l).join(' / ') : null),
      files,
      texts: Object.fromEntries(files.map((f) => [f, readFileSync(join(dir, f), 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim()])),
    };
    seen.set(dir, rec);
    order.push(rec);
    const deps = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
    for (const d of Object.keys(deps)) visit(d, dir, depth + 1);
  };
  const direct = Object.keys(rootPkg.dependencies || {});
  for (const d of direct) visit(d, root, 0);
  // 방문 순서와 무관하게 루트 dependencies 는 직접 의존성이다(core 를 거쳐 먼저 만난 @dnd-kit/utilities 같은 경우).
  for (const r of order) if (direct.includes(r.name) && seen.get(resolvePkg(r.name, root)) === r) r.depth = 0;
  return order;
}

// ── 2) 렌더 ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attr = (s) => esc(s ?? '');

// 대문자 'Copyright' 가 있는 첫 줄(줄 전체). Apache 본문의 소문자 'copyright' 와 "Grant of Copyright License" 조항은 제외.
function copyrightLine(r) {
  for (const t of Object.values(r.texts)) {
    const line = t.split('\n').find((l) => /Copyright/.test(l) && !/Copyright License/.test(l));
    if (line) return line.trim();
  }
  return null;
}

// 항목 하나. data-* 는 licensesNotice.test.ts 가 package.json dependencies 와 대조하는 기계용 표식이다.
function block(r) {
  const li = `<li data-pkg="${attr(r.name)}" data-version="${attr(r.version)}" data-license="${attr(r.license)}">`;
  const head = `<span class="b">${esc(r.name)} ${esc(r.version)} · ${esc(r.license ?? '확인 불가')}</span>`;
  if (FONT_PKGS[r.name]) {
    return `${li}<p>${head} — 글꼴 파일과 함께 동봉된 <a href="${FONT_PKGS[r.name]}">${FONT_PKGS[r.name]}</a> 참조 <span class="mute">(npm 패키지 자체는 빌드에 포함되지 않는다)</span></p></li>`;
  }
  if (!r.files.length) {
    const why = r.license
      ? `package.json license 필드: ${esc(r.license)} · 패키지 안에 LICENSE 파일 없음`
      : 'package.json 에 license 필드 없음 · 패키지 안에 LICENSE/NOTICE 파일 없음';
    return `${li}<p>${head} — <span class="warn">확인 불가</span> <span class="mute">(${why})</span></p></li>`;
  }
  const cp = copyrightLine(r);
  const files = r.files.map((f) => `<p class="mute">${esc(f)}</p><pre>${esc(r.texts[f])}</pre>`).join('\n');
  return `${li}<details><summary>${head}${cp ? ` — ${esc(cp)}` : ''}</summary>\n${files}\n</details></li>`;
}

function render(records) {
  const sibling = readFileSync(SIBLING, 'utf8').replace(/\r\n/g, '\n');
  const pick = (re, what) => {
    const m = sibling.match(re);
    if (!m) throw new Error(`형제 문서(refund.html)에서 ${what} 블록을 찾지 못했다 — gen-legal.mjs 템플릿이 바뀌었는지 확인하라`);
    return m[1];
  };
  const css = pick(/<style>\n([\s\S]*?)\n {2}<\/style>/, 'style');
  const footer = pick(/<footer>\n([\s\S]*?)\n {4}<\/footer>/, 'footer');
  // 형제 nav 목록은 gen-legal.mjs 의 DOCS 소유 — 그대로 보여 주고 현재 문서만 덧붙인다(형제 쪽에는 넣지 않는다 — 푸터 진입 하나로 충분).
  const nav = pick(/<nav class="docs"[^>]*>\n([\s\S]*?)\n {4}<\/nav>/, 'nav')
    .replace(' aria-current="page"', '').replace(' <em>(고지 · 현재 문서)</em>', ' <em>(고지)</em>');

  const direct = records.filter((r) => r.depth === 0);
  const trans = records.filter((r) => r.depth > 0).sort((a, b) => a.name.localeCompare(b.name));

  const body = [
    '<div><div>',
    '<p class="mute">NURI HOLDEM 웹앱에 포함된 오픈소스 소프트웨어와 글꼴의 저작권 고지·라이선스 전문입니다. 각 항목을 누르면 원문이 펼쳐집니다.</p>',
    '</div>',
    '<section data-scope="fonts"><h3 class="hl b">글꼴</h3><ul>',
    ...FONTS.map(([name, path]) => `<li><span class="b">${esc(name)}</span> · SIL Open Font License 1.1 — <a href="${path}">${path}</a></li>`),
    '</ul></section>',
    `<section data-scope="direct"><h3 class="hl b">직접 의존성 (${direct.length})</h3><ul>`,
    ...direct.map(block),
    '</ul></section>',
    `<section data-scope="transitive"><h3 class="hl b">함께 포함되는 전이 의존성 (${trans.length})</h3><p class="mute">위 패키지들이 다시 가져오는 패키지입니다.</p><ul>`,
    ...trans.map(block),
    '</ul></section>',
    '</div>',
  ].join('\n');

  const extraCss = [
    '.doc details{border:1px solid var(--line);border-radius:12px;padding:8px 12px;margin:0 0 6px}',
    '.doc summary{cursor:pointer;font-size:14px;color:var(--sub)}',
    '.doc pre{white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.5;color:var(--sub);background:var(--panel);border-radius:8px;padding:10px 12px;margin:6px 0 8px}',
  ].join('\n');

  return [
    '<!doctype html>',
    '<html lang="ko">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    `  <title>${esc(TITLE)} | NURI HOLDEM</title>`,
    `  <meta name="description" content="${esc(DESC)}">`,
    // 법적 고지 페이지 — 검색 노출 대상이 아니다(sitemap.xml 에도 넣지 않는다 · 오너 보호 파일).
    '  <meta name="robots" content="noindex, follow">',
    `  <link rel="canonical" href="${SITE}/legal/licenses.html">`,
    '  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
    '  <meta property="og:type" content="article">',
    `  <meta property="og:title" content="${esc(TITLE)} | NURI HOLDEM">`,
    `  <meta property="og:description" content="${esc(DESC)}">`,
    `  <meta property="og:url" content="${SITE}/legal/licenses.html">`,
    '  <style>',
    css,
    extraCss,
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="wrap">',
    '    <header>',
    '      <a class="brand" href="/">NURI HOLDEM</a>',
    `      <h1>${esc(TITLE)}</h1>`,
    '      <span class="badge">고지</span>',
    '    </header>',
    '',
    '    <main class="doc">',
    body,
    '    </main>',
    '',
    '    <nav class="docs" aria-label="약관 문서">',
    nav,
    `      <a href="/legal/licenses.html" aria-current="page">${esc(TITLE)} <em>(고지 · 현재 문서)</em></a>`,
    '    </nav>',
    '',
    '    <footer>',
    footer,
    '    </footer>',
    '  </div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// ── 3) 실행 ──────────────────────────────────────────────────────────────────
const records = collect(ROOT);
const want = render(records);
const summary = `직접 ${records.filter((r) => r.depth === 0).length} · 전이 ${records.filter((r) => r.depth > 0).length} · 확인 불가: ${records.filter((r) => !r.files.length && !FONT_PKGS[r.name]).map((r) => r.name).join(', ') || '없음'}`;

if (CHECK) {
  // 줄끝은 법적 텍스트가 아니다 — core.autocrlf=true 체크아웃(CRLF)과 비교하려면 정규화한다(gen-legal.mjs 와 같은 이유).
  const norm = (t) => t.split('\r\n').join('\n');
  const got = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
  if (got === null) {
    console.error('[licenses] public/legal/licenses.html 이 없다 — `npm run licenses` 로 생성한 뒤 커밋하라.');
    process.exitCode = 1;
  } else if (norm(got) !== norm(want)) {
    console.error('[licenses] 커밋된 고지가 설치된 의존성과 어긋났다(의존성·버전·LICENSE 원문이 바뀌었는데 재생성되지 않았다).');
    console.error('[licenses] 해결: `npm run licenses` 로 재생성한 뒤 커밋하라.');
    // process.exit() 는 쓰지 않는다 — Windows 에서 libuv assertion 크래시 기록(gen-sitemap.mjs). exitCode 만 세운다.
    process.exitCode = 1;
  } else {
    console.log(`[licenses] --check OK — ${summary}`);
  }
} else {
  writeFileSync(OUT, want, 'utf8');
  console.log(`[licenses] 생성 → public/legal/licenses.html (${summary})`);
}
