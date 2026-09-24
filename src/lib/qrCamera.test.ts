// src/lib/qrCamera.test.ts — 앱 안 스캐너의 jsQR 폴백(아이폰 출석의 주 경로)이 실제 QR 픽셀을 읽는지.
// 정적 이미지: 앱이 인쇄물에 쓰는 것과 같은 `qrcode` 라이브러리로 만든 행렬을 RGBA 로 그린다.
import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { decodeQrPixels } from './qrCamera';
import { parseQr } from './qrPayload';

/** QR 행렬 → 흰 바탕(여백 4칸) 검은 점 RGBA. scale = 한 칸의 픽셀 수. */
function render(text: string, scale = 4) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size, quiet = 4, side = (n + quiet * 2) * scale;
  const px = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const mx = Math.floor(x / scale) - quiet, my = Math.floor(y / scale) - quiet;
    if (mx >= 0 && my >= 0 && mx < n && my < n && modules.get(my, mx)) {
      const i = (y * side + x) * 4; px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  return { px, side };
}

describe('decodeQrPixels (jsQR 폴백)', () => {
  it('매장 출석 QR 원문을 그대로 읽고, parseQr 가 체크인으로 판정한다', async () => {
    const url = 'https://nuriholdem.com/?checkin=3f2b8c1e-6d4a-4b7e-9a51-0c2d7e8f9a10';
    const { px, side } = render(url);
    const raw = await decodeQrPixels(px, side, side);
    expect(raw).toBe(url);
    expect(parseQr(raw!)?.kind).toBe('checkin');
  });

  it('QR 이 없는 프레임은 null', async () => {
    const side = 200;
    expect(await decodeQrPixels(new Uint8ClampedArray(side * side * 4).fill(255), side, side)).toBeNull();
  });
});
