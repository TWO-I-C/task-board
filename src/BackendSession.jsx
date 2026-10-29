import { useCallback, useEffect, useRef, useState } from 'react'
import BackendTasks from './BackendTasks.jsx'

async function currentSession(signal = AbortSignal.timeout(5000)) {
  const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store', signal })
  if (response.status === 401) return { user: null }
  if (response.status !== 200) throw new Error(`无法确认登录状态（HTTP ${response.status}）。`)
  const data = await response.json()
  if (!data?.user || typeof data.user.id !== 'string' || !data.user.id
    || typeof data.user.username !== 'string' || !data.user.username
    || typeof data.expiresAt !== 'string' || Number.isNaN(Date.parse(data.expiresAt))) {
    throw new Error('后端返回的登录状态不完整。')
  }
  return data
}

function confirmedState(session, message) {
  return { ...session, state: session.user ? 'authenticated' : 'anonymous',
    message: message ?? (session.user ? '已向后端确认当前登录用户。' : '当前未登录，或会话已失效。') }
}

export default function BackendSession() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState('read')
  const [result, setResult] = useState({ state: 'checking', user: null, message: '正在向后端确认登录状态…' })
  const submitting = useRef(false)
  const channel = useRef(null)
  const needsRecheck = useRef(false)
  const [readVersion, setReadVersion] = useState(0)
  const refreshIdentity = useCallback(() => {
    setResult({ state: 'checking', user: null, message: '正在向后端确认登录状态…' })
    setPending('read')
    setReadVersion(version => version + 1)
  }, [])

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return
    const connection = new BroadcastChannel('task-board-session-changed')
    channel.current = connection
    connection.onmessage = () => {
      // 通知只用于重新向后端确认，消息本身不提供可信用户身份。
      if (submitting.current) needsRecheck.current = true
      else refreshIdentity()
    }
    return () => { connection.close(); channel.current = null }
  }, [refreshIdentity])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5000)])
    currentSession(signal)
      .then(session => { if (active) setResult(confirmedState(session)) })
      .catch(() => { if (active) setResult({ state: 'error', user: null, message: '暂时无法确认登录状态，请检查后端与数据库后重新确认。' }) })
      .finally(() => { if (active) setPending('') })
    return () => { active = false; controller.abort() }
  }, [readVersion])

  function checkSession() {
    if (pending || submitting.current) return
    refreshIdentity()
  }

  function finishSessionAction() {
    setPassword('')
    setPending('')
    submitting.current = false
    channel.current?.postMessage('changed')
    if (needsRecheck.current) {
      needsRecheck.current = false
      refreshIdentity()
    }
  }

  async function login(event) {
    event.preventDefault()
    if (pending || submitting.current) return
    const normalized = username.trim().toLowerCase()
    if (!/^[a-z][a-z0-9_]{2,31}$/.test(normalized) || !password.isWellFormed()
      || password.includes('\u0000') || [...password].length < 1 || [...password].length > 128) {
      setResult({ state: 'anonymous', user: null, error: true, message: '请填写有效的用户名及 1–128 个字符的密码。' })
      return
    }
    submitting.current = true
    setPending('login')
    setUsername(normalized)
    let accepted = false
    try {
      const response = await fetch('/api/login', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Task-Board-Request': '1' },
        body: JSON.stringify({ username: normalized, password }), signal: AbortSignal.timeout(10000),
      })
      if (response.status === 401) {
        const session = await currentSession()
        setResult({ ...confirmedState(session), error: true,
          message: `用户名或密码不正确（HTTP 401）。${session.user ? '原有登录会话仍然有效。' : '当前未登录。'}` })
        return
      }
      if (response.status === 429) throw new Error('登录尝试过于频繁（HTTP 429），请等待约一分钟后重新确认状态。')
      if (response.status !== 200) throw new Error(`登录未确认成功（HTTP ${response.status}），请恢复连接后重新确认状态。`)
      accepted = true
      const session = await currentSession()
      if (!session.user || session.user.username !== normalized) throw new Error('当前身份尚未确认。')
      setResult(confirmedState(session, '登录成功，后端已通过会话确认你的身份。'))
    } catch (error) {
      setResult({ state: 'error', user: null, message: accepted
        ? '后端已确认登录，但暂时无法读取当前身份。请点击重新确认登录状态。'
        : error.name === 'TimeoutError' || error instanceof TypeError
          ? '连接失败或超时，登录结果未确认。恢复后请重新确认登录状态。' : error.message })
    } finally { finishSessionAction() }
  }

  async function logout() {
    if (pending || submitting.current) return
    submitting.current = true
    setPending('logout')
    try {
      const response = await fetch('/api/logout', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Task-Board-Request': '1' },
        body: JSON.stringify({}), signal: AbortSignal.timeout(5000),
      })
      if (response.status !== 200) throw new Error('退出未确认。')
      const session = await currentSession()
      setResult(confirmedState(session, session.user
        ? '当前仍有有效会话，可能由另一标签页重新登录。请再次确认。' : '已退出登录，当前会话已失效。'))
    } catch {
      setResult({ state: 'error', user: null, message: '退出结果未确认，请恢复连接后重新确认登录状态；不能只凭页面变化认定已退出。' })
    } finally { finishSessionAction() }
  }

  const hasError = result.state === 'error' || result.error
  return (
    <><section className="backend-connection" aria-labelledby="session-title">
      <div className="connection-heading">
        <h2 id="session-title">本地学习实验：登录与会话</h2>
        <button className="connection-button" type="button" disabled={Boolean(pending)} onClick={checkSession}>
          {pending === 'read' ? '正在确认…' : '重新确认登录状态'}
        </button>
      </div>
      <p className={`connection-message is-${hasError ? 'error' : result.user ? 'success' : 'idle'}`}
        role={hasError ? 'alert' : 'status'}>{result.message}</p>
      {result.user && <dl className="connection-details">
        <dt>当前用户</dt><dd>{result.user.username}</dd>
        <dt>用户 ID</dt><dd>{result.user.id}</dd>
        <dt>会话到期时间（UTC）</dt><dd><time dateTime={result.expiresAt}>{result.expiresAt}</time></dd>
      </dl>}
      {result.state === 'anonymous' && <form className="registration-form" onSubmit={login} noValidate>
        <label htmlFor="login-username">登录用户名</label>
        <input id="login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
          value={username} disabled={Boolean(pending)} onChange={event => setUsername(event.target.value)} />
        <label htmlFor="login-password">登录密码</label>
        <input id="login-password" name="password" type="password" autoComplete="current-password"
          value={password} disabled={Boolean(pending)} onChange={event => setPassword(event.target.value)} />
        <button className="save-button" type="submit" disabled={Boolean(pending)}>{pending === 'login' ? '正在登录…' : '登录练习账号'}</button>
      </form>}
      {(result.user || result.state === 'error') && <button className="connection-button session-logout" type="button"
        disabled={Boolean(pending)} onClick={logout}>{pending === 'logout' ? '正在退出…' : '退出当前登录'}</button>}
      <p className="connection-note">同一浏览器的普通标签页共享登录状态。切换账号或退出后会通知其他任务板标签页重新确认；也可手动点击上方按钮。</p>
      <p className="connection-note">会话有效期为 1 小时。下方后端任务只允许当前用户访问，退出或重新确认身份时会清除列表与未提交的输入。</p>
    </section>
    {result.state === 'authenticated' && result.user && !pending
      ? <BackendTasks key={result.user.id} user={result.user} onIdentityChanged={refreshIdentity} />
      : <section className="backend-connection" aria-labelledby="backend-tasks-title">
          <h2 id="backend-tasks-title">本地学习实验：后端任务</h2>
          <p className="connection-note">{pending || result.state === 'error'
            ? '身份尚未确认，暂不展示后端任务。' : '请先登录，再读取和管理属于自己的后端任务。'}</p>
        </section>}
    </>
  )
}
