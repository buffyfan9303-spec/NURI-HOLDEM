// 닉네임(profiles.name) 형식 규칙 — 서버 RPC is_name_available 과 같은 기준(공백 정리 후 2~20자).
// 클라·서버가 같은 값을 보게 두는 단일 소스. 문자 종류는 제한하지 않는다(기존 프로필 설정과 동일).
export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 20;

export function isValidDisplayName(raw: string): boolean {
  const n = raw.trim().length;
  return n >= DISPLAY_NAME_MIN && n <= DISPLAY_NAME_MAX;
}
