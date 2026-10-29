import { createHash, randomBytes } from 'node:crypto'

const cookieName = 'task_board_session'
const cookieSecure = process.env.COOKIE_SECURE === 'true'
const allowedOrigins = new Set((process.env.APP_ORIGINS
  ?? 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(value => value.trim()))
const loginWindows = new Map()

export function sessionHash(token) {
  // 会话令牌有 256 位随机性，与人类选择的密码不同，可用快速哈希做查找键。
  return createHash('sha256').update(token).digest('hex')
}

export function newSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function requestSessionHash(request) {
  const values = (request.headers.cookie ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${cookieName}=`)).map(part => part.slice(cookieName.length + 1))
  if (values.length !== 1 || !/^[a-zA-Z0-9_-]{43}$/.test(values[0])) return null
  return sessionHash(values[0])
}

export function sessionCookie(token = '') {
  return `${cookieName}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${token ? 3600 : 0}${cookieSecure ? '; Secure' : ''}`
}

export function requireTrustedMutation(request) {
  // 自定义请求头触发跨源预检；不开放 CORS。Origin 白名单再检查浏览器请求来源。
  if (request.headers['x-task-board-request'] !== '1'
    || request.headers['sec-fetch-site'] === 'cross-site'
    || (request.headers.origin !== undefined && !allowedOrigins.has(request.headers.origin))) {
    request.resume()
    throw Object.assign(new Error('请求来源未通过检查，请从本地任务板操作。'), { statusCode: 403 })
  }
}

export function checkLoginRate(request, response) {
  const now = Date.now()
  for (const [key, entry] of loginWindows) if (entry.until <= now) loginWindows.delete(key)
  const key = request.socket.remoteAddress
  const entry = loginWindows.get(key) ?? { count: 0, until: now + 60000 }
  if (entry.count >= 20) {
    request.resume()
    response.setHeader('Retry-After', Math.ceil((entry.until - now) / 1000))
    throw Object.assign(new Error('登录尝试过于频繁，请稍后再试。'), { statusCode: 429 })
  }
  entry.count += 1
  loginWindows.set(key, entry)
}
