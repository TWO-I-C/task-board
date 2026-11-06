# 第二阶段 · 第 11 课：登录验证与会话

预计 60–90 分钟，包含约 15 分钟阅读。目标：理解后端如何验证密码、识别后续请求来自谁，以及怎样让登录失效。

## 课程进度

阶段 1 已完成。阶段 2 已完成任务 API 与数据库持久化、用户数据关系、注册和密码存储。本课完成登录与会话；下一课将身份接入任务查询和修改，验证用户隔离。当前“后端任务”仍是共享学习列表，即使登录了 alice，也还没有限制她操作 bob 的任务。

## 两次请求，各自做什么

```text
第一次：POST /api/login
输入用户名与密码 → 查用户记录 → 取已保存的盐和参数
→ 重新计算 scrypt → 安全比较 → 创建数据库会话 → 浏览器接收 Cookie

后续：GET /api/me
浏览器自动带 Cookie → 后端计算令牌摘要 → 查未过期会话
→ 找到关联用户 → 返回当前用户

退出：POST /api/logout
删除当前数据库会话 → 清除浏览器 Cookie → 后续请求不能再用旧会话登录
```

登录时不生成新密码盐来比较，也不解密原始密码。服务端使用已保存的盐与参数计算，使用 timingSafeEqual 比较派生结果。不存在的用户和无密码的旧用户也做一次等成本计算，再统一拒绝，减少明显的响应差异。

会话令牌是后端随机生成的临时凭证，不是用户名、用户 ID 或密码。Cookie 中保存令牌；数据库保存令牌摘要、关联用户、创建时间和到期时间。令牌与密码都不能复制到聊天、截图、Git 或日志中。

## 配套阅读（约 15 分钟）

- [MDN：Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)：只看 HttpOnly、SameSite、Max-Age 和 Secure。
- [OWASP：Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)：只看 Session ID Content、Renew the Session ID、Session Expiration。理解 Cookie 与后端会话共同工作。
- [Node.js：timingSafeEqual](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptotimingsafeequala-b)：可选读，知道不能因比较代码提前结束而留下明显差异即可；一个比较函数不保证整条请求都严格等时。

## 本项目的会话约定

| 项目 | 当前实现 |
| --- | --- |
| Cookie 名称 | task_board_session |
| 内容 | 32 字节随机令牌，编码为 base64url；不在 JSON 中返回 |
| HttpOnly | 页面脚本不能直接读取此 Cookie，浏览器仍会自动随匹配请求发送 |
| SameSite | Lax；登录与退出另外检查自定义请求头及浏览器 Origin |
| Path | /api；Cookie 不按端口隔离，练习时始终使用同一个主机名 |
| 有效期 | 固定 1 小时，不随访问续期；后端也检查到期时间 |
| 退出范围 | 当前浏览器会话，其他设备的有效会话可以保留 |
| 数据库中断 | 带有效形状 Cookie 的请求返回 503，无法确认身份；不据此清除 Cookie |

当前只在 localhost HTTP 学习，Cookie 默认没有 Secure；未来真正上线 HTTPS 时必须启用 `COOKIE_SECURE=true`。HttpOnly、SameSite 和 Secure 各有作用，不能把其中一个理解成所有安全问题都已解决。

会话令牌有足够随机性，因此用 SHA-256 摘要作为数据库查找键；人类选择的密码仍使用较慢的 scrypt。不要把这里的快速哈希用回密码存储。

## 开始前

已应用第三份迁移 `003-login-sessions.sql`，没有改动原有用户、密码或任务。保持 Postgres.app、前端与后端运行，固定打开 http://localhost:5173/，向下找到“本地学习实验：登录与会话”。

使用上一课的 `lesson10_alice` 及你自己保存的练习口令；若你给用户名加过后缀，下文同步替换。不要把口令发给我。若已忘记练习口令，可在注册面板另建一个练习用户；本课不重置旧密码。

页面出现 401 请求是“尚未登录”的正常验收结果。如果出现 403，核对访问网址是否为上述 localhost 地址。`APP_ORIGINS` 默认允许 localhost:5173 和 127.0.0.1:5173；换端口需配置白名单，不通过关闭来源检查解决。

## 五项独立验收

### 1. 未登录与错误密码

打开开发者工具 Network → Fetch/XHR。首次进入面板会自动请求 GET /api/me，未登录时应为 401，页面显示未登录与登录表单。如果你之前试过登录，先正常退出。

输入 `lesson10_alice` 和一个错误密码，点击“登录练习账号”：POST /api/login 返回 401，提示“用户名或密码不正确”，密码框清空，不能显示当前用户。可换一个不存在但格式合法的用户名，结果仍是同样的 401 提示。

### 2. 正确登录并识别当前用户

输入正确用户名和练习口令。预期 POST /api/login 返回 200，随后 GET /api/me 返回 200，面板显示用户名、用户 ID、会话到期时间。登录密码不再留在输入框中，JSON 中没有密码、密码哈希或会话令牌。

