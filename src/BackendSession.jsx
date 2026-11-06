import { useCallback, useEffect, useRef, useState } from 'react'
import BackendTasks from './BackendTasks.jsx'
import BackendRegistration from './BackendRegistration.jsx'

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
    message: message ?? (session.user ? '登录状态已确认。' : '当前未登录，或会话已失效。') }
}

export default function BackendSession() {
  const [username, setUsername] = useState('')
  const [authView, setAuthView] = useState('login')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState('read')
  const [result, setResult] = useState({ state: 'checking', user: null, message: '正在向后端确认登录状态…' })
  const submitting = useRef(false)
  const channel = useRef(null)
  const needsRecheck = useRef(false)
  const [readVersion, setReadVersion] = useState(0)
  const refreshIdentity = useCallback(() => {
    setAuthView('login')
    setPassword('')
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
      .catch(() => { if (active) setResult({ state: 'error', user: null, message: '暂时无法连接账户服务。请恢复服务后点击“重试连接”。' }) })
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
      setResult(confirmedState(session, '登录成功。'))
    } catch (error) {
      setResult({ state: 'error', user: null, message: accepted
        ? '登录已成功，但暂时无法读取当前身份。请点击“重试连接”。'
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

  function returnToLogin(name, message = '请输入密码登录。') {
    setUsername(name.trim().toLowerCase())
    setPassword('')
    setAuthView('login')
    setResult(confirmedState({ user: null }, message))
  }

  const hasError = result.state === 'error' || result.error
  const signedIn = result.state === 'authenticated' && result.user && !pending
  return (
    <>
      <section className={`backend-connection account-session${signedIn ? ' is-signed-in' : ''}`} aria-labelledby="session-title">
        <div className="connection-heading">
          <div>
            <p className="eyebrow">{signedIn ? '当前账号' : '欢迎回来'}</p>
            <h2 id="session-title">{signedIn ? result.user.username : authView === 'register' ? '创建账号' : '登录你的任务板'}</h2>
          </div>
          {result.user && <button className="cancel-button" type="button" disabled={Boolean(pending)} onClick={logout}>
            {pending === 'logout' ? '正在退出…' : '退出登录'}
          </button>}
        </div>
        {(hasError || (!signedIn && authView === 'login')) &&
          <p className={`connection-message is-${hasError ? 'error' : 'idle'}`} role={hasError ? 'alert' : 'status'}>{result.message}</p>}
        {result.state === 'anonymous' && (authView === 'register'
          ? <BackendRegistration onRegistered={name => returnToLogin(name, '注册成功，请输入密码登录。')} onCancel={name => returnToLogin(name)} />
          : <form className="registration-form login-form" onSubmit={login} noValidate>
              <label htmlFor="login-username">登录用户名</label>
              <input id="login-username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false}
                value={username} disabled={Boolean(pending)} onChange={event => setUsername(event.target.value)} />
              <label htmlFor="login-password">登录密码</label>
              <input id="login-password" name="password" type="password" autoComplete="current-password"
                value={password} disabled={Boolean(pending)} onChange={event => setPassword(event.target.value)} />
              <div className="auth-actions">
                <button className="save-button" type="submit" disabled={Boolean(pending)}>{pending === 'login' ? '正在登录…' : '登录'}</button>
                <button className="cancel-button" type="button" disabled={Boolean(pending)} onClick={() => { setPassword(''); setAuthView('register') }}>创建账号</button>
              </div>
            </form>)}
        {result.state === 'error' && <div className="auth-actions recovery-actions">
          <button className="save-button" type="button" disabled={Boolean(pending)} onClick={checkSession}>重试连接</button>
          <button className="cancel-button" type="button" disabled={Boolean(pending)} onClick={logout}>尝试退出登录</button>
        </div>}
        {signedIn && <p className="connection-note">任务保存在此账号中。切换账号后，会重新加载对应的任务。</p>}
      </section>
      {signedIn && <BackendTasks key={result.user.id} user={result.user} onIdentityChanged={refreshIdentity} />}
    </>
  )
}
