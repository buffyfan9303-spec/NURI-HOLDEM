// src/lib/cosmetics.ts — 코스메틱 카탈로그(프로필 카드 프레임 5종 · 닉네임 색 6종).
//
// shopMarks.ts 와 **같은 규약**이다: 정의의 출처는 서버(public.shop_cosmetics)이고 여기 있는
// 배열은 폴백 사본이다(오프라인·최초 렌더용). 가격은 서버 shop_skus 가 유일한 출처라
// 이 파일에 숫자가 없다 — 가격 재조정이 SQL 한 줄로 끝나는 규약을 계속 지킨다.
//
// ── 닉네임 색이 --tier-* 를 재사용하는 이유 ──────────────────────────────────
//  새 팔레트를 만들면 라이트/다크 두 벌을 새로 유도하고 대비 실측을 다시 해야 한다.
//  --tier-* 6종은 이미 그 과정을 통과했고(e2e/design-tokens.spec.ts '불투명 등급 텍스트' 계약이
//  base·low·mid·high·float 다섯 지면에서 4.5:1 을 잠근다), 이번 커밋에서 '닉네임 색' 지점을
//  그 계약에 명시적으로 추가했다. 서버 shop_cosmetics.token 화이트리스트가 같은 6종을 제약으로 들고 있다.
//  ⇒ 여기서 토큰명을 바꾸면 서버 제약·대비 계약 둘 다에서 먼저 터진다. 그게 의도다.
//
// ── 프레임이 hex 상수인 이유 ─────────────────────────────────────────────────
//  프로필 카드는 canvas 2D 로 굽는다. **캔버스는 CSS 변수를 읽지 못한다.**
//  그래서 프레임 색은 hex 고정이고, 카드 배경도 **다크 고정**이다(라이트 테마에서도 카드는 어둡게
//  나간다 — 공유 이미지는 상대방 기기의 테마와 무관하게 같은 그림이어야 하므로 이게 정답이다).
//  자세한 규약은 src/lib/profileCard.ts 헤더 참조.
import { supabase, IS_MOCK } from './supabase';

/** 서버 shop_cosmetics.kind 와 같은 값 */
export type CosmeticKind = 'card_frame' | 'nick_color';

/** 닉네임 색이 쓸 수 있는 등급 토큰 — 서버 shop_cosmetics_token_rule 제약과 같은 집합 */
export const NICK_COLOR_TOKENS = ['blue', 'green', 'purple', 'orange', 'rose', 'gold'] as const;
export type NickColorToken = (typeof NICK_COLOR_TOKENS)[number];

export interface Cosmetic {
  key: string;
  kind: CosmeticKind;
  label: string;
  desc: string;
  /** 닉네임 색 전용 — `--tier-<token>`. 프레임은 null. */
  token: NickColorToken | null;
  sort: number;
}

/** 닉네임 색 토큰 → CSS 변수명. 결합 지점을 한 곳에 모아 둔다(오타로 색이 조용히 사라지지 않게). */
export const nickColorVar = (token?: string | null): string | null =>
  token && (NICK_COLOR_TOKENS as readonly string[]).includes(token) ? `--tier-${token}` : null;

/**
 * 프레임 폴백 사본 5종. **키는 서버 shop_cosmetics.key 와 반드시 같아야 한다** —
 * 그림을 고르는 것도(profileCard.ts), 소장 판정도 이 문자열로 이어진다.
 */
export const FRAME_FALLBACK: Cosmetic[] = [
  { key: 'frame_gold',  kind: 'card_frame', label: '골드 라인', desc: '기본 카드의 정통 골드 테두리를 두 겹으로',     token: null, sort: 10 },
  { key: 'frame_neon',  kind: 'card_frame', label: '네온',      desc: '보라 네온 글로우 — 어두운 배경에서 가장 밝게', token: null, sort: 20 },
  { key: 'frame_felt',  kind: 'card_frame', label: '그린 펠트', desc: '테이블 천의 초록 — 홀덤 그 자체',              token: null, sort: 30 },
  { key: 'frame_chip',  kind: 'card_frame', label: '칩 트랙',   desc: '테두리를 따라 칩이 도는 트랙',                 token: null, sort: 40 },
  { key: 'frame_royal', kind: 'card_frame', label: '로열',      desc: '깊은 남색 바탕에 은빛 이중선',                 token: null, sort: 50 },
];

