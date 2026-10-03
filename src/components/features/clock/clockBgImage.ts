// src/components/features/clock/clockBgImage.ts
// 클락 배경 이미지 — 업로드(리사이즈 → webp → 밝기 상한·대표색 측정 → 이름표) · 삭제.
//
// 왜 별도 모듈인가: 포스터·아바타 업로드(lib/storage.ts)는 '원본을 줄여서 올린다'까지가 전부다.
// 클락 배경은 **그 위에 흰 글자가 상시 올라가는 매장 TV 바탕**이라, 사진이 밝으면 그대로 판독 불능이 된다.
// 그래서 이 한 가지가 더 필요하다 — 올리는 순간 밝기 상한을 굽는 것(clockTheme.ts CLOCK_BG_BAKE_CEIL).
// 리사이즈·EXIF 회전·webp 인코딩은 중복 구현하지 않고 lib/storage 의 resizeImage 를 그대로 쓴다.
import { supabase, IS_MOCK } from '../../../lib/supabase';
import { resizeImage, extOf } from '../../../lib/storage';
import {
  CLOCK_BG_BUCKET, CLOCK_BG_LUM_CAP, CLOCK_BG_SCRIM_MID, CLOCK_BG_MAX_PX, CLOCK_BG_TARGET_BYTES,
  clockBgObjectPath, clockLogoPlateKind, type ClockLogoPlate,
} from './clockTheme';

/** 밝기 측정 격자 — 셀 하나가 원본의 1/576 영역 평균이라 스펙큘러 1px 에 흔들리지 않는다 */
const GRID_W = 32, GRID_H = 18;

/** sRGB 채널(0~1) → 선형 — WCAG 상대휘도 정의 그대로 */
const lin = (u: number) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const relLum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** Blob → 그릴 수 있는 이미지. createImageBitmap 미지원 브라우저는 <img> 폴백(lib/storage 와 같은 문법) */
async function decodeBlob(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob); } catch { /* 폴백 */ }
  }
  return await new Promise((resolve, reject) => {
    const el = new Image();
    const url = URL.createObjectURL(blob);
    el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
    el.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 불러오지 못했습니다')); };
    el.src = url;
  });
}

/**
 * 32×18 요약 격자에서 **가장 밝은 셀의 색**을 찾는다(sRGB 0~1 3채널).
 * 평균이 아니라 최대인 이유: 글자가 앉는 자리는 고를 수 없다 — 화면에서 제일 밝은 구역이 곧 최악의 자리다.
 * 색까지 돌려주는 이유: 상한 판정이 상대휘도라 채널 구성(노랑·하늘 등)에 따라 필요한 배율이 달라진다.
 * 픽셀 읽기가 막히면(이론상 same-origin 이라 없음) null → 호출부가 '순백 사진' 취급으로 보수적으로 굽는다.
 */
function brightestCell(src: CanvasImageSource, w: number, h: number): [number, number, number] | null {
  try {
    const c = document.createElement('canvas');
    c.width = GRID_W; c.height = GRID_H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, w, h, 0, 0, GRID_W, GRID_H);
    const d = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
    let best: [number, number, number] = [0, 0, 0], bestL = -1;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const L = relLum(r, g, b);
      if (L > bestL) { bestL = L; best = [r, g, b]; }
    }
    return best;
  } catch { return null; }
}

/**
 * 가장 밝은 셀이 스크림까지 통과한 뒤 CLOCK_BG_LUM_CAP 이하가 되는 최대 배율을 찾는다.
 * 휘도는 배율에 단조증가라 이분탐색 30회면 충분하고, 닫힌 해를 쓰지 않는 이유는
 * sRGB→선형 변환의 +0.055 오프셋 때문에 배율^2.4 근사가 20% 가까이 어긋나기 때문이다.
 */
