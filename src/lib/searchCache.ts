// 자동완성류 검색의 동일 쿼리 중복 호출 방지 — in-flight 합치기 + 짧은 TTL LRU 를 입히는 공용 제네릭 팩토리.
// prefill+디바운스 동시발화, 백스페이스 후 같은 글자 재입력, 엔터가 디바운스와 겹치는 등 같은 q 재호출이 흔하다.
// normalize 는 "결과가 동일해지는 입력"을 같은 키로 묶어야 한다(예: ILIKE 검색 → trim+소문자, 전화 → 숫자 끝10자리).
export function makeSearchCache<T>(
  fetcher: (raw: string) => Promise<T[]>,
  normalize: (s: string) => string,
  opts?: { ttlMs?: number; max?: number },
): (raw: string) => Promise<T[]> {
  const ttl = opts?.ttlMs ?? 20_000; // 20s — 입력 세션 동안 동일 q 흡수(신규 데이터 반영은 최대 ttl 지연 허용)
  const max = opts?.max ?? 30;       // 최근 N개만 유지(소형 LRU)
  const cache = new Map<string, { at: number; data: T[] }>();
  const inflight = new Map<string, Promise<T[]>>();
  return (raw: string) => {
    const key = normalize(raw);
    if (!key) return Promise.resolve([]);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) { cache.delete(key); cache.set(key, hit); return Promise.resolve(hit.data); } // LRU 터치
    const live = inflight.get(key);
    if (live) return live; // 동시 동일 q → 한 번만 비행
    const p = fetcher(raw)
      .then((data) => {
        cache.set(key, { at: Date.now(), data });
        if (cache.size > max) { const oldest = cache.keys().next().value; if (oldest !== undefined) cache.delete(oldest); }
        return data;
      })
      .finally(() => { inflight.delete(key); });
    inflight.set(key, p);
    return p;
  };
}
