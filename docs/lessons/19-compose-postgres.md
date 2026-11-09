# 第 19 课 · 用 Docker Compose 连接后端和 PostgreSQL

第三阶段第 6 课，预计 45–60 分钟。你将通过账户页面新增一条任务，用 SQL 查出它的 ID，再重建后端和数据库容器，验证能否读回同一条记录。

请求从浏览器进入 Mac 上的账户页面（5190），经开发服务器转发给 API（Mac 的 3102 → 容器的 3001）。API 在 Compose 网络中用服务名 `db` 连接 PostgreSQL 的 5432 端口。数据库文件保存在名为 `pgdata` 的卷中。

## 验收 1 · 启动两个服务

打开终端 A，在项目根目录执行。准备命令会在首次运行时生成本课专用的随机数据库密码，后续复用同一份 `.env.compose`。请保留这个文件，Git 已忽略它。

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
node scripts/init-compose-env.mjs
docker compose --env-file .env.compose config --services
docker compose --env-file .env.compose up -d --build --wait
docker compose --env-file .env.compose ps
```

在 `SERVICE` 列找到 `db` 和 `api`，两者的状态都应为 `healthy`。在 `PORTS` 列找到 API 的 `127.0.0.1:3102->3001/tcp`。数据库行可能显示 `5432/tcp`，只有带主机地址和箭头的条目才表示向 Mac 发布了端口。若启动失败，用 `docker compose --env-file .env.compose logs --tail 30 db api` 查看最后的启动信息。

## 验收 2 · 验证后端找到了哪个数据库

```bash
curl -i http://127.0.0.1:3102/api/health
docker compose --env-file .env.compose logs api
docker compose --env-file .env.compose exec db psql -U task_board_app -d task_board_practice -c "SELECT current_database(), current_user, count(*) AS applied FROM schema_migrations;"
```

第一条应返回 HTTP 200。后端日志应显示初始化和迁移成功，SQL 应返回 `task_board_practice`、`task_board_app` 和本版本的 3 项迁移。打开项目根目录的 `compose.yaml`，找出 API 的 `PGHOST: db` 和 `depends_on`。前者决定连接哪里，后者让 API 等 PostgreSQL 可以接收连接后再启动。容器里的 `127.0.0.1` 指向该容器自身。[Compose 服务间网络](https://docs.docker.com/compose/how-tos/networking/) · [Compose 启动顺序](https://docs.docker.com/compose/how-tos/startup-order/)

## 验收 3 · 从页面写入，再用 SQL 对照

打开终端 B 并运行下面两行，让账户页面把请求发到刚刚验证的 3102。保持这个终端运行。

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
TASK_BOARD_DEV_API=http://127.0.0.1:3102 npm run dev -- --host 127.0.0.1 --port 5190 --strictPort
```

用一个新的无痕窗口打开 [本课账户页面](http://127.0.0.1:5190)。创建练习账号 `compose19`，设置至少 15 个字符的练习密码，登录后新增任务“验收 Compose 持久化”。如果之前已创建这个练习账号，直接登录。重复练习时可以选择新的任务标题，并对应调整下方查询。

回到终端 A，运行下面的 SQL。它通过 `owner_id` 核对归属，通过标题找到你刚刚新增的任务。

```bash
docker compose --env-file .env.compose exec db psql -U task_board_app -d task_board_practice -c "SELECT t.id, t.title, u.username FROM tasks t JOIN users u ON u.id = t.owner_id WHERE u.username = 'compose19' AND t.title = '验收 Compose 持久化';"
```

核对标题和用户名，记下任务 ID。如果查出多条同名任务，请用一个新的标题重新做这项对照。保留当前浏览器窗口和终端 B。

## 验收 4 · 移除容器，找到留下的数据卷

在终端 A 先记下数据库容器 ID，再移除本课的容器和网络。

```bash
docker compose --env-file .env.compose ps -q db
docker compose --env-file .env.compose down
docker volume ls --filter label=com.docker.compose.project=task-board-lesson19
curl -i --max-time 5 http://127.0.0.1:3102/api/health
```

按原样使用 `down`。`-v` 会连同练习数据卷一起删除。预期此时 3102 连接失败，卷列表里仍有 `task-board-lesson19_pgdata`。镜像提供程序，卷保存 PostgreSQL 写入的数据文件。[Docker 官方卷说明](https://docs.docker.com/engine/storage/volumes/)

## 验收 5 · 重建容器，读回同一个 ID

```bash
docker compose --env-file .env.compose up -d --wait
docker compose --env-file .env.compose ps -q db
```

数据库容器 ID 应与验收 4 中记录的不同。回到原浏览器窗口刷新页面，若会话已过期，用同一账号重新登录。任务应重新出现。再执行验收 3 的 SQL，确认任务 ID 与重建前完全相同。

记录三个结果：数据库容器 ID 是否改变、任务 ID 是否改变、刷新后的页面显示什么。完成后，在终端 B 按 Control+C，在终端 A 执行 `docker compose --env-file .env.compose down` 收尾。

## 复盘

1. API 容器为什么能用 `db:5432` 找到数据库？浏览器发请求时用的是哪个入口？
2. 健康检查返回 200、页面提示新增成功、SQL 查到对应的任务，这三项分别说明什么？
3. 新的数据库容器是怎样读回原来那条任务的？你用哪两个 ID 判断这是一个新容器在读取旧数据？

五项验收后，再把本课文件保存为一次 Git 提交。
