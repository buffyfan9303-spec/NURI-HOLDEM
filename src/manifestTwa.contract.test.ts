// TWA(Trusted Web Activity/Play Store 패키징) 준비 계약 — 오너 2026-09-25 TWA-WEB-READY.
//
// 무엇을 막는가 (근거: playstore/twa-technical.md)
//   ① Bubblewrap 은 shortcuts 5개 중 **4번째에서 자른다**(TwaManifest.ts `if (shortcuts.length === 4) break`).
//      5개인 채로 두면 경고 없이 마지막 항목이 APK 에서 조용히 사라진다 — 지금은 4개로 맞춰 뒀지만
//      나중에 실수로 하나 더 추가하면 이 계약이 그 자리에서 잡는다.
//   ② purpose:'monochrome' 아이콘이 없으면 Bubblewrap 이 다른 아이콘에서 단색을 유도하다가
//      Android 상태바 푸시 알림 아이콘이 흰 뭉개짐으로 뜬다(실제 sw.js 가 push/notificationclick 구현 중).
//   ③ manifest 에 screenshots 가 없으면 Chrome 안드로이드의 richer install 다이얼로그가 최소 설치로 폴백된다.
// 이 파일이 못 보는 것: Play 스토어 등록정보 스크린샷(Bubblewrap 이 manifest 를 안 읽음 — Play Console 별도 업로드),
//   실제 안드로이드 기기에서의 알림 아이콘 렌더링(NOT_RUN, 실기기 전용).
// 실행: npx vitest run src/manifestTwa.contract.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const manifestPath = join(ROOT, 'public/manifest.webmanifest');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

/** PNG IHDR 청크에서 width/height 만 읽는다 — 외부 이미지 라이브러리 의존 없이 계약을 검증하기 위함. */
function pngDims(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a) {
    throw new Error(`${path} 는 PNG 시그니처가 아니다`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('TWA manifest — shortcuts', () => {
  it('4개를 넘지 않는다(Bubblewrap 이 4번째에서 자른다)', () => {
    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts.length).toBeLessThanOrEqual(4);
    expect(manifest.shortcuts.length).toBeGreaterThan(0);
  });

  it('각 shortcut 의 url 이 App.tsx 가 실제로 여는 탭 쿼리 형태다(/?tab=<id>)', () => {
    for (const s of manifest.shortcuts) {
      expect(s.url, JSON.stringify(s)).toMatch(/^\/\?tab=[a-z-]+$/);
    }
  });
});

describe('TWA manifest — monochrome 아이콘', () => {
  it('purpose:"monochrome" 아이콘이 최소 48px 이상으로 선언돼 있다', () => {
    const mono = (manifest.icons ?? []).find((i: { purpose?: string }) => i.purpose === 'monochrome');
    expect(mono, 'icons 배열에 monochrome 항목이 없다').toBeTruthy();
    const [w, h] = String(mono.sizes).split('x').map(Number);
    expect(w).toBeGreaterThanOrEqual(48);
    expect(h).toBeGreaterThanOrEqual(48);

    const filePath = join(ROOT, 'public', mono.src.replace(/^\//, ''));
    expect(existsSync(filePath), `${filePath} 파일이 없다`).toBe(true);
    const dims = pngDims(filePath);
    expect(dims.width).toBe(w);
    expect(dims.height).toBe(h);
  });

  it('monochrome PNG 가 투명 배경 위 단일 실루엣이다(배경까지 불투명하면 상태바에서 흰 사각형으로 뭉개진다)', () => {
    const mono = manifest.icons.find((i: { purpose?: string }) => i.purpose === 'monochrome');
    const filePath = join(ROOT, 'public', mono.src.replace(/^\//, ''));
    const buf = readFileSync(filePath);
    // IHDR 뒤 색상 타입 바이트(offset 25)가 6(RGBA)이어야 알파를 가진다 — 배경 전체 불투명(순수 RGB) 회귀를 잡는다.
    const colorType = buf.readUInt8(25);
    expect(colorType, 'PNG 에 알파 채널이 없다(purpose:monochrome 은 투명 배경이 필수)').toBe(6);
  });
});

describe('TWA manifest — screenshots', () => {
  it('richer install 다이얼로그를 위해 최소 2장 이상, 세로(narrow) 폼팩터로 선언돼 있다', () => {
    expect(Array.isArray(manifest.screenshots)).toBe(true);
    expect(manifest.screenshots.length).toBeGreaterThanOrEqual(2);
    for (const s of manifest.screenshots) {
      expect(s.form_factor).toBe('narrow');
    }
  });

  it('선언된 screenshots 파일이 실제로 존재하고 선언된 치수와 일치한다', () => {
    for (const s of manifest.screenshots) {
      const filePath = join(ROOT, 'public', s.src.replace(/^\//, ''));
      expect(existsSync(filePath), `${filePath} 파일이 없다`).toBe(true);
      const [w, h] = String(s.sizes).split('x').map(Number);
      const dims = pngDims(filePath);
      expect(dims.width).toBe(w);
      expect(dims.height).toBe(h);
    }
  });
});
