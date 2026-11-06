# 第二阶段 · 第 9 课：用户与任务的数据关系

预计 60–75 分钟，包含约 15 分钟阅读。本课从“任务能保存”走向“任务属于谁”，用 SQL 验证用户与任务的关联。页面没有新增按钮，本课主要在终端完成。

## 课程进度

阶段 1：本地产品、Git 保存和静态网站上线，已完成。

阶段 2：已完成前端调用 API、任务增删改查和 PostgreSQL 持久化。本课学习数据建模；之后依次学习注册、登录状态，以及每个用户只能访问自己的任务。完成这些并独立验收后，才算完成阶段 2。

## 本课的三个问题

1. **任务属于谁？** users 表保存用户，tasks.owner_id 引用 users.id。
2. **这次请求是谁发来的？** 需要后续的登录与身份认证。
3. **这个人能否操作这条任务？** 需要后端检查权限。

本课只完成第一个问题。不能让前端随便填写一个 owner_id 就证明身份；外键也不会替后端判断请求者有没有权限。当前 API 仍能读取和操作全部后端任务，继续只在本机练习。

## 最小数据模型

```text
users                                  tasks
id（用户主键） <──────────────────────── owner_id（外键）
username（用户名，不可重复）              id（任务主键）
created_at                             title、completed、created_at

一个用户可以对应多条任务；一条已分配的任务对应一个用户。
```

用户 ID 与任务 ID 是不同表的主键。两个用户都可以创建“读书”，任务标题不用于判断归属。

- `users.username` 暂定为 3–32 位小写字母、数字、下划线，以字母开头。练习使用虚构用户名，无须填写邮箱或密码。
- 外键要求非空的 owner_id 必须对应一个存在的 users.id。
- 旧任务还没有已确认的归属，所以 owner_id 暂时允许 NULL；这表示“尚未分配”，不是“公开”。当前 API 新增的任务也暂为 NULL。
- 用户名将来修改时，关联仍指向稳定的用户 ID。
- `ON DELETE RESTRICT` 阻止直接删除仍拥有任务的用户。本课不实现删号，也不自动删除其任务。

## 配套阅读（约 15 分钟）

只读下面三节的主要示例，可以用浏览器翻译；不需要完整阅读数据库教材。

