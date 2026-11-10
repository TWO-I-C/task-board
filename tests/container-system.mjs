import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { chromium, expect } from '@playwright/test'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const directory = await mkdtemp(join(tmpdir(), 'task-board-containers-'))
const project = `task-board-check-${randomUUID().slice(0, 8)}`
const envFile = join(directory, 'runtime.env')
const controller = new AbortController()
const env = {
  ...process.env,
  COMPOSE_DB_ADMIN_PASSWORD: randomBytes(32).toString('hex'),
  COMPOSE_DB_APP_PASSWORD: randomBytes(32).toString('hex'),
  // Docker 自动选择测试 API 的宿主机端口。
  TASK_BOARD_API_PORT: '0',
}
let browser
let composeStarted = false
let passed = false

async function compose(args, options = {}) {
  const result = await run('docker', [
    'compose', '-f', join(root, 'compose.yaml'),
    '--env-file', envFile, '-p', project, ...args,
  ], {
    cwd: root, env, signal: controller.signal,
    timeout: 420000, maxBuffer: 4 * 1024 * 1024, ...options,
  })
  return result.stdout.trim()
}

function cancel() {
  process.exitCode = 1
  controller.abort()
  browser?.close().catch(() => {})
}

process.on('SIGINT', cancel)
process.on('SIGTERM', cancel)

try {
  await run('docker', ['info', '--format', '{{.ServerVersion}}'], {
    timeout: 10000, signal: controller.signal,
  })
  const probe = createServer()
  await new Promise((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', resolve)
  })
  const webPort = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  env.TASK_BOARD_WEB_PORT = String(webPort)
  // 显式配置文件避免读取学习配置；失败时也可用它清理本次项目。
  const keys = ['COMPOSE_DB_ADMIN_PASSWORD', 'COMPOSE_DB_APP_PASSWORD',
    'TASK_BOARD_API_PORT', 'TASK_BOARD_WEB_PORT']
  await writeFile(envFile, keys.map(key => `${key}=${env[key]}\n`).join(''), { mode: 0o600 })
  const base = `http://127.0.0.1:${webPort}`

  console.log(`构建并启动临时容器项目 ${project}，网页端口 ${webPort}。`)
  composeStarted = true
  await compose(['up', '-d', '--build', '--wait', '--wait-timeout', '120'])
  browser = await chromium.launch()
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const health = await context.request.get(`${base}/api/health`, { timeout: 10000 })
  assert.equal(health.status(), 200)
  assert.equal((await health.json()).service, 'task-board-api')
  const missing = await context.request.get(`${base}/api/container-check-missing`, { timeout: 10000 })
  assert.equal(missing.status(), 404)
  assert.match(missing.headers()['content-type'], /application\/json/)
  console.log('PASS 1：Nginx 转发健康检查和未知 API，状态码与内容类型正确。')

  const username = `container_${randomUUID().slice(0, 8)}`
  const password = randomUUID()
  await page.goto(base)
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('密码', { exact: true }).fill(password)
  await page.getByLabel('再次输入密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '注册账号', exact: true }).click()
  await expect(page.getByLabel('登录用户名', { exact: true })).toHaveValue(username)
  await page.getByLabel('登录密码', { exact: true }).fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  const board = page.getByRole('region', { name: '我的任务', exact: true })
  const title = `容器验收 ${randomUUID()}`
  await board.getByLabel('任务名称', { exact: true }).fill(title)
  const [response] = await Promise.all([
    page.waitForResponse(response =>
      response.url() === `${base}/api/tasks` && response.request().method() === 'POST'),
    board.getByRole('button', { name: '新增任务', exact: true }).click(),
  ])
  assert.equal(response.status(), 201)
  const { task } = await response.json()
  assert.equal(typeof task.id, 'string')
  assert.ok(task.id)
  const checkbox = board.getByRole('checkbox', { name: `任务：${title}`, exact: true })
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await page.reload()
  await expect(checkbox).toBeChecked()
  console.log('PASS 2：构建出的账户页面可以注册、登录、新增任务、标记完成并刷新读回。')

  const oldDatabaseId = await compose(['ps', '-q', 'db'])
  await compose(['down'])
  await compose(['up', '-d', '--no-build', '--wait', '--wait-timeout', '120'])
  const newDatabaseId = await compose(['ps', '-q', 'db'])
  assert.ok(oldDatabaseId && newDatabaseId)
  assert.notEqual(newDatabaseId, oldDatabaseId)
  await page.reload()
  await expect(checkbox).toBeChecked()
  const tasksResponse = await context.request.get(`${base}/api/tasks`, { timeout: 10000 })
  assert.equal(tasksResponse.status(), 200)
  assert.deepEqual((await tasksResponse.json()).tasks, [{ id: task.id, title, completed: true }])
  console.log('PASS 3：重建容器后，登录会话与同一条已完成任务能从数据库读回。')

  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  const session = await context.request.get(`${base}/api/me`, { timeout: 10000 })
  assert.equal(session.status(), 401)
  console.log('PASS 4：退出登录后，身份接口返回 401。')
  passed = true
} catch (error) {
  process.exitCode = 1
  console.error(controller.signal.aborted ? '容器验收已中止。' : `容器验收失败：${error.message}`)
  if (composeStarted && !controller.signal.aborted) {
    try {
      console.error(await compose(['logs', '--no-color', '--tail', '20'], { timeout: 15000 }))
    } catch (logsError) {
      console.error(`容器日志读取失败：${logsError.message}`)
    }
  }
} finally {
  try {
    await browser?.close()
  } catch (error) {
    process.exitCode = 1
    console.error(`测试浏览器关闭失败：${error.message}`)
  }
  try {
    if (composeStarted) {
      await compose(['down', '--volumes', '--rmi', 'local'], {
        signal: undefined, timeout: 60000,
      })
    }
    await rm(directory, { recursive: true, force: true })
  } catch (error) {
    process.exitCode = 1
    console.error(`临时项目 ${project} 清理失败：${error.message}`)
    console.error(`请检查该项目的 Docker 资源。临时配置目录为 ${directory}。`)
  }
  process.off('SIGINT', cancel)
  process.off('SIGTERM', cancel)
}

if (passed && !process.exitCode) {
  console.log('容器验收通过，临时环境已清理。')
}
