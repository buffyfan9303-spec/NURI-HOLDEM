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

function toWebp(canvas: HTMLCanvasElement, q: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob((b) => res(b), 'image/webp', q));
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

  // 적응형 품질 — 목표 용량을 넘으면 품질을 0.12씩 낮춰 최대 3회 재인코딩(최저 0.5)
  let q = quality;
  let blob = await toWebp(canvas, q);
  while (blob && blob.size > targetBytes && q > 0.5) {
    q = Math.max(0.5, q - 0.12);
    blob = await toWebp(canvas, q);
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

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: 'image/webp',
    upsert: true,
  });
  if (error) throw error;

  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ── 포스터 이미지 업로드 ─────────────────────────────────────────────────────
export async function uploadPoster(ownerId: string, file: File): Promise<string> {
  const blob = await resizeImage(file, 1200, 1600, 0.88);
  const ext  = 'webp';
  const path = `${ownerId}/${Date.now()}.${ext}`;
  return uploadToStorage(BUCKET_POSTERS, path, blob);
}

// ── 아바타 업로드 (256×256 정방형) ──────────────────────────────────────────
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const blob = await resizeImage(file, 256, 256, 0.90);
  const path = `${userId}/avatar.webp`;
  return uploadToStorage(BUCKET_AVATARS, path, blob);
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