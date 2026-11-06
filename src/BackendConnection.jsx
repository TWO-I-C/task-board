import { useState } from 'react'

export default function BackendConnection() {
  const [result, setResult] = useState({
    state: 'idle',
    message: '尚未检查。点击按钮发送一次请求。',
  })

  async function checkConnection() {
    setResult({ state: 'loading', message: '正在等待后端回答…' })

    try {
      const response = await fetch('/api/health', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })

      // fetch 收到 404、500 等响应时也会正常返回，需要自己检查状态码。
      if (!response.ok) {
        throw new Error(`请求失败（HTTP ${response.status}），请检查后端后重试。`)
      }

      const data = await response.json()
      if (data?.status !== 'ok'
        || data.service !== 'task-board-api'
        || typeof data.serverTime !== 'string'
        || Number.isNaN(Date.parse(data.serverTime))) {
        throw new Error('后端返回的数据不符合预期，请检查接口内容。')
      }

      setResult({ state: 'success', message: '本次连接成功，已收到后端响应。', data })
    } catch (error) {
      let message = error.message
      if (error.name === 'TimeoutError') {
        message = '请求超过 5 秒，请检查后端后重试。'
      } else if (error instanceof TypeError) {
        message = '连接失败，请确认后端已启动，然后重试。'
      } else if (error instanceof SyntaxError) {
        message = '后端返回的内容不是有效的 JSON，请检查接口内容。'
      }
      setResult({ state: 'error', message })
    }
  }

  return (
    <section className="backend-connection" aria-labelledby="backend-title">
      <div className="connection-heading">
        <h2 id="backend-title">本地学习实验：连接后端</h2>
        <button
          type="button"
          className="connection-button"
          onClick={checkConnection}
          disabled={result.state === 'loading'}
        >
          {result.state === 'loading' ? '正在检查…' : '检查后端连接'}
        </button>
      </div>
      <p
        className={`connection-message is-${result.state}`}
        role={result.state === 'error' ? 'alert' : 'status'}
      >
        {result.message}
      </p>
      {result.state === 'success' && (
        <dl className="connection-details">
          <dt>服务名称</dt>
          <dd>{result.data.service}</dd>
          <dt>服务器时间（UTC）</dt>
          <dd><time dateTime={result.data.serverTime}>{result.data.serverTime}</time></dd>
        </dl>
      )}
      <p className="connection-note">
        这里显示本次请求的结果；再次点击才会更新。此检查只确认后端能响应，不检查数据库。
      </p>
    </section>
  )
}
