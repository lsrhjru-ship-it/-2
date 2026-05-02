-- =============================================
-- HookPanel Supabase 스키마
-- Supabase Dashboard > SQL Editor에서 실행
-- =============================================

-- 회원 테이블
CREATE TABLE users (
  id           BIGSERIAL PRIMARY KEY,
  username     TEXT UNIQUE NOT NULL,
  pw_hash      TEXT,                    -- bcrypt 해시 (소셜 로그인은 NULL)
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  display_name TEXT,
  join_date    TEXT,
  online       BOOLEAN DEFAULT false,
  picture      TEXT,
  provider     TEXT DEFAULT 'local',    -- 'local' | 'google' | 'discord'
  discord_id   TEXT UNIQUE,
  google_email TEXT UNIQUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 웹훅 테이블 (URL은 여기에만 저장됨)
CREATE TABLE webhooks (
  id           BIGSERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  channel      TEXT DEFAULT '#채널',
  url          TEXT NOT NULL,           -- Discord 웹훅 URL (클라이언트에 절대 노출 안 됨)
  date         TEXT,
  created_by   TEXT REFERENCES users(username) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 발송 로그 테이블
CREATE TABLE logs (
  id         BIGSERIAL PRIMARY KEY,
  username   TEXT REFERENCES users(username) ON DELETE SET NULL,
  hook_name  TEXT,
  message    TEXT,
  time       TEXT,
  status     TEXT DEFAULT 'success',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- RLS (Row Level Security) - 보안 정책
-- =============================================

ALTER TABLE users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE logs     ENABLE ROW LEVEL SECURITY;

-- 웹훅: service_key(서버)만 접근 가능 (anon key는 접근 불가)
CREATE POLICY "webhooks_service_only" ON webhooks
  USING (false);  -- anon/authenticated 모두 차단, service key만 bypass

-- 로그: service_key(서버)만 접근 가능
CREATE POLICY "logs_service_only" ON logs
  USING (false);

-- 유저: service_key(서버)만 접근 가능
CREATE POLICY "users_service_only" ON users
  USING (false);

-- =============================================
-- 초기 관리자 계정 생성
-- pw_hash는 아래 Node.js로 생성 후 교체:
--   node -e "const b=require('bcryptjs'); b.hash('YOUR_PW',12).then(console.log)"
-- =============================================

INSERT INTO users (username, pw_hash, email, role, display_name, join_date)
VALUES (
  'lsrhjru',
  '$2a$12$REPLACE_THIS_WITH_BCRYPT_HASH',  -- ← 반드시 교체!
  'lsrhjru@gmail.com',
  'admin',
  '관리자',
  '2025-01-01'
);
