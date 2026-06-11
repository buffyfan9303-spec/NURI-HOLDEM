-- 앱 운영 설정(키-값): 부스트 문의 연락처 등. 읽기는 공개, 쓰기는 관리자만.
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS app_settings_admin_write ON public.app_settings;
CREATE POLICY app_settings_admin_write ON public.app_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- 부스트 문의 연락처 자리(값은 관리자 화면에서 입력)
INSERT INTO public.app_settings(key, value) VALUES ('boost_contact_email', ''), ('boost_contact_phone', '')
ON CONFLICT (key) DO NOTHING;
