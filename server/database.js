import { loadEnvFile } from 'node:process'
import { fileURLToPath } from 'node:url'
import { userInfo } from 'node:os'
import pg from 'pg'

try {
  loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

// 本地开发默认值；环境变量可让独立测试连接另一份数据库。
export const pool = new pg.Pool({
  host: process.env.PGHOST ?? '127.0.0.1',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'task_board',
  user: process.env.PGUSER ?? userInfo().username,
  max: 5,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 10000,
  statement_timeout: 2000,
})

// 数据库重启会断开空闲连接。记录提示，后续请求可重新建立连接。
pool.on('error', () => {
  console.error('数据库连接已中断；请检查 PostgreSQL 是否运行。')
})

async function query(text, values) {
  try {
    return await pool.query(text, values)
  } catch {
    throw Object.assign(new Error('数据库暂时无法完成请求，请确认 PostgreSQL 正在运行且任务表已初始化。'), {
      statusCode: 503,
    })
  }
}

export async function listTasks() {
  const result = await query('SELECT id, title, completed FROM tasks ORDER BY created_at, id')
  return result.rows
}

export async function insertTask(id, title) {
  // $1、$2 是参数占位符，用户输入不拼接进 SQL 语句。
  const result = await query(
    'INSERT INTO tasks (id, title) VALUES ($1, $2) RETURNING id, title, completed',
    [id, title],
  )
  return result.rows[0]
}
