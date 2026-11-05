## 解决的问题与结果

原任务板只把任务保存在当前浏览器。本次改动增加本地运行的账户系统：注册、登录后，任务通过 Node.js API 保存到 PostgreSQL；后端按数据库会话确定用户并检查任务归属。刷新和后端重启保留已提交的任务，不同账户的任务相互隔离。

本 PR 汇总第二阶段至今的改动，包括账户界面、数据库结构与迁移、任务权限、自动化测试及 CI。GitHub Pages 默认构建继续提供浏览器版；账户版使用独立构建，尚未完成线上服务部署。

## 验证依据

- 提交 `9ed891b` 的 [PR 检查](https://github.com/TWO-I-C/task-board/actions/runs/41971092200)已通过；检查包括 lint、两种构建、API 权限测试和浏览器测试。
- 上述基线记录不能替代本 PR 最新提交的检查。审查时核对 Checks 中的 `Lint, builds, API and browser tests`，后续推送需重新核对。
- 测试自行创建临时 PostgreSQL 和虚构账户，不使用本机学习数据库。

## 审查记录（AI 辅助核对）

- [x] 任务改名的身份来源、归属限制与越权验证已逐项对照。

`server/index.js` 的 `requireUser` 读取请求 Cookie 中的会话令牌并计算摘要，用摘要查找有效数据库会话，得到 `currentUser.id`，再传给 `setTaskTitle`。客户端提供的 `X-Task-Board-User` 仅用于发现旧页面身份不一致，不用于授予权限。

`server/database.js` 的 `setTaskTitle` 使用参数化 SQL：`UPDATE tasks SET title = $1 WHERE id = $2 AND owner_id = $3 RETURNING ...`。任务 ID 指定目标，owner_id 必须匹配已验证的当前用户；不匹配时没有更新记录，接口返回 404。

`tests/task-permissions.mjs` 保存操作前的任务数据，再用 A 的会话修改 B 的任务及反向操作，断言响应为 404。结束后重新执行 `SELECT * FROM tasks ORDER BY id`，用 `assert.deepEqual` 与操作前的数据比较，验证数据库没有被改动，而不只验证响应状态。

- [x] 默认构建、账户构建和 Pages 发布产物已对照。

`src/App.jsx` 的 `accountMode` 在开发模式或显式 account 模式下启用账户界面。`package.json` 中默认 `build` 生成 `dist` 中的浏览器版；`build:account` 使用 `--mode account --outDir dist-account` 生成账户版。

`.github/workflows/deploy.yml` 执行 `npm run build -- --base=/task-board/` 并上传 `dist`，所以现有 Pages 发布浏览器版。它不会启动 Node.js API 或 PostgreSQL；账户版构建成功不代表完整账户系统已经上线。

- [x] 已区分现有自动化覆盖与一个具体覆盖缺口。

`tests/e2e/task-board.spec.js` 的“编辑、筛选与刷新保留”覆盖空白名称被拒绝、有效改名、完成状态与计数保留、筛选及刷新后读回任务。该用例没有点击“取消编辑”，因此尚未自动验证“输入新名称后取消，刷新后仍是原名称”。同名任务用例中的“取消删除”不能替代这一场景。

后续补测应覆盖：编辑名称后取消，不发送改名 PATCH；刷新页面后名称、完成状态和任务计数仍保持原值。这是已确认的测试覆盖缺口，当前没有据此认定产品存在取消编辑缺陷。

## 合并条件与发布影响

- main 保护规则已通过 GitHub API 应用，并独立回读确认；必需检查绑定 GitHub Actions（App ID 15368）。仓库中的 JSON 文件保存预期配置，文件提交本身不修改远端规则。
- 本课要求经过 PR、通过指定检查、包含最新 main、解决审查讨论，规则也对管理员生效。个人练习要求批准人数为 0，不代表完成了独立第三方审查。
- 本课验证合并条件后保持 PR 打开，不启用自动合并。实际合入 main 会触发现有 Pages 工作流；该工作流与 CI 仍独立运行。
- 完整账户服务还需要线上 Node.js、PostgreSQL、HTTPS 与会话配置。合并或构建成功不代表账户系统已经上线。
