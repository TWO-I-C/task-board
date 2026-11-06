# 第二阶段 · 第 10 课：用户注册与密码存储

预计 60–90 分钟，包含约 15 分钟阅读。目标：完成注册并用 SQL 验证用户已保存，理解原始密码、随机盐和密码哈希的区别。

## 课程进度与本课边界

阶段 1 已完成。阶段 2 已完成任务 API、持久化、增删改查及用户与任务的数据关系；本课接通注册。接下来仍需完成登录状态、退出与用户权限隔离。

注册是创建用户记录；登录是证明“我是这个用户”并建立可验证的登录状态。当前注册不自动登录、不发 Cookie 或令牌，也不分配旧任务。已有任务接口仍未限制用户访问，继续只在本机学习；GitHub Pages 上的任务板保持浏览器本地版本。

## 一次注册的数据流

浏览器填写用户名、密码、确认密码 → 页面校验 → POST /api/register → 后端独立校验 → 生成随机盐 → 计算密码哈希 → INSERT users → 返回用户 ID、用户名、创建时间。

确认密码只防止输入错误，不需要发送或保存两份密码。密码通过请求正文传给后端；密码框显示圆点只是隐藏屏幕文字，不是加密网络请求。当前使用 localhost HTTP 练习，公开部署必须使用 HTTPS。

## 阅读与核心概念

阅读 [OWASP：Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) 的 Hashing vs Encryption、Salting 和 scrypt 小节；不用背参数。它建议采用专用密码哈希算法，避免明文或快速通用哈希。

- **原始密码**：用户输入的秘密。应用不把它保存到数据库、localStorage 或日志。
- **哈希**：本课使用 scrypt 得到的派生结果。登录时根据输入重新计算并安全比较，不需要解密出原始密码。
- **随机盐**：每次注册生成的新随机值，随哈希保存；盐不需要保密。同一个密码配不同盐，存储结果不同。
- **成本参数**：让每次猜测都需要计算和内存，提高批量猜测的成本。哈希不是“弱密码绝对无法被猜中”的保证。

实现使用 [Node.js 官方 crypto.scrypt](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)，参数 N=131072、r=8、p=1，随机盐 16 字节，派生结果 64 字节，不额外安装密码库。数据库字段格式为：

```text
scrypt$成本N$参数r$参数p$随机盐的十六进制$派生结果的十六进制
```

本课选择当前 Node.js 已有的稳定 scrypt 接口。OWASP 的首选是 Argon2id，scrypt 是其列出的替代方案。先理解存储与验证原则，不要求手写加密算法。

## 开始前

本课已应用第二份迁移 `002-user-passwords.sql`，原有用户和任务保留。旧用户若没有密码，字段保持 NULL；NULL 不代表空密码，后续不能让这类用户直接登录。

保持 Postgres.app、`npm run server`、`npm run dev` 运行，打开 http://localhost:5173/，向下找到“本地学习实验：用户注册”。如后端不是 watch 模式，请在它所在终端停止后重新执行 `npm run server`。

使用三个虚构用户名：`lesson10_alice`、`lesson10_bob`、`lesson10_recovery`。如果已使用过，可给三个名字加同一段数字后缀，并同步替换查询中的名字。只使用专门的练习口令，不复用真实账号密码，不把密码发送到聊天或截图中。前两个账号特意使用同一个练习口令，仅为了比较随机盐。

用户名规则延续第 9 课；输入中的大写字母会转小写、首尾空格会去掉。密码为 15–128 个字符，按 Unicode 码点计数，可包含中文和空格；不要求拼凑大小写或符号，但不能全为空白或包含 NUL/无效 Unicode。密码不会被 trim、转小写或截断。

SQL 验收先在另一个终端进入 psql：

```bash
/Applications/Postgres.app/Contents/Versions/latest/bin/psql -X -h 127.0.0.1 -p 5432 -U two-i-c -d task_board
```

```text
\pset pager off
```

以下 SQL 都是只读查询，不需要 BEGIN；不要把实际密码拼到 SQL 或终端命令中。

## 五项独立验收

### 1. 不合格输入不能注册

填写 `lesson10_alice`，先试短于 15 个字符的密码，再试两次输入不一致。页面应明确提示错误；Network → Fetch/XHR 中不应出现注册 POST。下面查询应为 0（开始前未注册过该用户名）：

```sql
SELECT count(*) FROM users WHERE username = 'lesson10_alice';
```

页面检查可以被绕过，后端也独立检查用户名、密码长度、类型及未知字段。实现已针对绕过页面直接请求的情况测试；本课无需在终端输入密码重做这些测试。

