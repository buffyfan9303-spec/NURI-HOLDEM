-- 2026-06-23 (감사 #13·#14): 실시간 구독 대상 테이블을 supabase_realtime 퍼블리케이션에 추가.
-- community_posts·comments(게시글/댓글), support_inquiries(1:1 문의). 이미 등록돼 있으면 skip.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='community_posts') then
    alter publication supabase_realtime add table public.community_posts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='support_inquiries') then
    alter publication supabase_realtime add table public.support_inquiries;
  end if;
end $$;
