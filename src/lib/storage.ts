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

// ── 이미지 리사이징 (Canvas API) ─────────────────────────────────────────────
export async function resizeImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      // 비율 유지 축소
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width  = Math.round(width  * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Canvas toBlob failed')),
        'image/webp',
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
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