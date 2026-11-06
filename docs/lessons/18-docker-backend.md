# 第 18 课 · 用 Docker 运行任务板后端

第三阶段第 5 课。目标是在 Mac 上访问容器里的 `/api/health`，并通过一次停启实验证明是谁返回了响应。第一次安装工具和下载镜像需要额外时间。

## 验收 1 · 确认 Docker 引擎在运行

这台 Mac 使用 Intel 芯片。打开官方安装页，选择 **Docker Desktop for Mac with Intel chip**，打开下载的磁盘映像，将 Docker 拖入“应用程序”，从那里启动。完成首次设置，等引擎启动后新开一个终端。[Docker 官方 Mac 安装说明](https://docs.docker.com/desktop/setup/install/mac-install/)

```bash
docker version
```

看到 **Client** 和 **Server** 两段版本信息才算通过。Client 是你在终端调用的工具，Server 是接收命令、管理镜像和容器的引擎。如果只有 Client 并提示连接失败，先看 Docker Desktop 的启动状态，然后重试。如果终端提示 `command not found`，检查首次设置中的 CLI 安装位置并重新打开终端。

## 验收 2 · 构建后端镜像

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
docker build -t task-board-api:lesson18 .
docker image ls task-board-api:lesson18
```

最后的点表示从当前项目目录读取构建所需的文件。打开项目根目录的 `Dockerfile`，依次找到 Node 24 基础镜像、按锁文件安装依赖的 `RUN`、复制后端的 `COPY`，以及启动服务的 `CMD`。`.dockerignore` 指定允许发送到构建过程的项目文件，本机的 `.env`、`.git` 和 `node_modules` 都会被排除。

镜像列表中能找到 `task-board-api` 和标签 `lesson18` 就通过了。镜像包含启动所需的文件。运行它时，Docker 才会创建容器。可用 5 分钟阅读官方文档的 *Explanation* 小节，然后回到本项目操作。[Docker 的容器入门](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/)

## 验收 3 · 启动容器并收到响应

```bash
docker run -d --name task-board-api-18 -p 127.0.0.1:3101:3001 task-board-api:lesson18
docker port task-board-api-18
docker logs task-board-api-18
curl -i --max-time 5 http://127.0.0.1:3101/api/health
```

**通过标准**：端口映射显示 `3001/tcp -> 127.0.0.1:3101`，请求返回 HTTP 200，正文包含 `"status": "ok"` 和 `"service": "task-board-api"`。如果日志还没打印启动信息，等几秒再执行最后两行。

请求的路径是 **Mac 的 3101 → 容器的 3001 → Node.js**。容器内设置 `API_HOST=0.0.0.0`，让 Node 接收从容器网卡转入的请求。在 Mac 上，`-p` 把入口限定在本机回环地址。浏览器也可以打开同一个健康检查地址。[Docker 官方端口映射说明](https://docs.docker.com/engine/network/port-publishing/)

如果报容器名已存在，运行 `docker ps -a --filter name=task-board-api-18` 查看状态。若它就是刚刚创建的练习容器，已停止时用 `docker start task-board-api-18`，正在运行时直接检查端口和日志。若端口占用或无法确认容器来源，先保留现场，记下报错。

## 验收 4 · 停止容器，观察同一个请求

先预测：停止后再次请求，终端会显示 HTTP 404，还是连不上？镜像还在吗？

```bash
docker stop task-board-api-18
docker ps -a --filter name=task-board-api-18
curl -i --max-time 5 http://127.0.0.1:3101/api/health
docker image ls task-board-api:lesson18
```

容器状态为 `Exited`、同一地址的请求失败、镜像仍能列出，这三项都观察到就通过了。404 需要一个运行中的 HTTP 服务接住请求并返回响应。停掉容器后，原先接收请求的进程已经退出。

## 验收 5 · 启动同一个容器并恢复访问

```bash
docker start task-board-api-18
curl -i --max-time 5 http://127.0.0.1:3101/api/health
```

若刚启动时连接尚未就绪，稍等再请求。**通过标准**：再次收到 200 和新的 `serverTime`。记录三次请求的结果，再执行 `docker stop task-board-api-18` 收尾，容器会保留供下次练习使用。

## 复盘

1. `docker build`、`docker run`、`docker start` 在这次实验中各做了什么？
2. 如果 Mac 上原来的后端也在监听 3001，为什么要一直请求 3101 才能验证这个容器的停启？
3. 看一下后端处理 `/api/health` 的代码。如果要证明 PostgreSQL 也能保存任务，你还需要哪条证据？

五项通过后再保存这次 Git 版本。下一个增量再用 Compose 连接后端和独立的练习数据库。
