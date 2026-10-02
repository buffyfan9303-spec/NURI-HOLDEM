/**
 * src/lib/storage.ts
 * Supabase Storage 업로드 + 클라이언트 사이드 이미지 리사이징
 */
import { supabase, IS_MOCK } from './supabase';

const BUCKET_POSTERS  = import.meta.env.VITE_STORAGE_BUCKET_POSTERS  ?? 'posters';
const BUCKET_LISTINGS = import.meta.env.VITE_STORAGE_BUCKET_LISTINGS ?? 'listings';
const BUCKET_AVATARS  = 'avatars';
// 커뮤니티 글쓰기 이미지 — 전용 공개 버킷(community_images). 정책: 공개 읽기 / 로그인 업로드 / 본인 삭제.
const BUCKET_COMMUNITY = import.meta.env.VITE_STORAGE_BUCKET_COMMUNITY ?? 'community_images';

// ── 이미지 디코드 (EXIF 회전 보정) ───────────────────────────────────────────
// 폰 사진은 EXIF orientation 으로 돌아가 보일 수 있음 → createImageBitmap(imageOrientation:'from-image')
// 으로 정방향 디코드. 미지원 브라우저는 <img>(브라우저 기본 EXIF 적용)로 폴백.
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions); }
    catch { /* 폴백 */ }
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 불러오지 못했습니다')); };
    img.src = url;
  });
}

function encodeAs(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob((b) => res(b), type, q));
}

/**
 * S-12(2026-10-01) — webp 인코딩을 못 하는 브라우저(구형 Safari 등)는 toBlob(…,'image/webp') 에 **PNG 를 돌려준다**.
 * 예전엔 blob.type 을 안 보고 'image/webp'·.webp 로 올려 ① 형식 표기가 거짓이 되고 ② PNG 는 품질 인자를 무시해
 * 품질 낮추기 루프가 헛돌아 목표(포스터 250KB)를 넘기거나 버킷 5MB 에 걸렸다.
 * 첫 인코딩 결과가 webp 가 아니면 jpeg(모든 브라우저 지원·품질 인자 유효)로 고정한다 — 버킷 허용 형식(jpeg|png|webp) 안이다.
 */
export async function encodeImage(canvas: HTMLCanvasElement, q: number, prefer = 'image/webp'): Promise<Blob | null> {
  const b = await encodeAs(canvas, prefer, q);
  if (!b || b.type === prefer) return b;
  return encodeAs(canvas, 'image/jpeg', q);
}

/** 올릴 파일 확장자 — blob 의 실제 형식을 따른다(경로 확장자와 Content-Type 을 한 출처로). */
export function extOf(blob: Blob): 'webp' | 'jpg' | 'png' {
  return blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/png' ? 'png' : 'webp';
}

// ── 이미지 리사이징 + webp 인코딩 (Canvas API) ──────────────────────────────
// 비율 유지 축소 후 webp 로 인코딩. 결과가 targetBytes 를 넘으면 품질을 단계적으로 낮춰
// 재인코딩(대역폭·저장 비용 절감). EXIF 회전은 decodeImage 에서 보정.
export async function resizeImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85,
  targetBytes = 500_000,
): Promise<Blob> {
  const src = await decodeImage(file);
  let width = src.width;
  let height = src.height;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width  = Math.round(width  * ratio);
    height = Math.round(height * ratio);
  }

  const canvas = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  canvas.getContext('2d')!.drawImage(src as CanvasImageSource, 0, 0, width, height);
  if (src instanceof ImageBitmap) src.close();

  // 적응형 품질 — 목표 용량을 넘으면 품질을 0.12씩 낮춰 최대 3회 재인코딩(최저 0.5).
  // 형식은 첫 인코딩에서 정한다(webp 불가 → jpeg) — 루프 안에서 형식이 바뀌지 않게.
  let q = quality;
  let blob = await encodeImage(canvas, q);
  const type = blob?.type || 'image/webp';
  while (blob && blob.size > targetBytes && q > 0.5) {
    q = Math.max(0.5, q - 0.12);
    blob = await encodeAs(canvas, type, q);
  }
  // S-12 — 최저 품질에서도 목표를 넘으면 해상도를 한 단계(0.8배)씩, 최대 2회 줄인다(품질만으론 못 줄이는 큰 사진).
  for (let i = 0; i < 2 && blob && blob.size > targetBytes && canvas.width > 480; i++) {
    const w = Math.round(canvas.width * 0.8), h = Math.round(canvas.height * 0.8);
    const next = document.createElement('canvas');
    next.width = w; next.height = h;
    next.getContext('2d')!.drawImage(canvas, 0, 0, w, h);
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d')!.drawImage(next, 0, 0);
    blob = await encodeAs(canvas, type, q);
  }
  if (!blob) throw new Error('이미지 처리에 실패했습니다');
  return blob;
}

