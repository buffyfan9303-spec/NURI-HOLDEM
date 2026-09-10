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

/** 이 게임의 순위로 **이미 저장된 행 수** — hasRankingForGame 과 같은 후보 집합으로 센다(교체 경고용). */
export function countRankingsForGame(game: RankingGame, savedEventNames: Iterable<string | null | undefined>): number {
  const cands = new Set(rankingEventCandidates(game));
  let n = 0;
  for (const e of savedEventNames) if (cands.has(normalizeEventName(e))) n++;
  return n;
}

/**
 * 장부 명단의 '실명(닉네임)' 합성 표기 → 순위 칸 {닉네임, 실명}.
 *
 * 왜 한 곳에 두나(2026-09-11): 장부(NuriPosLedger pickRegistered)는 가입자를 고르면 `실명(닉네임)` 으로 적는다.
 * 그 문자열을 통째로 닉네임 칸에 넣으면 ① 회원 대조가 전부 '비회원'이 되어 그 선수의 전적·뱃지에 한 건도 안 붙고,
 * ② 공개 순위표는 닉네임 칸을 마스킹하지 않으므로 **실명이 그대로 노출**된다(2026-09-10 서버 마스킹 우회).
 * 순위 화면(VenueManageTab.addFromLedger·자동완성 '장부' 칩)은 이 분리를 이미 하고 있었고 클락 END 저장만 빠져 있었다 —
 * 같은 규칙을 세 곳이 각자 들고 있으면 또 한 곳만 고쳐지므로 여기로 모은다.
 *  · 괄호가 없으면 통째로 닉네임이다(비회원 자유 입력).
 *  · 경계는 **첫 여는 괄호**다(순위 화면의 기존 규칙 그대로). 서버 accrue_voucher 는 마지막 괄호로 가르므로
 *    중첩 괄호 이름에서만 둘이 갈린다 — 실제 데이터에 없는 경우라 여기서 통일하지 않는다.
 *  · 장부는 닉네임이 없는 회원을 '실명()' 로 적는다 → 닉네임 '' · 실명만 채운다. 실명을 닉네임 칸에 넣지 않는다
 *    (공개 순위표는 닉네임 칸을 가리지 않는다). 호출부가 빈 닉네임을 거절해야 한다.
 */
export function splitLedgerName(raw: string): { nickname: string; realName: string } {
  const s = raw.trim();
  const m = s.match(/^(.+?)\((.*)\)$/);
  return { nickname: (m ? m[2] : s).trim(), realName: (m ? m[1] : '').trim() };
}

/**
 * 클락 입상 순위 입력칸 → 저장 엔트리. 이름을 분리하고 **비어 있는 줄만** 버린다.
 * 닉네임이 빈 엔트리('실명()')는 남겨 둔다 — 여기서 조용히 버리면 뒤 등수가 한 칸씩 당겨진다.
 * 호출부(클락 END)가 등수를 짚어 거절한다.
 */
export function finishEntriesFromRows(rows: { name: string }[]): { nickname: string; realName: string }[] {
  return rows.filter((r) => r.name.trim()).map((r) => splitLedgerName(r.name));
}

/**
 * 클락 END 저장의 **대회 이름과 교체 경고 수치**.
 *
 * 서버 save_venue_rankings 는 (날짜, event_name) **한 이름만** 지우고 넣는다. 그런데 메인 게임은 ''(기본 칩)와
 * 장부 제목 둘 다 정상값이라(파일 머리말), 경고는 둘을 세면서 저장은 한 이름만 지우면
 * "교체됩니다" 가 거짓이 되고 두 벌이 남는다(2026-09-11 리뷰). 그래서 저장 이름을 **이미 행이 있는 후보**로 맞춘다:
 *   rankingEventOf(game) 에 행이 있으면 그것 → 없고 다른 후보에 행이 있으면 그 후보 → 아무 데도 없으면 rankingEventOf(game).
 * leftover = 다른 후보 이름으로 남는 행 수(서버가 안 지움). 0 이 아니면 경고문에 적어 사실대로 말한다.
 */
export function rankingSaveTarget(
  game: RankingGame, savedEventNames: Iterable<string | null | undefined>,
): { eventName: string; replaces: number; leftover: number } {
  const counts = new Map<string, number>();
  for (const e of savedEventNames) { const k = normalizeEventName(e); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const has = (n: string) => (counts.get(n) ?? 0) > 0;
  const preferred = rankingEventOf(game);
  const eventName = has(preferred) ? preferred : (rankingEventCandidates(game).find(has) ?? preferred);
  const replaces = counts.get(eventName) ?? 0;
  const leftover = rankingEventCandidates(game).filter((c) => c !== eventName).reduce((n, c) => n + (counts.get(c) ?? 0), 0);
  return { eventName, replaces, leftover };
}
