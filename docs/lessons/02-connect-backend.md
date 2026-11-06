# 第二阶段 · 第 2 课：让页面调用后端

预计 30–45 分钟，包含 10–15 分钟阅读。目标：点击任务板中的按钮，让前端发送请求、读取响应，并根据结果更新页面。

## 本课的数据流

浏览器中的任务板 → 请求 `/api/health` → Vite 开发服务器转发 → Node.js 后端 → JSON 响应 → 页面显示结果。

上一课由你在地址栏直接访问接口；这一课由页面里的 `fetch()` 发起请求。两者都会发送 HTTP 请求。

Vite 在本地开发时把 `/api` 开头的请求转发到 `http://127.0.0.1:3001`。因此，浏览器访问的是前端网址下的接口路径，后端仍由另一个程序运行。

## 先读，再实验

必读：[MDN：使用 Fetch](https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API/Using_Fetch)。用 10–15 分钟看开头的基本示例、HTTP 错误状态码的说明，以及 Response 对象相关内容。

这次只需要理解三个动作：

1. `fetch('/api/health')`：向这个地址发送请求。
2. `response.ok`：判断 HTTP 状态码是否处于 200–299。收到 404 或 500 时，`fetch()` 本身不一定抛出异常，需要主动检查。
3. `response.json()`：把响应正文解析成 JavaScript 可以使用的数据。

暂时不用读文件上传、凭据或流式读取。想了解转发设置时，再查 [Vite：server.proxy](https://vite.dev/config/server-options.html#server-proxy)。

## 启动方式

需要两个终端窗口。已运行的服务可以继续使用，不必重复启动。

终端 A 运行后端：

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
npm run server
```

终端 B 运行前端：

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
npm run dev
```

打开终端 B 显示的 Local 网址，通常是 `http://localhost:5173/`。在页面底部找到“本地学习实验：连接后端”。这是本地开发实验，线上 GitHub Pages 网站不会显示这个面板。

## 独立验收

1. 点击“检查后端连接”，应显示“本次连接成功”，以及服务名称和服务器时间。
2. 等几秒再点击一次，时间应更新。页面不自动轮询，也不自动刷新时间。
3. 在终端 A 按 Control + C 停止后端，保留终端 B 运行。再次点击按钮，应显示失败提示，并清除上次成功的时间。Vite 转发失败时可能返回 HTTP 500，这是转发层生成的响应。
4. 在终端 A 重新执行 `npm run server`，再次点击按钮，应恢复成功，无需刷新任务板。

后端停止时，已有任务应仍然可见、可以操作，因为目前任务功能还使用浏览器本地保存。

## 阅读代码时只追踪这一条线

`src/BackendConnection.jsx` 中的 `checkConnection`：设置等待状态 → 发请求 → 检查 HTTP 状态 → 读取并检查 JSON → 显示成功；出现异常则显示失败。请求超过 5 秒会终止等待，按钮在等待期间不可重复点击。

`vite.config.js` 声明本地请求如何转发；`src/App.jsx` 只在开发模式挂载这个学习面板。任务的新增、编辑、删除和本地保存逻辑未改动。

## 复盘问题

- 这次是谁发出了 HTTP 请求？你在地址栏直接打开接口与点击按钮，有什么相同和不同？
- 为什么后端停了，任务板页面及本地任务功能仍然可以使用？
- 为什么收到 HTTP 404 或 500，不能直接当成连接成功？

先完成验收，再保存本课 Git 版本。下一步才会考虑让任务数据通过 API 读写。
