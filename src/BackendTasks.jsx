import { useCallback, useEffect, useRef, useState } from 'react'

function isTask(task) {
  return task !== null && typeof task === 'object'
    && typeof task.id === 'string' && task.id.trim() !== ''
    && typeof task.title === 'string' && task.title.trim() !== ''
    && typeof task.completed === 'boolean'
}

async function fetchTasks(taskRequest) {
  const response = await taskRequest('/api/tasks')
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(`读取失败（HTTP ${response.status}）。${typeof data?.error === 'string' ? data.error : '请恢复服务后点击“刷新任务”。'}`)
  }
  const data = await response.json()
  if (!Array.isArray(data?.tasks) || !data.tasks.every(isTask)
    || new Set(data.tasks.map((task) => task.id)).size !== data.tasks.length) {
    throw new Error('服务返回的任务格式不符合预期，请检查接口内容。')
  }
  return data.tasks
}

function errorMessage(error) {
  if (error.name === 'TimeoutError') return '请求超时，请恢复服务后点击“刷新任务”。'
  if (error instanceof TypeError) return '无法连接服务，请恢复后点击“刷新任务”。'
  if (error instanceof SyntaxError) return '服务返回的内容不是有效的 JSON。'
  return error.message
}

export default function BackendTasks({ user, onIdentityChanged }) {
  const lifetime = useRef(null)

  const taskRequest = useCallback(async (path, options = {}) => {
    const controller = lifetime.current
    const response = await fetch(path, {
      ...options,
      credentials: 'same-origin', cache: 'no-store',
      headers: { ...options.headers, 'X-Task-Board-Request': '1', 'X-Task-Board-User': user.id },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    })
    if (controller.signal.aborted) throw new DOMException('页面身份已变化', 'AbortError')
    if ([401, 409].includes(response.status)) {
      onIdentityChanged()
      throw new Error('登录状态已失效或用户已变化，请重新确认身份。')
    }
    if (response.status === 503) throw new Error('任务服务暂时不可用，请恢复连接后刷新任务核对。')
    return response
  }, [user.id, onIdentityChanged])

  const [draft, setDraft] = useState('')
  const [filter, setFilter] = useState('all')
  const [formError, setFormError] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [pending, setPending] = useState('read')
  const [result, setResult] = useState({
    state: 'loading',
    message: '正在加载你的任务…',
  })

  const showTasks = useCallback((tasks, message) => {
    setResult({
      state: 'success',
      message,
      tasks,
    })
  }, [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    lifetime.current = controller
    fetchTasks(taskRequest)
      .then(tasks => { if (active) showTasks(tasks, '任务已加载。') })
      .catch(error => { if (active) setResult({ state: 'error', message: errorMessage(error) }) })
      .finally(() => { if (active) setPending(null) })
    return () => { active = false; controller.abort() }
  }, [taskRequest, showTasks])

  async function loadTasks() {
    if (pending || deleting) return
    setPending('read')
    setResult({ state: 'loading', message: '正在刷新任务…' })
    try {
      const tasks = await fetchTasks(taskRequest)
      showTasks(tasks, '任务已刷新。')
      if (editing) {
        const current = tasks.find((task) => task.id === editing.id)
        setEditing((previous) => ({
          ...previous,
          originalTitle: current?.title ?? previous.originalTitle,
          needsReload: !current,
          error: current ? '' : '这条任务不存在或无权访问，编辑文字已保留，请取消编辑。',
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
    if (pending || editing || deleting || result.state !== 'success') return
    const title = draft.trim()
    if (!title || title.length > 200 || title.includes('\u0000')) {
      setFormError('请填写 1–200 个字符的任务名称，不能只输入空格。')
      return
    }

    setFormError('')
    setPending('create')
    setResult({ state: 'loading', message: '正在保存新任务…' })
    let created = false
    let rejected = false

    try {
      const response = await taskRequest('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })

      if (response.status !== 201) {
        // 这些状态表示本接口在写入前拒绝了请求；其他失败可能无法确认写入结果。
        rejected = [400, 403, 413, 415].includes(response.status)
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
      showTasks(await fetchTasks(taskRequest), '任务已新增。')
    } catch (error) {
      const outcome = created
        ? '服务已确认新增成功，但列表未能更新。请先刷新任务，不要重复提交。'
        : rejected
          ? '服务拒绝了本次新增，请先刷新任务，再修改输入并提交。'
          : '本次新增结果未确认，输入已保留。请恢复连接并刷新任务，确认是否已新增后再决定提交。'
      setResult({ state: 'error', message: `${outcome} ${errorMessage(error)}` })
    } finally {
      setPending(null)
    }
  }

  async function changeCompleted(task, completed) {
    if (pending || editing || deleting || result.state !== 'success') return
    setPending(`update:${task.id}`)
    setResult((previous) => ({ ...previous, state: 'loading', message: '正在保存任务状态…' }))
    let saved = false
    let rejected = false

    try {
      const response = await taskRequest(`/api/tasks/${encodeURIComponent(task.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })
      if (response.status !== 200) {
        rejected = [400, 403, 404, 413, 415].includes(response.status)
        const data = await response.json().catch(() => null)
        throw new Error(`修改失败（HTTP ${response.status}）。${typeof data?.error === 'string' ? data.error : '请恢复服务后重试。'}`)
      }
      saved = true
      const data = await response.json()
      if (!isTask(data?.task) || data.task.id !== task.id || data.task.completed !== completed) {
        throw new Error('修改响应的任务格式不符合预期。')
      }
      // 不提前更改勾选状态；保存确认后重新读取，展示数据库中的最新结果。
      showTasks(await fetchTasks(taskRequest), '完成状态已保存。')
    } catch (error) {
      const outcome = saved
        ? '服务已确认保存成功，但列表未能更新。'
        : rejected
          ? '服务拒绝了本次修改。'
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
    if (pending || editing || deleting || result.state !== 'success') return
    setEditing({ id: task.id, title: task.title, originalTitle: task.title, error: '', needsReload: false })
    showTasks(result.tasks, '正在编辑名称，输入框中的文字尚未保存')
  }

  function cancelEdit() {
    if (pending) return
    setEditing(null)
    if (result.state === 'success') {
      showTasks(result.tasks, '已关闭编辑框，保留已读取的名称')
    } else {
      setResult((previous) => ({ ...previous, message: '已关闭编辑框。请重新刷新任务，确认数据库中的最新名称。' }))
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
      const response = await taskRequest(`/api/tasks/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (response.status !== 200) {
        rejected = [400, 403, 404, 413, 415].includes(response.status)
        const data = await response.json().catch(() => null)
        throw new Error(`修改失败（HTTP ${response.status}）。${typeof data?.error === 'string' ? data.error : '请恢复服务后重试。'}`)
      }
      saved = true
      const data = await response.json()
      if (!isTask(data?.task) || data.task.id !== id || data.task.title !== title) {
        throw new Error('修改响应的任务格式不符合预期。')
      }
      showTasks(await fetchTasks(taskRequest), '任务名称已保存。')
      setEditing(null)
    } catch (error) {
      const outcome = saved
        ? '服务已确认名称保存成功，但列表未能更新。'
        : rejected
          ? '服务拒绝了本次改名。'
          : '本次改名结果未确认。'
      setResult((previous) => ({
        ...previous,
        state: 'error',
        message: `${outcome} 编辑文字已保留。请恢复连接后点击“刷新任务”，核对已保存的名称后再继续。${errorMessage(error)}`,
      }))
      setEditing((previous) => ({ ...previous, needsReload: true }))
    } finally {
      setPending(null)
    }
  }

  function beginDelete(task) {
    if (pending || editing || deleting || result.state !== 'success') return
    setDeleting(task)
    showTasks(result.tasks, '请确认是否删除，尚未发送删除请求')
  }

  function cancelDelete() {
    if (pending) return
    setDeleting(null)
    showTasks(result.tasks, '已取消删除，未发送删除请求')
  }

  async function confirmDelete() {
    if (pending || !deleting || editing || result.state !== 'success') return
    const id = deleting.id
    setPending(`delete:${id}`)
    setResult((previous) => ({ ...previous, state: 'loading', message: '正在删除任务…' }))
    let removed = false
    let missing = false
    try {
      const response = await taskRequest(`/api/tasks/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (response.status !== 200) {
        missing = response.status === 404
        const data = await response.json().catch(() => null)
        throw new Error(`删除请求未成功（HTTP ${response.status}）。${typeof data?.error === 'string' ? data.error : '请恢复服务后重试。'}`)
      }
      removed = true
      const data = await response.json()
      if (!isTask(data?.task) || data.task.id !== id) {
        throw new Error('删除响应的任务格式不符合预期。')
      }
      showTasks(await fetchTasks(taskRequest), '任务已删除。')
    } catch (error) {
      const outcome = removed
        ? '服务已确认删除成功，但列表未能更新。'
        : missing
          ? '这条任务不存在或无权访问，本次没有删除。'
          : '本次删除结果未确认。'
      setResult((previous) => ({
        ...previous,
        state: 'error',
        message: `${outcome} 下方保留的是上次读取的列表。请恢复连接后重新读取核对，再继续操作。${errorMessage(error)}`,
      }))
    } finally {
      setDeleting(null)
      setPending(null)
    }
  }

  const visibleTasks = (result.tasks ?? []).filter(task => filter === 'all'
    || (filter === 'completed' ? task.completed : !task.completed))
  const blocked = Boolean(pending) || Boolean(editing) || Boolean(deleting)

  return (
    <section className="backend-connection account-tasks" aria-labelledby="backend-tasks-title" aria-busy={Boolean(pending)}>
      <div className="connection-heading">
        <h2 id="backend-tasks-title">我的任务</h2>
        <button
          type="button"
          className="connection-button"
          onClick={loadTasks}
          disabled={Boolean(pending) || Boolean(deleting)}
        >
          {pending === 'read' ? '正在读取…' : '刷新任务'}
        </button>
      </div>
      {result.tasks && <p className="task-count account-count">
        共 {result.tasks.length} 项 · 已完成 {result.tasks.filter(task => task.completed).length} 项
        {result.state !== 'success' && '（上次读取）'}
      </p>}
      <form className="task-form backend-task-form" onSubmit={addTask}>
        <label htmlFor="backend-task-title">任务名称</label>
        <div className="input-row">
          <input
            id="backend-task-title"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setFormError('')
            }}
            placeholder="例如：读书 30 分钟"
            maxLength={200}
            disabled={blocked || result.state !== 'success'}
            aria-invalid={Boolean(formError)}
            aria-describedby={formError ? 'backend-task-error' : undefined}
          />
          <button type="submit" disabled={blocked || result.state !== 'success'}>
            {pending === 'create' ? '正在新增…' : '新增任务'}
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
      {deleting && (
        <section
          className="backend-delete-confirm"
          aria-labelledby="backend-delete-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape') cancelDelete()
          }}
        >
          <h3 id="backend-delete-title">确认删除任务</h3>
          <p>删除“{deleting.title}”（{deleting.completed ? '已完成' : '未完成'}）？删除后无法在任务板中撤销。</p>
          <div className="task-actions">
            <button type="button" className="cancel-button" onClick={cancelDelete} disabled={Boolean(pending)} autoFocus>取消删除</button>
            <button type="button" className="delete-button" onClick={confirmDelete} disabled={Boolean(pending)}>
              {pending === `delete:${deleting.id}` ? '正在删除…' : '确认删除'}
            </button>
          </div>
        </section>
      )}
      {editing && (
        <form className="edit-form backend-edit-form" onSubmit={saveTitle}>
          <label htmlFor="backend-edit-title">修改任务名称</label>
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
      {result.tasks && <div className="task-filters account-filters" role="group" aria-label="按完成状态筛选账户任务">
        {[['all', '全部'], ['active', '未完成'], ['completed', '已完成']].map(([value, label]) => (
          <button className="filter-button" type="button" key={value} aria-pressed={filter === value}
            disabled={blocked || result.state !== 'success'} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>}
      {result.tasks && (
        visibleTasks.length === 0 ? (
          <div className="empty-state" role="status">
            <p>{result.tasks.length === 0 ? '还没有任务' : filter === 'active' ? '没有未完成任务' : '没有已完成任务'}</p>
            <p>{result.tasks.length === 0 ? '在上方记下一件想完成的事。' : '切换筛选查看其他任务。'}</p>
          </div>
        ) : (
          <ul className="backend-task-list" aria-label="账户任务列表">
            {visibleTasks.map((task) => (
              <li key={task.id} className={task.completed ? 'is-complete' : undefined}>
                <label className="task-item">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={(event) => changeCompleted(task, event.target.checked)}
                    disabled={Boolean(pending) || Boolean(editing) || Boolean(deleting) || result.state !== 'success'}
                    aria-label={`任务：${task.title}`}
                  />
                  <span className="task-title">{task.title}</span>
                </label>
                <span className="task-state">
                  {pending === `update:${task.id}` ? '正在保存…' : task.completed ? '已完成' : '未完成'}
                </span>
                <div className="task-actions">
                  <button
                    type="button"
                    className="edit-button"
                    aria-label={`编辑任务“${task.title}”`}
                    onClick={() => beginEdit(task)}
                    disabled={Boolean(pending) || Boolean(editing) || Boolean(deleting) || result.state !== 'success'}
                  >编辑</button>
                  <button
                    type="button"
                    className="delete-button"
                    aria-label={`删除任务“${task.title}”`}
                    onClick={() => beginDelete(task)}
                    disabled={Boolean(pending) || Boolean(editing) || Boolean(deleting) || result.state !== 'success'}
                  >删除</button>
                </div>
              </li>
            ))}
          </ul>
        )
      )}
      <p className="connection-note">操作成功后会重新读取已保存的结果。连接恢复后，可点击“刷新任务”核对最新状态。</p>
    </section>
  )
}
