-- 保留已有用户；NULL 表示尚未设置密码，不能据此登录。
ALTER TABLE users ADD COLUMN password_hash TEXT
  CHECK (password_hash IS NULL OR length(password_hash) > 0);

COMMENT ON COLUMN users.password_hash IS
  '密码派生记录：算法、成本参数、随机盐、哈希；不保存原始密码。NULL 表示未设置密码。';
