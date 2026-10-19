import { createServer } from 'node:http'

const host = '127.0.0.1'
const port = 3001

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(data, null, 2))
}

const server = createServer((request, response) => {
  const pathname = request.url.split('?')[0]

  if (pathname !== '/api/health') {
    sendJson(response, 404, { error: '接口不存在' })
    return
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET')
    sendJson(response, 405, { error: '这个接口只支持 GET 请求' })
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
