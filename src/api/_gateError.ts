// supabase-js 가 돌려주는 `{ error }` 는 Error 인스턴스가 아닌 평범한 객체다(2026-09-29 실측: 글쓰기·한 줄·딜러·신고 토스트가
// 서버 사유 대신 '…실패했습니다' 로 떨어졌다 — 호출부의 `err instanceof Error ? err.message : 기본` 이 거짓이 되어서).
// 서버가 사용자를 향해 쓴 문장(plpgsql raise = 12초·5초 쿨다운·제재·금칙어, code P0001)은 그대로 올리고,
// RLS 등 기술 오류는 식별자 없는 문장(fallback + 권한 안내)으로 바꾼다 — 판정은 lib/dbError.msgOf 한 곳(댓글 등록과 같은 계약).
import { msgOf } from '../lib/dbError';

export function gateError(error: unknown, fallback: string): Error {
  return new Error(msgOf(error, fallback));
}
