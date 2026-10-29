import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createSession, deleteTask, findSession, insertTask, insertUser, listTasks, pool, removeSession, setTaskCompleted, setTaskTitle, userForLogin } from './database.js'
import { hashPassword, verifyPassword } from './passwords.js'
import { checkLoginRate, newSessionToken, requestSessionHash, requireTrustedMutation, sessionCookie, sessionHash } from './sessions.js'

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

function validatedTitle(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw requestError(400, '任务名称不能为空，且必须是文本。')
  }
  const title = value.trim()
  if (title.length > 200) throw requestError(400, '任务名称不能超过 200 个字符。')
  if (title.includes('\u0000')) throw requestError(400, '任务名称不能包含空字符。')
  return title
}

function validatedRegistration(data) {
  if (data === null || typeof data !== 'object' || Array.isArray(data)
    || Object.keys(data).length !== 2 || !Object.hasOwn(data, 'username') || !Object.hasOwn(data, 'password')) {
    throw requestError(400, '注册只接受 username 和 password 两个字段。')
  }
  const username = typeof data.username === 'string' ? data.username.trim().toLowerCase() : ''
  if (!/^[a-z][a-z0-9_]{2,31}$/.test(username)) {
    throw requestError(400, '用户名需为 3–32 位小写字母、数字或下划线，并以字母开头。')
  }
  const { password } = data
  if (typeof password !== 'string' || !password.isWellFormed() || password.includes('\u0000')
    || !password.trim() || [...password].length < 15 || [...password].length > 128) {
    throw requestError(400, '密码需为 15–128 个字符，不能全为空白或包含无效字符。')
  }
  // 密码保留原样，不 trim、不转小写、不截断。
  return { username, password }
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

async function readSessionBody(request) {
  const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase()
  if (contentType !== 'application/json') {
    request.resume()
    throw requestError(415, '请使用 application/json 发送登录或退出请求。')
  }
  return readJson(request)
}

function publicUser(user) {
  return { id: user.id, username: user.username, created_at: user.created_at }
}

async function requireUser(request, response) {
  const tokenHash = requestSessionHash(request)
  const session = tokenHash ? await findSession(tokenHash) : null
  if (!session) {
    request.resume()
    response.setHeader('Set-Cookie', sessionCookie())
    throw requestError(401, '当前未登录，或登录状态已失效。')
  }
  return session
}

const server = createServer(async (request, response) => {
  try {
    const pathname = request.url.split('?')[0]
    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/)
    const sessionAction = pathname === '/api/login' || pathname === '/api/logout'

    if (!['/api/health', '/api/tasks', '/api/register', '/api/me'].includes(pathname) && !sessionAction && !taskMatch) {
      sendJson(response, 404, { error: '接口不存在' })
      return
    }

    const allowedMethods = pathname === '/api/register' || sessionAction ? ['POST']
      : taskMatch ? ['PATCH', 'DELETE'] : pathname === '/api/tasks' ? ['GET', 'POST'] : ['GET']
    if (!allowedMethods.includes(request.method)) {
      response.setHeader('Allow', allowedMethods.join(', '))
      sendJson(response, 405, { error: `这个接口只支持 ${allowedMethods.join('、')} 请求` })
      return
    }

    if (pathname === '/api/me') {
      const session = await requireUser(request, response)
      sendJson(response, 200, { user: publicUser(session), expiresAt: session.expires_at })
      return
    }

    if (sessionAction) {
      requireTrustedMutation(request)
      if (pathname === '/api/login') checkLoginRate(request, response)
      const data = await readSessionBody(request)
      if (pathname === '/api/logout') {
        if (data === null || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).length) {
          throw requestError(400, '退出请求的正文应为一个空对象。')
        }
        const tokenHash = requestSessionHash(request)
        if (tokenHash) await removeSession(tokenHash)
        // 数据库删除成功后才清 Cookie；失败不伪装为已退出。
        response.setHeader('Set-Cookie', sessionCookie())
        sendJson(response, 200, { user: null })
        return
      }
      if (data === null || typeof data !== 'object' || Array.isArray(data)
        || Object.keys(data).length !== 2 || typeof data.username !== 'string' || typeof data.password !== 'string') {
        throw requestError(400, '登录只接受文本 username 和 password。')
      }
      const username = data.username.trim().toLowerCase()
      const { password } = data
      if (!/^[a-z][a-z0-9_]{2,31}$/.test(username) || !password.isWellFormed()
        || password.includes('\u0000') || [...password].length < 1 || [...password].length > 128) {
        throw requestError(400, '请检查用户名格式和密码长度。')
      }
      const user = await userForLogin(username)
      const matches = await verifyPassword(password, user?.password_hash)
      if (!matches || !user) throw requestError(401, '用户名或密码不正确。')
      const token = newSessionToken()
      const expiresAt = await createSession(user.id, sessionHash(token), requestSessionHash(request))
      response.setHeader('Set-Cookie', sessionCookie(token))
      sendJson(response, 200, { user: publicUser(user), expiresAt })
      return
    }

    if (pathname === '/api/register') {
      const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase()
      if (contentType !== 'application/json') {
        request.resume()
        throw requestError(415, '请使用 application/json 发送注册信息。')
      }
      const { username, password } = validatedRegistration(await readJson(request))
      const passwordHash = await hashPassword(password)
      const user = await insertUser(randomUUID(), username, passwordHash)
      if (!user) throw requestError(409, '用户名已被使用，请换一个用户名。')
      // 只返回公开字段；不返回密码/哈希，也不创建登录 Cookie 或令牌。
      sendJson(response, 201, { user })
      return
    }

    let currentUser
    if (pathname === '/api/tasks' || taskMatch) {
      currentUser = await requireUser(request, response)
      // 页面提供的 ID 只用于发现旧页面与实际会话不一致，绝不作为身份来源。
      const expectedUser = request.headers['x-task-board-user']
      if (expectedUser !== undefined && expectedUser !== currentUser.id) {
        request.resume()
        throw requestError(409, '登录用户已变化，请重新确认登录状态后再操作。')
      }
      if (request.method !== 'GET') requireTrustedMutation(request)
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
      if (request.method === 'DELETE') {
        // URL 指定目标；已验证的会话决定谁有权删除。正文不能改变归属。
        request.resume()
        const task = await deleteTask(id, currentUser.id)
        if (!task) throw requestError(404, '任务不存在或无权访问，请重新读取后端任务。')
        sendJson(response, 200, { task })
        return
      }
      const contentType = request.headers['content-type']?.split(';')[0].trim().toLowerCase()
      if (contentType !== 'application/json') {
        request.resume()
        throw requestError(415, '请使用 application/json 发送任务修改。')
      }
      const data = await readJson(request)
      if (data === null || typeof data !== 'object' || Array.isArray(data)
        || Object.keys(data).length !== 1
        || !['completed', 'title'].includes(Object.keys(data)[0])) {
        throw requestError(400, '每次只能修改 title 或 completed 中的一个字段。')
      }
      let task
      if (Object.hasOwn(data, 'title')) {
        task = await setTaskTitle(id, validatedTitle(data.title), currentUser.id)
      } else {
        if (typeof data.completed !== 'boolean') {
          throw requestError(400, 'completed 必须是 true 或 false。')
        }
        task = await setTaskCompleted(id, data.completed, currentUser.id)
      }
      if (!task) throw requestError(404, '任务不存在或无权访问，请重新读取后端任务。')
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
        || Object.keys(data).length !== 1 || !Object.hasOwn(data, 'title')) {
        throw requestError(400, '新增任务只接受 title，归属与初始状态由后端决定。')
      }
      const title = validatedTitle(data.title)

      // 身份和初始完成状态由后端决定，不采用客户端传来的值。
      // 等数据库确认写入后，才返回创建成功。
      const task = await insertTask(randomUUID(), title, currentUser.id)
      sendJson(response, 201, { task })
      return
    }

    if (pathname === '/api/tasks') {
      const tasks = await listTasks(currentUser.id)
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
