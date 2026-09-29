// 차단 목록 로더 — 계정 축 가드(2026-09-29 critical-reviewer #15 리허설 후속).
// · 계정이 바뀌면 조회 **전에** 목록을 비운다 — 새 계정 조회가 실패해도 이전 계정의 차단 목록·이름이 남지 않게.
// · 같은 계정의 재조회가 실패하면(던지면) 직전 목록을 그대로 둔다(차단이 조용히 풀리지 않게 — blocks.ts 가 던진다).
// · 늦게 온 응답(이전 계정·이전 호출)은 버린다 — 마지막 호출의 응답만 반영.
export function createBlockLoader<T>(o: { fetch: () => Promise<T>; apply: (v: T) => void; clear: () => void }) {
  let owner: string | null = null;
  let seq = 0;
  return async (uid: string | null) => {
    const my = ++seq;
    if (uid !== owner) { owner = uid; o.clear(); }
    if (!uid) return;
    const v = await o.fetch();
    if (my === seq) o.apply(v);
  };
}
