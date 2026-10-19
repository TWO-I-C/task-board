# 第二阶段 · 第 1 课：让后端回答一个请求

预计 30–45 分钟，包含下面的必读材料，选读另计。目标是能启动、停止后端，并解释浏览器收到的数据从哪里来。

这节课使用同一个任务板项目，只新增一个本地 API。任务板页面仍使用浏览器本地保存，尚未调用这个 API。GitHub Pages 上的版本继续正常工作。

## 先认识这条数据流

浏览器发送 GET 请求 → Node.js 后端处理 → 返回 HTTP 状态码和 JSON 数据。

- **后端**：这里是运行在你电脑上的 Node.js 程序。服务器可以是一个提供服务的程序，不一定是一台另外购买的电脑。
- **API**：约定好的访问方式。本课接口是 `GET /api/health`。
- **JSON**：一种用文字组织数据的格式，前端可以读取它并显示在页面上。
- **127.0.0.1**：当前设备本身。本课后端只监听本机，手机访问这个地址会指向手机自己。
- **3001**：本课后端使用的端口，用来区分同一台电脑上不同的服务。

## 1. 亲自启动后端

打开一个新的终端窗口，执行：

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
npm run server
```

看到“任务板后端已启动”后，保留这个终端运行。在同一台电脑的浏览器中打开：

<http://127.0.0.1:3001/api/health>

你会看到包含这些字段的数据：

```json
{
  "status": "ok",
  "service": "task-board-api",
  "serverTime": "每次请求时生成的服务器时间"
}
```

实际 `serverTime` 是 ISO 格式的时间，末尾的 `Z` 表示 UTC。隔几秒刷新一次，观察时间变化。这个响应来自后端，不是浏览器里保存的任务。

## 2. 检查成功与失败的区别

另开一个终端窗口，执行：

```bash
curl -i http://127.0.0.1:3001/api/health
curl -i http://127.0.0.1:3001/api/missing
```

`curl` 是终端里的 HTTP 客户端，`-i` 让它同时显示响应头。第一条应返回 `200 OK`，第二条应返回 `404 Not Found` 和“接口不存在”。

再回到运行后端的终端，按 **Control + C** 停止它。重新运行第一条 `curl` 命令，这次应连接失败。

注意：404 表示后端已经回答了请求，只是找不到对应接口；连接失败表示没有建立起连接。这是两种不同的故障。

重新执行 `npm run server`，确认接口恢复可用。不要关闭其他终端中的开发服务。

## 验收与复盘

1. 能独立启动后端，看到 `status: "ok"`，刷新时观察到时间变化。
2. 能区分正确地址的 200 与不存在接口的 404。
3. 停止后端后请求失败，重新启动后恢复。
4. 能用自己的话回答：这份 JSON 由谁生成？停止本地后端后，已经上线的任务板是否还能使用？为什么？

本课文件包括 `server/index.js`、`package.json` 中的 `server` 命令，以及这份说明。`node --watch` 会在后端文件保存后自动重启程序。

完成独立验收后，再保存 Git 版本。下一课将让任务板页面主动调用 API，并显示成功或失败的结果。

## 配套阅读与课程

每次学习按“带着问题阅读 → 在任务板中验证 → 用自己的话解释”的顺序进行。下面的时间是建议投入时间，不是课程原始时长。

| 安排 | 资源与阅读范围 | 建议时间 | 学完要能说明 |
| --- | --- | --- | --- |
| 本课必读 | [MDN：客户端服务端交互概述](https://developer.mozilla.org/zh-CN/docs/Learn_web_development/Extensions/Server-side/First_steps/Client-Server_overview)，看 HTTP 请求与响应、GET 示例及“返回 HTML 以外的内容” | 10–15 分钟 | 谁发请求，谁返回结果，为什么返回的数据也可以是 JSON |
| 跑通接口后选读 | [Full Stack Open：Node.js and Express](https://fullstackopen.com/en/part3/node_js_and_express/)，只看 Simple web server，到 Express 标题前停止 | 15–20 分钟 | createServer、request、response 分别承担什么工作 |
| 终端操作不熟时补课 | [MIT Missing Semester 2026：Shell 入门](https://missing.csail.mit.edu/2026/course-shell/)，选读路径、导航和执行命令的内容 | 15–20 分钟 | 当前目录是什么，命令从哪里运行，如何进入项目目录 |

Full Stack Open 这里链接到已核验的英文页面，可以使用浏览器翻译。课程示例使用 `require`，本项目沿用 `import`；先理解请求和响应，不必照着课程另建一个项目或改变现有模块写法。

读完必读材料后，先合上文章，用自己的话回答上面的验收问题。遇到卡点可以把原文或不理解的词带回来，我们结合正在运行的接口解释。

实现参考：[Node.js 24 HTTP 文档](https://nodejs.org/docs/latest-v24.x/api/http.html)，目前作为查询资料，不要求通读。
