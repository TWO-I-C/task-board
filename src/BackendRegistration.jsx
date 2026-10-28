import { useRef, useState } from 'react'

export default function BackendRegistration() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [result, setResult] = useState({ state: 'idle', message: '创建一个本地练习账号，体验注册流程。' })
  const submitting = useRef(false)
  const busy = result.state === 'loading'

  async function register(event) {
    event.preventDefault()
    if (submitting.current) return
    const normalizedUsername = username.trim().toLowerCase()
    let validationError = ''
    if (!/^[a-z][a-z0-9_]{2,31}$/.test(normalizedUsername)) {
      validationError = '用户名需为 3–32 位小写字母、数字或下划线，并以字母开头。'
    } else if (!password.isWellFormed() || password.includes('\u0000') || !password.trim()
      || [...password].length < 15 || [...password].length > 128) {
      validationError = '密码需为 15–128 个字符，不能全为空白或包含无效字符。'
    } else if (password !== confirmation) {
      validationError = '两次输入的密码不一致，请重新确认。'
    }
    if (validationError) {
      setResult({ state: 'error', message: validationError })
      return
    }

    submitting.current = true
    setUsername(normalizedUsername)
    setResult({ state: 'loading', message: '正在注册，请稍候…' })
    let confirmed = false
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizedUsername, password }),
        signal: AbortSignal.timeout(10000),
      })
      if (response.status !== 201) {
        if (response.status === 409) throw new Error('用户名已被使用（HTTP 409），没有覆盖已有账号。请换一个用户名。')
        if (response.status === 400) throw new Error('注册信息未通过后端校验（HTTP 400），请检查用户名和密码。')
        throw new Error(`注册未确认成功（HTTP ${response.status}）。恢复连接后先按用户名核对数据库，再决定是否重试。`)
      }
      confirmed = true
      const data = await response.json()
      if (!data?.user || typeof data.user.id !== 'string' || !data.user.id
        || data.user.username !== normalizedUsername || typeof data.user.created_at !== 'string'
        || Number.isNaN(Date.parse(data.user.created_at))) {
        throw new Error('响应内容不完整。')
      }
      setResult({ state: 'success', message: '注册成功，用户已保存。注册不会自动登录或切换当前用户。', user: data.user })
    } catch (error) {
      let message = error.message
      if (confirmed) message = '后端已确认注册成功，但响应未能完整显示。请按用户名核对数据库。'
      else if (error.name === 'TimeoutError' || error instanceof TypeError) {
        message = '连接失败或等待超过 10 秒，注册结果未确认。恢复后先按用户名核对数据库，再决定是否重试。'
      }
      setResult({ state: 'error', message })
    } finally {
      setPassword('')
      setConfirmation('')
      submitting.current = false
    }
  }

  return (
    <section className="backend-connection" aria-labelledby="registration-title">
      <h2 id="registration-title">本地学习实验：用户注册</h2>
      <p className="connection-note">使用专门的练习密码。注册后可在下方登录，当前暂不分配任务。</p>
      <form className="registration-form" onSubmit={register} noValidate>
        <label htmlFor="register-username">用户名</label>
        <input id="register-username" name="username" autoComplete="username" autoCapitalize="none"
          spellCheck={false} value={username} disabled={busy} aria-describedby="register-username-help"
          onChange={event => setUsername(event.target.value)} />
        <p id="register-username-help" className="connection-note">3–32 位字母、数字或下划线，以字母开头；提交时去除首尾空白并转为小写。</p>
        <label htmlFor="register-password">密码</label>
        <input id="register-password" name="password" type="password" autoComplete="new-password"
          value={password} disabled={busy} aria-describedby="register-password-help"
          onChange={event => setPassword(event.target.value)} />
        <p id="register-password-help" className="connection-note">15–128 个字符，可使用长口令；大小写和首尾空格都会保留。</p>
        <label htmlFor="register-confirmation">再次输入密码</label>
        <input id="register-confirmation" name="confirmation" type="password" autoComplete="new-password"
          value={confirmation} disabled={busy} onChange={event => setConfirmation(event.target.value)} />
        <button className="save-button" type="submit" disabled={busy}>{busy ? '正在注册…' : '注册练习账号'}</button>
      </form>
      <p className={`connection-message is-${result.state}`} role={result.state === 'error' ? 'alert' : 'status'}>
        {result.message}
      </p>
      {result.user && <dl className="connection-details">
        <dt>用户名</dt><dd>{result.user.username}</dd>
        <dt>用户 ID</dt><dd>{result.user.id}</dd>
        <dt>创建时间（UTC）</dt><dd><time dateTime={result.user.created_at}>{result.user.created_at}</time></dd>
      </dl>}
      <p className="connection-note">发送请求后会清空密码框；本页面不会把密码写入浏览器本地存储。</p>
    </section>
  )
}