/** 닉네임 색 폴백 사본 6종 */
export const NICK_COLOR_FALLBACK: Cosmetic[] = [
  { key: 'nick_blue',   kind: 'nick_color', label: '블루',   desc: '차분하게 눈에 띄는 파랑', token: 'blue',   sort: 110 },
  { key: 'nick_green',  kind: 'nick_color', label: '그린',   desc: '테이블 천의 초록',        token: 'green',  sort: 120 },
  { key: 'nick_purple', kind: 'nick_color', label: '퍼플',   desc: '앱의 강조색과 같은 결',   token: 'purple', sort: 130 },
  { key: 'nick_orange', kind: 'nick_color', label: '오렌지', desc: '따뜻하고 선명한 주황',    token: 'orange', sort: 140 },
  { key: 'nick_rose',   kind: 'nick_color', label: '로즈',   desc: '부드러운 붉은빛',         token: 'rose',   sort: 150 },
  { key: 'nick_gold',   kind: 'nick_color', label: '골드',   desc: '최고 등급과 같은 금색',   token: 'gold',   sort: 160 },
];

export const FALLBACK_COSMETICS: Cosmetic[] = [...FRAME_FALLBACK, ...NICK_COLOR_FALLBACK];

// ── 서버 카탈로그 캐시 ───────────────────────────────────────────────────────
// 병합(덮어쓰기 아님)인 이유는 shopMarks 와 같다: 서버에 있는데 폴백에 없는 키가 와도,
// 폴백에만 있는 키가 조용히 사라지지 않게 한다('산 게 없어지는' 사고 방지).
let catalog: Cosmetic[] = FALLBACK_COSMETICS;
let inflight: Promise<Cosmetic[]> | null = null;

/** 지금 알고 있는 카탈로그(동기) — 서버 응답 전에는 폴백 */
export const getCosmetics = (): Cosmetic[] => catalog;

/** 서버 카탈로그 로드(1회 캐시). 실패하면 폴백을 그대로 쓴다 — 상점이 비어 보이지 않게. */
export async function loadCosmetics(): Promise<Cosmetic[]> {
  if (IS_MOCK) return catalog;
  if (inflight) return inflight;
  inflight = (async () => {
    const { data, error } = await supabase
      .from('shop_cosmetics')
      .select('key, kind, label, descr, token, sort')
      .eq('active', true)
      .order('sort');
    if (error || !data?.length) return catalog;
    const rows: Cosmetic[] = data.map((r) => ({
      key: String(r.key),
      kind: r.kind === 'nick_color' ? 'nick_color' : 'card_frame',
      label: String(r.label),
      desc: String(r.descr ?? ''),
      token: (NICK_COLOR_TOKENS as readonly string[]).includes(String(r.token))
        ? (String(r.token) as NickColorToken) : null,
      sort: Number(r.sort) || 0,
    }));
    const byKey = new Map(catalog.map((c) => [c.key, c]));
    for (const r of rows) byKey.set(r.key, r);
    catalog = [...byKey.values()].sort((a, b) => a.sort - b.sort);
    return catalog;
  })().catch(() => catalog)
    .finally(() => { inflight = null; });
  return inflight;
}

/** 프로필 카드 프레임만 */
export const frameCosmetics = (): Cosmetic[] =>
  catalog.filter((c) => c.kind === 'card_frame').sort((a, b) => a.sort - b.sort);

/** 닉네임 색만 */
export const nickColorCosmetics = (): Cosmetic[] =>
  catalog.filter((c) => c.kind === 'nick_color').sort((a, b) => a.sort - b.sort);

/** 키 → 카탈로그 행 */
export const cosmeticOf = (key?: string | null): Cosmetic | undefined =>
  key ? catalog.find((c) => c.key === key) : undefined;
