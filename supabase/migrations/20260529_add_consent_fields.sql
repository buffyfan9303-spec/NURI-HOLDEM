-- ============================================================
-- Migration: 약관 동의 이력 컬럼 추가
-- 근거: 개인정보보호법 §15·§22, 전자상거래법 §8, 게임산업법 §32
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS agreed_to_terms          boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreed_to_privacy         boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreed_to_anti_gambling   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreed_to_marketing       boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terms_agreed_at           timestamptz;

COMMENT ON COLUMN profiles.agreed_to_terms          IS '[필수] 서비스 이용약관 동의';
COMMENT ON COLUMN profiles.agreed_to_privacy        IS '[필수] 개인정보 수집·이용 동의 (개인정보보호법 §15)';
COMMENT ON COLUMN profiles.agreed_to_anti_gambling  IS '[필수] 불법 환전·사행성 행위 금지 서약 (게임산업법 §32)';
COMMENT ON COLUMN profiles.agreed_to_marketing      IS '[선택] 마케팅 정보 수신 동의';
COMMENT ON COLUMN profiles.terms_agreed_at          IS '동의 일시 (ISO 8601 / KST)';

-- 기존 회원은 NULL 허용(동의 이력 없음), 신규 가입자만 기록됨
ALTER TABLE profiles
  ALTER COLUMN agreed_to_terms        DROP NOT NULL,
  ALTER COLUMN agreed_to_privacy      DROP NOT NULL,
  ALTER COLUMN agreed_to_anti_gambling DROP NOT NULL,
  ALTER COLUMN agreed_to_marketing    DROP NOT NULL;
