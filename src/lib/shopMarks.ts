// src/lib/shopMarks.ts — 랭킹 상점 마크 레지스트리.
//
// 2026-08-30 소비 경제 재설계로 **카탈로그의 출처가 서버(public.shop_marks)로 옮겨졌다.**
// 여기 있는 배열은 이제 '정의'가 아니라 **폴백 사본**이다(오프라인·최초 렌더용).
//   · 왜 옮겼나: 마크 해금을 화면에서만 검사하고 있었다 —
//     클라이언트가 profiles.equipped_mark 를 직접 UPDATE 했으므로 API 를 직접 부르면
//     0점으로도 크라운을 달 수 있었다. 마크가 유료가 되는 순간 그건 결제 우회다.
//     이제 장착은 set_equipped_mark() RPC 만이 하고, 서버가 도달 점수·렌탈 기간을 최종 판정한다.
//   · 그래서 need/가격을 여기서 고치면 **아무 효과가 없다.** 서버 표를 고쳐야 한다.
//
// 마크가 '이모지 문자'인 이유(종전과 동일): 장착 마크는 닉네임 앞에 **텍스트로** 붙는다
// (getEquippedMarks → '♠ 닉네임'). SVG 로 바꾸면 목록·댓글·리더보드의 문자열 결합이 전부 깨진다.
import { supabase, IS_MOCK } from './supabase';
import { SHOP_MARKS as BASE_MARKS, type ShopMark } from './loyalty';

export type { ShopMark };

/** 카탈로그 한 줄 — 도달(earn)과 기간제(rent)를 한 타입으로 다룬다 */
export interface CatalogMark {
  key: string;
  emoji: string;
  name: string;
  desc: string;
  /**
   * earn = 활동점수 도달로 영구 해금(차감 없음) ·
   * rent = **점수로 사는 꾸미기 마크**.
   * ⚠ 'rent' 라는 이름은 2026-08-30 영구 소장 전환 뒤에도 **서버 shop_marks.kind 의 값 그대로**다.
   *   여기서 이름만 바꾸면 서버 값과 갈려 카탈로그가 통째로 어긋난다 — 의미는 '구매형'으로 읽을 것.
   */
  kind: 'earn' | 'rent';
  /** earn 전용 도달 점수. 구매형은 0(가격은 shop_skus.mark_own 이 단일 출처). */
  need: number;
  sort: number;
}

/** 도달 마크 추가분 — 기존 6종 사이사이를 메워 다음 목표가 항상 가까이 보이게 배치 */
export const EXTRA_MARKS: ShopMark[] = [
  { key: 'chip_stack',  emoji: '🪙', name: '첫 스택',      need: 250,   desc: '판에 앉았다. 250점' },
  { key: 'joker',       emoji: '🃏', name: '조커',         need: 800,   desc: '변수의 카드 · 800점' },
  // 오너 #9(2026-08-30): 이름만 '핫 스트릭' → '핫'. key·emoji 는 그대로 —
  // key 는 profiles.equipped_mark 에 문자열로 박혀 있어 바꾸면 이미 보유한 사람의 마크가 사라진다.
  { key: 'hot_streak',  emoji: '🔥', name: '핫',           need: 1200,  desc: '달아오른 흐름 · 1,200점' },
  { key: 'bullseye',    emoji: '🎯', name: '타겟',         need: 2200,  desc: '노린 자리는 놓치지 않는다. 2,200점' },
  { key: 'rush',        emoji: '🚀', name: '러시',         need: 3000,  desc: '수직 상승 · 3,000점' },
  { key: 'star_player', emoji: '🌟', name: '스타 플레이어', need: 5000,  desc: '눈에 띄는 사람 · 5,000점' },
  { key: 'gem_hand',    emoji: '💎', name: '다이아 핸드',   need: 6500,  desc: '쥐면 놓지 않는다. 6,500점' },
  { key: 'turbo',       emoji: '⚡', name: '터보',         need: 10000, desc: '레벨업이 빠르다. 10,000점' },
  { key: 'shark',       emoji: '🦈', name: '샤크',         need: 12000, desc: '테이블의 포식자 · 12,000점' },
  { key: 'champion',    emoji: '🏆', name: '챔피언',       need: 20000, desc: 'KK 너머 · 20,000점' },
];

/** 도달 마크 16종(=서버 shop_marks.kind='earn' 과 같은 값). 해금 방식은 종전과 동일한 '도달'. */
export const ALL_MARKS: ShopMark[] = [...BASE_MARKS, ...EXTRA_MARKS].sort((a, b) => a.need - b.need);

/**
 * 꾸미기 마크 6종(폴백 사본) — 활동점수로 **사서 영구 소장**하는 마크다.
 *
 * 도달 마크를 구매형으로 돌리지 않은 이유: 이미 해금해 장착 중인 마크가 '사야 하는 것'이 되면
 * 산 걸 빼앗는 회귀가 된다(spent_points 를 따로 둔 이유가 바로 그것이었다).
 * 도달 마크는 '버는 이유', 꾸미기 마크는 '쓰는 이유' — 둘을 겹치지 않게 분리한다.
 *
 * 2026-08-30: 기간권(1일/7일/30일)을 접고 2,000점 영구 소장으로 옮겼다.
 * 만료로 반복 소비를 만들려던 설계였지만, 만료는 유저에게 '산 걸 잃는 일'이라 살 이유가 아니라
 * 안 살 이유가 됐다. 반복 소비는 외치기(20초 슬롯)가 맡는다 — 그쪽은 만료가 상품의 본질이다.
 * 배열 이름과 key 접두사 `rent_` 는 **서버 shop_marks 의 값 그대로**라 바꾸지 않는다.
 */
