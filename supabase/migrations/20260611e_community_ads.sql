-- 커뮤니티 광고 5칸: 게시판 한 줄 리스트 사이 광고 행. 읽기 공개, 쓰기 관리자.
CREATE TABLE IF NOT EXISTS public.community_ads (
  slot int PRIMARY KEY CHECK (slot BETWEEN 1 AND 5),
  title text NOT NULL DEFAULT '',
  link_url text NOT NULL DEFAULT '',
  advertiser text NOT NULL DEFAULT '',
  expires_at date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.community_ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS community_ads_read ON public.community_ads;
CREATE POLICY community_ads_read ON public.community_ads FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS community_ads_admin_write ON public.community_ads;
CREATE POLICY community_ads_admin_write ON public.community_ads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
INSERT INTO public.community_ads(slot) VALUES (1),(2),(3),(4),(5) ON CONFLICT (slot) DO NOTHING;
