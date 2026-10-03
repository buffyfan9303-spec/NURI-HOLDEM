// scripts/legal-archive.mjs — 2026-06-15 시행 이전판(제1판) 약관 정적 아카이브를 git 이력에서 꺼내 public/legal/archive/2026-06-15/ 에 만든다.
//
// 왜 있나: 개인정보처리방침 제14조③ 이 "변경 이력을 확인하실 수 있도록 이전 방침을 함께 게시"한다고 약속한다.
//   제2판이 2026-09-29 에 시행됐으므로 직전 판(제1판)의 원문을 공개 URL 로 남긴다.
//
// 실행: `node scripts/gen-legal.mjs --archive`  (git 이력이 필요하다 — 1회 생성 후 산출물을 커밋한다)
//   · 평소 `npm run build`·`--check` 에는 들어가지 않는다(CI 의 얕은 클론에서 git 이력이 없을 수 있고, 이전판은 더 변하지 않는다).
//   · public/sitemap.xml 에 넣지 않는다(오너 보호 파일 · 검색 노출 대상이 아니라 robots noindex).
//
// 원문 보존 원칙: 본문 텍스트는 그대로 둔다. 단 **개인 연락처 3종**(옛 사업장 주소·휴대전화·개인 메일)은
//   2026-09 에 공식 값으로 교체된 것이라 옛 값을 다시 공개하지 않고 현재 공식 값으로 바꿔 싣는다(배너에 밝힌다).
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// 2026-08-30 '오너 23건 배치'(1cf6f5dd, 약관 본문을 처음 개정한 커밋)의 부모 = 제1판(2026-06-15)만 있던 마지막 상태.
const REV = '5d9fe46cc0b57899faa2cd04835a9d6fbda344a0';
const DIR = '2026-06-15';
const OLD_PERSONAL = ['경기도 남양주시 진건읍 사릉로372번길 25, 201동 1403호(주공아파트)', '010-7508-7689', 'buffyfan9303@gmail.com'];

const git = (path) => execFileSync('git', ['show', `${REV}:${path}`], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });

// 앱이 가입 화면에서 열던 3문서(TSX) + 하단 '약관 및 정책' 창이 열던 3문서(문자열). 같은 6/15 시행판의 두 게재 형식이다.
const DOCS = [
  { slug: 'terms', title: '이용약관', via: '회원가입 화면의 「보기」로 열리던 판', cur: 'terms', kind: 'tsx', exp: 'terms' },
  { slug: 'privacy', title: '개인정보처리방침', via: '회원가입 화면의 「보기」로 열리던 판', cur: 'privacy', kind: 'tsx', exp: 'privacy' },
  { slug: 'anti-gambling', title: '불법 환전·사행성 행위 금지 서약(사행성 배제 및 건전 이용 공지)', via: '회원가입 화면의 「보기」로 열리던 판', cur: 'anti-gambling', kind: 'tsx', exp: 'antiGambling' },
  { slug: 'footer-terms', title: '이용약관', via: '화면 하단 「약관 및 정책」 창에 게재되던 판', cur: 'terms', kind: 'txt', exp: 'TERMS' },
  { slug: 'footer-privacy', title: '개인정보처리방침', via: '화면 하단 「약관 및 정책」 창에 게재되던 판', cur: 'privacy', kind: 'txt', exp: 'PRIVACY' },
  { slug: 'location', title: '위치기반서비스 이용약관', via: '화면 하단 「약관 및 정책」 창에 게재되던 판(현재 판은 앱 하단 「위치기반서비스 이용약관」)', cur: null, kind: 'txt', exp: 'LOCATION' },
];

