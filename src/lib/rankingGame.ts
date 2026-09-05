// 순위(성적) 완료 판정은 '날짜'가 아니라 (날짜, 게임) 단위다 — F02.
//
// 왜 헬퍼 하나로 모으나: venue_rankings 의 저장 단위는 (venue_id, ranking_date, event_name) 이고
// **game_seq 컬럼이 없다**. 그래서 날짜 Set 한 겹으로 판정하면 같은 날 메인만 저장해도
// 사이드가 '순위 ✓' 로 뭉쳐 '순위 미입력' 버튼이 사라진다(반대로 사이드만 저장해도 메인이 뭉친다).
// 게임 식별자는 event_name 하나뿐이므로, 그 계약을 이 파일에 한 번만 적고 모든 소비처가 같은 판정을 쓴다.
//
// event_name ↔ 게임 계약(2026-09-05 코드·라이브 실측):
//  · 서버 save_venue_rankings 가 `left(coalesce(trim(p_event),''),40)` 로 정규화해 저장한다.
//  · 메인(game_seq 1): 진입 경로에 따라 '' (게임 칩바·기본 칩) **또는** 그 장부 title(장부 마감→순위 초안)
//    둘 다 정상값이다. 어느 한쪽으로 과거 기록을 소급 통일하지 않는다.
//  · 사이드(2+): 항상 그 장부/클락 title 로 저장된다(제목이 비면 칩바·클락이 '사이드N' 라벨을 쓴다).
// 판정이 불확실하면 '완료'로 표시하지 않는다 — 미입력 쪽이 안전하다(버튼이 남아 다시 입력할 수 있다).

import { ledgerGameLabel } from './ledgerLink';

/** 서버가 저장하는 event_name 길이 상한(save_venue_rankings 의 left(...,40)). */
export const MAX_EVENT_NAME = 40;

/** 저장 시점과 같은 규칙으로 event 이름 정규화(trim → 40자). 한글은 BMP 라 char 수 = code unit 수. */
export function normalizeEventName(name?: string | null): string {
  return (name ?? '').trim().slice(0, MAX_EVENT_NAME);
}

/** 메인 게임인가(1 이하 = 메인, 2+ = 사이드). ledgerLink.ledgerGameLabel 과 같은 기준. */
function isMain(gameSeq: number): boolean { return gameSeq <= 1; }

/** 순위 판정·이동의 대상 게임 — 장부 한 개(그 날짜의 게임 하나). */
export interface RankingGame { gameSeq: number; title?: string | null }

/**
 * 그 게임의 순위 입력 화면이 열려야 할 event 이름.
 * 메인은 장부 title 그대로(없으면 '' = 기본 칩) — 장부 마감→순위 초안 경로와 같은 값이라 두 경로가 같은 칩에 착지한다.
 * 사이드는 title(없으면 '사이드N') — '' 로 넘기면 사이드 순위가 메인 칩에 착지한다.
 */
export function rankingEventOf(game: RankingGame): string {
  const t = normalizeEventName(game.title);
  if (isMain(game.gameSeq)) return t;
  return t || ledgerGameLabel(game.gameSeq);
}

/** 그 게임의 순위로 인정할 수 있는 event 이름들(메인만 '' 를 함께 받는다). */
export function rankingEventCandidates(game: RankingGame): string[] {
  const t = normalizeEventName(game.title);
  if (isMain(game.gameSeq)) return t ? ['', t] : [''];
  return [t || ledgerGameLabel(game.gameSeq)];
}

/**
 * 그 게임의 순위가 입력됐는가 — 그 **날짜에 저장된 event 이름 목록**과 대조한다.
 * 목록은 같은 날짜(ranking_date)의 것만 넘긴다(날짜 대조는 호출자 몫).
 */
export function hasRankingForGame(game: RankingGame, savedEventNames: Iterable<string | null | undefined>): boolean {
  const saved = new Set<string>();
  for (const e of savedEventNames) saved.add(normalizeEventName(e));
  if (saved.size === 0) return false;
  return rankingEventCandidates(game).some((c) => saved.has(c));
}
