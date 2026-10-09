// 파비콘·PWA/TWA 아이콘·Play 앱 아이콘(골드 다이아 · 테마 바탕 #101823) + OG 이미지(다크 플럼 + 골드 스페이드 심벌) 재생성.
// 2026-10-09 앱 아이콘을 다이아로 바꿨다(오너 결정 — 앱 안 헤더 로고와 같은 다이아). OG(nuri-logo.png)는 이번 범위 밖이라 스페이드 그대로다.
// OG 심벌 정본: public/brand/nuri-holdem-symbol.svg (지평선·떠오르는 해 네거티브 스페이스 mask).
// 워드마크 정본: src/components/atoms/wordmark.ts (gen-wordmark.mjs 생성 — OG 합성에 사용).
// 실행: node scripts/gen-favicons.mjs → public/favicon*.png, icon-*.png, nuri-logo.png 갱신
// 검증: 아이콘은 다이아 몸통 금색(실루엣은 흰색)·옆 배경 픽셀 샘플링, OG 는 지평선 컷 픽셀이 배경색인지 + 채널 편차로 단색 여부.
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

// ── 앱 아이콘(2026-10-09 오너: 앱 아이콘을 앱 안 헤더와 같은 다이아로) ─────────────
// 다이아 정본: 오너 C안 01-symbol-transparent.png(1254²)를 알파 기준으로 잘라 높이 400 으로 줄인 무손실 사본.
// 헤더의 public/brand/nuri-diamond-*.{avif,webp,png} 와 같은 원본이다(BrandDiamond.tsx 머리말). 아이콘은 축소만 한다.
const DIAMOND = path.join(root, 'scripts/brand/nuri-diamond-source-400.webp');
const ICON_BG = '#101823'; // 앱 테마 바탕(manifest theme_color·background_color 와 같은 값)
const PNG_OUT = { compressionLevel: 9, adaptiveFiltering: true, palette: false }; // 무손실 RGBA — 크기만 줄인다. palette 는 쓰지 않는다(monochrome 은 색 형식 6 이 계약)

// size 캔버스 · h 다이아 높이 비율 · round 배경 라운드 비율(0=풀블리드) · mono=흰 실루엣+투명 바탕(알림·테마 아이콘용)
async function diamondIcon(size, h, round, mono = false) {
  const dh = Math.round(size * h);
  if (mono) {
    // 흰 사각형을 다이아 알파로 잘라 실루엣을 만든다 — 모양은 알파 그대로, 색은 순백.
    const alpha = await sharp(DIAMOND).resize({ height: dh, kernel: 'lanczos3' }).ensureAlpha().extractChannel('alpha').raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: hh } = alpha.info;
    const rgba = Buffer.alloc(w * hh * 4);
    for (let i = 0; i < w * hh; i++) { rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = 255; rgba[i * 4 + 3] = alpha.data[i]; }
    const sil = await sharp(rgba, { raw: { width: w, height: hh, channels: 4 } }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: sil, left: Math.round((size - w) / 2), top: Math.round((size - hh) / 2) }]).png(PNG_OUT).toBuffer();
  }
  const gemBuf = await sharp(DIAMOND).resize({ height: dh, kernel: 'lanczos3' }).png().toBuffer();
  const meta = await sharp(gemBuf).metadata();
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${(size * round).toFixed(1)}" fill="${ICON_BG}"/></svg>`;
  return sharp(Buffer.from(bg))
    .composite([{ input: gemBuf, left: Math.round((size - meta.width) / 2), top: Math.round((size - meta.height) / 2) }])
    .png(PNG_OUT).toBuffer();
}

// ── 렌더 + 검증 ──────────────────────────────────────────────
// 다이아 한가운데 = 금색, 다이아 옆(좌우 끝보다 바깥, 세로 중앙) = 배경(또는 투명), 실루엣이면 흰색 불투명.
async function verifyIcon(buf, size, h, mono) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => { const i = (y * info.width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
  const c = Math.floor(size / 2);
  const body = px(c, Math.round(size / 2 - size * h * 0.2));
  const side = px(Math.min(size - 1, Math.round(c + size * h * 0.7 * 0.5 + size * 0.06)), c);
  const gold = mono ? body[0] > 250 && body[3] > 250 : body[0] > 140 && body[2] < 140 && body[0] - body[2] > 60;
  const bg = mono ? side[3] === 0 : side[0] < 40 && side[2] < 60;
  return { gold, bg, body, side };
}

const jobs = [
  // [out, size, h(다이아 높이 비율), round(배경 라운드), mono]
  // 다이아는 세로로 긴 마름모(폭 = 높이 × 0.70)라 높이 비율로 잡는다.
  // favicon-180(iOS)·maskable·Play 아이콘은 풀블리드: iOS·Android·Play 가 스스로 모서리를 깎는다(투명 코너=검은 모서리).
  // maskable·monochrome 은 원형 마스크 안전 영역(지름 80%) 안 — 마름모 위아래 꼭짓점이 중심에서 0.26 < 0.40.
  ['public/favicon.png', 48, 0.78, 0.22],
  ['public/favicon-32.png', 32, 0.80, 0.22],
  ['public/favicon-64.png', 64, 0.78, 0.22],
  ['public/favicon-180.png', 180, 0.60, 0],
  ['public/icon-192.png', 192, 0.62, 0.19],
  ['public/icon-512.png', 512, 0.62, 0.19],
  ['public/icon-maskable-512.png', 512, 0.52, 0],
  ['public/icon-monochrome-512.png', 512, 0.52, 0, true],
  ['playstore/app-icon-512.png', 512, 0.58, 0], // Play Console 앱 아이콘(정사각 풀블리드 — Play 가 모서리를 깎는다)
];

let fail = 0;
for (const [out, size, h, round, mono = false] of jobs) {
  const buf = await diamondIcon(size, h, round, mono);
  writeFileSync(path.join(root, out), buf);
  const v = await verifyIcon(buf, size, h, mono);
  const ok = v.gold && v.bg;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${out} ${size}px ${buf.length}b · body ${v.body.join(',')} ${v.gold ? (mono ? 'WHITE' : 'GOLD') : 'FAIL'} · side ${v.side.join(',')} ${v.bg ? 'BG' : 'BG-FAIL'}`);
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
