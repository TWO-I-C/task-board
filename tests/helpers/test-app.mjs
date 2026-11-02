import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { createServer as createViteServer } from 'vite'

const run = promisify(execFile)
const root = fileURLToPath(new URL('../../', import.meta.url))

async function unusedPort() {
  const probe = createServer()
  await new Promise((resolve, reject) => {
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', resolve)
  })
  const port = probe.address().port
  await new Promise(resolve => probe.close(resolve))
  return port
}

async function stopChild(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  const exited = once(child, 'exit')
  child.kill('SIGTERM')
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000)
  try { await exited } finally { clearTimeout(timer) }
}

// 只建立临时集群；不接受学习数据库的连接地址，也不复用已运行的应用。
export async function startTestApp() {
  const bin = process.env.POSTGRES_BIN ?? '/Applications/Postgres.app/Contents/Versions/latest/bin'
  const directory = await mkdtemp(join(tmpdir(), 'task-board-e2e-'))
  const dataDir = join(directory, 'data')
  let backend, frontend, databaseMayRun = false, stopped = false

  async function stop() {
    if (stopped) return
    stopped = true
    const errors = []
    try { await frontend?.close() } catch (error) { errors.push(error) }
    try { await stopChild(backend) } catch (error) { errors.push(error) }
    let databaseStopped = !databaseMayRun
    if (databaseMayRun) {
      try {
        await run(join(bin, 'pg_ctl'), ['-D', dataDir, '-w', '-t', '10', 'stop', '-m', 'fast'])
        databaseStopped = true
      } catch (error) {
        try {
          await run(join(bin, 'pg_ctl'), ['-D', dataDir, 'status'])
          errors.push(error)
        } catch (statusError) {
          // pg_ctl 的退出码 3 表示没有服务器在运行。
          if (statusError.code === 3) databaseStopped = true
          else errors.push(statusError)
        }
      }
    }
    if (databaseStopped) await rm(directory, { recursive: true, force: true })
    if (errors.length) throw new AggregateError(errors, `临时测试环境未完全清理，请检查 ${directory}`)
  }

  try {
    const pgPort = await unusedPort()
    const frontendPort = await unusedPort()
    const url = `http://127.0.0.1:${frontendPort}`
    const env = {
      ...process.env,
      PGHOST: '127.0.0.1', PGPORT: String(pgPort), PGDATABASE: 'postgres',
      PGUSER: 'task_board_e2e', PGPASSWORD: '', PGSSLMODE: 'disable',
      PORT: '0', APP_ORIGINS: url, COOKIE_SECURE: 'false',
    }
    await run(join(bin, 'initdb'), ['-D', dataDir, '-U', 'task_board_e2e', '--auth=trust', '--encoding=UTF8', '--locale=C'])
    databaseMayRun = true
    await run(join(bin, 'pg_ctl'), ['-D', dataDir, '-l', join(directory, 'postgres.log'), '-w', '-t', '10', 'start', '-o', `-h 127.0.0.1 -p ${pgPort} -k ''`])
    await run(process.execPath, ['server/init-db.js'], { cwd: root, env })
    await run(process.execPath, ['server/migrate-db.js'], { cwd: root, env })

    backend = spawn(process.execPath, ['server/index.js'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    // 消费日志，避免阻塞；测试报告无需保存后端的整份日志。
    backend.stderr.resume()
    const backendURL = await new Promise((resolve, reject) => {
      let startup = ''
      const timer = setTimeout(() => reject(new Error('独立测试后端启动超时')), 5000)
      backend.stdout.on('data', chunk => {
        startup += chunk.toString()
        const match = startup.match(/http:\/\/127\.0\.0\.1:(\d+)\/api\/health/)
        if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`) }
      })
      backend.once('error', error => { clearTimeout(timer); reject(error) })
      backend.once('exit', code => { clearTimeout(timer); reject(new Error(`独立测试后端提前退出：${code}`)) })
    })
    frontend = await createViteServer({
      root,
      configFile: join(root, 'vite.config.js'),
      logLevel: 'error',
      server: {
        host: '127.0.0.1', port: frontendPort, strictPort: true,
        proxy: { '/api': backendURL },
      },
    })
    await frontend.listen()
    return { url, stop }
  } catch (error) {
    await stop()
    throw error
  }
}
