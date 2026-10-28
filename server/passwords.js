import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)
// OWASP 的一组 scrypt 参数。每次计算约需 128 MiB，不使用快速通用哈希保存密码。
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }
let activeHashes = 0

async function derivePassword(password, salt) {
  // 注册与登录共享计算上限，避免连续请求无限占用内存。
  if (activeHashes >= 2) {
    throw Object.assign(new Error('密码处理暂忙，请稍后重试。'), { statusCode: 503 })
  }
  activeHashes += 1
  try {
    return await deriveKey(password, salt, 64, options)
  } finally {
    activeHashes -= 1
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await derivePassword(password, salt)
  return `scrypt$${options.N}$${options.r}$${options.p}$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  // 只接受当前支持的参数，避免损坏的存储记录要求无界计算。
  const match = typeof stored === 'string'
    ? /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(stored) : null
  // 用户不存在、没有密码或记录损坏时也做一次等成本计算，减少明显的响应时间差。
  const salt = match ? Buffer.from(match[1], 'hex') : Buffer.alloc(16)
  const expected = match ? Buffer.from(match[2], 'hex') : Buffer.alloc(64)
  const actual = await derivePassword(password, salt)
  return timingSafeEqual(actual, expected) && Boolean(match)
}
