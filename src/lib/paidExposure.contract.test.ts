// 유료 노출 스위치 계약 — 오너 결정 2026-10-09 "유료 광고 노출 하지마".
// 공개 화면이 is_paid_ad / is_premium 을 **직접** 읽으면 스위치를 꺼도 배지·상단 고정이 되살아난다.
// 그래서 공개 소비처 파일에서 날것의 `.isPaidAd` / `.isPremium` 읽기는 paidShown( … ) 안에서만 허용한다.
// (관리·업주 화면 — VenueManagement·DraggableList·MyPostersTab·PosterFormModal·VenueVerificationCard 는 대상이 아니다.)
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAID_EXPOSURE_ON, paidShown } from './paidExposure';

const PUBLIC_FILES = [
  'src/components/features/CommunityTab.tsx',
  'src/components/features/ScheduleCard.tsx',
  'src/components/features/ScheduleDetailModal.tsx',
  'src/components/features/ScheduleTable.tsx',
  'src/lib/scheduleSort.ts',
  'src/lib/homeRail.ts',
];

/** 주석을 뺀 코드에서 paidShown( … ) 밖의 `.isPaidAd` / `.isPremium` 읽기 */
function rawReads(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    .replace(/paidShown\([^()]*\)/g, '');
  // 타입 위치(Pick<…, 'isPremium'>)는 점이 없어 안 걸린다. 걸린 것은 전부 값 읽기다.
  return [...code.matchAll(/[\w.]+\.(isPaidAd|isPremium)\b/g)].map((m) => m[0]);
}

describe('유료 노출 스위치(lib/paidExposure)', () => {
  it('꺼져 있다 — 유료 표시가 참이어도 공개 화면에는 보이지 않는다', () => {
    expect(PAID_EXPOSURE_ON).toBe(false);
    expect(paidShown(true)).toBe(false);
    expect(paidShown(undefined)).toBe(false);
  });

  it.each(PUBLIC_FILES)('%s — 유료 표시는 paidShown 을 거쳐서만 읽는다', (f) => {
    expect(rawReads(readFileSync(f, 'utf8'))).toEqual([]);
  });

  it('커뮤니티 광고 칸은 스위치가 꺼져 있으면 조회하지 않는다', () => {
    const src = readFileSync('src/components/features/CommunityTab.tsx', 'utf8');
    expect(src).toMatch(/if \(!enableCategory \|\| !PAID_EXPOSURE_ON\) return;\s*loadAds\(\);/);
  });

  it('공개 매장 목록은 스위치가 꺼져 있으면 is_paid_ad 로 정렬하지 않는다', () => {
    const src = readFileSync('src/api/communityCore.ts', 'utf8');
    const body = src.slice(src.indexOf('export async function getVenues'), src.indexOf('export async function updateVenueDescription'));
    expect(body).toMatch(/if \(PAID_EXPOSURE_ON\) q = q\.order\('is_paid_ad'/);
    expect(body.match(/order\('is_paid_ad'/g)?.length).toBe(1);
  });
});
