// src/lib/clockSlides.ts — 클락 TV 왼쪽 칸 슬라이드 순서표(K단계, 2026-09-30).
//
// 요구 원문: .claude/handoff/specs-0930/PLAN-AB-exec.md §5-1 · W-defects.md#W-11(오너 결정: 클락 추가 페이지 + 순위표 팀 합산).
//   순서 = 시상 → 추가 페이지 A → 추가 페이지 B → 광고. 없는 것은 건너뛴다. 한 장뿐이면 멈춘다.
//   머무는 시간은 **코드 상수**다(매장 페이지 30초 · 광고 10초) — 데이터에 시간 칸을 두지 않아 매장이 바꿀 수 없다.
//   여러 TV 동기화: 서버 시각 기준 floor(t / 한 바퀴) 로 지금 장을 계산한다(새로고침해도 이어진다).
//
// 이 파일은 순수 함수만 둔다(화면·저장 0). ClockStage 가 그리고, 서버 상한(20260930h 초안)과 편집기가 같은 상수를 쓴다.

import { filterContent } from './content-filter';

/** 추가 페이지 종류. team = 깐부 팀 합산 점수(W-11). */
export type ClockExtraKind = 'bounty' | 'event' | 'notice' | 'custom' | 'team';
/** 추가 페이지 한 줄 — 이름표 · 내용 · 메모. team 에서는 이름표 = 팀 이름, 내용 = 팀원들의 등수("1, 7"), 메모 = 팀원 이름. */
export interface ClockExtraRow { label: string; content: string; note?: string }
/** 매장이 직접 켜는 추가 페이지(최대 2장). **시간 칸이 없다** — 머무는 시간은 아래 상수다. */
export interface ClockExtraPage { kind: ClockExtraKind; title: string; rows: ClockExtraRow[]; points?: number[] }

// ── 상한 — 서버 트리거(supabase/migrations/20260930h_*.sql)가 같은 수로 막는다. 바꾸면 두 곳을 같이 바꾼다. ──
// 🔴 2026-09-30 design-reviewer 실측(5aa08f93): 제목 30자는 TV 에서 7~8자만 보였고, 긴 내용은 두 줄로 감겨 8줄부터 칸을 넘쳐
//   Prize Pool 총액까지 잘렸다. 상한은 **TV 왼쪽 칸(16:9 기준 폭 PRIZE_COL_CQ≈37cqmin)에 한 줄로 다 보이는 길이**다
//   (한글 1자 ≈ 0.95em · 줄 구성은 ClockStage extraSheet: 이름표 1.7cqmin 한 줄 + 내용 2.1cqmin 한 줄 + 메모 1.3cqmin).
//   · 내용 16자 × 2.1 × 0.95 ≈ 31.9cqmin · 이름표 14자(팀은 '10. ' 포함) × 1.7 ≈ 26.7 · 메모 20자 × 1.3 ≈ 24.7 · 시상 문구 12자 × 2.5(1등) ≈ 28.5 + 등수
//   · 제목 12자 — 머리말은 글자 수에 맞춰 4.6→3.2cqmin 까지 줄인다(줄 높이는 고정).
//   · 줄 8개 — 메모까지 있는 최악 8줄 ≈ 56cqmin 로 20줄 시상표(≈73cqmin)보다 낮다 → 칸 높이를 늘리지 않는다.
export const EXTRA_PAGES_MAX = 2;
export const EXTRA_ROWS_MAX = 8;
export const EXTRA_TITLE_MAX = 12;
export const EXTRA_LABEL_MAX = 14;
export const EXTRA_CONTENT_MAX = 16;
export const EXTRA_NOTE_MAX = 20;
export const TEAM_POINTS_MAX = 30;
export const PRIZE_TEXT_MAX = 12;
export const PRIZE_NOTE_MAX = 20;
/** 시상 줄 수 상한(종전 표가 200등까지 쓴다 — 서버 트리거도 같은 수). */
export const PRIZE_ROWS_MAX = 200;

// ── 머무는 시간(설정 불가) ──
/** 매장 페이지(시상·추가 페이지) 한 번에 머무는 시간. */
export const PAGE_MS = 30_000;
/** 광고 한 장 — 매장이 바꿀 수 없다(오너 2026-09-29). */
export const AD_MS = 10_000;
/** 시상표 한 장(20줄) 머무름 — 종전 PrizeColumn 값 그대로(ClockStage 주석의 7초 근거). */
export const PRIZE_SHEET_MS = 7_000;

