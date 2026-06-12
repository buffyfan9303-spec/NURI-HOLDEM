-- 포인트 상점(랭킹 탭): 활동점수 도달로 해금되는 코스메틱 마크 — 장착 상태 저장(차감 없음, 등급 영향 없음)
alter table public.profiles add column if not exists equipped_mark text;
comment on column public.profiles.equipped_mark is '랭킹 상점에서 장착한 마크 키(예: spade_gold). 점수 도달 해금형 — 금전 가치 없음';
