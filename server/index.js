import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = 3001

// 本课使用写在后端代码里的固定示例，还没有连接数据库。
const tasks = [
  { id: 'server-task-1', title: '读懂任务 API 的响应', completed: true },
  { id: 'server-task-2', title: '在页面读取后端任务', completed: false },
]

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(data, null, 2))
}

const server = createServer((request, response) => {
  const pathname = request.url.split('?')[0]

  if (pathname !== '/api/health' && pathname !== '/api/tasks') {
    sendJson(response, 404, { error: '接口不存在' })
    return
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    sendJson(response, 405, { error: '这个接口只支持 GET 请求' })
    return
  }

  if (pathname === '/api/tasks') {
    sendJson(response, 200, { tasks })
    return
  }

  // 这个接口只确认当前后端能够响应，尚未检查数据库等其他服务。
  sendJson(response, 200, {
    status: 'ok',
    service: 'task-board-api',
    serverTime: new Date().toISOString(),
  })
})

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `端口 ${port} 已被占用，请检查是否已在另一个终端启动了后端。`
    : `后端启动失败：${error.message}`)
  process.exitCode = 1
})

server.listen(port, host, () => {
  console.log(`任务板后端已启动：http://${host}:${port}/api/health`)
  console.log('按 Control + C 停止后端。')
})
