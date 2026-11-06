# 第二阶段 · 第 12 课：任务权限与用户隔离

预计 60–90 分钟，包含约 15 分钟阅读。目标：区分“认证你是谁”和“授权你做什么”，验证后端按当前登录用户限制每一次任务操作。

## 课程进度

阶段 1 已完成。阶段 2 已完成 API、数据库持久化、用户关系、注册、密码存储和登录会话。本课把这些部分连接起来：每个用户只管理自己的后端任务。完成本课验收后，再做阶段 2 综合验收与界面整合，随后进入工程交付。

当前仍是本机教学应用。上方“我的任务”属于浏览器本地任务，与账号无关；下方“后端任务”才使用本课权限规则。GitHub Pages 仍是阶段 1 的静态网站。

## 一次请求经过的两道检查

```text
请求携带 Cookie
  → 会话存在且未过期吗？
      否：401，不执行任务操作
      是：得到后端确认的 currentUser.id
  → 目标任务的 owner_id 等于 currentUser.id 吗？
      否：不允许修改或删除，本项目统一返回 404
      是：执行操作，返回结果
```

登录是认证；检查任务归属是授权。客户端传来的用户名、user_id、owner_id 都不能替代已经验证的会话。

| 操作 | 后端规则 |
| --- | --- |
| GET /api/tasks | 只查询 owner_id 等于当前用户 ID 的任务 |
| POST /api/tasks | 正文只接受 title；owner_id 由后端从会话取得 |
| PATCH /api/tasks/:id | SQL 同时匹配任务 id 和当前用户 owner_id |
| DELETE /api/tasks/:id | SQL 同时匹配任务 id 和当前用户 owner_id |

修改完成状态的 SQL 现在类似下面这样，参数仍通过数据库驱动绑定，不拼接输入：

```sql
UPDATE tasks SET completed = $1
WHERE id = $2 AND owner_id = $3
RETURNING id, title, completed;
```

$2 是目标任务 ID，$3 是后端从有效会话中确认的用户 ID。把权限条件放进修改语句，可以避免“先查归属、稍后修改”之间的归属变化漏洞。本课没有转移任务归属接口。

一个陌生任务 ID 可能不存在，也可能属于别人。两种情况统一返回 404 和“任务不存在或无权访问”，不向调用者额外透露别人的任务是否存在。404 在这里不等于数据库里一定没有这条记录。

## 配套阅读（约 15 分钟）

- [OWASP：Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)：只读 Deny by Default 和 Validate the Permissions on Every Request。权限检查必须在后端执行，且覆盖每次请求。
- [OWASP：IDOR Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)：看 Examples、Identifier complexity 与 Verifying access controls。重点理解“把 URL 中的 ID 换成别人的 ID”。即便任务使用难猜的 UUID，也仍需要权限检查。

## 开始前

保持 PostgreSQL、前端、后端运行，固定使用 http://localhost:5173/。注册面板下面是登录面板，登录后再出现可操作的后端任务区。测试都在下方“后端任务”完成。

使用上一课两个不同的练习账户，例如 lesson10_alice 与 lesson10_bob，密码由你自己保存。忘记练习密码可以注册新的练习账户；不要向我发送密码或 Cookie。下面 SQL 中的用户名也要相应替换。

本课无需新迁移。交付前核对到原有 7 条任务，其中 2 条完成，7 条均为 owner_id = NULL。它们仍保留，但不出现在任何用户的任务列表中，也不能通过普通任务 API 修改或删除。NULL 表示未分配，不表示公开。不能因为某人第一个登录，就自动把旧任务都归给他。

## 五项独立验收

### 1. 未登录不能读取，旧数据仍在

在任务板正常退出。打开同一主机名下的 http://localhost:5173/api/tasks，应看到未登录错误，Network 中状态为 401。任务板后端区域显示“请先登录”。

用新终端进入 psql：

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -X -h 127.0.0.1 -p 5432 -U two-i-c -d task_board
```

```text
\pset pager off
```

执行：

```sql
SELECT count(*) AS all_tasks,
       count(*) FILTER (WHERE owner_id IS NULL) AS unassigned_tasks
