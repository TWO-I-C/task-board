# 第二阶段 · 第 6 课：保存后端任务的完成状态

预计 45–60 分钟，其中阅读约 10–15 分钟。目标：让下方“后端任务”支持完成与取消完成，并用 SQL 验证状态确实保存。上方“我的任务”仍使用浏览器 localStorage，两组任务继续独立。

## 你目前的进度

阶段 1 的本地任务板、Git 保存与静态上线已完成。阶段 2 已完成健康检查、页面请求、读取任务、新增任务和 PostgreSQL 持久化；本课开始修改已有记录。之后再逐步加入后端名称编辑、删除、账号与用户数据隔离。进入下一阶段以实际验收为准，不按已经学习的天数计算。

## 开始前

保持 Postgres.app、前端 `npm run dev` 与后端 `npm run server` 运行。打开前端终端显示的网址（当前为 http://localhost:5173/），刷新页面，找到下方“本地学习实验：后端任务”，点击“读取后端任务”。每条任务前会出现复选框。

代码已添加，不需要安装新依赖、重新建表或修改数据库配置。若后端没有自动重启，在它的终端按 Control + C，再执行 `npm run server`。

## 一次点击经过了什么

勾选任务 → 浏览器发送 PATCH → 后端校验 ID 和布尔值 → PostgreSQL UPDATE → 后端返回 200 → 页面重新 GET 列表 → 显示最新完成状态。

| 操作 | HTTP 请求 | 数据库动作 |
| --- | --- | --- |
| 读取列表 | `GET /api/tasks` | SELECT |
| 新增任务 | `POST /api/tasks` | INSERT |
| 设置完成状态 | `PATCH /api/tasks/任务ID` | UPDATE |

例如将指定任务设为完成，请求正文为：

```json
{ "completed": true }
```

取消完成则发送 `false`。两者都是 JSON 布尔值，不能写成带引号的 `"true"` 或 `"false"`。

这里传的是明确的目标值，不是“把当前状态反转一次”。同一条任务连续收到两次 `{ "completed": true }`，仍保持完成。这是本接口的设计，不意味着所有 PATCH 接口都具有相同的重复请求行为。

## 先读两小节（10–15 分钟）

- [MDN：PATCH](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Reference/Methods/PATCH)：先看开头对“部分修改”的解释，不必背完整协议。
- [PostgreSQL 18：Updates](https://www.postgresql.org/docs/18/tutorial-update.html)：辨认 UPDATE、SET、WHERE，想一想每个词对应本项目的哪部分。

选读 [PostgreSQL：RETURNING](https://www.postgresql.org/docs/18/dml-returning.html)，只看 UPDATE 示例：RETURNING 可把修改后的记录返回给程序。

本项目的 SQL 模板：

```sql
UPDATE tasks
SET completed = $1
WHERE id = $2
RETURNING id, title, completed;
```

- `$1` 是目标完成状态，`$2` 是任务 ID；由 Node.js 驱动单独传入，不是让你直接复制到 psql 执行的完整 SQL。
- `WHERE id = $2` 限定要修改的那一条。主键 ID 唯一，任务名称可以重复。
- `SET completed` 只改完成状态，保留名称、ID、创建时间和任务总数。
- 没有匹配记录时，后端返回 404，不把“修改了 0 条”说成成功。

## 观察一次请求

在 Chrome 按 Option + Command + I 打开开发者工具，进入 Network（网络），选择 Fetch/XHR。保持面板打开，然后勾选一条后端任务。找到方法为 PATCH 的请求，查看：

1. Headers：请求地址最后是该任务的 ID，方法是 PATCH，成功状态为 200。
2. Payload：勾选发送 `completed: true`；取消勾选发送 `completed: false`。
3. Response：包含修改后的任务，其 ID 应与请求地址对应。
4. 随后还有一次 GET `/api/tasks`，因为页面要重新读取数据库中的列表。

本课浏览器通过 Vite 代理访问后端，因此开发者工具里看到的端口仍可能是 5173。

## 五项独立验收

先在下方新增两条完全同名的“练习 PATCH”，确认都为未完成，并记录此时总数及已完成数。下面的增减均相对这两个基准。

1. **完成与同名任务隔离**：只勾选第一条“练习 PATCH”。它显示已完成，另一条仍未完成；总数不变，已完成数增加 1。运行下方 SQL，确认两条 ID 不同，其中恰好一条 completed 为 `t`。
2. **取消完成**：取消第一条的勾选。总数仍不变，已完成数回到基准；SQL 中这两条都为 `f`。名称和 ID 不变。
3. **刷新及重启**：再次勾选第一条，然后刷新页面并点击读取，状态仍为完成。只重启 Node.js 后端，再读取及查询 SQL，状态、ID 和数量仍保持一致。
4. **数据库停止时修改**：先读取出列表，再在 Postgres.app 点击 Stop。尝试取消第一条的勾选，应提示失败（HTTP 503），不能提示保存成功。页面保留的是上次读取的状态，复选框暂时禁用；这不代表已经实时确认了数据库状态。不要刷新页面后才尝试这项操作，否则需要先恢复连接才能读出列表。
5. **恢复后重新操作**：在 Postgres.app 点击 Start，运行后点击读取，第一条仍为完成，两条任务都还在。再次取消第一条的勾选应成功；SQL 显示 `f`。总数及另一条任务的状态仍不变。

在空闲终端运行只读查询；同名任务靠 ID 区分，顺序按创建时间排列：

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -X -h 127.0.0.1 -p 5432 -U two-i-c -d task_board -c "SELECT id, title, completed FROM tasks WHERE title = '练习 PATCH' ORDER BY created_at, id;"
```

如果以前已有同名练习记录，记下本次新建的两个 ID，按 ID 对照。`t` 是 true，`f` 是 false。这两条练习记录可以留到后续删除课使用。

## 为什么先确认、再更新页面

当前界面不会仅因你点击了复选框就显示保存成功。后端确认 UPDATE 后，页面还会 GET 列表，以重新读取的结果更新勾选和计数。请求期间按钮暂时禁用，避免连续操作重叠。

需要分清三种结果：

- 请求被拒绝，例如完成状态不是布尔值（400）或任务不存在（404）：不能宣告成功。
- 请求超时、连接中断或数据库报错：浏览器可能无法确认最终结果，恢复后先读取再继续。不能把所有网络错误都当成“数据库肯定没改”。
- PATCH 已返回成功，但随后的 GET 失败：修改已被后端确认，只是列表未能刷新。页面会明确区分这两件事。

这次“数据库在请求前已停止”的实验中，UPDATE 无法执行，恢复后应该读到原状态。

## 对照源码

- `src/BackendTasks.jsx`：changeCompleted 发送 PATCH，检查结果并重新读取；失败时显示上次读取的数据并禁用勾选。
- `server/index.js`：从路径取 ID，只接受 completed 布尔值，等待数据库结果再返回成功或 404。
- `server/database.js`：setTaskCompleted 执行带 WHERE 的参数化 UPDATE。

本课不涉及表结构变化，无需执行 db:init。

## 复盘与保存

完成五项验收后，用自己的话回答：

1. 两条任务名称完全相同，为什么只会修改其中一条？
2. 如果这条 UPDATE 删除了 WHERE 条件，会产生什么结果？请只解释，不执行。
3. 为什么数据库停止时，点击复选框不能直接在页面显示“保存成功”？

验收和复盘后再保存本课 Git 版本。当前仍处于阶段 2，还没有接入账号或用户之间的数据隔离。
