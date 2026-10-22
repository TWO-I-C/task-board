import { useState } from 'react'

function isTask(task) {
  return task !== null && typeof task === 'object'
    && typeof task.id === 'string' && task.id.trim() !== ''
    && typeof task.title === 'string' && task.title.trim() !== ''
    && typeof task.completed === 'boolean'
}

async function fetchTasks() {
  const response = await fetch('/api/tasks', {
    cache: 'no-store',
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(`读取失败（HTTP ${response.status}）。${typeof data?.error === 'string' ? data.error : '请检查后端后重试。'}`)
  }
  const data = await response.json()
  if (!Array.isArray(data?.tasks) || !data.tasks.every(isTask)
    || new Set(data.tasks.map((task) => task.id)).size !== data.tasks.length) {
    throw new Error('后端返回的任务格式不符合预期，请检查接口内容。')
  }
  return data.tasks
}

function errorMessage(error) {
  if (error.name === 'TimeoutError') return '请求超过 5 秒，请检查后端。'
  if (error instanceof TypeError) return '无法连接后端，请确认后端已启动。'
  if (error instanceof SyntaxError) return '后端返回的内容不是有效的 JSON。'
  return error.message
}

export default function BackendTasks() {
  const [draft, setDraft] = useState('')
  const [formError, setFormError] = useState('')
  const [pending, setPending] = useState(null)
  const [result, setResult] = useState({
    state: 'idle',
    message: '尚未读取。点击按钮向后端获取任务。',
  })

  function showTasks(tasks, message) {
    setResult({
      state: 'success',
      message: `${message}，共 ${tasks.length} 项 · 已完成 ${tasks.filter((task) => task.completed).length} 项`,
      tasks,
    })
  }

  async function loadTasks() {
    if (pending) return
    setPending('read')
    setResult({ state: 'loading', message: '正在读取后端任务…' })
    try {
      showTasks(await fetchTasks(), '读取成功')
    } catch (error) {
      setResult({ state: 'error', message: errorMessage(error) })
    } finally {
      setPending(null)
    }
  }

  async function addTask(event) {
    event.preventDefault()
    if (pending) return
    const title = draft.trim()
    if (!title || title.length > 200) {
      setFormError('请填写 1–200 个字符的任务名称，不能只输入空格。')
      return
    }

    setFormError('')
    setPending('create')
    setResult({ state: 'loading', message: '正在向后端新增任务…' })
    let created = false
    let rejected = false

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
        signal: AbortSignal.timeout(5000),
      })

      if (response.status !== 201) {
        // 这些状态表示本接口在写入前拒绝了请求；其他失败可能无法确认写入结果。
        rejected = [400, 413, 415].includes(response.status)
        const data = await response.json().catch(() => null)
        throw new Error(typeof data?.error === 'string'
          ? data.error
          : `请求失败（HTTP ${response.status}）。`)
      }

      created = true
      setDraft('')
      const data = await response.json()
      if (!isTask(data?.task) || data.task.title !== title || data.task.completed !== false) {
        throw new Error('新增响应的任务格式不符合预期。')
      }
      // 收到创建成功的响应后重新 GET，列表以这次从后端读取的数据为准。
      showTasks(await fetchTasks(), '新增成功，已重新读取后端列表')
    } catch (error) {
      const outcome = created
        ? '后端已确认新增成功，但列表未能更新。请先读取后端任务，不要重复提交。'
        : rejected
          ? '后端拒绝了本次新增，请修改输入后再提交。'
          : '本次新增结果未确认，输入已保留。请恢复连接并读取后端任务，确认是否已新增后再决定提交。'
      setResult({ state: 'error', message: `${outcome} ${errorMessage(error)}` })
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="backend-connection" aria-labelledby="backend-tasks-title">
      <div className="connection-heading">
        <h2 id="backend-tasks-title">本地学习实验：后端任务</h2>
        <button
          type="button"
          className="connection-button"
          onClick={loadTasks}
          disabled={Boolean(pending)}
        >
          {pending === 'read' ? '正在读取…' : '读取后端任务'}
        </button>
      </div>
      <p className="connection-note">
        这里的任务通过后端保存到 PostgreSQL，独立于上方“我的任务”。重启后端后仍会保留。
      </p>
      <form className="task-form backend-task-form" onSubmit={addTask}>
        <label htmlFor="backend-task-title">后端任务名称</label>
        <div className="input-row">
          <input
            id="backend-task-title"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setFormError('')
            }}
            placeholder="例如：学习 POST 请求"
            maxLength={200}
            disabled={Boolean(pending)}
            aria-invalid={Boolean(formError)}
            aria-describedby={formError ? 'backend-task-error' : undefined}
          />
          <button type="submit" disabled={Boolean(pending)}>
            {pending === 'create' ? '正在新增…' : '新增到后端'}
          </button>
        </div>
        {formError && <p id="backend-task-error" className="error" role="alert">{formError}</p>}
      </form>
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
          <ul className="backend-task-list" aria-label="后端任务列表">
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
        新增成功后自动读取列表；刷新页面后需点击读取。使用时请保持 PostgreSQL 运行。
      </p>
    </section>
  )
}
