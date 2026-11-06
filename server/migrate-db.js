import { readFile, readdir } from 'node:fs/promises'
import { pool } from './database.js'

// db:init 创建最初的 tasks 表；此命令按编号升级已有数据库。
const directory = new URL('./migrations/', import.meta.url)
let client
let current = '连接数据库'

try {
  const files = (await readdir(directory)).filter(name => /^\d{3}-[a-z0-9-]+\.sql$/.test(name)).sort()
  client = await pool.connect()
  await client.query('BEGIN')
  // 同一数据库内，两个迁移命令不能同时修改结构。
  await client.query("SELECT pg_advisory_xact_lock(hashtext('task-board-schema-migrations'))")
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const applied = []
  for (const file of files) {
    current = file
    const existing = await client.query('SELECT version FROM schema_migrations WHERE version = $1', [file])
    if (existing.rowCount) continue

    const sql = await readFile(new URL(file, directory), 'utf8')
    await client.query(sql)
    await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file])
    applied.push(file)
  }

  current = '提交迁移'
  await client.query('COMMIT')
  console.log(applied.length ? `迁移完成：${applied.join('、')}` : '没有待执行的迁移，数据库结构已是当前版本。')
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {})
  // 不把数据库配置或数据写入日志；连接在提交时断开也不能宣称一定没成功。
  console.error(`迁移未确认成功（${current}；${error.code ?? '未知错误'}）。请检查 PostgreSQL、.env，并确认已运行 npm run db:init；修复后可重新运行迁移。`)
  process.exitCode = 1
} finally {
  client?.release()
  await pool.end()
}
