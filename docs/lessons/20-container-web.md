# 第 20 课 · 用一个地址访问容器里的账户任务板

第三阶段第 7 课，预计 45–60 分钟。本课将账户页面构建进镜像，由 Nginx 提供网页，并将同一地址下的 API 请求转给 Node.js。你将通过本机地址 `http://127.0.0.1:8080` 完成登录、任务操作和一次后端故障实验。

Compose 的项目名继续使用 `task-board-lesson19`，这样数据库会挂载上节课的 `task-board-lesson19_pgdata` 卷。练习账号和任务可以接着使用。`.env.compose` 也继续使用原有文件。

## 验收 1 · 启动三个服务，打开账户页面

在项目根目录运行下面三行。首次构建网页镜像需要下载 Nginx 镜像并安装前端构建依赖。

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
docker compose --env-file .env.compose up -d --build --wait
docker compose --env-file .env.compose ps
```

确认 `db`、`api`、`web` 都显示 `healthy`，并在 `web` 行看到 `127.0.0.1:8080->8080/tcp`。打开一个新的无痕窗口，访问 [本课账户页面](http://127.0.0.1:8080)。预期能看到登录和创建账号入口。

如果原来的 `npm run dev` 终端还在运行，可以在那个终端按 Control+C，再刷新 8080 页面，观察网页仍能载入。Compose 中的 web 容器此时正在提供已经构建好的 HTML、CSS 和 JavaScript。

## 验收 2 · 核对页面与 API 的响应

```bash
curl -I http://127.0.0.1:8080/
curl -i http://127.0.0.1:8080/api/health
curl -i http://127.0.0.1:8080/api/lesson20-missing
```

依次应收到页面的 200（`text/html`）、健康检查的 200（`application/json`），以及未知接口的 404（`application/json`）。打开 `docker/nginx.conf`，找到 `location /api/` 和 `proxy_pass`。网页由 web 容器读取文件返回，API 请求由 web 转发到 `api:3001`。

## 验收 3 · 登录、修改任务并用 SQL 对照

用上节课的练习账号 `compose19` 登录，确认能看到上节课的任务。如果这是新建的练习数据库，先创建 `compose20` 账号。

1. 新增任务“三容器验收”。
2. 改名为“三容器验收完成”，再勾选完成。
3. 刷新页面，确认名称和完成状态都能读回。
4. 在终端执行下面的 SQL，对照任务的 ID、标题、完成状态和用户名。

```bash
docker compose --env-file .env.compose exec db psql -U task_board_app -d task_board_practice -c "SELECT t.id, t.title, t.completed, u.username FROM tasks t JOIN users u ON u.id=t.owner_id WHERE t.title='三容器验收完成';"
```

找到属于当前账号的那一行，记下 ID。重复练习有多条同名任务时，可以给本次任务改成独有标题，再相应修改 SQL。

## 验收 4 · 观察一次页面刷新发出的请求

在 Chrome 中按 Command+Option+I 打开开发者工具，进入 Network（网络），选择 Fetch/XHR，然后刷新页面。找到 `/api/me` 和 `/api/tasks`，点开后在 Headers 中查看 Request URL 和 Status Code。

保持已登录时，两条请求应返回 200，请求地址都以 `http://127.0.0.1:8080/api/` 开头。浏览器使用网页所在的同一个来源发请求，Nginx 在容器网络中完成后续转发。按顺序解释下面两条路径。

```text
网页文件     浏览器 → Mac 8080 → web 容器 → 构建好的 HTML/CSS/JS
读取任务     浏览器 → Mac 8080 → web 容器 → api:3001 → db:5432
```

如果身份接口返回 401，先重新登录，再刷新并观察。

## 验收 5 · 停掉 API，区分页面与账户服务的状态

先预测 API 停止后，下方两个地址分别会返回什么。

```bash
docker compose --env-file .env.compose stop api
curl -I http://127.0.0.1:8080/
curl -i --max-time 15 http://127.0.0.1:8080/api/health
```

预期页面仍返回 200，健康检查经 Nginx 返回 502 或 504。刷新浏览器，预期能看到“暂时无法连接账户服务”的提示。502 表示转发时遇到了后端连接或响应错误，504 表示等待后端的过程超时。容器停止后的地址解析和网络状态会影响本次出现哪一个状态码。记下你实际看到的结果。

接着启动 API，等待它就绪。

```bash
docker compose --env-file .env.compose up -d --wait api
curl -i http://127.0.0.1:8080/api/health
```

健康检查应恢复 200。若刚启动时还未恢复，稍等几秒再请求。刷新浏览器，确认仍能读到“三容器验收完成”，再查验收 3 的 SQL，任务 ID 应相同。

最后退出登录，刷新页面确认回到登录入口。用同一账号登录，确认任务仍在。完成后执行 `docker compose --env-file .env.compose down` 收尾，保留数据卷。

## 阅读与复盘

打开 `docker/web.Dockerfile`，先找 `AS build` 和 `RUN npm run build:account`，再找 `COPY --from=build`。前一阶段用 Node 构建网页，后一阶段把构建产物装进 Nginx 镜像。用约 5 分钟阅读 Docker 多阶段构建示例。[Docker 多阶段构建](https://docs.docker.com/build/building/multi-stage/)

再看 `docker/nginx.conf` 中的 `proxy_pass`，留意配置保留了请求中的 `/api/` 路径。可用约 5 分钟对照官方文档中的请求路径说明。[Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)

完成后回答三个问题。

1. 浏览器请求任务列表时访问哪个地址？Nginx 又把请求转给谁？
2. 为什么 API 停止后，网页可以返回 200，而健康检查返回 502 或 504？
3. 这次镜像构建后，如果修改了本机的前端源码，要怎样让 8080 页面使用新版本？

五项验收通过后，再保存本课 Git 版本。后续继续学习完整系统的检查、交付和线上环境配置。
