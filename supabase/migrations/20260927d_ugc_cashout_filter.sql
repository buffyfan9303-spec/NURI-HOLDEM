-- ✅ 적용 완료 2026-09-27 (nuri-lead, MCP execute_sql). community-team 리허설(DO+RAISE 롤백)을 리드가 검토 후 적용.
-- community-team 2026-09-27. UGC 금칙어 '환전' 계열 확장 + 외치기 필터 단일화. 적용은 nuri-lead.
-- 원문 단일 출처: src/lib/content-filter.ts 의 CASH_OUT_SOURCE — 한 글자라도 다르면 화면은 통과시키고 서버가 거절한다.
--   표(막을 13 · 통과 13)는 src/lib/content-filter.test.ts 와 같고, 운영 리허설(DO + 끝 RAISE)로 서버에서도 같은 판정을 확인했다.
-- 이전 서버식의 차이: ① 대상 없는 권유("환전 해드립니다") 통과 → 차단 ② "현금화는 불법입니다"·"칩 환전은 안 됩니다" 차단(오탐) → 통과
--   ③ shout_blocked 가 금칙어를 **따로 복사**해 들고 있었다(칩 살게/팔게는 외치기만, 나머지는 같음) → contains_blocked_ugc 를 부르게 해 한 벌로.
-- CREATE OR REPLACE 는 ACL 을 보존한다(CLAUDE.md 보안 3 · 2026-09-12 실측). 반환형·인자 불변.
create or replace function public.contains_blocked_ugc(p_text text) returns boolean
language sql immutable set search_path = public, pg_temp as $f$
  select coalesce(p_text,'') ~* '현금화(?!\s*(?:은|는|이|가|을|를)?\s*(?:불가|금지|불법|절대|사절|안\s*(?:됩|됨|돼|되|해|받)|하지\s*않|받지\s*않))|현금\s*교환(?!\s*(?:은|는|이|가|을|를)?\s*(?:불가|금지|불법|절대|사절|안\s*(?:됩|됨|돼|되|해|받)|하지\s*않|받지\s*않))|(?:칩|gp|시드|포인트|게임\s*머니|머니|코인|상금|현금)\s*환전(?!\s*(?:은|는|이|가|을|를)?\s*(?:불가|금지|불법|절대|사절|안\s*(?:됩|됨|돼|되|해|받)|하지\s*않|받지\s*않))|환전\s*(?:칩|gp)|시드\s*현금|현금\s*시드|환전\s*(?:해\s*(?:드|줌|줍|줄|준|줘)|합니다|됩니다|돼요|되요|가능|상담|업체|대행|연락|카톡|톡|텔레|원하시|하실\s*분|구합|받습|받아요|받아\s*드|문의)(?!\S*\s*(?:않|못|없|불가|금지|사절|받지))'
      or coalesce(p_text,'') ~* '칩\s*(직|판)매|칩\s*구매|칩\s*삽니다|칩\s*팝니다|칩\s*거래|칩\s*살게|칩\s*팔게|게임\s*머니\s*거래|불법\s*카지노|사설\s*도박|토토\s*환전|배팅\s*사이트|먹튀|총판\s*모집|도박\s*사이트|대리\s*게임|대리\s*참가|대리\s*플레이|대리\s*바이인|대신\s*플레이|게임\s*대행'
      or coalesce(p_text,'') ~ '[0-9]{3,6}-[0-9]{2,6}-[0-9]{4,8}';
$f$;

create or replace function public.shout_blocked(p_text text) returns boolean
language sql immutable set search_path = public, pg_temp as $f$
  select public.contains_blocked_ugc(p_text)
      or coalesce(p_text, '') ~* 'https?://|www\.';
$f$;
