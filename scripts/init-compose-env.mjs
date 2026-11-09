import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'

const path = new URL('../.env.compose', import.meta.url)
const settings = ['COMPOSE_DB_ADMIN_PASSWORD', 'COMPOSE_DB_APP_PASSWORD']
  .map(key => `${key}=${randomBytes(32).toString('hex')}\n`).join('')

try {
  await writeFile(path, settings, { mode: 0o600, flag: 'wx' })
  console.log('已生成 .env.compose。后续启动这个练习库时请保留此文件。')
} catch (error) {
  if (error.code !== 'EEXIST') throw error
  console.log('继续使用已有的 .env.compose。')
}
