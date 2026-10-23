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
  const [editing, setEditing] = useState(null)
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
      const tasks = await fetchTasks()
      showTasks(tasks, '读取成功')
      if (editing) {
        const current = tasks.find((task) => task.id === editing.id)
        setEditing((previous) => ({
          ...previous,
          originalTitle: current?.title ?? previous.originalTitle,
          needsReload: !current,
          error: current ? '' : '这条任务已不存在，编辑文字已保留，请取消编辑。',
        }))
      }
    } catch (error) {
      setResult({ state: 'error', message: errorMessage(error) })
      if (editing) setEditing((previous) => ({ ...previous, needsReload: true }))
    } finally {
      setPending(null)
    }
  }

  async function addTask(event) {
    event.preventDefault()
    if (pending || editing) return
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

  async function changeCompleted(task, completed) {
    if (pending || editing || result.state !== 'success') return
    setPending(`update:${task.id}`)
    setResult((previous) => ({ ...previous, state: 'loading', message: '正在保存任务状态…' }))
    let saved = false
    let rejected = false

    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
        signal: AbortSignal.timeout(5000),
      })
      if (response.status !== 200) {
        rejected = [400, 404, 413, 415].includes(response.status)
        const data = await response.json().catch(() => null)
        throw new Error(`修改失败（HTTP ${response.status}）。${typeof data?.error === 'string' ? data.error : '请检查后端。'}`)
      }
      saved = true
      const data = await response.json()
      if (!isTask(data?.task) || data.task.id !== task.id || data.task.completed !== completed) {
        throw new Error('修改响应的任务格式不符合预期。')
      }
      // 不提前更改勾选状态；保存确认后重新读取，展示数据库中的最新结果。
      showTasks(await fetchTasks(), '状态保存成功，已重新读取后端列表')
    } catch (error) {
      const outcome = saved
        ? '后端已确认保存成功，但列表未能更新。'
        : rejected
          ? '后端拒绝了本次修改。'
          : '本次修改结果未确认。'
      setResult((previous) => ({
        ...previous,
        state: 'error',
        message: `${outcome} 下方保留的是上次读取的状态，请恢复连接后重新读取，再继续操作。${errorMessage(error)}`,
      }))
    } finally {
      setPending(null)
    }
  }

  function beginEdit(task) {
    setEditing({ id: task.id, title: task.title, originalTitle: task.title, error: '', needsReload: false })
    showTasks(result.tasks, '正在编辑名称，输入框中的文字尚未保存')
  }

  function cancelEdit() {
    if (pending) return
    setEditing(null)
    if (result.state === 'success') {
      showTasks(result.tasks, '已关闭编辑框，保留已读取的名称')
    } else {
      setResult((previous) => ({ ...previous, message: '已关闭编辑框。请重新读取后端任务，确认数据库中的最新名称。' }))
    }
  }

  async function saveTitle(event) {
    event.preventDefault()
    if (pending || !editing || editing.needsReload || result.state !== 'success') return
    const title = editing.title.trim()
    if (!title || title.length > 200 || title.includes('\u0000')) {
      setEditing((previous) => ({ ...previous, error: '请填写 1–200 个字符的任务名称，不能只输入空格或包含空字符。' }))
      return
    }
    const id = editing.id
    setEditing((previous) => ({ ...previous, error: '' }))
    setPending(`rename:${id}`)
    setResult((previous) => ({ ...previous, state: 'loading', message: '正在保存任务名称…' }))
    let saved = false
    let rejected = false
    try {
      const response = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
        signal: AbortSignal.timeout(5000),
      })
      if (response.status !== 200) {
        rejected = [400, 404, 413, 415].includes(response.status)
        const data = await response.json().catch(() => null)
        throw new Error(`修改失败（HTTP ${response.status}）。${typeof data?.error === 'string' ? data.error : '请检查后端。'}`)
      }
      saved = true
      const data = await response.json()
      if (!isTask(data?.task) || data.task.id !== id || data.task.title !== title) {
        throw new Error('修改响应的任务格式不符合预期。')
      }
      showTasks(await fetchTasks(), '名称保存成功，已重新读取后端列表')
      setEditing(null)
    } catch (error) {
      const outcome = saved
        ? '后端已确认名称保存成功，但列表未能更新。'
        : rejected
          ? '后端拒绝了本次改名。'
          : '本次改名结果未确认。'
      setResult((previous) => ({
        ...previous,
        state: 'error',
        message: `${outcome} 编辑文字已保留。请恢复连接后点击“读取后端任务”，核对已保存的名称后再继续。${errorMessage(error)}`,
      }))
      setEditing((previous) => ({ ...previous, needsReload: true }))
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
            disabled={Boolean(pending) || Boolean(editing)}
            aria-invalid={Boolean(formError)}
            aria-describedby={formError ? 'backend-task-error' : undefined}
          />
          <button type="submit" disabled={Boolean(pending) || Boolean(editing)}>
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
      {editing && (
        <form className="edit-form backend-edit-form" onSubmit={saveTitle}>
          <label htmlFor="backend-edit-title">修改后端任务名称</label>
          <p className="connection-note">上次读取的名称：{editing.originalTitle}</p>
          <div className="edit-input-row">
            <input
              id="backend-edit-title"
              value={editing.title}
              onChange={(event) => setEditing({ ...editing, title: event.target.value, error: '' })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancelEdit()
              }}
              maxLength={200}
              disabled={Boolean(pending)}
              aria-invalid={Boolean(editing.error)}
              aria-describedby={editing.error ? 'backend-edit-error' : undefined}
              autoFocus
            />
            <div className="task-actions">
              <button className="save-button" type="submit" disabled={Boolean(pending) || editing.needsReload || result.state !== 'success'}>
                {pending === `rename:${editing.id}` ? '正在保存…' : '保存名称'}
              </button>
              <button className="cancel-button" type="button" onClick={cancelEdit} disabled={Boolean(pending)}>取消编辑</button>
            </div>
          </div>
          {editing.error && <p id="backend-edit-error" className="error" role="alert">{editing.error}</p>}
          {editing.needsReload && <p className="connection-note">请先重新读取；编辑框里的文字会保留，读取成功后可核对并保存或取消。</p>}
        </form>
      )}
      {result.tasks && (
        result.tasks.length === 0 ? (
          <p className="connection-note">后端任务列表为空。</p>
        ) : (
          <ul className="backend-task-list" aria-label="后端任务列表">
            {result.tasks.map((task) => (
              <li key={task.id} className={task.completed ? 'is-complete' : undefined}>
                <label className="task-item">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(event) => changeCompleted(task, event.target.checked)}
                    disabled={Boolean(pending) || Boolean(editing) || result.state !== 'success'}
                    aria-label={`后端任务：${task.title}`}
                  />
                  <span className="task-title">{task.title}</span>
                </label>
                <span className="task-state">
                  {pending === `update:${task.id}` ? '正在保存…' : task.completed ? '已完成' : '未完成'}
                </span>
                <button
                  type="button"
                  className="edit-button"
                  aria-label={`编辑后端任务“${task.title}”`}
                  onClick={() => beginEdit(task)}
                  disabled={Boolean(pending) || Boolean(editing) || result.state !== 'success'}
                >编辑</button>
              </li>
            ))}
          </ul>
        )
      )}
      <p className="connection-note">
        勾选可完成或取消完成，点击编辑可改名。新增和修改成功后自动读取列表；刷新页面后需点击读取。使用时请保持 PostgreSQL 运行。
      </p>
    </section>
  )
}