export const EXTRA_KIND_LABEL: Record<ClockExtraKind, string> = {
  bounty: '바운티', event: '이벤트', notice: '공지', custom: '직접 입력', team: '팀 점수',
};
/** TV 보드 라벨(영문 대문자 — 보드 라벨 규칙, clockBoard.contract). custom 은 제목을 라벨로 쓰지 않고 'INFO'. */
export const EXTRA_KIND_BOARD: Record<ClockExtraKind, string> = {
  bounty: 'Bounty', event: 'Event', notice: 'Notice', custom: 'Info', team: 'Team Score',
};

export type ClockSegment =
  | { kind: 'prize'; ms: number; sheets: number }
  | { kind: 'extra'; ms: number; index: number }
  | { kind: 'ad'; ms: number };

/** 화면에 그릴 내용이 있는 추가 페이지만. 빈 페이지(줄 0)는 건너뛴다. */
export function visibleExtraPages(pages: readonly ClockExtraPage[] | null | undefined): ClockExtraPage[] {
  const list: readonly ClockExtraPage[] = Array.isArray(pages) ? pages : [];
  // 서버를 거치지 않은(또는 트리거 이전의) 행이 스칼라·null 이어도 TV 가 깨지지 않게 문자열로 정규화한다(critical-reviewer P3).
  return list.slice(0, EXTRA_PAGES_MAX)
    .filter((p): p is ClockExtraPage => !!p && typeof p === 'object' && Array.isArray(p.rows))
    .map((p) => ({ ...p, title: str(p.title), rows: p.rows.filter((r) => !!r && typeof r === 'object').slice(0, EXTRA_ROWS_MAX).map((r) => ({ label: str(r.label), content: str(r.content), ...(r.note ? { note: str(r.note) } : {}) })) }))
    .filter((p) => p.rows.some((r) => r.label.trim() || r.content.trim()));
}
const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));

/**
 * 한 바퀴 순서표 — 시상 → 추가 A → 추가 B → 광고.
 * 시상 칸은 장이 여럿이면 **장 전환이 끊기지 않게** 30초를 넘는 가장 작은 '장 수 × 7초' 의 배수로 늘린다
 * (2장 → 42초 = 1·2·1·2·1·2). 시상만 있으면 이 값이 곧 종전의 7초 순환과 같다.
 */
export function slideSegments(o: { prizeSheets: number; extraCount: number; hasAd: boolean }): ClockSegment[] {
  const out: ClockSegment[] = [];
  if (o.prizeSheets > 0) {
    const round = o.prizeSheets * PRIZE_SHEET_MS;
    out.push({ kind: 'prize', sheets: o.prizeSheets, ms: o.prizeSheets <= 1 ? PAGE_MS : Math.ceil(PAGE_MS / round) * round });
  }
  for (let i = 0; i < Math.min(o.extraCount, EXTRA_PAGES_MAX); i++) out.push({ kind: 'extra', index: i, ms: PAGE_MS });
  if (o.hasAd) out.push({ kind: 'ad', ms: AD_MS });
  return out;
}

/** 트랙 위 장 수(시상 장 + 추가 페이지 + 광고 1장). */
export function sheetCount(segs: readonly ClockSegment[]): number {
  return segs.reduce((n, s) => n + (s.kind === 'prize' ? s.sheets : 1), 0);
}

export interface SlidePos {
  /** 지금 칸(segs 인덱스). 칸이 없으면 -1. */
  seg: number;
  /** 트랙 위 전체 장 번호(0부터). */
  sheet: number;
  /** 몇 번째 바퀴인가 — 광고 순번(한 바퀴에 하나)에 쓴다. */
  cycle: number;
  /** 다음 장 전환까지 남은 ms. 움직일 게 없으면 Infinity. */
  msLeft: number;
}

/** 시각 t(ms) 의 위치. t 가 음수여도(기기 시계 역행) 바르게 돈다. */
export function slideAt(segs: readonly ClockSegment[], t: number): SlidePos {
  if (!segs.length) return { seg: -1, sheet: 0, cycle: 0, msLeft: Infinity };
  const total = segs.reduce((s, x) => s + x.ms, 0);
  const cycle = Math.floor(t / total);
  let r = t - cycle * total;
  let base = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (r < s.ms || i === segs.length - 1) {
      const still = sheetCount(segs) <= 1;
      if (s.kind === 'prize' && s.sheets > 1) {
        const k = Math.floor(r / PRIZE_SHEET_MS);
        const toNextSheet = (k + 1) * PRIZE_SHEET_MS - r;
        return { seg: i, sheet: base + (k % s.sheets), cycle, msLeft: still ? Infinity : Math.min(toNextSheet, s.ms - r) };
      }
      return { seg: i, sheet: base, cycle, msLeft: still ? Infinity : s.ms - r };
    }
    r -= s.ms;
    base += s.kind === 'prize' ? s.sheets : 1;
  }
  return { seg: 0, sheet: 0, cycle, msLeft: Infinity };   // 도달 불가(위 루프의 마지막 칸이 받는다)
}

