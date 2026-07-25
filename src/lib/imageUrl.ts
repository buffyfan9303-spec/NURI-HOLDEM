// src/lib/imageUrl.ts — 목록용 썸네일 URL 생성(Supabase Storage 이미지 변환)
//
// 💰 왜: 목록 카드는 화면에서 64~200px로 그려지는데 원본(최대 1200×1600, 평균 165KB)을 그대로 내려받고 있었다.
//    Supabase의 /render/image/ 변환을 쓰면 폭을 줄여 전송량을 크게 줄일 수 있다 → 무료 Egress(5GB/월) 수명 연장.
//
// 실측(포스터 1장, 원본 webp 159KB 기준):
//    width=400 + format=webp → 60KB (62% 절감)   ← 목록 카드
//    width=300 + format=webp → 41KB (74% 절감)   ← 작은 썸네일
//    format 미지정 시 JPEG로 변환돼 오히려 커진다(88KB) → **format=webp 필수**
//
// 주의: 변환본 캐시는 max-age=3600(Supabase 기본). 원본 객체 캐시(1년)와 별개다.
//       변환을 지원하지 않는 URL(외부 이미지·data:·blob:)은 그대로 반환한다.

/** Storage 공개 URL을 지정 폭의 webp 썸네일 URL로 변환. 대상이 아니면 원본 그대로. */
export function thumbUrl(url: string | undefined | null, width: number, quality = 70): string | undefined {
  if (!url) return undefined;
  // Supabase Storage 공개 객체만 변환 가능
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${width}&quality=${quality}&format=webp&resize=cover`;
}

/** 레티나 대응 srcset(1x/2x) — 폭이 확정된 목록 썸네일에 사용 */
export function thumbSrcSet(url: string | undefined | null, width: number, quality = 70): string | undefined {
  if (!url || !url.includes('/storage/v1/object/public/')) return undefined;
  return `${thumbUrl(url, width, quality)} 1x, ${thumbUrl(url, width * 2, quality)} 2x`;
}
