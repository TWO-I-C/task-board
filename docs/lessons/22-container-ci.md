# 第 22 课 · 把完整容器系统的验收接入 CI

第三阶段第 9 课，预计 60–90 分钟，包含首次构建和云端等待。你将运行一条自动验收命令，故意改错 Nginx 的后端端口，观察测试失败，再修复并在 GitHub Actions 中核对结果。

本课的 `tests/container-system.mjs` 使用临时项目名、随机数据库密码和独立网页端口。它会构建镜像、启动三个服务，使用浏览器操作账户页面，重建容器后读取同一条任务，再清理自己的容器、数据卷和镜像标签。运行日志会显示本次 `task-board-check-...` 项目名。

## 验收 1 · 在本机运行容器验收

确认 Docker Desktop 已运行，在项目根目录执行。

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
npm run test:containers
```

成功时预期看到四条 PASS，依次验证 API 转发、账户页面操作、容器重建后的持久化以及退出登录。最后应看到“容器验收通过，临时环境已清理。”回到提示符后立即运行 `echo $?`，预期为 0。

如果提示缺少浏览器执行文件，按前面的测试课运行 `npx playwright install chromium` 后重试。Docker 连接错误则先检查 Docker Desktop 和 `docker version` 的 Server 信息。

## 验收 2 · 找到一项真实断言

打开 `tests/container-system.mjs`，找到这行。

```js
assert.equal(health.status(), 200)
```

向上看它请求的 `base + /api/health`，再找到 `base` 的定义。测试实际访问的是本次 web 容器在 Mac 上的入口，Nginx 随后把请求转发给 API。

再找 `oldDatabaseId`、`newDatabaseId` 和 `tasksResponse`。说明测试怎样确认容器确实重建了，以及读回来的任务与创建时是同一条。

## 验收 3 · 故意改错 Nginx 的后端端口

打开 `docker/nginx.conf`，把下面这一行中的 `3001` 临时改成 `3999`，保存文件。

```nginx
set $api_address api:3001;
```

运行 `npm run test:containers`。这次测试会把错误配置构建进 web 镜像。预期它在健康检查的断言处失败，实际状态可能是 502 或 504。回到提示符后立即运行 `echo $?`，应为非 0。

这里的 web 容器仍可能显示 healthy，因为它的健康检查请求首页。自动验收额外检查了网页入口到 API 的转发路径。记下失败时的实际状态码与退出码。

## 验收 4 · 修复、提交并推送

把刚才的端口恢复为 `3001`，保存后再次运行。

```bash
npm run test:containers
npm run lint
git diff --check
git diff -- docker/nginx.conf
```

预期测试和 lint 成功，后两条命令安静结束。此时 Nginx 文件已回到本课演练前的配置。然后保存本课六个文件并推送学习分支。

```bash
git add -- .github/workflows/ci.yml compose.yaml package.json tests/container-system.mjs README.md docs/lessons/22-container-ci.md
git diff --cached --name-status
```

清单应为 4 个修改、2 个新增。确认后执行。

```bash
git commit -m "将完整容器系统验收接入 CI"
git push -u origin codex/docker-backend
git rev-parse HEAD
git status
```

记下这次完整的提交编号，确认工作区为 `working tree clean`。

## 验收 5 · 核对 GitHub Actions 的同一次提交

打开仓库的 Actions，找到分支 `codex/docker-backend` 对应的最新运行，核对提交编号与验收 4 一致。[任务板 Actions](https://github.com/TWO-I-C/task-board/actions)

进入 `Lint, builds, API and browser tests`，展开 `Test container system`，确认里面执行了 `npm run test:containers`，出现四条 PASS 及清理完成提示。再看整个 check 任务是否成功。

本课把容器验收作为 check 任务的一步。它失败时，check 会失败。main 上的发布任务依赖 check 成功，这样构建出的系统也进入了交付前检查。学习分支运行中的发布任务应显示 Skipped。

云端首次运行若失败，记录运行链接、提交编号和第一个失败步骤的日志，再针对原因修复并重跑。以最后一次修复提交的结果作为验收依据。

## 阅读与复盘

用约 5 分钟查看 Compose 变量替换。项目中的 `TASK_BOARD_WEB_PORT` 同时用于网页端口和允许的浏览器来源，测试脚本为每次运行设置这个值。[Compose 变量替换](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)

再看 GitHub Actions 的步骤超时设置，以及 Ubuntu runner 提供的 Docker 工具。它们解释了同一条命令在云端怎样获得执行环境。[工作流步骤超时](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idstepstimeout-minutes) · [Ubuntu runner 工具清单](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md)

完成后回答三个问题。

1. 为什么 web 的健康检查成功，完整容器验收仍可能失败？
2. 测试为什么要用独立项目名、密码和数据卷？重建前后对照了哪些数据？
3. 本地测试通过后，怎样确认云端真的验收了你刚提交的容器配置？

发我本地红绿演练结果、云端运行链接和提交编号。五项完成后，再进入下一课。
