import { randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'

const deriveKey = promisify(scrypt)
// OWASP 的一组 scrypt 参数。每次计算约需 128 MiB，不使用快速通用哈希保存密码。
const options = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }
let activeHashes = 0

export async function hashPassword(password) {
  // 限制同时计算的数量，避免连续请求无限占用内存；这不是完整的注册限流策略。
  if (activeHashes >= 2) {
    throw Object.assign(new Error('注册暂忙，请稍后重试。'), { statusCode: 503 })
  }
  activeHashes += 1
  try {
    const salt = randomBytes(16)
    const key = await deriveKey(password, salt, 64, options)
    return `scrypt$${options.N}$${options.r}$${options.p}$${salt.toString('hex')}$${key.toString('hex')}`
  } finally {
    activeHashes -= 1
  }
}