### 2. 成功注册并核对保存内容

填写合格练习口令，两次一致，注册 `lesson10_alice`。预期 Network 中 POST /api/register 返回 201；页面显示注册成功、用户 ID 和“尚未登录”，两个密码框清空。只检查 Response：user 中应仅有 id、username、created_at，不含 password 或 password_hash。

```sql
SELECT id, username,
       password_hash IS NOT NULL AS has_password_hash,
       split_part(password_hash, '$', 1) AS algorithm,
       length(password_hash) AS stored_length
FROM users
WHERE username = 'lesson10_alice';
```

预期 1 行：has_password_hash 为 t、algorithm 为 scrypt、stored_length 为 179。查询只显示摘要特征，不需要把完整哈希复制到聊天。单凭字符串变长不能证明实现安全；还需确认用的是专用算法，并且不保存原始密码。

记录该用户 ID。刷新页面，再重启 Node.js 后端，重新执行 SQL，用户 ID 和记录应保留。注册成功提示会随页面刷新消失，这不代表数据库用户被删除。

### 3. 重复用户名不能覆盖原账号

再次注册 `lesson10_alice`，这次填写另一个合格练习口令。预期 HTTP 409，提示用户名已被使用，不能显示注册成功。重复第二项 SQL，仍只有一行，ID 不变。

实现使用数据库唯一约束和 ON CONFLICT DO NOTHING，重名不会更新原密码；并发注册也只能创建一条。此时还没有登录界面，旧密码未被覆盖已由独立测试验证。409 只说明名字已占用，不证明账号属于当前操作者；本课为便于观察而明确返回这一结果，公开产品还需考虑用户名枚举风险。

### 4. 同一个密码，为什么存储结果不同

用与 alice 完全相同的练习口令注册 `lesson10_bob`，预期 201。执行：

```sql
SELECT a.password_hash <> b.password_hash AS different_hash,
       split_part(a.password_hash, '$', 5) <> split_part(b.password_hash, '$', 5) AS different_salt
FROM users AS a
CROSS JOIN users AS b
WHERE a.username = 'lesson10_alice' AND b.username = 'lesson10_bob';
```

预期两个字段都为 t。每次注册使用不同随机盐，所以相同密码不会得到相同的整段存储记录。盐随记录保存，未来登录时使用该记录里的盐重新计算，不能临时换一份新盐再直接比较。

### 5. 数据库停止时，不能假装注册成功

先确认 `lesson10_recovery` 不存在；退出当前 psql（`\q`），再停止 Postgres.app 的数据库服务。用这个名字和合格练习口令注册。预期 HTTP 503，不显示成功，密码框清空。

恢复 PostgreSQL 后重新进入 psql，先执行：

```sql
SELECT count(*) FROM users WHERE username = 'lesson10_recovery';
```

本实验在请求前已停止数据库，预期 0。然后在页面重新输入练习口令注册，预期 201；SQL 数量变成 1。原有任务数量与完成状态不变。

不能把所有报错都当成没有注册：服务器可能已提交，而响应没送达。连接失败或超时后先按用户名核对；不要自动重试或把 409 当作登录成功。若后端已返回 201、响应 JSON 却不完整，页面会明确提示“后端已确认注册成功，但响应未能完整显示”。

## 观察代码

- `src/BackendRegistration.jsx`：表单校验、确认密码、发请求、清空密码框、显示结果。
- `server/index.js`：独立校验，只接受 username/password；后端生成用户 ID，等待数据库写入。
- `server/passwords.js`：使用随机盐与异步 scrypt；同时最多计算两份，避免无界占用内存。
- `server/database.js`：带参数 INSERT，只 RETURNING 公开字段，重名不覆盖。
- `server/migrations/002-user-passwords.sql`：只增加密码哈希列，不修改已执行的第一份迁移。

当前并发上限不是完整的防滥用机制。正式公开服务还要加入请求频率限制、常见/泄露密码检查、HTTPS、监控和合适的账号枚举防护；这些不是本课已经完成的能力。

## 复盘与保存

1. 数据库没有保存原始密码，将来登录时应该怎样判断输入是否正确？需要“解密”哈希吗？
2. alice 和 bob 使用同一个密码，为什么数据库中的记录不同？盐需要保密吗？
3. 页面显示注册成功，是否意味着已登录、已经能够安全隔离两个人的任务？还缺什么？

完成验收和复盘后再保存 Git 版本。三个练习账号留在本机供下一课学习登录，不需要删除；真实密码、完整哈希或数据库内容都不要加入 Git。