async function renderOld(root) {
  const src = join(root, 'scripts', '_archive-src');
  const out = join(root, 'node_modules', '.tmp', 'legal-archive-ssr');
  rmSync(src, { recursive: true, force: true });
  mkdirSync(src, { recursive: true });
  try {
    const iconPath = '../../src/components/atoms/Icon';
    const files = { TermsOfService: 'src/pages/legal/TermsOfService.tsx', PrivacyPolicy: 'src/pages/legal/PrivacyPolicy.tsx', LegalNotice: 'src/pages/legal/LegalNotice.tsx' };
    for (const [name, p] of Object.entries(files)) {
      // 본문은 그대로, import 경로만 이 임시 폴더 기준으로 바꾼다.
      writeFileSync(join(src, name + '.tsx'), git(p).split("'../../components/atoms/Icon'").join("'" + iconPath + "'"), 'utf8');
    }
    writeFileSync(join(src, 'entry.tsx'), [
      "export { default as terms } from './TermsOfService';",
      "export { default as privacy } from './PrivacyPolicy';",
      "export { default as antiGambling } from './LegalNotice';",
    ].join('\n'), 'utf8');
    rmSync(out, { recursive: true, force: true });
    await build({
      configFile: false, logLevel: 'error', plugins: [react()],
      build: { ssr: join(src, 'entry.tsx'), outDir: out, emptyOutDir: true, minify: false,
        rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'] } },
    });
    const mod = await import(pathToFileURL(join(out, 'entry.js')).href);
    const html = {};
    for (const d of DOCS.filter((x) => x.kind === 'tsx')) {
      html[d.slug] = renderToStaticMarkup(createElement(mod[d.exp]));
      if (html[d.slug].length < 500) throw new Error(d.slug + ': 이전판 렌더 결과가 비정상적으로 짧다');
    }
    return html;
  } finally {
    rmSync(src, { recursive: true, force: true });
  }
}

// 하단 창 문서: 옛 LegalDocsModal 의 BIZ 값과 TERMS/PRIVACY/LOCATION 템플릿 리터럴을 정규식으로 읽는다(eval·new Function 금지 — 보안 표준).
function readOldText() {
  const s = git('src/components/features/LegalDocsModal.tsx');
  const biz = {};
  for (const m of s.slice(s.indexOf('const BIZ = {'), s.indexOf('const TERMS = `')).matchAll(/^\s+(\w+): '([^']*)',/gm)) biz[m[1]] = m[2];
  const grab = (name) => {
    const m = s.match(new RegExp('const ' + name + ' = `([\\s\\S]*?)`;\\r?\\n'));
    if (!m) throw new Error('옛 LegalDocsModal 에서 ' + name + ' 를 찾지 못했다');
    return m[1].replace(/\$\{BIZ\.(\w+)\}/g, (_x, k) => {
      if (!(k in biz)) throw new Error('BIZ.' + k + ' 를 찾지 못했다');
      return biz[k];
    }).split('\r\n').join('\n');
  };
  return { TERMS: grab('TERMS'), PRIVACY: grab('PRIVACY'), LOCATION: grab('LOCATION') };
}

export async function buildArchive({ root, CSS, esc, reclass, biz, SITE }) {
  const tsx = await renderOld(root);
  const txt = readOldText();
  const swap = (t) => OLD_PERSONAL.reduce((acc, v, i) => acc.split(v).join([biz.addr, biz.phone, biz.email][i]), t);

  const outDir = resolve(root, 'public', 'legal', 'archive', DIR);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const banner = (d) => [
    '      <div class="box arch">',
    '        <p class="b">이 문서는 2026-09-29 전까지 적용된 이전판(제1판 · 2026년 6월 15일 시행)입니다.</p>',
    '        <p class="mute">현재 적용되는 판(제2판 · 2026년 9월 29일 시행)은 ' +
      (d.cur ? '<a href="/legal/' + d.cur + '.html">현재 ' + esc(d.title) + '</a>' : '앱 하단의 「위치기반서비스 이용약관」') +
      '에서 확인하실 수 있습니다. 변경 내용은 현재 문서 끝의 「부칙 · 개정 이력」에 있습니다. ' +
      '사업장 소재지·전화번호·고객센터는 현재 공식 정보로 바꿔 표시합니다(옛 개인 연락처는 다시 공개하지 않습니다).</p>',
      '      </div>',
    ].join('\n');

  const foot = [
    '    <footer>',
    '      <b>상호</b> ' + esc(biz.company) + ' · <b>대표자</b> ' + esc(biz.ceo) + ' · <b>사업자등록번호</b> <span class="nw">' + esc(biz.bizNo) + '</span><br>',
    '      <b>사업장 소재지</b> ' + esc(biz.addr) + '<br>',
    '      <b>전화번호</b> <span class="nw">' + esc(biz.phone) + '</span> · <b>고객센터</b> <a href="mailto:' + esc(biz.email) + '">' + esc(biz.email) + '</a><br>',
    '      만 19세 미만은 이용할 수 없습니다 · 도박문제 상담 <span class="nw">1336(24시간·무료)</span><br>',
    '      © 2026 ' + esc(biz.company) + '. · <a href="/legal/terms.html">이용약관</a> · <a href="/legal/privacy.html">개인정보처리방침</a> · <a href="/">nuriholdem.com 으로 이동</a>',
    '    </footer>',
  ].join('\n');

  const shell = (title, desc, slugPath, h1, badge, main) => [
    '<!doctype html>',
    '<html lang="ko">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>' + esc(title) + ' | NURI HOLDEM</title>',
    '  <meta name="description" content="' + esc(desc) + '">',
    '  <meta name="robots" content="noindex, follow">',
    '  <link rel="canonical" href="' + SITE + '/legal/archive/' + DIR + '/' + slugPath + '">',
    '  <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">',
    '  <link rel="stylesheet" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css">',
    '  <style>',
    CSS,
    '.doc .txt{white-space:pre-wrap;color:var(--sub);font-size:15px}',
    '.doc .arch{margin:0 0 22px}',
    '  </style>',
    '</head>',
    '<body>',
    '  <div class="wrap">',
    '    <header>',
    '      <a class="brand" href="/">NURI HOLDEM</a>',
    '      <h1>' + esc(h1) + '</h1>',
    '      <span class="badge">' + esc(badge) + '</span>',
    '    </header>',
    '',
    '    <main class="doc">',
    main,
    '    </main>',
    '',
    foot,
    '  </div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');

  for (const d of DOCS) {
    const body = d.kind === 'tsx'
      ? swap(reclass(tsx[d.slug])).split('\n').map((l) => '      ' + l).join('\n')
      : '      <div class="txt">' + esc(swap(txt[d.exp])) + '</div>';
    const h1 = d.title + ' (이전판)';
    const html = shell(h1, d.title + ' — 2026년 6월 15일 시행 제1판 원문 보존본(' + d.via + ')', d.slug + '.html', h1, '제1판 · 2026-06-15 시행 · 이전판',
      banner(d) + '\n' + body + '\n      <p class="mute" style="margin-top:18px"><a href="/legal/archive/' + DIR + '/index.html">← 이전판 목록</a></p>');
    writeFileSync(join(outDir, d.slug + '.html'), html, 'utf8');
  }

  const list = DOCS.map((d) => '        <li><a href="/legal/archive/' + DIR + '/' + d.slug + '.html">' + esc(d.title) + '</a> <span class="mute">— ' + esc(d.via) + '</span></li>').join('\n');
  const indexMain = [
    '      <div class="box arch">',
    '        <p class="b">2026-09-29 전까지 적용된 이전판(제1판 · 2026년 6월 15일 시행) 약관·방침 원문입니다.</p>',
    '        <p class="mute">개인정보처리방침 제14조③에 따라 변경 이력을 확인하실 수 있도록 이전 방침을 함께 게시합니다. 현재 적용되는 판은 <a href="/legal/terms.html">이용약관</a> · <a href="/legal/privacy.html">개인정보처리방침</a> 입니다.</p>',
    '      </div>',
    '      <section>',
    '        <p>제1판은 서비스 화면에 따라 두 가지 형식으로 게재되었습니다. 둘 다 그대로 보존합니다.</p>',
    '        <ul>',
    list,
    '        </ul>',
    '        <p class="mute">사업장 소재지·전화번호·고객센터는 현재 공식 정보로 바꿔 표시합니다(옛 개인 연락처는 다시 공개하지 않습니다). 그 밖의 본문은 고치지 않았습니다.</p>',
    '      </section>',
  ].join('\n');
  writeFileSync(join(outDir, 'index.html'), shell('약관·방침 이전판 목록(2026-06-15 시행)', 'NURI HOLDEM 약관·개인정보처리방침 제1판(2026년 6월 15일 시행) 원문 보존본 목록.', 'index.html', '약관·방침 이전판', '제1판 · 2026-06-15 시행 · 이전판', indexMain), 'utf8');
  console.log('[legal] 이전판 아카이브 ' + (DOCS.length + 1) + '개 생성 → public/legal/archive/' + DIR + '/');
}