export const RENT_MARKS: CatalogMark[] = [
  { key: 'rent_clover',    emoji: '🍀', name: '네잎클로버', desc: '오늘의 행운을 걸치고 다닌다', kind: 'rent', need: 0, sort: 210 },
  { key: 'rent_wave',      emoji: '🌊', name: '웨이브',     desc: '흐름을 타는 중',              kind: 'rent', need: 0, sort: 220 },
  { key: 'rent_dragon',    emoji: '🐉', name: '드래곤',     desc: '판을 삼킬 기세',              kind: 'rent', need: 0, sort: 230 },
  { key: 'rent_moon',      emoji: '🌙', name: '초승달',     desc: '조용히 오래 남는 사람',       kind: 'rent', need: 0, sort: 240 },
  { key: 'rent_butterfly', emoji: '🦋', name: '나비',       desc: '가볍게, 그러나 눈에 띄게',    kind: 'rent', need: 0, sort: 250 },
  { key: 'rent_note',      emoji: '🎵', name: '리듬',       desc: '내 페이스대로',               kind: 'rent', need: 0, sort: 260 },
];

const asCatalog = (m: ShopMark, i: number): CatalogMark =>
  ({ key: m.key, emoji: m.emoji, name: m.name, desc: m.desc, kind: 'earn', need: m.need, sort: (i + 1) * 10 });

/** 폴백 전체 목록(도달 16 + 기간 6) */
export const FALLBACK_CATALOG: CatalogMark[] = [...ALL_MARKS.map(asCatalog), ...RENT_MARKS];

// ── 서버 카탈로그 캐시 ───────────────────────────────────────────────────────
// markEmoji() 는 목록 렌더 중에 **동기로** 불린다(닉네임 앞 글리프). 그래서 async 로 바꿀 수 없고,
// 대신 폴백으로 먼저 그린 뒤 서버 응답이 오면 캐시를 갈아 끼운다.
// 서버에 새 마크가 추가돼도 폴백에 없으면 잠깐 빈 문자열이 되는데, 그건 '조용히 사라짐'이라
// loyalty.markEmojiOf 가 겪은 함정과 같다 — 그래서 캐시는 **덮어쓰기가 아니라 병합**한다.
let catalog: CatalogMark[] = FALLBACK_CATALOG;
let inflight: Promise<CatalogMark[]> | null = null;

/** 지금 알고 있는 카탈로그(동기) — 서버 응답 전에는 폴백 */
export const getCatalog = (): CatalogMark[] => catalog;

/** 서버 카탈로그 로드(1회 캐시). 실패하면 폴백을 그대로 쓴다 — 상점이 비어 보이지 않게. */
export async function loadShopMarks(): Promise<CatalogMark[]> {
  if (IS_MOCK) return catalog;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from('shop_marks')
      .select('key, emoji, name, descr, kind, need, sort')
      .eq('active', true)
      .order('sort');
    if (error || !data?.length) return catalog;
    const rows: CatalogMark[] = data.map((r) => ({
      key: String(r.key), emoji: String(r.emoji), name: String(r.name),
      desc: String(r.descr ?? ''), kind: r.kind === 'rent' ? 'rent' : 'earn',
      need: Number(r.need) || 0, sort: Number(r.sort) || 0,
    }));
    // 병합 — 서버에 없는 폴백 키도 남겨 둔다(마크가 조용히 사라지는 사고 방지).
    const byKey = new Map(catalog.map((m) => [m.key, m]));
    for (const r of rows) byKey.set(r.key, r);
    catalog = [...byKey.values()].sort((a, b) => a.sort - b.sort);
    return catalog;
  })().catch(() => catalog)
    .finally(() => { inflight = null; });
  return inflight;
}

/** 도달 마크만(상점 '모으기' 구역) */
export const earnMarks = (): CatalogMark[] =>
  catalog.filter((m) => m.kind === 'earn').sort((a, b) => a.need - b.need);

/** 구매형 마크만(상점 '꾸미기' 구역) — 2,000점 영구 소장 대상 */
export const ownableMarks = (): CatalogMark[] =>
  catalog.filter((m) => m.kind === 'rent').sort((a, b) => a.sort - b.sort);

/** @deprecated 이름이 기간권 시절 잔재다. 같은 목록을 주는 {@link ownableMarks} 를 쓸 것. */
export const rentMarks = ownableMarks;

/** 마크 키 → 이모지(없으면 빈 문자열) — 도달·기간 마크 모두 인식 */
export const markEmoji = (key?: string | null): string =>
  key ? (catalog.find((m) => m.key === key)?.emoji ?? '') : '';

/** 마크 키 → 카탈로그 행 */
export const markOf = (key?: string | null): CatalogMark | undefined =>
  key ? catalog.find((m) => m.key === key) : undefined;
