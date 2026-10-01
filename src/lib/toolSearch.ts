// 도구 카탈로그 검색 — 질의를 공백으로 쪼개 **모든 토큰**이 (이름+설명+키워드) 안에 있으면 적중.
// 왜: 통짜 부분일치였을 때 'MDF 블러프' 가 keywords 'MDF · 블러프 계산기' (가운뎃점 낀 옛 이름)에 안 맞아 0건이었다(2026-10-01).
// 단일어 검색 결과는 통짜 부분일치와 같다.
export function matchesToolQuery(fields: ReadonlyArray<string | undefined>, query: string): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  const hay = fields.map((f) => f ?? '').join(' ').toLowerCase();
  return tokens.every((t) => hay.includes(t));
}
