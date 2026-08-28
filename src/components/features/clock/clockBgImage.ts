// src/components/features/clock/clockBgImage.ts
// 클락 배경 이미지 — 업로드(리사이즈 → 밝기 굽기 → webp) · 삭제.
//
// 왜 별도 모듈인가: 포스터·아바타 업로드(lib/storage.ts)는 '원본을 줄여서 올린다'까지가 전부다.
// 클락 배경은 **그 위에 흰 글자가 상시 올라가는 매장 TV 바탕**이라, 사진이 밝으면 그대로 판독 불능이 된다.
// 그래서 이 한 가지가 더 필요하다 — 올리는 순간 밝기 상한을 굽는 것(clockTheme.ts CLOCK_BG_BAKE_CEIL).
// 리사이즈·EXIF 회전·webp 인코딩은 중복 구현하지 않고 lib/storage 의 resizeImage 를 그대로 쓴다.
import { supabase, IS_MOCK } from '../../../lib/supabase';
import { resizeImage } from '../../../lib/storage';
import {
  CLOCK_BG_BUCKET, CLOCK_BG_LUM_CAP, CLOCK_BG_SCRIM_MID, CLOCK_BG_MAX_PX, CLOCK_BG_TARGET_BYTES,
  clockBgObjectPath,
} from './clockTheme';

/** 밝기 측정 격자 — 셀 하나가 원본의 1/576 영역 평균이라 스펙큘러 1px 에 흔들리지 않는다 */
const GRID_W = 32, GRID_H = 18;

/** sRGB 채널(0~1) → 선형 — WCAG 상대휘도 정의 그대로 */
const lin = (u: number) => (u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const relLum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

function toWebp(canvas: HTMLCanvasElement, q: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/webp', q));
}

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

/**
 * 매장 클락 배경 업로드 — 최대 1920px · webp · 밝기 상한 적용 후 clock_bg/<venueId>/<ts>.webp.
 * 반환: 공개 URL(sanitizeClockTheme 의 허용 접두사와 일치).
 */
export async function uploadClockBg(venueId: string, file: File): Promise<string> {
  if (IS_MOCK) throw new Error('미리보기 모드에서는 배경 이미지를 올릴 수 없습니다');
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일만 올릴 수 있습니다');

  // ① 리사이즈 + webp — 포스터·갤러리와 같은 경로(EXIF 회전 보정·적응형 품질 포함)
  const sized = await resizeImage(file, CLOCK_BG_MAX_PX, CLOCK_BG_MAX_PX, 0.85, CLOCK_BG_TARGET_BYTES);

  // ② 밝기 굽기 — 어두운 사진은 손대지 않고, 밝은 사진만 상한까지 눌러 저장한다.
  //    렌더 스크림(고정)과 곱해져 최종 합성 밝기가 결정된다 — 계약·실측값은 clockTheme.ts 주석 참조.
  //    (resizeImage 가 이미 EXIF 정방향으로 돌려놨으므로 여기선 회전 보정이 필요 없다)
  const img = await decodeBlob(sized);
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) { if (img instanceof ImageBitmap) img.close(); throw new Error('이미지 처리에 실패했습니다'); }
  ctx.drawImage(img as CanvasImageSource, 0, 0);
  const cell = brightestCell(img as CanvasImageSource, img.width, img.height);
  if (img instanceof ImageBitmap) img.close();
  const dim = 1 - bakeScale(cell ?? [1, 1, 1]); // 측정 실패 = 순백 사진으로 간주(가장 보수적)
  if (dim > 0.005) {
    ctx.fillStyle = `rgba(0,0,0,${dim.toFixed(4)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  let q = 0.85;
  let blob = await toWebp(canvas, q);
  while (blob && blob.size > CLOCK_BG_TARGET_BYTES && q > 0.5) {
    q = Math.max(0.5, q - 0.12);
    blob = await toWebp(canvas, q);
  }
  if (!blob) throw new Error('이미지 처리에 실패했습니다');

  // ③ 업로드 — 경로 첫 칸이 venue_id 다(스토리지 RLS 가 '본인 매장 폴더'를 이 값으로 판정).
  const path = `${venueId}/${Date.now()}.webp`;
  const { error } = await supabase.storage.from(CLOCK_BG_BUCKET).upload(path, blob, {
    contentType: 'image/webp',
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
