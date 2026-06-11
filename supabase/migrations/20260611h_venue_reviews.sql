-- 매장 후기·별점: 체크인 인증자만 작성(서버 RLS 강제). 매장당 1인 1후기(수정 가능).
-- 적용일: 2026-06-11 (apply_migration 'venue_reviews')
CREATE TABLE IF NOT EXISTS public.venue_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  nickname text NOT NULL DEFAULT '',
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_venue_reviews_venue ON public.venue_reviews(venue_id, created_at DESC);
ALTER TABLE public.venue_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS venue_reviews_read ON public.venue_reviews;
CREATE POLICY venue_reviews_read ON public.venue_reviews FOR SELECT TO anon, authenticated USING (true);

-- 작성: 본인 + 해당 매장 체크인 기록 보유자만(방문 인증)
DROP POLICY IF EXISTS venue_reviews_insert ON public.venue_reviews;
CREATE POLICY venue_reviews_insert ON public.venue_reviews FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.checkins c WHERE c.user_id = auth.uid() AND c.venue_id = venue_reviews.venue_id)
  );

-- 수정: 본인 것만(체크인 조건은 작성 시 이미 검증됨)
DROP POLICY IF EXISTS venue_reviews_update ON public.venue_reviews;
CREATE POLICY venue_reviews_update ON public.venue_reviews FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- 삭제: 본인 또는 운영자
DROP POLICY IF EXISTS venue_reviews_delete ON public.venue_reviews;
CREATE POLICY venue_reviews_delete ON public.venue_reviews FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
