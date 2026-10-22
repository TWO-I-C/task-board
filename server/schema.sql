-- 初始化只建表，不清空数据，也不在每次启动时重新写入示例。
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY CHECK (length(btrim(id)) > 0),
  title TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