// ── 공통 업로드 ──────────────────────────────────────────────────────────────
async function uploadToStorage(
  bucket: string,
  path: string,
  blob: Blob,
): Promise<string> {
  if (IS_MOCK) {
    // Mock 모드: object URL을 임시 반환 (미리보기용)
    return URL.createObjectURL(blob);
  }

  // S-12 — 형식은 blob 이 정한다. 호출부가 '.webp' 로 적은 경로도 실제 형식 확장자로 맞춘다.
  path = path.replace(/\.webp$/, `.${extOf(blob)}`);
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || 'image/webp',
    upsert: true,
    // 💰 Egress 절감(무료 한도 5GB/월 유지의 핵심) — 이미지 경로는 타임스탬프 파일명이라
    //    내용이 바뀌면 경로도 바뀐다(아바타는 고정 경로 upsert 라 uploadAvatar 가 ?v= 쿼리로 캐시 키를 바꾼다).
    //    기본값(1시간) 대신 1년 캐시로 두면 재방문·재조회 시 CDN/브라우저가 처리해 전송량이 거의 0이 된다.
    cacheControl: '31536000',
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ── 포스터 이미지 업로드 ─────────────────────────────────────────────────────
/** @param groupId 그룹 포스터면 '<uid>/g/<그룹id>/' 폴더(서버 정책 posters_upload_group, 20261002h — 그 그룹 개설자만).
 *  매장 포스터 경로('<uid>/')는 매장 운영자만 올릴 수 있어 그룹 개설자에게는 막혀 있다. */
export async function uploadPoster(ownerId: string, file: File, groupId?: string): Promise<string> {
  // 오너 2026-09-30 "원본 말고 webp 로 압축 — 용량이 너무 크다": 목표 250KB(종전 500KB).
  //   실측: 715×1440 포스터 q0.80 ≈ 130~160KB 로 표·작은 글자까지 읽힌다. 품질은 0.5 아래로는 내리지 않는다(resizeImage).
  const blob = await resizeImage(file, 1200, 1600, 0.82, 250_000);
  const ext  = extOf(blob);
  const path = groupId ? `${ownerId}/g/${groupId}/${Date.now()}.${ext}` : `${ownerId}/${Date.now()}.${ext}`;
  return uploadToStorage(BUCKET_POSTERS, path, blob);
}

// ── 아바타 업로드 (256×256 정방형) ──────────────────────────────────────────
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const blob = await resizeImage(file, 256, 256, 0.90);
  const url  = await uploadToStorage(BUCKET_AVATARS, `${userId}/avatar.webp`, blob);
  // 고정 경로 upsert + 1년 캐시 → 두 번째 사진부터 URL 이 같아 브라우저·CDN 이 옛 사진을 계속 냈다.
  // 쿼리로 캐시 키를 바꾼다(공개 객체 서빙은 미지정 파라미터를 무시 · thumbUrl 은 '?' 유무를 처리한다).
  return `${url}?v=${Date.now()}`;
}

// ── 마켓플레이스 이미지 업로드 (최대 5장) ───────────────────────────────────
export async function uploadListingImages(
  sellerId: string,
  files: FileList | File[],
  max = 5,
): Promise<string[]> {
  const list = Array.from(files).slice(0, max);
  const urls = await Promise.all(
    list.map(async (file, i) => {
      const blob = await resizeImage(file, 1000, 1000, 0.82);
      const path = `${sellerId}/${Date.now()}-${i}.webp`;
      return uploadToStorage(BUCKET_LISTINGS, path, blob);
    }),
  );
  return urls;
}

// ── 매장 갤러리 이미지 업로드 (자동 슬라이드용, 최대 8장) ────────────────────
export async function uploadVenueImages(
  venueId: string,
  files: FileList | File[],
  max = 8,
): Promise<string[]> {
  const list = Array.from(files).slice(0, max);
  const urls = await Promise.all(
    list.map(async (file, i) => {
      const blob = await resizeImage(file, 1280, 1280, 0.85);
      const path = `venues/${venueId}/${Date.now()}-${i}.webp`;
      return uploadToStorage(BUCKET_COMMUNITY, path, blob);
    }),
  );
  return urls;
}

// ── 커뮤니티 글쓰기 이미지 업로드 (최대 4장) ────────────────────────────────
export async function uploadCommunityImages(
  userId: string,
  files: FileList | File[],
  max = 4,
): Promise<string[]> {
  const list = Array.from(files).slice(0, max);
  const urls = await Promise.all(
    list.map(async (file, i) => {
      const blob = await resizeImage(file, 1200, 1200, 0.82);
      const path = `community/${userId}/${Date.now()}-${i}.webp`;
      return uploadToStorage(BUCKET_COMMUNITY, path, blob);
    }),
  );
  return urls;
}