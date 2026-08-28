// src/lib/postCategory.ts
// 게시글 카테고리의 단일 출처 — 라벨과 pill 색.
//
// 왜 모듈로 뺐나: 이 팔레트가 CommunityTab 안에 module-private 로 갇혀 있어서
// 목록에만 카테고리 뱃지가 있고 **글보기 상세에는 아예 없었다**. 상세에 뱃지를 넣으려면
// 같은 색표가 필요한데, 복사해 두면 언젠가 한쪽만 바뀌어 같은 카테고리가 화면마다
// 다른 색으로 보인다. 색표는 한 곳에만 있어야 한다.
//
// 팔레트 원칙(Nightingale §20.1) — 무지개 남발 금지. 15% 틴트 4계열로 고정한다:
//   accent(전략·분석) / emerald(정보·질문) / gold(대회·후기) / 무채(자유·기본)
import type { PostCategory } from '../api/community';

/** 글쓰기 폼의 선택지(= 실제로 쓸 수 있는 카테고리 전체). */
export const POST_CATEGORIES: { id: PostCategory; label: string }[] = [
  { id: 'free',     label: '자유' },
  { id: 'hand',     label: '핸드 분석' },
  { id: 'tourney',  label: '대회 후기' },
  { id: 'question', label: '질문' },
  { id: 'info',     label: '정보' },
  { id: 'review',   label: '후기' },
  { id: 'study',    label: '공부' },
];

/** 목록 필터용 — 위 목록 앞에 '전체' 를 붙인 것(순서는 필터 진열 순서 그대로 유지). */
export const BOARD_FILTER_CATEGORIES: { id: PostCategory | 'all'; label: string }[] = [
  { id: 'all',      label: '전체' },
  { id: 'hand',     label: '핸드 분석' },
  { id: 'tourney',  label: '대회 후기' },
  { id: 'question', label: '질문' },
  { id: 'info',     label: '정보' },
  { id: 'review',   label: '후기' },
  { id: 'free',     label: '자유' },
  { id: 'study',    label: '공부' },
];

export function postCategoryLabel(cat: PostCategory | undefined): string {
  return POST_CATEGORIES.find((c) => c.id === cat)?.label ?? '자유';
}

const CATEGORY_TINT_FALLBACK = 'bg-surface-high text-ink-muted';

// 2026-08-29 대비 교정. 세 계열은 **한 규칙으로 못 고친다** — accent 만 CSS 변수(테마 전환)이고
// gold·emerald 는 테마 고정 브랜드 색이라, 라이트에서는 index.css 의 unlayered 오버라이드
// (`html.light .text-gold-300/400 → #8F6200`, `html.light .text-emerald-300/400 → #0A8F5C`)가
// 실제 렌더색을 바꾼다. 그래서 계열마다 결론이 다르다. 양 테마 '틴트 위' 합성면 실측(WCAG):
//
//   accent  틴트 #2C2448(다크·surface-low) / #E9E3F7(라이트)
//     · text-accent-300  다크 3.14 · 모달(surface-mid) 위 2.90  → AA 미달 ❌
//     · text-accent-200  다크 6.93 / 모달 6.40 · 라이트 5.07    → 채택 ✅
//       (라이트의 accent-200 은 unlayered 오버라이드로 #6946C8 딥 톤이라 양 테마에서 통한다)
//   emerald 틴트 #1B343A(다크) / #DBF7EC(라이트)
//     · text-emerald-400  다크 6.18 ✅ / 라이트 렌더값 #0A8F5C 3.64 ❌
//     · text-emerald-700(#067A4D, 오버라이드 없음)  라이트 4.75 ✅ / 다크 2.44 ❌
//       → 단일 값으로는 양 테마를 못 넘긴다. dark: 분기가 유일한 해(앱 전례: LiveGamesTab·PostAttachments).
//   gold    틴트 #3E352F(다크) / #FFF9E1(라이트)
//     · text-gold-400  다크 6.64 ✅ / 라이트 렌더값 #8F6200 5.08 ✅ → **이미 통과, 손대지 않는다**
//       (여기서 gold 까지 700 단 같은 걸로 밀면 다크가 2.39 로 무너진다)
//   free    surface-high 위 ink-muted  다크 4.53 ✅ / 라이트 4.69 ✅ → 유지
const CATEGORY_TINTS: Partial<Record<PostCategory, string>> = {
  hand:     'bg-accent-300/15 text-accent-200',
  study:    'bg-accent-300/15 text-accent-200',
  question: 'bg-emerald-400/15 text-emerald-700 dark:text-emerald-400',
  info:     'bg-emerald-400/15 text-emerald-700 dark:text-emerald-400',
  tourney:  'bg-gold-300/15 text-gold-400',
  review:   'bg-gold-300/15 text-gold-400',
  free:     CATEGORY_TINT_FALLBACK,
};

export function categoryPillClass(cat: PostCategory | undefined): string {
  return CATEGORY_TINTS[cat ?? 'free'] ?? CATEGORY_TINT_FALLBACK;
}
