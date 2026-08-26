// [DS] IMG-1 — 워드마크 벡터화: Pretendard Black 아웃라인로 'NURI / HOLDEM' 2단 워드마크를
// SVG path 로 생성한다(원본 PNG 1118×660 의 레이아웃 재현 — NURI 대형 + HOLDEM 소형·와이드 트래킹).
// 왜 Pretendard 인가: 원본 PNG 의 제작 폰트·EULA 를 확인할 수 없어(카드 IMG-1 ①),
// 앱 본문 폰트와 동일하고 SIL OFL(아웃라인·로고 사용 허용)인 Pretendard 로 재레터링한다.
// 실행: node scripts/gen-wordmark.mjs → src/components/atoms/wordmark.ts 재생성(결정론적).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import opentype from 'opentype.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fontPath = path.join(root, 'node_modules/pretendard/dist/public/static/Pretendard-Black.otf');
const font = opentype.parse(readFileSync(fontPath).buffer.slice(0));

// 문자 단위 배치(트래킹 지원) — opentype.getPath 는 letter-spacing 이 없다
function linePath(text, size, tracking) {
  const scale = size / font.unitsPerEm;
  let x = 0;
  const paths = [];
  for (const ch of text) {
    const glyph = font.charToGlyph(ch);
    paths.push({ glyph, x });
    x += glyph.advanceWidth * scale + tracking;
  }
  const width = x - tracking; // 마지막 글자 뒤 트래킹 제거
  return { paths, width, scale };
}

function render(line, size, offsetX, baselineY) {
  let d = '';
  for (const { glyph, x } of line.paths) {
    d += glyph.getPath(offsetX + x, baselineY, size).toPathData(2);
  }
  return d;
}

// 레이아웃(원본 비율 근사): viewBox 1118×660, NURI 가 전폭, HOLDEM 이 그 아래 전폭(작게·와이드)
const VB_W = 1118;
// 1) NURI — 대형, 트래킹 소폭
let nuri = linePath('NURI', 100, 4);
const nuriSize = (100 * (VB_W - 100)) / nuri.width; // 좌우 여백 50px
nuri = linePath('NURI', nuriSize, 4 * (nuriSize / 100));
// 2) HOLDEM — 소형, 와이드 트래킹으로 NURI 와 같은 폭
let hold = linePath('HOLDEM', 100, 18);
const holdSize = (100 * (VB_W - 100)) / hold.width;
hold = linePath('HOLDEM', holdSize, 18 * (holdSize / 100));

const ascent = (font.ascender / font.unitsPerEm);
const capRatio = (font.tables.os2?.sCapHeight ?? font.ascender) / font.unitsPerEm;
const nuriCap = nuriSize * capRatio;
const holdCap = holdSize * capRatio;
const GAP = nuriCap * 0.22; // 두 줄 사이 간격
const PAD = 10;
const nuriBase = PAD + nuriCap;
const holdBase = nuriBase + GAP + holdCap;
const VB_H = Math.ceil(holdBase + PAD);

const dNuri = render(nuri, nuriSize, (VB_W - nuri.width) / 2, nuriBase);
const dHold = render(hold, holdSize, (VB_W - hold.width) / 2, holdBase);

const out = `// 자동 생성 — scripts/gen-wordmark.mjs (수정 금지, 재생성할 것)
// [DS] IMG-1: Pretendard Black(SIL OFL) 아웃라인 기반 'NURI / HOLDEM' 워드마크.
// 브랜드 형태의 단일 소스 — 앱 로고·정적 셸·클락 워터마크·(향후) OG/gen-icons 가 공유한다.
export const WORDMARK_VIEWBOX = '0 0 ${VB_W} ${VB_H}';
export const WORDMARK_D = ${JSON.stringify(dNuri + dHold)};
`;
writeFileSync(path.join(root, 'src/components/atoms/wordmark.ts'), out);
console.log(`ok viewBox 0 0 ${VB_W} ${VB_H} · nuriSize ${nuriSize.toFixed(1)} · holdSize ${holdSize.toFixed(1)} · d ${(dNuri.length + dHold.length / 1024).toFixed(0)}B`);
console.log('ascent', ascent.toFixed(3), 'capRatio', capRatio.toFixed(3));
