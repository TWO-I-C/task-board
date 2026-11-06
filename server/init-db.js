import { readFile } from 'node:fs/promises'
import { pool } from './database.js'

try {
  const sql = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
  await pool.query(sql)
  console.log('tasks 表已准备好。已有任务保留，未清空或重新写入示例。')
} catch {
  console.error('初始化失败：请检查 PostgreSQL、.env 配置及项目数据库是否已创建。')
  process.exitCode = 1
} finally {
  await pool.end()
}
