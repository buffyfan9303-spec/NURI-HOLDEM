// PWA 아이콘 재생성 — 다크 배경 + 골드 스페이드/워드마크(홈 화면 검은 네모 수정)
// 실행: node scripts/gen-icons.mjs  → public/icon-*.png, favicon-*.png 갱신
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const BG = '#0E1116';      // 다크 네이비(완전 검정보다 살짝 밝게 — 시스템 다크 아이콘과 구분)
const GOLD = '#FFD100';

// 스페이드 + NURI 워드마크. pad=0(any, 풀블리드) / pad 키우면 maskable safe-zone.
const svg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>
  <g transform="translate(256 256) scale(${1 - pad * 2 / 512}) translate(-256 -256)">
    <!-- 골드 스페이드 -->
    <path fill="${GOLD}" d="M256 64
      C 214 150, 122 196, 122 278
      C 122 336, 170 366, 218 348
      C 210 386, 192 408, 164 428
      L 348 428
      C 320 408, 302 386, 294 348
      C 342 366, 390 336, 390 278
      C 390 196, 298 150, 256 64 Z"/>
    <!-- 워드마크 -->
    <text x="256" y="494" text-anchor="middle"
      font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="74"
      letter-spacing="6" fill="${GOLD}">NURI</text>
  </g>
</svg>`;

const render = (svgStr, size) => sharp(Buffer.from(svgStr)).resize(size, size).png();

const jobs = [
  // any: 풀블리드 / maskable: 중앙 76%만 사용(원형 마스크 안전)
  ['public/icon-192.png', svg(36), 192],
  ['public/icon-512.png', svg(36), 512],
  ['public/icon-maskable-512.png', svg(92), 512],
  ['public/favicon-180.png', svg(40), 180], // iOS 홈 화면(apple-touch-icon)
  ['public/favicon-64.png', svg(20), 64],
  ['public/favicon-32.png', svg(10), 32],
  ['public/favicon.png', svg(10), 48],
];

for (const [out, s, size] of jobs) {
  const buf = await render(s, size).toBuffer();
  writeFileSync(out, buf);
  console.log('✓', out, `${size}px`, `${buf.length}b`);
}
