# 第二阶段 · 第 5 课（下）：让任务保存到 PostgreSQL

预计 60–90 分钟，包含 15–20 分钟阅读。目标：理解数据库、表、行、列，用 SQL 验证页面新增的数据，并确认重启后仍能读回。

## 本课已经接上的数据流

浏览器 → Node.js API → PostgreSQL → API 返回 JSON → 页面更新。

`GET /api/tasks` 使用 SELECT 查询；`POST /api/tasks` 使用 INSERT 写入。后端等待数据库确认写入后才返回 201。数据库暂时不可用时返回 503，页面提示失败；没有把写入暂存在内存的备用分支。

原来内存中的 3 条任务已保留 ID、名称和完成状态并迁移进数据库。迁移前还保存了本地快照，位于项目仓库之外。上方 localStorage 个人任务保持独立。

## 四个基本概念

| 概念 | 本项目中的例子 |
| --- | --- |
| 数据库 | `task_board`，本项目的数据集合 |
| 表 | `tasks`，记录任务的一张表 |
| 行 | 一条任务 |
| 列 | `id`、`title`、`completed`、`created_at` 等字段 |

`id` 是主键，区分同名任务；`title` 是文本；`completed` 是布尔值；`created_at` 是创建时间。为了兼容上课已有的示例 ID，本课 id 使用 TEXT，新任务仍由后端生成 UUID 字符串。

## 配套阅读（15–20 分钟）

阅读 PostgreSQL 官方教程的三小节，可用浏览器翻译：

- [创建表](https://www.postgresql.org/docs/18/tutorial-table.html)：看 CREATE TABLE 示例，认识字段名和类型。
- [插入行](https://www.postgresql.org/docs/18/tutorial-populate.html)：看 INSERT INTO 与 VALUES。
- [查询表](https://www.postgresql.org/docs/18/tutorial-select.html)：看 SELECT、FROM、WHERE、ORDER BY。

只把示例对应到任务表，不必另建教程里的 weather 表。选读 [node-postgres 参数化查询](https://node-postgres.com/features/queries)，只读 Parameterized query。

## 阅读项目里的两条 SQL

读取列表：

```sql
SELECT id, title, completed FROM tasks ORDER BY created_at, id;
```

新增任务的程序模板：

```sql
INSERT INTO tasks (id, title) VALUES ($1, $2)
RETURNING id, title, completed;
```

后端把 ID 和名称单独传给 `$1`、`$2`；不把输入拼进 SQL。即使名称包含引号，也只作为数据保存。这里的占位符模板由 Node.js 驱动使用，不是让你直接复制到 psql 执行的完整语句。

后端不传 completed 时，表定义的 DEFAULT FALSE 让新任务初始为未完成。NOT NULL 和 CHECK 约束也会限制无效数据；页面校验、后端校验和数据库约束分别发挥作用。

## 开始前

保持 Postgres.app 运行。在运行后端的终端按 Control + C，再执行：

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
npm run server
```

这样也确认你启动的是本课代码。保持前端 `npm run dev` 运行，打开它显示的网址，在下方“本地学习实验：后端任务”点击读取。记录当前数量，不再假设重启后固定为 2 条。

## 五项独立验收

1. **页面新增**：新增“数据库持久化练习”，提示成功，数量增加 1。
2. **直接查询数据库**：执行下方只读命令，找到新任务。记下这一行的 ID，完成状态应为 `f`（false）。这证明记录已进入数据库，而不只是页面显示出来。
3. **重启后端**：只停止并重新启动 `npm run server`，再读取列表。新任务仍在，ID、名称、完成状态与数量不变。
4. **停止数据库**：保持前后端运行，在 Postgres.app 点击 Stop 停止数据库服务。点击读取后端任务，应显示失败（HTTP 503），不能显示空列表或继续假报成功。点击“检查后端连接”仍可能成功，因为它只检查后端进程。
5. **重新启动数据库**：在 Postgres.app 点击 Start，等服务运行后再读取。无需重启 Node.js，任务恢复可读，新任务 ID 与数量不变。再执行一次 SQL 查询核对。

“停止数据库服务”与“删除数据库／数据目录”是不同操作，本次只使用 Stop 和 Start。数据停止时暂时无法读取，数据文件仍保留在电脑上。

只读查询命令（在空闲终端执行）：

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -X -h 127.0.0.1 -p 5432 -U two-i-c -d task_board -c "SELECT id, title, completed FROM tasks ORDER BY created_at, id;"
```

## 配置与文件

- `.env`：本机连接配置，Git 已忽略。此电脑连接 127.0.0.1:5432 的 task_board；连接信息由后端读取。
- `.env.example`：给其他环境参考的模板，不含密码。
- `server/schema.sql`：建表定义。
- `server/database.js`：连接池、SELECT 和带参数的 INSERT。
- `server/init-db.js`：执行建表语句。`npm run db:init` 可重复执行，不删除已有任务，也不重复添加示例。

本机数据库已经准备好，这次验收无需再次初始化。新环境按 README 先创建数据库再建表。

## 这次为什么能够持久化

之前只修改 Node.js 进程内存里的数组；现在 PostgreSQL 将已提交的数据持久化到数据目录。重启进程不会删除这些文件，因此可以重新读取。

数据库内部也使用内存缓存，并借助事务日志等机制保证已提交数据可恢复，不需要现在深入全部原理。持久化也不等于备份：后续工程阶段会练习数据目录损坏或误删除时的恢复。

## 复盘与保存

用自己的话回答：

1. 页面显示“新增成功”和直接用 SQL 查到任务，分别说明了什么？
2. PostgreSQL 停止后任务暂时读不到，为什么不等于任务丢失？
3. 健康检查返回 ok，为什么任务 API 仍可能失败？

完成五项验收和复盘后，再保存第 5 课 Git 版本。本课仍属于阶段 2，账号、用户隔离及完整任务修改／删除接口后续逐步加入。
