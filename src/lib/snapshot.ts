// src/lib/snapshot.ts — 캐시 퍼스트 데이터 페인트 (마스터 지시서 Phase 6, SWR)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// apislive 는 프리렌더(HTML 404KB)로 '열자마자 내용이 있다' 를 달성했다.
// 누리는 CSR 이라 같은 무기를 못 쓴다 — 대신 직전 세션의 데이터 스냅샷을
// localStorage 에 두고, 재방문 시 네트워크 응답을 **기다리지 않고** 먼저 그린다.
// 신선한 데이터는 0.3~1초 뒤 소리 없이 교체된다(값만 바뀜, 애니메이션 금지).
//
// ── 규칙 ────────────────────────────────────────────────────────────────────
// · 키: nuri:snap:<리소스>:v<버전> — 타입이 바뀌면 버전을 올려 옛 스냅샷을 자연 폐기
// · TTL 24h: 하루 지난 스냅샷은 없는 것으로 취급(스켈레톤 경로로)
// · 용량 가드 300KB/리소스: venues 의 imageUrl 이 dataURL 인 경우(업로드 직후)
//   스냅샷 하나가 localStorage 5MB 를 삼킬 수 있다 — 초과분은 저장을 포기한다
//   (캐시는 없어도 되는 층이다. 저장 실패가 앱을 건드리면 안 된다).
// · 읽기·쓰기 전부 try/catch — 스토리지 차단 환경(웹뷰·시크릿)에서 무동작.

const PREFIX = 'nuri:snap:';
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 300 * 1024;

interface Envelope<T> { t: number; data: T }

/** 스냅샷 읽기 — 없거나, 만료됐거나, 깨졌으면 null (그냥 스켈레톤 경로로 가면 된다) */
export function readSnap<T>(name: string, version = 1): T | null {
  try {
    const raw = localStorage.getItem(`${PREFIX}${name}:v${version}`);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env.t !== 'number' || Date.now() - env.t > TTL_MS) return null;
    return env.data;
  } catch { return null; }
}

/** 스냅샷 쓰기 — 크면 버리고, 실패해도 조용히 넘어간다 */
export function writeSnap(name: string, data: unknown, version = 1): void {
  try {
    const raw = JSON.stringify({ t: Date.now(), data } satisfies Envelope<unknown>);
    if (raw.length > MAX_BYTES) return; // dataURL 이미지 등 — 캐시를 포기하는 게 맞다
    localStorage.setItem(`${PREFIX}${name}:v${version}`, raw);
  } catch { /* quota 초과·차단 환경 — 캐시는 선택 사양 */ }
}
