import { useState } from 'react'
import './App.css'

function App() {
  const [draft, setDraft] = useState('')
  const [tasks, setTasks] = useState([])
  const [error, setError] = useState('')

  function addTask(event) {
    event.preventDefault()
    const title = draft.trim()

    if (!title) {
      setError('请填写任务内容，不能只输入空格。')
      return
    }

    const task = { id: crypto.randomUUID(), title, completed: false }
    setTasks((previousTasks) => [...previousTasks, task])
    setDraft('')
    setError('')
  }

  function toggleTask(taskId) {
    setTasks((previousTasks) => previousTasks.map((task) => (
      task.id === taskId ? { ...task, completed: !task.completed } : task
    )))
  }

  const completedCount = tasks.filter((task) => task.completed).length

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
        {tasks.length === 0 ? (
          <div className="empty-state">
            <p>还没有任务</p>
            <p>在上方输入一件想完成的事。</p>
          </div>
        ) : (
          <ul className="task-list">
            {tasks.map((task) => (
              <li key={task.id}>
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
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="storage-note">任务暂存在当前页面，刷新后会清空。</p>
    </main>
  )
}

export default App
