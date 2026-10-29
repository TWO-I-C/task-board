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
    throw Object.assign(new Error('数据库暂时无法完成请求，请确认 PostgreSQL 正在运行，且数据库初始化和迁移已完成。'), {
      statusCode: 503,
    })
  }
}

export async function listTasks(ownerId) {
  const result = await query('SELECT id, title, completed FROM tasks WHERE owner_id = $1 ORDER BY created_at, id', [ownerId])
  return result.rows
}

export async function insertTask(id, title, ownerId) {
  // $1、$2、$3 是参数占位符；ownerId 来自已验证的会话。
  const result = await query(
    'INSERT INTO tasks (id, title, owner_id) VALUES ($1, $2, $3) RETURNING id, title, completed',
    [id, title, ownerId],
  )
  return result.rows[0]
}

export async function setTaskCompleted(id, completed, ownerId) {
  // 按 ID 更新一条任务，明确设置目标值；重复提交 true 不会把状态翻回 false。
  const result = await query(
    'UPDATE tasks SET completed = $1 WHERE id = $2 AND owner_id = $3 RETURNING id, title, completed',
    [completed, id, ownerId],
  )
  return result.rows[0] ?? null
}

export async function setTaskTitle(id, title, ownerId) {
  const result = await query(
    'UPDATE tasks SET title = $1 WHERE id = $2 AND owner_id = $3 RETURNING id, title, completed',
    [title, id, ownerId],
  )
  return result.rows[0] ?? null
}

export async function deleteTask(id, ownerId) {
  const result = await query(
    'DELETE FROM tasks WHERE id = $1 AND owner_id = $2 RETURNING id, title, completed',
    [id, ownerId],
  )
  return result.rows[0] ?? null
}

export async function insertUser(id, username, passwordHash) {
  // 用数据库唯一约束处理重名，包括两个请求同时注册的情况；不覆盖已有密码。
  const result = await query(
    `INSERT INTO users (id, username, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (username) DO NOTHING
     RETURNING id, username, created_at`,
    [id, username, passwordHash],
  )
  return result.rows[0] ?? null
}

export async function userForLogin(username) {
  const result = await query('SELECT id, username, created_at, password_hash FROM users WHERE username = $1', [username])
  return result.rows[0] ?? null
}

export async function createSession(userId, tokenHash, previousHash) {
  // 同一 SQL 事务中轮换当前浏览器的会话，清理过期记录；不退出其他有效设备会话。
  const result = await query(
    `WITH revoked AS (
       DELETE FROM sessions WHERE token_hash = $3 OR expires_at <= CURRENT_TIMESTAMP
     )
     INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '1 hour') RETURNING expires_at`,
    [tokenHash, userId, previousHash],
  )
  return result.rows[0].expires_at
}

export async function findSession(tokenHash) {
  const result = await query(
    `SELECT users.id, users.username, users.created_at, sessions.expires_at
     FROM sessions JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = $1 AND sessions.expires_at > CURRENT_TIMESTAMP`,
    [tokenHash],
  )
  return result.rows[0] ?? null
}

export async function removeSession(tokenHash) {
  await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash])
}
