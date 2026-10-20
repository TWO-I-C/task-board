import { useState } from 'react'

export default function BackendTasks() {
  const [result, setResult] = useState({
    state: 'idle',
    message: '尚未读取。点击按钮向后端获取示例任务。',
  })

  async function loadTasks() {
    setResult({ state: 'loading', message: '正在读取后端任务…' })

    try {
      const response = await fetch('/api/tasks', {
        cache: 'no-store',
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        throw new Error(`读取失败（HTTP ${response.status}），请检查后端后重试。`)
      }

      const data = await response.json()
      const validTasks = Array.isArray(data?.tasks) && data.tasks.every((task) => (
        task !== null && typeof task === 'object'
        && typeof task.id === 'string' && task.id.trim() !== ''
        && typeof task.title === 'string' && task.title.trim() !== ''
        && typeof task.completed === 'boolean'
      ))
      if (!validTasks || new Set(data.tasks.map((task) => task.id)).size !== data.tasks.length) {
        throw new Error('后端返回的任务格式不符合预期，请检查接口内容。')
      }

      setResult({
        state: 'success',
        message: `读取成功，共 ${data.tasks.length} 项 · 已完成 ${data.tasks.filter((task) => task.completed).length} 项`,
        tasks: data.tasks,
      })
    } catch (error) {
      let message = error.message
      if (error.name === 'TimeoutError') {
        message = '读取超过 5 秒，请检查后端后重试。'
      } else if (error instanceof TypeError) {
        message = '无法连接后端，请确认后端已启动，然后重试。'
      } else if (error instanceof SyntaxError) {
        message = '后端返回的内容不是有效的 JSON，请检查接口内容。'
      }
      setResult({ state: 'error', message })
    }
  }

  return (
    <section className="backend-connection" aria-labelledby="backend-tasks-title">
      <div className="connection-heading">
        <h2 id="backend-tasks-title">本地学习实验：读取后端任务</h2>
        <button
          type="button"
          className="connection-button"
          onClick={loadTasks}
          disabled={result.state === 'loading'}
        >
          {result.state === 'loading' ? '正在读取…' : '读取后端任务'}
        </button>
      </div>
      <p className="connection-note">
        这里展示后端提供的固定示例，仅供查看；它们独立于上方“我的任务”。
      </p>
      <p
        className={`connection-message is-${result.state}`}
        role={result.state === 'error' ? 'alert' : 'status'}
      >
        {result.message}
      </p>
      {result.state === 'success' && (
        result.tasks.length === 0 ? (
          <p className="connection-note">后端任务列表为空。</p>
        ) : (
          <ul className="backend-task-list" aria-label="后端示例任务">
            {result.tasks.map((task) => (
              <li key={task.id} className={task.completed ? 'is-complete' : undefined}>
                <span className="task-title">{task.title}</span>
                <span className="task-state">{task.completed ? '已完成' : '未完成'}</span>
              </li>
            ))}
          </ul>
        )
      )}
      <p className="connection-note">
        再次点击才会重新读取；刷新页面后需重新读取。这些示例尚未存入数据库。
      </p>
    </section>
  )
}
