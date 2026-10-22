import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { insertTask, listTasks, pool, setTaskCompleted } from './database.js'

const host = '127.0.0.1'
const port = Number(process.env.PORT ?? 3001)

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(data, null, 2))
}

function requestError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode })
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let chunks = []
    let size = 0

    request.on('data', (chunk) => {
      size += chunk.length
      if (size > 16 * 1024) {
        chunks = []
        reject(requestError(413, '请求内容过大，请减少发送的内容。'))
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      if (size > 16 * 1024) return
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(requestError(400, '请求正文必须是有效的 JSON。'))
      }
    })
    request.on('error', () => reject(requestError(400, '读取请求失败。')))
    request.on('aborted', () => reject(requestError(400, '请求已中断。')))
  })
}

const server = createServer(async (request, response) => {
  try {
    const pathname = request.url.split('?')[0]
    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/)

    if (pathname !== '/api/health' && pathname !== '/api/tasks' && !taskMatch) {
      sendJson(response, 404, { error: '接口不存在' })
      return
    }

    const allowedMethods = taskMatch ? ['PATCH'] : pathname === '/api/tasks' ? ['GET', 'POST'] : ['GET']
    if (!allowedMethods.includes(request.method)) {
      response.setHeader('Allow', allowedMethods.join(', '))
      sendJson(response, 405, { error: `这个接口只支持 ${allowedMethods.join('、')} 请求` })
      return
    }

    if (taskMatch) {
      let id
      try {
        id = decodeURIComponent(taskMatch[1])
      } catch {
        throw requestError(400, '任务 ID 编码无效。')
      }
      if (!id.trim() || id.includes('\u0000') || id.includes('/')) {
        throw requestError(400, '任务 ID 无效。')
      }
      const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase()
      if (contentType !== 'application/json') {
        request.resume()
        throw requestError(415, '请使用 application/json 发送任务状态。')
      }
      const data = await readJson(request)
      if (data === null || typeof data !== 'object' || Array.isArray(data)
        || typeof data.completed !== 'boolean' || Object.keys(data).length !== 1) {
        throw requestError(400, '本接口只接受 completed 字段，值必须是 true 或 false。')
      }
      const task = await setTaskCompleted(id, data.completed)
      if (!task) throw requestError(404, '任务不存在，请重新读取后端任务。')
      sendJson(response, 200, { task })
      return
    }

    if (pathname === '/api/tasks' && request.method === 'POST') {
      const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase()
      if (contentType !== 'application/json') {
        request.resume()
        throw requestError(415, '请使用 application/json 发送任务。')
      }

      const data = await readJson(request)
      if (data === null || typeof data !== 'object' || Array.isArray(data)
        || typeof data.title !== 'string' || data.title.trim() === '') {
        throw requestError(400, '任务名称不能为空，且必须是文本。')
      }
      const title = data.title.trim()
      if (title.length > 200) {
        throw requestError(400, '任务名称不能超过 200 个字符。')
      }
      if (title.includes('\u0000')) {
        throw requestError(400, '任务名称不能包含空字符。')
      }

      // 身份和初始完成状态由后端决定，不采用客户端传来的值。
      // 等数据库确认写入后，才返回创建成功。
      const task = await insertTask(randomUUID(), title)
      sendJson(response, 201, { task })
      return
    }

    if (pathname === '/api/tasks') {
      const tasks = await listTasks()
      sendJson(response, 200, { tasks })
      return
    }

    // 这个接口只确认后端进程能够响应，不检查数据库。
    sendJson(response, 200, {
      status: 'ok',
      service: 'task-board-api',
      serverTime: new Date().toISOString(),
    })
  } catch (error) {
    if (!response.destroyed && !response.headersSent) {
      sendJson(response, error.statusCode ?? 500, {
        error: error.statusCode ? error.message : '后端处理请求失败，请稍后重试。',
      })
    }
  }
})

let closing = false
function shutdown() {
  if (closing) return
  closing = true
  server.close(() => {
    pool.end().catch(() => { process.exitCode = 1 })
  })
  server.closeIdleConnections()
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已被占用，请检查是否已在另一个终端启动了后端。`
    : `后端启动失败：${error.message}`)
  process.exitCode = 1
})

server.listen(port, host, () => {
  console.log(`任务板后端已启动：http://${host}:${server.address().port}/api/health`)
  console.log('按 Control + C 停止后端。')
})