function bakeScale(cell: [number, number, number]): number {
  const at = (s: number) => relLum(cell[0] * s * CLOCK_BG_SCRIM_MID, cell[1] * s * CLOCK_BG_SCRIM_MID, cell[2] * s * CLOCK_BG_SCRIM_MID);
  if (at(1) <= CLOCK_BG_LUM_CAP) return 1; // 이미 충분히 어두운 사진 — 손대지 않는다
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (at(m) <= CLOCK_BG_LUM_CAP) lo = m; else hi = m; }
  // 8비트 반올림 여유 한 칸 — 캔버스 알파 합성은 채널을 정수로 반올림하므로 이론값 그대로 쓰면
  // 순백 사진에서 실측 0.02349(상한 0.0233)로 아주 살짝 넘는다(브라우저 실측으로 확인).
  return Math.max(0, lo - 1 / 255);
}

/** 올릴 수 있는 형식 — 입력칸 accept 와 **같은 목록 한 벌**(L1-7). 버킷(clock_bg allowed_mime_types)도 webp·jpeg·png 3종이다.
 *  예전엔 `image/*` 면 다 받아 GIF·SVG 도 webp 로 바뀌어 저장됐다(움직이는 GIF 는 첫 장만 · SVG 는 래스터로 굳음). */
export const CLOCK_BG_ACCEPT = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** 받침 판정 — 40×40 으로 줄인 그림의 불투명(알파 ≥ 160) 픽셀 휘도로 clockLogoPlateKind. 실패하면 받침 없음(종전과 같다). */
function plateOf(src: CanvasImageSource, w: number, h: number): ClockLogoPlate {
  try {
    const c = document.createElement('canvas');
    c.width = 40; c.height = 40;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 'none';
    ctx.drawImage(src, 0, 0, w, h, 0, 0, 40, 40);
    const d = ctx.getImageData(0, 0, 40, 40).data;
    const ls: number[] = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 160) ls.push(relLum(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255));
    return clockLogoPlateKind(ls);
  } catch { return 'none'; }
}

/** 대표색(맞추기의 남는 칸) — 불투명 픽셀 평균을 상대휘도 상한 아래로 눌러 #rrggbb. 글자는 판(--clk-plate) 위에 앉지만 판 밖 여백도 어둡게 둔다. */
function tintOf(src: CanvasImageSource, w: number, h: number): { hex: string } | null {
  try {
    const c = document.createElement('canvas');
    c.width = GRID_W; c.height = GRID_H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, w, h, 0, 0, GRID_W, GRID_H);
    const d = ctx.getImageData(0, 0, GRID_W, GRID_H).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;   // 투명 로고의 빈 곳은 색이 아니다
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return null;
    let k = 1;
    const at = (s: number) => relLum((r / n / 255) * s, (g / n / 255) * s, (b / n / 255) * s);
    while (k > 0.02 && at(k) > 0.012) k *= 0.9;   // 기본 바탕(#06080F) 근처의 어둠까지만
    const hex = (v: number) => Math.round((v / n) * k).toString(16).padStart(2, '0');
    return { hex: `${hex(r)}${hex(g)}${hex(b)}` };
  } catch { return null; }
}

/**
 * 매장 클락 배경 업로드 — 최대 1920px · webp · 밝기 상한·대표색을 **재서 이름에 싣는다** → clock_bg/<venueId>/<ts>-d<n>-t<hex>.webp.
 * 반환: 공개 URL(sanitizeClockTheme 의 허용 접두사와 일치).
 *
 * N-2(2026-10-03 오너 결정) — 예전엔 밝기 상한을 **사진에 구워** 저장했다. 그래서 로고를 올리면 색이 거의 검게 눌렸다.
 *   이제 원본 밝기 그대로 저장하고, 같은 값(d = 상한까지 누를 비율)을 이름표로 남긴다. '꽉 채우기' 는 렌더 때 그 비율의
 *   검은 층을 사진 위에 얹으므로 **합성 결과는 굽던 때와 같다**(rgba(0,0,0,d) 를 덮어 그리는 것 = 구운 것). '맞추기'·'가운데' 는
 *   누르지 않고 글자 뒤 판으로 가독을 지킨다. 이름표 없는 옛 파일은 이미 구운 파일이라 d = 0 으로 읽힌다(clockBgMetaOf).
 */
