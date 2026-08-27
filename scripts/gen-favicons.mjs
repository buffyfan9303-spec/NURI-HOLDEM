// NH CI 파비콘·PWA 아이콘·OG 이미지 재생성 — 다크 플럼 배경 + 골드 스페이드 심벌.
// 심벌 정본: public/brand/nuri-holdem-symbol.svg (지평선·떠오르는 해 네거티브 스페이스 mask).
// 워드마크 정본: src/components/atoms/wordmark.ts (gen-wordmark.mjs 생성 — OG 합성에 사용).
// 실행: node scripts/gen-favicons.mjs → public/favicon*.png, icon-*.png, nuri-logo.png 갱신
// 검증: 각 렌더의 지평선 컷 픽셀이 배경색인지 샘플링(전부 골드면 mask 실패) + 채널 편차로 단색 여부.
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BG = '#151221'; // 다크 플럼(브랜드 배경)

// ── 심벌 지오메트리(240×240 정본과 동일) ─────────────────────────────
const SPADE_D = 'M 120 18 C 96 58 40 96 40 138 C 40 172 66 190 92 184 C 103 181 111 175 116 167 C 112 194 100 208 84 216 L 156 216 C 140 208 128 194 124 167 C 129 175 137 181 148 184 C 174 190 200 172 200 138 C 200 96 144 58 120 18 Z';
// small=true: ≤64px 축소본 — 컷이 서브픽셀로 뭉개지지 않게 지평선·해를 소폭 증폭(형태 비율은 유지)
const symbolDefs = (uid, small = false) => `
  <linearGradient id="gold${uid}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#E8C97C"/><stop offset="1" stop-color="#C79A3F"/>
  </linearGradient>
  <mask id="cut${uid}">
    <rect width="240" height="240" fill="#fff"/>
    ${small
      ? '<rect x="28" y="116" width="184" height="14" rx="7" fill="#000"/><path d="M 94 108 A 26 26 0 0 1 146 108 L 94 108 Z" fill="#000"/>'
      : '<rect x="28" y="118" width="184" height="9" rx="4.5" fill="#000"/><path d="M 96 110 A 24 24 0 0 1 144 110 L 96 110 Z" fill="#000"/>'}
  </mask>`;
const symbolBody = (uid) => `<g mask="url(#cut${uid})"><path fill="url(#gold${uid})" d="${SPADE_D}"/></g>`;

// ── 아이콘 SVG: size 캔버스 · frac 심벌 박스 비율 · round 배경 라운드 비율(0=풀블리드) ──
function iconSvg(size, frac, round) {
  const s = (size * frac) / 240;
  const t = (size * (1 - frac)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>${symbolDefs('', size <= 64)}</defs>
  <rect width="${size}" height="${size}" rx="${(size * round).toFixed(1)}" fill="${BG}"/>
  <g transform="translate(${t.toFixed(2)} ${t.toFixed(2)}) scale(${s.toFixed(5)})">${symbolBody('')}</g>
</svg>`;
}

// ── OG 1200×630: 심벌 + 흰 워드마크 세로 조합(다크 플럼 풀블리드) ──
function ogSvg() {
  const wm = readFileSync(path.join(root, 'src/components/atoms/wordmark.ts'), 'utf8');
  const vb = wm.match(/WORDMARK_VIEWBOX = '([^']+)'/)?.[1];
  const d = wm.match(/WORDMARK_D = "([^"]+)"/)?.[1];
  if (!vb || !d) throw new Error('wordmark.ts 파싱 실패 — gen-wordmark.mjs 산출 형식이 바뀌었는지 확인');
  const [, , vbW, vbH] = vb.split(' ').map(Number);
  const MARK = 230;                       // 심벌 박스 높이(px)
  const WORD_W = 500;                     // 워드마크 폭(px)
  const wordH = (WORD_W * vbH) / vbW;     // ≈232
  const GAP = 30;
  const top = (630 - (MARK + GAP + wordH)) / 2;
  const ms = MARK / 240;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>${symbolDefs('Og')}</defs>
  <rect width="1200" height="630" fill="${BG}"/>
  <g transform="translate(${(1200 - MARK) / 2} ${top.toFixed(1)}) scale(${ms.toFixed(5)})">${symbolBody('Og')}</g>
  <g transform="translate(${(1200 - WORD_W) / 2} ${(top + MARK + GAP).toFixed(1)}) scale(${(WORD_W / vbW).toFixed(5)})">
    <path fill="#F4F2FA" d="${d}"/>
  </g>
</svg>`;
}

// ── 렌더 + 검증 ──────────────────────────────────────────────
async function verifyIcon(buf, size, frac) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  const t = (size * (1 - frac)) / 2, s = (size * frac) / 240;
  const body = px(Math.round(t + 120 * s), Math.round(t + 70 * s));    // 스페이드 몸통 → 골드
  const cut = px(Math.round(t + 120 * s), Math.round(t + 122.5 * s)); // 지평선 컷 → 배경
  const gold = body[0] > 140 && body[2] < 150;
  // 컷 픽셀: 큰 사이즈는 순수 배경, ≤64px 는 안티앨리어스 블렌드 — '몸통보다 확실히 어두움'으로 판정
  const bg = cut[0] < 110 && body[0] - cut[0] > 100;
  return { gold, bg, body, cut };
}