- [PostgreSQL 18：Foreign Keys](https://www.postgresql.org/docs/18/tutorial-fk.html)：外键怎样拒绝不存在的关联对象。
- [PostgreSQL 18：Joins Between Tables](https://www.postgresql.org/docs/18/tutorial-join.html)：重点看 JOIN ... ON，以及 LEFT JOIN 如何保留没有匹配对象的行。
- [PostgreSQL 18：Transactions](https://www.postgresql.org/docs/18/tutorial-transactions.html)：先看 BEGIN、COMMIT、ROLLBACK；保存点留待后续。

## 验收 1：检查结构与原有数据

保持 Postgres.app 运行。在普通终端进入项目：

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
npm run db:migrate
```

本课交付时已应用过迁移，这次应显示“没有待执行的迁移”。在新环境中需先运行 `npm run db:init`，第一次迁移会显示 `001-task-owners.sql`。迁移是修改已有数据库结构的编号步骤；重复执行命令不会重复创建或清空表。

然后进入交互式 psql。接下来标为 SQL 的代码只在这里执行，不在普通 shell 中执行。

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -X -h 127.0.0.1 -p 5432 -U two-i-c -d task_board
```

看到 `task_board=#` 后执行：

```text
\pset pager off
\pset null '(未分配)'
\d users
\d tasks
```

应看到 users 表、username 唯一约束，以及 tasks.owner_id 的外键。

```sql
SELECT id, title, completed, owner_id FROM tasks ORDER BY created_at, id;
SELECT version FROM schema_migrations ORDER BY version;
SELECT count(*) AS original_task_count FROM tasks;
```

核对原有任务名称、完成状态和数量；记下任务总数 N。原有任务的 owner_id 应显示 `(未分配)`；迁移记录只有一条 `001-task-owners.sql`。在另一个终端重复执行 `npm run db:migrate`，这里重新查询，数量应不变。

## 验收 2：建立一对多关系并查询

仍在同一个 psql 窗口。先执行 BEGIN，再粘贴其后的 INSERT；本练习最后使用 ROLLBACK，不使用 COMMIT。临时用户与任务只在这次事务中存在。

```sql
BEGIN;

INSERT INTO users (id, username) VALUES
  ('lesson09-user-a', 'lesson09_alice'),
  ('lesson09-user-b', 'lesson09_bob');

INSERT INTO tasks (id, title, owner_id) VALUES
  ('lesson09-task-a1', '读书', 'lesson09-user-a'),
  ('lesson09-task-a2', '跑步', 'lesson09-user-a'),
  ('lesson09-task-b1', '读书', 'lesson09-user-b');

SELECT tasks.id, tasks.title, users.username
FROM tasks
JOIN users ON tasks.owner_id = users.id
WHERE tasks.id IN ('lesson09-task-a1', 'lesson09-task-a2', 'lesson09-task-b1')
ORDER BY tasks.id;
```

预期 3 行：alice 的“读书、跑步”，bob 的“读书”。`JOIN ... ON` 按关联条件组合两张表，不会创建新表或修改记录。两个“读书”的任务 ID 和 owner_id 均不同。

此时查询总任务数应为 N+3；先不要结束事务。网页通过另一条数据库连接读取，不会看到这些未提交的练习记录，这是正常现象。

## 验收 3：观察旧任务为何没有出现在 JOIN 结果中

在同一事务中执行：

```sql
SELECT tasks.id, tasks.title, users.username
FROM tasks
LEFT JOIN users ON tasks.owner_id = users.id
ORDER BY tasks.created_at, tasks.id;
```

预期 N+3 行。旧任务也会显示，对应 username 为 `(未分配)`。INNER JOIN 只保留匹配的行；LEFT JOIN 保留左侧 tasks 的所有行。普通 JOIN 的缺行只是查询结果不同，不表示旧任务被删除。

可对照下面不带任务 ID 筛选的普通 JOIN，结果只有 3 行：

```sql
SELECT tasks.id, tasks.title, users.username
FROM tasks
JOIN users ON tasks.owner_id = users.id
ORDER BY tasks.id;
```

## 验收 4：让数据库拒绝不存在的用户

仍在上述事务中，单独执行下面这一条：

```sql
INSERT INTO tasks (id, title, owner_id)
VALUES ('lesson09-task-invalid', '不应写入的练习', 'lesson09-missing-user');
```

预期 ERROR，包含 `foreign key constraint`。不存在的用户不能成为任务所有者。

此时事务进入失败状态，提示符通常变为 `task_board=!#`。先执行下面的回滚，再执行后面的查询：

```sql
ROLLBACK;

SELECT count(*) AS remaining_practice_users FROM users
WHERE id IN ('lesson09-user-a', 'lesson09-user-b');

SELECT count(*) AS remaining_practice_tasks FROM tasks
WHERE id IN ('lesson09-task-a1', 'lesson09-task-a2', 'lesson09-task-b1', 'lesson09-task-invalid');

SELECT count(*) AS task_count_after_rollback FROM tasks;
```

预期依次为 **0、0、N**。ROLLBACK 取消本次 BEGIN 之后的所有写入，包括前面成功的两条用户和三条任务；原有任务保留，之前已经提交的表结构也保留。它不是“只撤销最后一条错误语句”，也不能撤销之前已经提交的删除。

## 验收 5：回到网页核对

先退出 psql：

```text
\q
```

保持后端和前端运行，打开 http://localhost:5173/，点击“读取后端任务”。应仍是原有 N 条任务，完成数量与原先一致；没有本课的 alice/bob 练习任务。

页面没有增加注册或登录入口。用户表里的记录本身不能让浏览器登录，当前 API 也没有按用户过滤。后续课程会逐步接通这些行为。

如果练习中途出错，先在该 psql 窗口执行 `ROLLBACK;`，再核对原有数据；不要在错误状态下不断粘贴后续 SQL。直接退出 psql 也会放弃该连接尚未提交的事务。

## 对照代码

- `server/migrations/001-task-owners.sql`：新用户表与 owner_id 外键，保留原有任务。
- `server/migrate-db.js`：按编号执行尚未应用的迁移，同一事务中记录版本，失败尝试回滚。
- `schema_migrations`：数据库中的已执行版本记录，重复运行时据此跳过。

已经执行的迁移文件不要再修改；下一次结构变更添加新编号。`git commit` 保存文件版本，不会自动运行 SQL，也不是数据库备份。

## 复盘与保存

完成五项验收后回答：

1. alice 和 bob 都有“读书”任务，数据库靠哪两个字段区分“哪条任务”和“属于谁”？
2. 旧任务在普通 JOIN 中不出现、LEFT JOIN 中却出现，是否说明它们曾被删除？为什么？
3. 已经有 owner_id 和外键，是否就能阻止 alice 通过 API 修改 bob 的任务？还缺什么？

验收与复盘后再保存 Git 版本。下一课进入注册：把“创建用户记录”接到一个可以验证的 API，并正确处理密码存储。
