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

// ⚠ 이 값들은 CommunityTab 에서 **그대로 옮겨온 것**이다(동작 변경 0).
//   감사에서 `text-accent-300` 이 `accent-300/15` 틴트 위에서 다크 2.90:1 로 AA 미달인 것이
//   확인됐지만, 여기서 함께 고치지 않았다 — gold·emerald 는 accent 와 달리 CSS 변수가 아니라
//   **테마 고정 브랜드 색**이라(tailwind.config.js) 라이트에서 규칙이 반대다
//   (emerald 는 300~600 이 흰 배경 텍스트로 전부 4.5 미달, 라이트 텍스트는 700 단만 유효).
//   즉 세 계열을 한 규칙으로 못 고친다. 양 테마에서 '틴트 위' 대비를 실측한 뒤 교정할 것.
const CATEGORY_TINTS: Partial<Record<PostCategory, string>> = {
  hand:     'bg-accent-300/15 text-accent-300',
  study:    'bg-accent-300/15 text-accent-300',
  question: 'bg-emerald-400/15 text-emerald-400',
  info:     'bg-emerald-400/15 text-emerald-400',
  tourney:  'bg-gold-300/15 text-gold-400',
  review:   'bg-gold-300/15 text-gold-400',
  free:     CATEGORY_TINT_FALLBACK,
};

export function categoryPillClass(cat: PostCategory | undefined): string {
  return CATEGORY_TINTS[cat ?? 'free'] ?? CATEGORY_TINT_FALLBACK;
}
