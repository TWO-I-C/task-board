# 个人任务板

用 React、Vite 和 AI 辅助开发的学习项目。支持新增任务、完成与取消完成、编辑名称、删除确认、状态筛选，以及浏览器本地保存。

在线使用：[打开个人任务板](https://two-i-c.github.io/task-board/)

## 数据保存在哪里

上方“我的任务”保存在当前浏览器的 localStorage 中，不会上传到 GitHub，也不会在不同设备或浏览器之间同步。清除网站数据会删除任务。

本地开发地址和线上网址属于不同来源，各自保存自己的任务。首次打开线上网站时看不到本地开发时的任务，这是正常的。

本地学习面板中的“后端任务”通过 Node.js 写入 PostgreSQL 的 `task_board` 数据库、`tasks` 表。它与上方个人任务独立；后端和数据库服务重启后，已提交的数据仍保留。

## 本地开发

使用 Node.js 24。在项目目录中执行：

```bash
npm ci
npm run dev
```

打开终端显示的本地网址。已经安装依赖且依赖文件没有变化时，只需执行 `npm run dev`。

## 本地数据库与后端

当前学习环境已创建数据库并导入接入前的 3 条后端任务。保持 Postgres.app 运行，再执行 `npm run server`。`.env` 保存本地数据库配置，已加入 Git 忽略；`.env.example` 是供其他环境参考的模板。

新环境按第 5 课先安装 PostgreSQL，再创建项目数据库。使用 Postgres.app 时，可以在终端运行下面的命令一次（已存在时无需再创建）：

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/createdb -h 127.0.0.1 -p 5432 task_board
```

需要自定义连接时，把 `.env.example` 复制为 `.env` 并填写自己的 PostgreSQL 用户；保留已有 `.env`。未设置时，后端默认连接本机 5432 端口的 `task_board`，用户名取当前系统用户。

```bash
npm run db:init
npm run db:migrate
npm run server
```

`db:init` 只创建缺少的表，不清空或填入示例数据。新环境的任务表起初为空；当前电脑接入前的记录已单独迁移。GET 使用 SELECT，POST 使用带参数的 INSERT；PATCH 按 ID 使用带参数的 UPDATE 保存完成状态。数据库请求失败返回 503，不回退到内存。`/api/health` 只检查后端进程，数据库停止时它仍可能返回 200。

`db:migrate` 按编号执行 `server/migrations/` 下尚未应用的 SQL 文件，在同一个事务中记录到 `schema_migrations`；重复运行会跳过已完成的版本。新增结构变更应添加新的编号文件，不修改已执行的迁移。Git 保存迁移代码，数据库命令才实际应用结构变更。

第 9 课增加 `users` 表和 `tasks.owner_id` 外键，已有任务保留且归属暂为 NULL。用户名采用 3–32 位小写字母、数字、下划线，并以字母开头；用户名不能重复。一个用户可以拥有多条任务；仍有关联任务的用户不能直接删除。任务 API 尚未接入登录与权限检查，仍操作全部后端任务，新建任务暂不分配用户。NULL 不表示公开任务。服务继续仅供本机学习。

第 10 课通过第二份迁移增加 `users.password_hash`，并在本地页面提供注册表单。`POST /api/register` 只接受 JSON 中的 `username`、`password`：用户名去除首尾空白后转为小写；密码原样保留，按 Unicode 码点计 15–128 个字符，不接受全空白、NUL 或无效 Unicode。确认密码只用于页面校验。后端独立校验，采用 Node.js 异步 scrypt（N=131072、r=8、p=1）和每次随机的 16 字节盐；数据库保存算法、参数、盐和派生结果，不保存原始密码。

注册成功返回 201 和 `user.id`、`user.username`、`user.created_at`。重名返回 409，不覆盖旧用户或密码；错误输入返回 400，数据库不可用返回 503。两次并发重名注册由数据库唯一约束保证只创建一条。响应和应用日志不包含密码或哈希；页面不将密码写入 localStorage，发送请求结束后清空密码框。不创建登录 Cookie 或令牌，旧的无密码用户仍保持 NULL。哈希同时计算最多两份，超出返回 503；公开服务所需的完整频率限制、常见密码检查和 HTTPS 部署留待后续，当前注册服务仅在本机运行。

第 11 课增加数据库 `sessions` 表与登录面板。`POST /api/login` 校验用户名、密码，按已保存的盐和参数重新计算 scrypt 并安全比较；错误密码、不存在用户、无密码记录均返回 401。成功返回 200、公开用户信息和到期时间，并设置 `task_board_session` Cookie（HttpOnly、SameSite=Lax、Path=/api、Max-Age=3600，无 Domain）。每次成功登录生成新的 32 字节随机令牌，只把它的 SHA-256 摘要存进数据库，并撤销当前浏览器先前的会话。注册不会切换当前已登录用户。

`GET /api/me` 通过 Cookie 查询未过期的数据库会话，返回用户和到期时间；无有效会话返回 401。`POST /api/logout` 接受空 JSON 对象，删除当前会话后清 Cookie；失败返回 503，不伪装成已退出。会话在后端重启后保留，固定一小时到期，不随访问续期；登录时顺便清理过期记录。页面刷新会调用 me，不把用户身份或会话令牌保存在 localStorage。

登录和退出必须带 `Content-Type: application/json`、`X-Task-Board-Request: 1`，浏览器 Origin 还需属于 `APP_ORIGINS`（默认 localhost:5173 与 127.0.0.1:5173）；外部来源被拒绝，不开放 CORS。登录每来源地址每分钟最多 20 次，超过返回 429 与 Retry-After；该计数只在本进程内，重启会清零。注册与登录共享最多两份并发密码计算。当前本机 HTTP 默认 `COOKIE_SECURE=false`；未来 HTTPS 部署必须设为 true。这是本机教学实现，仍需后续完善部署与分布式限流等措施。任务 API 本课仍未按登录用户过滤或检查归属，登录不等于用户数据隔离。

`PATCH /api/tasks/:id` 每次接受一个字段：`{ "completed": true }` / `{ "completed": false }` 修改完成状态，或 `{ "title": "新名称" }` 修改名称。后端会去除名称首尾空白，拒绝空名称、非文本、超过 200 个字符或包含空字符的名称；其他字段或一次传两个字段返回 400。成功返回 200 和修改后的任务，不存在的任务返回 404。

页面等待保存确认并重新读取后才更新列表。编辑名称时可保存或取消，失败会保留编辑文字并要求重新读取核对；读取不会自动提交草稿。请求进行中暂时禁用重复操作。

`DELETE /api/tasks/:id` 按 URL 中的 ID 删除任务，不需要请求正文。删除成功返回 200 和被删除的任务；记录已不存在则返回 404，数据库不可用返回 503。页面先显示确认区，取消不会发送 DELETE；确认后等待后端结果，再读取列表更新任务与计数。失败或结果不明确时显示提示并要求重新读取核对。

## 构建与预览上线版本

```bash
npm run build -- --base=/task-board/
npm run preview -- --base=/task-board/
```

构建产物在 `dist` 目录中。预览仅用于本地检查，不是线上服务器。

## 自动部署到 GitHub Pages

仓库的 Settings → Pages → Source 使用 **GitHub Actions**。

工作流位于 `.github/workflows/deploy.yml`。每次推送到 `main`，它依次执行：安装依赖 → 构建网站 → 上传 `dist` → 发布到 GitHub Pages。也可以在 Actions 页面手动运行。

因为网站部署在 `/task-board/` 路径下，构建时需要指定 `--base=/task-board/`，让页面从正确的位置加载 JavaScript 和 CSS。本地开发配置不变。

可以在 [Actions 页面](https://github.com/TWO-I-C/task-board/actions) 查看发布结果。只有流程成功完成，才能确认该版本已经发布；`git commit` 只在本地保存版本，`git push` 才会触发这里的自动部署。

## 上线后验收

1. 打开线上网址，新增任务、编辑名称、切换完成状态并筛选。
2. 刷新页面，确认任务名称和完成状态保留。
3. 用另一台设备打开同一网址，确认可以使用，且任务列表独立保存。
4. 删除测试任务，确认刷新后不会重新出现。

部署参考：[Vite 官方指南](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 第二阶段学习实验

[第 1 课：让后端回答一个请求](docs/lessons/01-first-api.md)。在本地运行 `npm run server`，访问 `http://127.0.0.1:3001/api/health`。

[第 2 课：让页面调用后端](docs/lessons/02-connect-backend.md)。同时运行 `npm run server` 与 `npm run dev`，在本地任务板底部点击“检查后端连接”。

[第 3 课：读取后端任务列表](docs/lessons/03-read-backend-tasks.md)。访问 `http://127.0.0.1:3001/api/tasks` 查看 JSON，再在本地页面点击“读取后端任务”，对照两种展示。

[第 4 课：向后端新增任务](docs/lessons/04-create-backend-tasks.md)。在“本地学习实验：后端任务”中输入名称，点击“新增到后端”，观察 POST 请求及重启后的数据变化。

[第 5 课（上）：启动 PostgreSQL 并验证连接](docs/lessons/05-postgresql-setup.md)。先安装本地数据库并执行一次查询；完成连接验收后，再将任务接口接入数据库。

[第 5 课（下）：让任务保存到 PostgreSQL](docs/lessons/05-postgresql-persistence.md)。观察 SQL 读写、后端重启、数据库停止和恢复，验证持久化。

[第 6 课：保存后端任务的完成状态](docs/lessons/06-update-backend-tasks.md)。用 PATCH 和 SQL UPDATE 修改指定任务，验证同名任务隔离、重启保留和失败后的页面反馈。

[第 7 课：编辑后端任务名称](docs/lessons/07-edit-backend-task-title.md)。练习名称校验、编辑草稿、取消与保存失败后的恢复，验证改名不影响任务 ID 和完成状态。

[第 8 课：删除后端任务](docs/lessons/08-delete-backend-tasks.md)。通过确认与取消、同名任务隔离、SQL 核对及失败恢复，补齐任务的增删改查。

[第 9 课：用户与任务的数据关系](docs/lessons/09-task-ownership.md)。理解主键、外键与一对多关系，练习 JOIN、迁移和回滚，区分数据归属与访问权限。

[第 10 课：用户注册与密码存储](docs/lessons/10-user-registration.md)。练习输入校验、重名处理、随机盐与密码哈希，验证注册失败和恢复。

[第 11 课：登录验证与会话](docs/lessons/11-login-sessions.md)。观察密码验证、Cookie、当前用户、刷新保留、故障恢复与退出失效。

本地开发页面通过 Vite 转发请求到后端，下方任务现已连接 PostgreSQL。前面课程文档保留各阶段的实验背景，当前任务操作以第 8 课为准，账号与数据库结构以第 11 课为准。学习面板只在开发模式显示；GitHub Pages 仍只发布浏览器本地任务板，不运行这个 Node.js 后端或 PostgreSQL。
