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

// ── 2026-10-08 Play 출시 준비 — TWA 빌드 설정(playstore/twa/twa-manifest.json)과 웹·도메인 쪽의 일치 ──────────
// 왜: Bubblewrap 은 색·아이콘·패키지명을 **빌드 시점에 APK 로 굽는다**. 웹 테마를 바꾸고 이 값을 놓치면
//   앱을 켤 때마다 옛 색 스플래시가 먼저 뜬다(2026-10-08 실측: manifest #0A0A0A ↔ index.html #101823 — E+황동에서 4안 미드나이트 블루로
//   바뀔 때 manifest 만 남았다). 패키지명이 assetlinks 와 다르면 Digital Asset Links 검증이 실패해 앱 위에 주소창이 뜬다.
// 음성 대조: manifest theme_color 를 다른 값으로 바꾸면 ①이, twa packageId 를 바꾸면 ③이, twa shortcuts 를 5개로 늘리면 ④가 빨개진다.
const indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf-8');
const twa = JSON.parse(readFileSync(join(ROOT, 'playstore/twa/twa-manifest.json'), 'utf-8'));
const assetlinks = JSON.parse(readFileSync(join(ROOT, 'public/.well-known/assetlinks.json'), 'utf-8'));

describe('TWA — 색이 현행 테마(index.html meta theme-color)와 같다', () => {
  const meta = indexHtml.match(/<meta name="theme-color" content="(#[0-9A-Fa-f]{6})"/)?.[1];
  it('① 웹 manifest 의 theme_color·background_color', () => {
    expect(meta, 'index.html 에 meta theme-color 가 없다').toBeTruthy();
    expect(manifest.theme_color.toUpperCase()).toBe(meta!.toUpperCase());
    expect(manifest.background_color.toUpperCase()).toBe(meta!.toUpperCase());
  });
  it('② twa-manifest 의 스플래시·상태바·내비게이션 색', () => {
    for (const k of ['themeColor', 'themeColorDark', 'backgroundColor', 'navigationColor', 'navigationColorDark']) {
      expect(String(twa[k]).toUpperCase(), k).toBe(meta!.toUpperCase());
    }
  });
});

describe('TWA — 패키지·도메인·바로가기', () => {
  it('③ packageId 가 assetlinks 의 package_name 과 같고, host 가 운영 도메인이다', () => {
    expect(twa.packageId).toBe('com.nuriholdem.twa');
    expect(assetlinks[0].target.package_name).toBe(twa.packageId);
    expect(twa.host).toBe('nuriholdem.com');
  });
  it('④ shortcuts 가 웹 manifest 와 같은 탭을 같은 순서로 가리킨다(4개 이하)', () => {
    expect(twa.shortcuts.length).toBeLessThanOrEqual(4);
    expect(twa.shortcuts.map((s: { url: string }) => new URL(s.url).search))
      .toEqual(manifest.shortcuts.map((s: { url: string }) => s.url.replace(/^\//, '')));
  });
  it('⑤ 아이콘 URL 이 public/ 에 실제로 있는 파일을 가리킨다(Bubblewrap 은 운영 URL 에서 받아 굽는다)', () => {
    for (const k of ['iconUrl', 'maskableIconUrl', 'monochromeIconUrl']) {
      const path = new URL(twa[k]).pathname;
      expect(existsSync(join(ROOT, 'public', path.replace(/^\//, ''))), `${k} → ${path}`).toBe(true);
    }
  });
  it('⑥ 서명 키·지문 같은 비밀은 저장소에 두지 않는다(경로·별칭만)', () => {
    expect(twa.fingerprints).toEqual([]);
    expect(Object.keys(twa.signingKey).sort()).toEqual(['alias', 'path']);
    expect(existsSync(join(ROOT, 'playstore/twa/android.keystore'))).toBe(false);
  });
});