const jobs = [
  // [out, size, frac(심벌 비율), round(배경 라운드)] — 라운드 배경은 알파 코너.
  // favicon-180(iOS)·icon-maskable 은 풀블리드: iOS 는 스스로 라운딩(투명 코너=검은 모서리 아티팩트),
  // maskable 은 플랫폼 마스크 전제 + 심벌을 중앙 60% 안전영역에 유지.
  ['public/favicon.png', 48, 0.74, 0.22],
  ['public/favicon-32.png', 32, 0.74, 0.22],
  ['public/favicon-64.png', 64, 0.74, 0.22],
  ['public/favicon-180.png', 180, 0.70, 0],
  ['public/icon-192.png', 192, 0.70, 0.19],
  ['public/icon-512.png', 512, 0.70, 0.19],
  ['public/icon-maskable-512.png', 512, 0.60, 0],
];

let fail = 0;
for (const [out, size, frac, round] of jobs) {
  const buf = await sharp(Buffer.from(iconSvg(size, frac, round))).png().toBuffer();
  writeFileSync(path.join(root, out), buf);
  const v = await verifyIcon(buf, size, frac);
  const ok = v.gold && v.bg;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${out} ${size}px ${buf.length}b · body ${v.body.join(',')} ${v.gold ? 'GOLD' : 'FAIL'} · cut ${v.cut.join(',')} ${v.bg ? 'BG' : 'MASK-FAIL'}`);
}

// OG — 워드마크 흰 픽셀 + 심벌 컷 검증
{
  const buf = await sharp(Buffer.from(ogSvg())).png().toBuffer();
  writeFileSync(path.join(root, 'public/nuri-logo.png'), buf);
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * info.channels; return [data[i], data[i + 1], data[i + 2]]; };
  const stats = await sharp(buf).stats();
  const flat = stats.channels.every((c) => c.stdev < 1);
  const top = (630 - (230 + 30 + (500 * 518) / 1118)) / 2, ms = 230 / 240;
  const cut = px(Math.round((1200 - 230) / 2 + 120 * ms), Math.round(top + 122.5 * ms));
  const cutOk = cut[0] < 70 && cut[2] < 90;
  if (flat || !cutOk) fail++;
  console.log(`${!flat && cutOk ? '✓' : '✗'} public/nuri-logo.png 1200×630 ${buf.length}b · cut ${cut.join(',')} ${cutOk ? 'BG' : 'MASK-FAIL'}${flat ? ' · FLAT(단색)' : ''}`);
}

if (fail) { console.error(`검증 실패 ${fail}건`); process.exit(1); }
