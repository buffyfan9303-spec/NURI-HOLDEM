// 순위 입력 임시 초안 — '저장 전 입력분'이 통째로 사라지던 문제 대응.
//
// 왜 필요한가: 순위 입력 화면은 (매장·날짜·게임)이 바뀌면 로더가 rows 를 통째로 갈아끼운다.
//   20명을 다 친 상태에서 사이드 게임 칩을 잘못 누르면 빈 줄 하나로 리셋됐고, 저장 전이라
//   서버에도 없어 되돌릴 방법이 없었다(대회 직후 한 손 조작에서 실제로 나오기 쉬운 사고).
// 왜 확인 다이얼로그가 아닌가: 손실 경로가 칩 오탭만이 아니다 — 장부→순위 딥링크(draft prop),
//   방문 섹션 상한 초과로 인한 언마운트, 새로고침은 사용자 탭이 아니라 다이얼로그로 못 막는다.
// 왜 (매장·날짜·게임) 키인가: 그 세 값이 '지금 무엇을 입력 중인지'를 정의한다. 키가 같으면
//   되돌아왔을 때 그대로 살아나므로, 잘못 누른 칩을 다시 눌러 원상복구할 수 있다.
// 왜 메모리 Map 을 앞에 두는가: 사파리 프라이빗/스토리지 차단 환경은 localStorage 접근이 예외를
//   던져 초안이 통째로 무력화된다. 최소한 같은 세션 안의 전환만큼은 메모리로 지킨다
//   (VenuePage 랭킹 패널 캐시가 쓰는 '메모리 우선 + LS 폴백'과 같은 방식).
// 왜 TTL 인가: 저장이 (날짜+게임) 단위 '전체 교체'(save_venue_rankings)라, 오래된 초안이
//   되살아나 저장되면 이미 저장된 순위를 덮어쓴다. 복구 가치가 있는 건 대회 다음날까지다.

// 2026-09-05(법적위험완화 v3): prize·voucher·note 를 뺐다 — 순위 입력은 참가자·등수만 받는다.
// 48h 안의 구형 초안에 남은 세 필드는 readRowsDraft 가 버린다(신규 저장·발급으로 재유입 금지).
export interface RankRow {
  nickname: string; realName: string;
}

/** 구형 초안 호환 — 참가자 필드만 남긴다(prize·voucher·note 는 어떤 경로로도 되살리지 않는다). */
const sanitizeRows = (rows: unknown): RankRow[] =>
  (Array.isArray(rows) ? rows : []).map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    return { nickname: String(o.nickname ?? ''), realName: String(o.realName ?? '') };
  });

const PREFIX = 'nuri:rank-draft:';
export const RANK_DRAFT_TTL_MS = 48 * 60 * 60 * 1000; // 48시간
const MAX_BYTES = 200_000; // 비정상적으로 큰 초안은 LS 쿼터를 먹으므로 메모리에만 둔다

interface DraftEntry { ts: number; rows: RankRow[] }
const mem = new globalThis.Map<string, DraftEntry>();

export const rankDraftKey = (venueId: string, date: string, eventName: string) =>
  `${PREFIX}${venueId}:${date}:${eventName}`;

/** 의미 있는 입력이 하나라도 있는가 — 빈 줄만 있는 상태를 초안으로 남기면 복원이 오히려 방해된다 */
export function hasRowContent(rows: RankRow[]): boolean {
  return rows.some((r) => r.nickname.trim() || r.realName.trim());
}

export function writeRowsDraft(key: string, rows: RankRow[], now = Date.now()): void {
  if (!hasRowContent(rows)) { clearRowsDraft(key); return; }
  const entry: DraftEntry = { ts: now, rows };
  mem.set(key, entry);
  try {
    const s = JSON.stringify(entry);
    if (s.length <= MAX_BYTES) localStorage.setItem(key, s);
  } catch { /* 스토리지 차단·쿼터 초과 — 메모리 초안만으로 계속 동작 */ }
}

export function readRowsDraft(key: string, now = Date.now()): RankRow[] | null {
  const fresh = (e: DraftEntry | undefined | null) =>
    e && Array.isArray(e.rows) && e.rows.length > 0 && now - e.ts <= RANK_DRAFT_TTL_MS ? sanitizeRows(e.rows) : null;
  const m = fresh(mem.get(key));
  if (m) return m;
  try {
    const s = localStorage.getItem(key);
    if (!s) return null;
    const e = JSON.parse(s) as DraftEntry;
    const r = fresh(e);
    if (!r) { clearRowsDraft(key); return null; } // 만료분은 읽는 김에 정리
    mem.set(key, e);
    return r;
  } catch { return null; }
}

export function clearRowsDraft(key: string): void {
  mem.delete(key);
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

/** 만료 초안 일괄 정리 — 매장·날짜·게임마다 키가 하나씩 쌓이므로 진입 시 1회 청소한다 */
export function pruneRowsDrafts(now = Date.now()): number {
  let removed = 0;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      let expired = true;
      try {
        const e = JSON.parse(localStorage.getItem(k) ?? '{}') as { ts?: number };
        expired = !e.ts || now - e.ts > RANK_DRAFT_TTL_MS;
      } catch { expired = true; } // 깨진 값도 정리 대상
      if (expired) { clearRowsDraft(k); removed++; }
    }
  } catch { /* 스토리지 차단 */ }
  return removed;
}

/**
 * 행 이동(등수 재배치) — 배열 순서가 곧 등수다(save_venue_rankings 가 배열 순서대로 position 을 매긴다).
 * 왜 초안 모듈에 두는가: 초안 커밋이 JSON.stringify(rows) 를 기준선과 비교해 '손댔는지'를 판정한다.
 *   이동이 행 객체를 새로 만들면 원래 순서로 되돌려도 문자열이 달라져 초안이 안 지워지고,
 *   '저장 전 입력분' 배너가 영영 남는다. 그래서 '객체는 그대로 두고 순서만 바꾼다'와
 *   '헛 이동은 같은 배열을 그대로 돌려준다'(=rows 참조가 안 바뀌어 커밋 효과가 헛돌지 않는다)를
 *   이 파일의 계약으로 못 박고 테스트로 고정한다.
 */
export function moveRankRow<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = rows.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
