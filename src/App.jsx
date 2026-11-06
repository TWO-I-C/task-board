import { useState } from 'react'
import BackendConnection from './BackendConnection.jsx'
import BackendSession from './BackendSession.jsx'
import LocalTaskBoard from './LocalTaskBoard.jsx'
import './App.css'

// GitHub Pages 继续发布浏览器版；账户版构建必须显式使用 account 模式。
const accountMode = import.meta.env.DEV || import.meta.env.MODE === 'account'

export default function App() {
  const [showLegacy, setShowLegacy] = useState(false)
  if (!accountMode) return <LocalTaskBoard />
  return (
    <main className="task-board account-board">
      <header className="app-header">
        <p className="eyebrow">从一件小事开始 · 账户任务</p>
        <h1>个人任务板</h1>
        <p className="intro">每个账号，自己的任务。登录后继续上次的进度。</p>
      </header>
      <BackendSession />
      <details className="secondary-panel" onToggle={event => setShowLegacy(event.currentTarget.open)}>
        <summary>查看旧版浏览器任务</summary>
        <p className="connection-note">这些记录仅保存在当前浏览器，与登录账号无关，不会自动导入账户任务。</p>
        {showLegacy && <LocalTaskBoard embedded />}
      </details>
      {import.meta.env.DEV && <details className="secondary-panel learning-tools">
        <summary>学习工具：服务连接检查</summary>
        <BackendConnection />
      </details>}
    </main>
  )
}