在 Application → Cookies 中找到 task_board_session，观察 HttpOnly、SameSite、Path 和过期时间。不要复制 Value，也不要把包含令牌的界面截图发出来。Set-Cookie 是响应头，后续请求中的 Cookie 由浏览器自动携带。

用另一终端进入 psql：

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -X -h 127.0.0.1 -p 5432 -U two-i-c -d task_board
```

```text
\pset pager off
```

执行只读查询，记下本次会话的创建时间和到期时间：

```sql
SELECT users.username, sessions.created_at, sessions.expires_at,
       sessions.expires_at > CURRENT_TIMESTAMP AS active
FROM sessions
JOIN users ON users.id = sessions.user_id
WHERE users.username = 'lesson10_alice'
ORDER BY sessions.created_at;
```

本次会话应存在且 active 为 t。查询特意没有返回 token_hash。浏览器里的原始令牌与数据库摘要不同，后端收到令牌后会再次计算摘要用于查找。

### 3. 刷新、重启与另一个标签页

刷新页面，先看到确认中的状态，再看到同一用户。Network 中只有读取当前身份的 GET /api/me，不需要再次发送密码。

仅重启 Node.js 后端，再点“重新确认登录状态”：一小时有效期内仍应识别同一个用户。因为会话在数据库中，不依赖 Node.js 进程内存。

在同一个 Chrome 配置的另一个普通标签页打开同一网址，也会共享该 Cookie；不同浏览器或独立的无痕环境不会自动获得这份登录状态。不要把 localhost 与 127.0.0.1 当成同一个 Cookie 主机名。

### 4. 数据库停止时，退出不能假成功

先保持已登录，退出 psql（`\q`），再停止 PostgreSQL。点击“退出当前登录”，应收到 503，页面提示退出结果未确认，不能显示“已退出登录”。点击重新确认也无法确认身份。

恢复 PostgreSQL 后点“重新确认登录状态”，在一小时内应仍为原用户：本次实验在删除会话之前就停了数据库，所以会话没有被删掉，Cookie 也未清除。

如果你恰好跨过一小时到期时间，恢复后会是未登录。数据库是否可访问与会话是否过期是两个判断条件。

### 5. 真正退出并核对失效

保持服务正常，点击“退出当前登录”。预期 POST /api/logout 为 200，随后的 GET /api/me 为 401，页面显示已退出。再刷新，仍是未登录；之前打开的另一普通标签页点击重新确认，也应变成未登录。

重新执行第二项 SQL：本次记录的那一行应已删除。如果只在这个浏览器建立过会话，查询为 0 行；其他设备的会话可保留。用户记录和任务没有被删除。

可以再登录一次并退出，观察新会话的创建时间变化。会话到期与旧令牌重放也已在独立测试中验证：过期会话或已退出的旧令牌都不能继续通过 /api/me。无须手工复制或篡改真实 Cookie 做实验。

## 不同结果怎么理解

| 状态 | 含义 |
| --- | --- |
| 200 | 本次操作或身份查询成功 |
| 400 | 请求字段或格式不符合要求 |
| 401 | 登录凭据不正确，或当前没有有效会话 |
| 403 | 登录/退出请求来源检查未通过 |
| 429 | 一分钟内登录尝试超过本机示例上限，按 Retry-After 等待 |
| 503 | 数据库不可用或密码计算暂忙，不能认定登录/退出成功 |

连接失败或响应丢失后，不自动重复登录、也不靠旧页面判断；恢复后调用 /api/me 确认。登录接口已返回成功、后续 me 失败时，页面会提示身份暂时无法读取。

本机示例每个来源地址每分钟最多 20 次登录请求；计数在进程内，后端重启会清零，不能当作多实例服务的完整限流方案。会话目前采用固定有效期，未增加空闲超时、设备管理或密码修改后全设备退出等功能。

## 对照代码

- `server/passwords.js`：从已有记录取盐，重新计算并安全比较；注册和登录共享计算上限。
- `server/sessions.js`：随机令牌、Cookie、来源检查、登录频率限制。
- `server/database.js`：创建、查找及删除数据库会话；新登录轮换当前浏览器旧会话。
- `server/index.js`：三个接口只返回公开用户字段，不接受客户端指定的 user_id。
- `src/BackendSession.jsx`：刷新时读取当前身份，未知状态单独显示，退出后再核对。

## 复盘与保存

1. 刷新页面后没有重新输入密码，后端依据什么确认你是谁？能否只相信 localStorage 中保存的用户名？
2. 退出时只把页面上的用户名清掉，为什么不够？服务器与浏览器各需要处理什么？
3. alice 已经成功登录，是否就能保证她无法修改 bob 的任务？后端还需要检查什么？

验收和复盘后再保存本课 Git 版本。下一课将登录身份接入任务 API，处理旧任务归属，并验证不同用户的数据隔离。
