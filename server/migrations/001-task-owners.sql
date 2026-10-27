-- 由 migrate-db.js 在事务中执行，并记录版本；已应用的文件不要再修改。
CREATE TABLE users (
  id TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),
  username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z][a-z0-9_]{2,31}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 先允许 NULL，保留还没有归属的旧任务；后续接入认证时再处理归属。
ALTER TABLE tasks
  ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT;

COMMENT ON COLUMN tasks.owner_id IS
  '任务归属用户；NULL 表示尚未分配，不代表公开。当前 API 尚未执行用户权限检查。';