export async function uploadClockBg(venueId: string, file: File): Promise<string> {
  if (IS_MOCK) throw new Error('미리보기 모드에서는 배경 이미지를 올릴 수 없습니다');
  if (!(CLOCK_BG_ACCEPT as readonly string[]).includes(file.type)) throw new Error('JPG·PNG·WebP 이미지만 올릴 수 있습니다');

  // ① 리사이즈 + webp — 포스터·갤러리와 같은 경로(EXIF 회전 보정·적응형 품질 포함). webp 는 알파를 지킨다(투명 로고).
  const sized = await resizeImage(file, CLOCK_BG_MAX_PX, CLOCK_BG_MAX_PX, 0.85, CLOCK_BG_TARGET_BYTES);

  // ② 밝기 상한·대표색 측정 — 픽셀은 바꾸지 않는다.
  const img = await decodeBlob(sized);
  const cell = brightestCell(img as CanvasImageSource, img.width, img.height);
  const tint = tintOf(img as CanvasImageSource, img.width, img.height);
  const plate = plateOf(img as CanvasImageSource, img.width, img.height);
  if (img instanceof ImageBitmap) img.close();
  // 측정 실패 = 순백 사진으로 간주(가장 보수적). 정수 % 는 올림 — 반올림으로 상한을 넘지 않게.
  const dimPct = Math.min(95, Math.ceil((1 - bakeScale(cell ?? [1, 1, 1])) * 100));
  const blob = sized;

  // ③ 업로드 — 경로 첫 칸이 venue_id 다(스토리지 RLS 가 '본인 매장 폴더'를 이 값으로 판정).
  // -k = 어두운 로고(리뷰 중-3) — 렌더가 밝은 받침·밝은 남는 칸을 고른다. -m = 중간 밝기 로고(하-A) — 검은 받침. -m 은 옛 번들 정규식을 위해 -d 앞.
  const path = `${venueId}/${Date.now()}${plate === 'dark' ? '-m' : ''}-d${dimPct}${tint ? `-t${tint.hex}${plate === 'light' ? '-k' : ''}` : ''}.${extOf(blob)}`;
  const { error } = await supabase.storage.from(CLOCK_BG_BUCKET).upload(path, blob, {
    contentType: blob.type || 'image/webp',
    // upsert 를 쓰지 않는다 — 경로가 타임스탬프라 충돌이 없고, 덮어쓰기는 CDN 1년 캐시와 상극이다.
    // (참고: upsert 경로는 충돌 행을 읽어야 해서 **버킷에 SELECT 정책이 없으면 RLS 로 거부**된다.
    //  clock_bg 는 본인 매장 한정 SELECT 가 있어 되지만, 공개 버킷 전반의 upsert 는 지금 막혀 있다 —
    //  20260623b 가 read 정책을 걷어낸 뒤로. 여기서 굳이 그 경로에 의존할 이유가 없다.)
    upsert: false,
    cacheControl: '31536000', // 내용이 바뀌면 경로도 바뀐다 → 1년 캐시(egress 절감)
  });
  if (error) throw error;
  return supabase.storage.from(CLOCK_BG_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * 옛 배경 파일 정리 — 베스트에포트(실패해도 조용히 무시).
 * ⚠ 반드시 **page_config 저장이 성공한 뒤에** 호출한다. 먼저 지우면 저장 실패 시
 *   테마가 사라진 파일을 계속 가리켜 매장 TV 배경이 깨진 채 남는다.
 */
export async function deleteClockBg(url: string | null | undefined): Promise<void> {
  if (IS_MOCK || !url) return;
  const path = clockBgObjectPath(url);
  if (!path) return;
  try { await supabase.storage.from(CLOCK_BG_BUCKET).remove([path]); } catch { /* 고아 파일은 다음 교체 때 정리 */ }
}
