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

// 자체 도메인 정적 배너(public/banners/*.webp)는 Supabase 변환이 안 걸린다 —
// 그래서 **원본이 그대로** 내려갔다(실측: 홈 목록 64px 썸네일이 118KB 원본을 받음).
// scripts/gen-thumbs.mjs 가 빌드 때 폭별 변형본을 만들고 여기서 그걸 가리킨다(64px → 3KB).
// 변형본이 없어도 ScheduleCard 의 onError 폴백이 원본으로 되돌아가 화면은 깨지지 않는다.
// 2026-09-18: `/venues/` 추가 — 매장 로고는 일정 목록의 **모든 줄**에 18px 로 그려진다.
// 원본 하나(16KB)를 줄 수만큼 곱해 내려받던 것을 변형본(64px ≈ 1~2KB)으로 바꾼다.
// ⚠ 폴더를 늘렸으면 `scripts/gen-thumbs.mjs` 의 DIRS 도 같이 늘려야 한다 — 한쪽만 고치면
//   여기서는 `-64.webp` 를 가리키는데 그 파일이 없어 404 → onError 폴백으로 원본이 다시 내려간다
//   (화면은 안 깨지고 **느려지기만 해서** 아무도 눈치채지 못한다).
const LOCAL_WIDTHS = [64, 128, 256, 400, 800, 960];
const localVariant = (url: string, width: number): string | undefined => {
  if (!/\/(banners|venues)\/[^/]+\.webp$/i.test(url)) return undefined;
  const w = LOCAL_WIDTHS.find((x) => x >= width);
  if (!w) return undefined;              // 요청 폭이 최대 변형본보다 크면 원본이 맞다
  return url.replace(/\.webp$/i, `-${w}.webp`);
};

/** 서버 변환 방식. 폭만 넘기므로 차이는 이렇다(2026-09-30 실측, render/image):
 *  · 'cover'(종전 기본) — 원본 높이를 **그대로 두고 가운데 폭만 잘라** 세로 띠를 준다.
 *     715×1440 포스터 width=400 → 400×1440 · 256×151 사진 width=96 → 96×151.
 *     그 띠를 화면의 object-cover 틀이 또 잘라, 3:4 포스터 카드는 포스터 **가운데 36%** 만 보였다.
 *  · 'contain' — 비율 그대로 폭에 맞춰 줄인다(400×806). 자르기는 호출부 CSS 가 원본 기준으로 한다.
 *  🔴 기본값 = contain(오너 결정 2026-09-30). 소비처 7곳이 전부 폭만 넘기고 틀 맞춤 자르기는 CSS(object-cover/contain)에
 *  맡긴다 — 서버 cover 가 필요한 곳은 0곳이었다. 높이까지 넘겨 서버에서 잘라야 하는 곳이 생기면 그때 { fit: 'cover' } 를 붙인다. */
export type ThumbFit = 'cover' | 'contain';
interface ThumbOpts { quality?: number; fit?: ThumbFit }

/** Storage 공개 URL을 지정 폭의 webp 썸네일 URL로 변환. 대상이 아니면 원본 그대로. */
export function thumbUrl(url: string | undefined | null, width: number, { quality = 70, fit = 'contain' }: ThumbOpts = {}): string | undefined {
  if (!url) return undefined;
  const local = localVariant(url, width);
  if (local) return local;
  // Supabase Storage 공개 객체만 변환 가능
  if (!url.includes('/storage/v1/object/public/')) return url;
  const base = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${width}&quality=${quality}&format=webp&resize=${fit}`;
}

/** 레티나 대응 srcset(1x/2x) — 폭이 확정된 목록 썸네일에 사용 */
export function thumbSrcSet(url: string | undefined | null, width: number, opts: ThumbOpts = {}): string | undefined {
  if (!url) return undefined;
  // 로컬 배너: 1x/2x 변형본이 **둘 다 있을 때만** srcset 을 낸다(한쪽만 있으면 브라우저가 404 를 고를 수 있다).
  if (localVariant(url, width)) {
    const two = localVariant(url, width * 2);
    return two ? `${localVariant(url, width)} 1x, ${two} 2x` : undefined;
  }
  if (!url.includes('/storage/v1/object/public/')) return undefined;
  return `${thumbUrl(url, width, opts)} 1x, ${thumbUrl(url, width * 2, opts)} 2x`;
}