/** 이 바퀴에 걸 광고 — 한 바퀴에 하나씩 순번. */
export function adIndexAt(adCount: number, cycle: number): number {
  if (adCount <= 0) return -1;
  return ((cycle % adCount) + adCount) % adCount;
}

// ── W-11 깐부 팀 합산 점수 ─────────────────────────────────────────────────
export interface TeamStanding { rank: number; team: string; total: number; places: number[]; note?: string }

/** "1, 7" · "1·7" · "1 7" → [1, 7]. 1 이상 정수만. */
export function parsePlaces(s: string): number[] {
  return (s ?? '').split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

/**
 * 팀 합산 점수 → 팀 순위. points[k] = (k+1)등의 점수(깐부 예: 1st 14 … 12th 1). 표 밖 등수는 0점.
 * 동점은 같은 순위(1·1·3). 동점 순서는 입력 순서를 지킨다(안정 정렬) — 동점 해소 규칙은 매장마다 달라 정하지 않는다.
 */
export function teamStandings(points: readonly number[], rows: readonly ClockExtraRow[]): TeamStanding[] {
  const list = rows
    .filter((r) => (r.label ?? '').trim())
    .map((r) => {
      const places = parsePlaces(r.content);
      const total = places.reduce((s, p) => s + (Number(points[p - 1]) || 0), 0);
      return { team: r.label.trim(), total, places, note: r.note?.trim() || undefined };
    });
  const sorted = list.map((x, i) => ({ x, i })).sort((a, b) => b.x.total - a.x.total || a.i - b.i).map((e) => e.x);
  let rank = 0;
  return sorted.map((x, i) => {
    if (i === 0 || sorted[i - 1].total !== x.total) rank = i + 1;
    return { ...x, rank };
  });
}

/** §28 — 매장이 쓴 글자(시상 문구·메모 · 추가 페이지 제목·이름표·내용·메모)를 한 줄씩 모은다. 서버 트리거(contains_blocked_ugc)와 편집기 사전 검사가 같은 칸을 본다. */
export function clockUserTexts(prizes: readonly { text?: string; note?: string }[] | null | undefined, pages: readonly ClockExtraPage[] | null | undefined): string[] {
  const out: string[] = [];
  for (const p of prizes ?? []) { if (p?.text) out.push(p.text); if (p?.note) out.push(p.note); }
  for (const pg of pages ?? []) {
    if (pg?.title) out.push(pg.title);
    for (const r of pg?.rows ?? []) { if (r?.label) out.push(r.label); if (r?.content) out.push(r.content); if (r?.note) out.push(r.note); }
  }
  return out;
}

/** §28 — 매장이 쓴 글자 중 금칙 표현이 든 첫 칸의 안내(없으면 null). 서버 트리거(contains_blocked_ugc)가 같은 칸을 다시 막는다. */
export function clockPagesBlocked(prizes: readonly { text?: string; note?: string }[] | null | undefined, pages: readonly ClockExtraPage[] | null | undefined): string | null {
  for (const t of clockUserTexts(prizes, pages)) {
    const r = filterContent(t);
    if (r.blocked) return `「${t}」 — ${r.reason ?? '게시할 수 없는 표현입니다'}`;
  }
  return null;
}

/** 편집기·저장 전에 상한으로 자른다(서버도 같은 수로 거절한다 — 여기서 먼저 잘라 저장 실패를 막는다). */
export function clampExtraPages(pages: readonly ClockExtraPage[] | null | undefined): ClockExtraPage[] {
  const cut = (s: unknown, n: number) => String(s ?? '').slice(0, n);
  const list: readonly ClockExtraPage[] = Array.isArray(pages) ? pages : [];
  return list.slice(0, EXTRA_PAGES_MAX).map((p) => ({
    kind: (['bounty', 'event', 'notice', 'custom', 'team'] as const).includes(p.kind) ? p.kind : 'custom',
    title: cut(p.title, EXTRA_TITLE_MAX),
    rows: (Array.isArray(p.rows) ? p.rows : ([] as ClockExtraRow[])).slice(0, EXTRA_ROWS_MAX).map((r) => ({
      label: cut(r.label, EXTRA_LABEL_MAX), content: cut(r.content, EXTRA_CONTENT_MAX),
      ...(r.note ? { note: cut(r.note, EXTRA_NOTE_MAX) } : {}),
    })),
    ...(p.kind === 'team' ? { points: (Array.isArray(p.points) ? p.points : ([] as number[])).slice(0, TEAM_POINTS_MAX).map((n) => Math.max(0, Math.min(9999, Math.round(Number(n) || 0)))) } : {}),
  }));
}
