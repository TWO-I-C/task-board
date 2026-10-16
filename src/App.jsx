import { useState } from 'react'
import './App.css'

const STORAGE_KEY = 'task-board.tasks.v1'
const TASK_FILTERS = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '未完成' },
  { value: 'completed', label: '已完成' },
]

function loadTaskBoard() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    const tasks = saved === null ? [] : JSON.parse(saved)
    const validTasks = Array.isArray(tasks) && tasks.every((task) => (
      task !== null && typeof task === 'object'
      && typeof task.id === 'string' && task.id.trim() !== ''
      && typeof task.title === 'string' && task.title.trim() !== ''
      && typeof task.completed === 'boolean'
    ))

    if (!validTasks || new Set(tasks.map((task) => task.id)).size !== tasks.length) {
      throw new Error('Invalid saved tasks')
    }

    return { tasks, storageReady: true, storageError: '' }
  } catch {
    return {
      tasks: [],
      storageReady: false,
      storageError: '无法读取本地任务，已暂停保存，原有记录未被覆盖。当前改动仅在本页有效，刷新后会丢失。',
    }
  }
}

function App() {
  const [draft, setDraft] = useState('')
  const [board, setBoard] = useState(loadTaskBoard)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [editingTask, setEditingTask] = useState(null)
  const { tasks, storageReady, storageError } = board

  function updateTasks(nextTasks) {
    let nextStorageError = storageError

    // 读取失败时保留原记录，避免用空列表或新任务覆盖它。
    if (storageReady) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTasks))
        nextStorageError = ''
      } catch {
        nextStorageError = '保存失败，本次改动只保留在当前页面。刷新或关闭页面可能丢失改动，请检查浏览器是否允许保存网站数据或存储空间是否已满。'
      }
    }

    setBoard({ tasks: nextTasks, storageReady, storageError: nextStorageError })
  }

  function addTask(event) {
    event.preventDefault()
    const title = draft.trim()

    if (!title) {
      setError('请填写任务内容，不能只输入空格。')
      return
    }

    const task = { id: crypto.randomUUID(), title, completed: false }
    updateTasks([...tasks, task])
    setDraft('')
    setError('')
  }

  function toggleTask(taskId) {
    updateTasks(tasks.map((task) => (
      task.id === taskId ? { ...task, completed: !task.completed } : task
    )))
  }

  function deleteTask(task) {
    const confirmed = window.confirm(`确定删除任务“${task.title}”吗？`)

    if (!confirmed) return

    updateTasks(tasks.filter((item) => item.id !== task.id))
  }

  function saveTask(event) {
    event.preventDefault()
    const title = editingTask.title.trim()

    if (!title) {
      setEditingTask({ ...editingTask, error: '任务名称不能为空，也不能只输入空格。' })
      return
    }

    updateTasks(tasks.map((task) => (
      task.id === editingTask.id ? { ...task, title } : task
    )))
    setEditingTask(null)
  }

  const completedCount = tasks.filter((task) => task.completed).length
  const visibleTasks = tasks.filter((task) => {
    if (filter === 'active') return !task.completed
    if (filter === 'completed') return task.completed
    return true
  })

  return (
    <main className="task-board">
      <header>
        <p className="eyebrow">从一件小事开始</p>
        <h1>个人任务板</h1>
        <p className="intro">把要做的事记下来，给今天一个清晰的开始。</p>
      </header>

      <form onSubmit={addTask} className="task-form">
        <label htmlFor="task-title">任务名称</label>
        <div className="input-row">
          <input
            id="task-title"
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value)
              setError('')
            }}
            placeholder="例如：学习终端的基本命令"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'task-error' : undefined}
          />
          <button type="submit">新增任务</button>
        </div>
        {error && <p id="task-error" className="error" role="alert">{error}</p>}
      </form>

      <section aria-labelledby="task-list-title" className="tasks-section">
        <div className="list-heading">
          <h2 id="task-list-title">我的任务</h2>
          <span className="task-count" role="status">
            共 {tasks.length} 项 · 已完成 {completedCount} 项
          </span>
        </div>
        <div className="task-filters" role="group" aria-label="按完成状态筛选任务">
          {TASK_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="filter-button"
              aria-pressed={filter === option.value}
              disabled={Boolean(editingTask)}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {tasks.length === 0 ? (
          <div className="empty-state">
            <p>还没有任务</p>
            <p>在上方输入一件想完成的事。</p>
          </div>
        ) : visibleTasks.length === 0 ? (
          <div className="empty-state" role="status">
            <p>{filter === 'active' ? '没有未完成任务' : '还没有已完成任务'}</p>
            <p>切换筛选可查看其他任务。</p>
          </div>
        ) : (
          <ul className="task-list">
            {visibleTasks.map((task) => (
              <li key={task.id}>
                {editingTask?.id === task.id ? (
                  <form className="edit-form" onSubmit={saveTask}>
                    <label htmlFor={`edit-task-${task.id}`}>修改任务名称</label>
                    <div className="edit-input-row">
                      <input
                        id={`edit-task-${task.id}`}
                        value={editingTask.title}
                        onChange={(event) => setEditingTask({ ...editingTask, title: event.target.value, error: '' })}
                        onKeyDown={(event) => {
                          if (event.key === 'Escape') setEditingTask(null)
                        }}
                        aria-invalid={Boolean(editingTask.error)}
                        aria-describedby={editingTask.error ? `edit-error-${task.id}` : undefined}
                        autoFocus
                      />
                      <div className="task-actions">
                        <button type="submit" className="save-button">保存</button>
                        <button type="button" className="cancel-button" onClick={() => setEditingTask(null)}>取消</button>
                      </div>
                    </div>
                    {editingTask.error && <p id={`edit-error-${task.id}`} className="error" role="alert">{editingTask.error}</p>}
                  </form>
                ) : (
                  <>
                    <label className={`task-item${task.completed ? ' is-complete' : ''}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(task.completed)}
                        onChange={() => toggleTask(task.id)}
                        aria-label={task.completed
                          ? `将“${task.title}”恢复为未完成`
                          : `将“${task.title}”标记为完成`}
                      />
                      <span className="task-title">{task.title}</span>
                      <span className="task-state">{task.completed ? '已完成' : '待完成'}</span>
                    </label>
                    <div className="task-actions">
                      <button
                        type="button"
                        className="edit-button"
                        onClick={() => setEditingTask({ id: task.id, title: task.title, error: '' })}
                        disabled={Boolean(editingTask)}
                        aria-label={`编辑任务“${task.title}”`}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="delete-button"
                        onClick={() => deleteTask(task)}
                        aria-label={`删除任务“${task.title}”`}
                      >
                        删除
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <p
        className={`storage-note${storageError ? ' storage-error' : ''}`}
        role={storageError ? 'alert' : 'status'}
      >
        {storageError || '任务会自动保存在当前浏览器，刷新后仍会保留。清除网站数据会删除这些任务。'}
      </p>
    </main>
  )
}

export default App
