// e2e/_fakeCamera.ts — 앱 안 QR 스캐너 e2e 의 가짜 카메라(y4m) + jsQR 폴백 강제 도구.
// Chromium 가짜 카메라 파일은 브라우저 실행 인자라 **스펙 파일당 하나**다(describe 안 test.use 불가) —
// 그래서 출석(qr-camera-checkin)·이용권(qr-camera-voucher) 스펙이 이 파일을 나눠 쓴다.
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';
import type { Page } from '@playwright/test';

export const VENUE = '11111111-2222-3333-4444-555555555555';

/** QR 한 장이 가운데 찍힌 640×480 y4m(10프레임, 반복 재생)을 만든다 — 브라우저 실행 전에 있어야 해서 동기. */
export function fakeCamera(text: string): string {
  const W = 640, H = 480;
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const n = modules.size, quiet = 4, scale = Math.floor(360 / (n + quiet * 2)), side = (n + quiet * 2) * scale;
  const ox = (W - side) >> 1, oy = (H - side) >> 1;
  const Y = Buffer.alloc(W * H, 60);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) {
    const mx = Math.floor(x / scale) - quiet, my = Math.floor(y / scale) - quiet;
    Y[(oy + y) * W + ox + x] = mx >= 0 && my >= 0 && mx < n && my < n && modules.get(my, mx) ? 16 : 235;
  }
  const UV = Buffer.alloc(W * H / 2, 128);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < 10; i++) parts.push(Buffer.from('FRAME\n'), Y, UV);
  const file = join(tmpdir(), `nuri-qr-${text.replace(/\W+/g, '_').slice(-40)}-${process.pid}.y4m`);
  writeFileSync(file, Buffer.concat(parts));
  return file;
}
export const cameraArgs = (file: string) => ({ launchOptions: { args: [
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${file}`,
] } });

/** 폴백 강제 + 열린 카메라 트랙을 기록(닫은 뒤 전부 꺼졌는지 본다). */
export async function forceJsQr(page: Page) {
  await page.addInitScript(() => {
    delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
    const w = window as unknown as { __tracks: MediaStreamTrack[] };
    w.__tracks = [];
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await orig(c); w.__tracks.push(...s.getTracks()); return s; };
  });
}
export const liveTracks = (page: Page) => page.evaluate(() =>
  (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.filter((t) => t.readyState === 'live').length);
export const openedTracks = (page: Page) => page.evaluate(() => (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.length);
export const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

