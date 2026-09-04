-- 20260904e — 공개 표시용 읽기 RPC 3종을 anon 에도 허용
--
-- 증상(오너 콘솔 2026-09-04): 비로그인 화면에서 401 4건 —
--   rpc/shout_rules · rpc/get_equipped_marks · rpc/get_nick_colors(2회)
--
-- 원인: 셋 다 authenticated 전용이었다. 그런데 이 값들은 **이미 공개된 화면에 그려지는 장식 정보**다.
--   비로그인 방문자에게도 커뮤니티 글 목록의 닉네임은 보이는데, 색과 마크만 조용히 빠져
--   '로그인하면 화면이 달라지는' 일관성 없는 상태였다(에러도 매 로드마다 4건).
--
-- 안전성 검토(CLAUDE.md 보안 §6 '응답에 민감 컬럼을 싣지 않는다'):
--   · shout_rules()           → shop_skus 의 가격·시간뿐. 이미 UI 에 '외치기 50점'으로 노출 중.
--   · get_nick_colors(ids)    → id → 색 토큰. 소유(cosmetic_unlocks) 검증을 통과한 것만.
--   · get_equipped_marks(ids) → id → 마크 키. 획득/대여 검증을 통과한 것만.
--   셋 다 ci_hash·이메일·전화·role 등 민감 컬럼을 반환하지 않고, 인자 uuid 는 호출자가 이미
--   화면에서 보고 있는 작성자 id 다. → 읽기 RPC 의 anon 허용 조건(§3)에 부합.
--
-- 함수 본문은 건드리지 않는다(CREATE OR REPLACE 아님) → 기존 ACL 유지 + anon 추가만.
-- 롤백: revoke execute on function public.shout_rules() from anon; (나머지 2개도 동일)

grant execute on function public.shout_rules()              to anon;
grant execute on function public.get_nick_colors(uuid[])    to anon;
grant execute on function public.get_equipped_marks(uuid[]) to anon;

notify pgrst, 'reload schema';
