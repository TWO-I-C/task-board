# 第二阶段 · 第 5 课（上）：启动 PostgreSQL 并验证连接

预计 20–40 分钟，下载时间取决于网络。本步由你亲自安装并连接数据库；验收通过后，再把任务 API 接入数据库，完成重启后数据仍然保留的实验。

## 本步目标

运行 PostgreSQL，并通过命令行执行一次查询。只完成本步安装、尚未进行下半课改造时，任务 API 仍是第 4 课的内存版本；安装数据库本身不会自动改变任务的保存位置。

| 程序 | 本机地址／端口 | 作用 |
| --- | --- | --- |
| Vite 前端开发服务器 | 通常为 `localhost:5173` | 向浏览器提供页面与前端代码 |
| Node.js 后端 | `127.0.0.1:3001` | 处理任务 API 请求 |
| PostgreSQL 数据库服务 | 默认 `localhost:5432` | 接受数据库查询，管理持久化数据 |

接入后的数据流将是：浏览器 → 后端 API → PostgreSQL。浏览器不直接连接数据库。

PostgreSQL 是数据库服务；Postgres.app 是在 Mac 上安装、启动和停止它的应用；psql 是与数据库服务通信的命令行客户端。

## 1. 安装并启动

1. 打开 [Postgres.app 官方下载页](https://postgresapp.com/downloads.html)，选择页面顶部的 PostgreSQL 18 稳定版、Universal 安装包。无需下载包含所有版本的安装包，也不使用 Beta／RC 预发布版本。
2. 打开下载的磁盘映像，把 Postgres.app 拖到“应用程序”（Applications）文件夹。
3. 从“应用程序”打开 Postgres.app，点击 Initialize（初始化），保持默认端口 5432。
4. 确认数据库服务显示正在运行。保持应用运行，再进行下一步。

本课使用默认的本机连接方式。官方安装说明中的远程网络访问设置不属于本课操作。

参考：[Postgres.app 安装与初始化说明](https://postgresapp.com/documentation/install.html)，只读 Installing 和 Initializing 两节。

## 2. 确认命令行客户端存在

新开一个空闲终端，执行：

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql --version
```

预期显示 `psql (PostgreSQL) 18.x`，具体小版本以安装结果为准。这只能证明 psql 客户端已安装，尚不能证明数据库服务正在运行。

这里使用完整路径，所以不用先修改系统 PATH。

## 3. 验证数据库真的能回答查询

在同一个空闲终端执行：

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -h 127.0.0.1 -p 5432 -U two-i-c -d postgres -c "SELECT 1 AS connection_ok;"
```

参数含义：`-h` 指定主机，`-p` 指定端口，`-U` 指定数据库用户，`-d` 指定数据库，`-c` 执行这一条 SQL 后退出。

Postgres.app 默认会创建与 macOS 用户同名的数据库用户。这里使用当前电脑用户名 `two-i-c`，连接自带的 `postgres` 数据库。

预期输出大致是：

```text
 connection_ok
---------------
             1
(1 row)
```

这是一条只读查询，不创建或修改任务。它证明客户端成功连接了数据库，数据库执行了 SQL 并返回结果。

如果报错，保留完整错误文本，不要反复初始化或删除数据目录。根据报错检查服务状态、端口或连接设置。

## 验收与下一步

告诉我：Postgres.app 是否正在运行、psql 的版本，以及查询是否返回 1。有错误时发送错误文本。

本步完成后，下半课才会创建项目数据库和 tasks 表，安装 Node.js 的 PostgreSQL 驱动，把 GET／POST 接到数据库，并验证后端与数据库服务重启后任务仍能读回。

复盘：仅安装并运行 Postgres.app，是否就意味着任务板的新增任务已经存进数据库？请结合接口是否已接入数据库这一点判断。

连接验收完成后，继续[第 5 课（下）：让任务保存到 PostgreSQL](05-postgresql-persistence.md)。
