CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at)
);

COMMENT ON COLUMN sessions.token_hash IS
  '随机会话令牌的 SHA-256 摘要；原始令牌只放在浏览器 HttpOnly Cookie 中，不返回到 JSON 或日志。';