FROM tasks;
```

首次开始本课且未新增任务时，预期为 7 和 7。随后增加自己的任务会让 all_tasks 增加，unassigned_tasks 应仍为 7。若你此前已经增加了其他练习数据，以自己的初始计数为准。

### 2. Alice 新增任务，归属由后端决定

登录 Alice，点击“读取后端任务”。新账户起初应为空。新增“第12课同名任务”，勾选完成，再刷新页面、点击读取；任务和完成状态仍保留。

Network 中检查 POST /api/tasks 的 Request Payload：只有 title，没有你手填的 owner_id。后端从有效会话确定归属。在 psql 中执行只读查询：

```sql
SELECT tasks.id, tasks.title, tasks.completed, users.username
FROM tasks JOIN users ON tasks.owner_id = users.id
WHERE users.username IN ('lesson10_alice', 'lesson10_bob')
ORDER BY users.username, tasks.created_at, tasks.id;
```

Alice 的任务应对应她自己的用户名。记住：数据库里的 owner_id 是后端写入的；客户端省略 owner_id 并不意味着任务没有归属。

### 3. Bob 的同名任务与 Alice 互不影响

退出 Alice，登录 Bob，点击读取：不能看到 Alice 的任务。Bob 也新增“第12课同名任务”，暂不勾选。

再次执行第二项 SQL：两条标题相同的任务有不同 id、不同归属；Alice 已完成，Bob 未完成。把 Bob 的任务改名为“第12课 Bob 的任务”，再通过确认区删除它。

退出 Bob，重新登录 Alice并读取：Alice 的原任务仍存在，名称和完成状态不变。不能仅凭页面隐藏了别人任务，就认定接口已受保护，第五项会直接验证接口。

### 4. 退出和切换账号不遗留旧列表

同一个 Chrome 配置中再开一个普通标签页，访问相同的 localhost 地址。两个普通标签页共享当前登录状态，并不是两个独立用户环境。

在第一个标签页读取 Alice 的任务；在第二个标签页退出。第一个标签页也应收到通知，收起旧列表及编辑、新增输入，显示需要登录。刷新后仍不能读取任务。

在第二个标签页登录 Bob，第一个标签页会重新向后端确认身份；点击读取，只能读取 Bob 的任务。若浏览器不支持跨标签页通知，点击“重新确认登录状态”。需要同时保持两个不同用户时，应使用不同浏览器配置或普通窗口与独立无痕环境。

上方浏览器本地任务仍可操作，这是阶段 1 的独立数据。它们不会因退出账号而被删除，也不受本课后端权限系统保护。

### 5. 绕过页面，直接验证接口拒绝越权

在普通终端中运行（不是 psql 内；如仍在 psql，先执行 \q）：

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
npm run test:permissions
```

这条命令使用已安装的 Node.js 和 Postgres.app，在系统临时目录建立全新的数据库，以随机端口启动独立后端。测试会创建两个虚构账户，不要求输入真实密码，不连接你的 task_board 数据库，也不要求停止现有服务。完成后关闭测试进程、清理临时数据库。其他环境可用 POSTGRES_BIN 指定 PostgreSQL 命令所在目录。

应看到 PASS 1 到 PASS 5 和“五组权限检查通过”，然后回到终端提示符。它直接发送 HTTP 请求并核对数据库，包括：

1. 没有会话或伪造会话时，所有任务操作返回 401。
2. 两个用户读取自己的同名任务，伪造查询参数也不能读取对方或未分配任务。
3. 直接用对方的任务 ID 改名、修改完成状态和删除，均为 404，数据保持不变；请求正文伪造 owner_id 为 400。
4. 自己的增删改查成功、重启后仍保留，另一个用户的数据不受影响。
5. 数据库停止时为 503；已退出或过期的旧令牌再请求为 401；恢复后数据完整。

打开 tests/task-permissions.mjs，找到“越权改名”和断言 response.status 为 404 的位置。说清楚这项测试输入了什么、期待什么、怎样确认数据库没有被修改。本课先学会运行和解释测试，阶段 3 再系统学习测试组织与 CI。

测试之后重新查询自己的数据库，原有未分配任务仍为 7，本课手工创建的任务也不受测试影响。Alice 的练习任务可以保留用于下一课。

## 常见结果

| 状态码 | 本课含义 |
| --- | --- |
| 200 / 201 | 已授权的查询或修改成功 / 新增成功 |
| 400 | 正文不符合要求，例如试图自行填写 owner_id |
| 401 | 未登录、会话不存在或已过期 |
| 403 | 修改请求的来源检查不通过 |
| 404 | 指定任务不存在或不属于当前用户 |
| 409 | 页面记住的用户与请求实际携带的会话不一致，需要重新确认身份 |
| 503 | 数据库无法完成请求；不能假设任务已保存或被删除 |

任务写入继续检查 X-Task-Board-Request 和浏览器来源。页面额外发送 X-Task-Board-User，作用是防止在别的标签页切换账号后，旧页面误操作新账号；它只与会话身份作一致性比较，不能用于授予权限。直接请求即使不带这个可选头，也必须通过会话和任务归属检查。

跨标签页通知只是提醒页面重新调用 /api/me，消息本身不决定谁已登录。退出或身份重查会卸载旧任务区域、取消尚在等待的请求，并清除旧列表和草稿。取消浏览器等待不等于回滚服务器已经完成的写入，结果不明时仍需重新读取核对。

本课默认保留旧的未分配任务。若之后需要恢复到某个账户下，应先确认具体任务与接收账户，再通过明确的迁移分配，不能让普通用户自行认领所有旧任务。

## 复盘与保存

1. Alice 在新增请求里填写 Bob 的 owner_id，后端应该怎样处理？真正的归属应从哪里取得？
2. 已经验证登录，为什么 UPDATE 和 DELETE 还要同时检查任务 id 与 owner_id？只隐藏别人的任务按钮够不够？
3. 登录后旧的 7 条任务不显示，是否代表被删除？你会怎样验证？

验收和复盘通过后再保存 Git 版本，不推送到线上。下一步做阶段 2 综合验收与界面整合。
