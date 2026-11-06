# 第三阶段 · 第 2 课：GitHub Actions 持续集成

项目连续编号第 15 课。预计 90–120 分钟，包括约 15 分钟阅读和云端排队时间。

你已经能在本机运行浏览器测试。本课把代码检查、构建和两类测试交给 GitHub 上的临时电脑执行，并亲自经历一次绿色 → 故意失败 → 恢复绿色的过程。

## 本课与前面课程不同的地方

前面可以先在本地验收，最后再提交 Git。本课必须先提交、推送，GitHub 才能收到代码并运行 CI。因此本课会在云端验收前保存并上传一个初始版本，之后再做失败和恢复实验。

这些提交和推送仍由你在终端操作。本课只使用当前学习分支 `codex/first-api`，不合并或推送 main，也不发布账户服务。

当前仓库是公开仓库 TWO-I-C/task-board。首次推送这个学习分支，会上传第二阶段至今的代码和提交，不只是新写的 ci.yml。准备本课时已核对该分支新增提交均使用 GitHub noreply 身份，待上传历史中未包含 `.env`、测试报告或数据库备份；仍然只推送这个分支，不使用 `--all`、`--mirror` 或强制推送。

## CI 到底做什么

CI 是 Continuous Integration，即持续集成。本课重点是：代码更新进入仓库后，自动在新环境执行约定的检查，让问题尽早暴露。

```text
修改文件 → git commit（本地保存）
         → git push（上传学习分支）
         → GitHub Actions 启动临时 runner
         → 安装依赖、检查、构建、测试
         → 返回结果和日志，保留浏览器测试报告
```

| 名词 | 在本项目中的意思 |
| --- | --- |
| workflow | 一整套自动流程，定义在 .github/workflows/ci.yml |
| event | 触发事件，例如 push 或 pull_request |
| runner | 执行命令的临时电脑，本课使用 Ubuntu 24.04 |
| job | 一组执行任务，本课只有一个 check job |
| step | job 中的一个步骤，例如 npm ci 或 npm run test:e2e |
| artifact | 运行后保留的文件，例如 HTML 测试报告，不等于网站已经发布 |

`git commit` 不会触发 GitHub 上的检查。工作流必须随代码推送到远端，且满足触发条件。

## 阅读资源（约 15 分钟）

1. [GitHub：Workflows](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflows)，约 5 分钟，理解 event、job、runner、step。
2. [Playwright：Setting up CI](https://playwright.dev/docs/ci-intro)，约 10 分钟，重点看安装浏览器、运行测试、查看日志和报告。

遇到触发条件问题，再查 [GitHub：Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) 中的 push 和 pull_request，不需要全文阅读。

## 我们的工作流怎样安排

打开 `.github/workflows/ci.yml`。它的显示名称是 **CI - Task board checks**。

触发条件：

- 推送到 main 或名称以 `codex/` 开头的分支。
- 创建或更新目标分支为 main 的 Pull Request。这里的 main 指 PR 想合入的目标分支，不是要求来源分支也叫 main。
- 同一分支或同一个 PR 出现更新时，可取消尚未完成的旧运行，以检查最新提交。

本课先用 push 触发，不需要创建 PR。工作流步骤如下：

| Actions 中的步骤名称 | 作用 |
| --- | --- |
| Checkout source | 取出本次提交的代码 |
| Set up Node.js 24 | 明确使用 Node.js 24，不依赖 runner 自带版本 |
| Install locked dependencies | npm ci 按 package-lock.json 安装依赖 |
| Check code | npm run lint |
| Build browser edition | 构建原来的浏览器版，指定 /task-board/ 路径 |
| Build account edition | 构建账户版，但不发布它 |
| Install PostgreSQL 18 tools | 从 PostgreSQL 官方 Ubuntu 软件源安装数据库命令 |
| Install Chromium and system dependencies | 安装测试浏览器及 Linux 所需系统库 |
| Test API permissions | 运行五组权限、持久化和故障检查 |
| Test browser journeys | 运行五条浏览器 E2E |
| Keep browser test report | E2E 已执行且运行未取消时，保留报告 7 天 |

本机的 PostgreSQL 命令在 Postgres.app 中，云端则位于 `/usr/lib/postgresql/18/bin`。通过 `POSTGRES_BIN` 告诉同一份测试代码去哪里找命令，不把 Mac 路径照搬到 Ubuntu。

测试仍自行创建临时数据库和虚构账号。runner 不需要你电脑中的 `.env`、数据库密码或真实账号，也不会连接本机的 task_board 数据库。临时测试服务器在检查结束后关闭，不是供用户使用的线上服务。

这里 `uses` 调用已有 Action，`run` 执行项目命令。Action 后面的长字符串是固定的提交版本；本课先知道它用于固定依赖，不必背诵。

## 验收 1：本地提交不等于云端运行

先在项目终端确认当前分支：

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
git branch --show-current
git status --short
```

应处于 `codex/first-api`，本课准备了三个文件：ci.yml、README.md 和本课讲义。如果分支或清单与你看到的不一致，先把状态发给我，不要改推 main。

本课已进行工作流语法检查，以及不含 `.env` 和现成 node_modules 的干净副本检查。本地通过不代表 Ubuntu 云端已通过，后面要看实际 Actions 结果。

保存三个文件：

```bash
git add .github/workflows/ci.yml README.md docs/lessons/15-github-actions-ci.md
git diff --cached --stat
git commit -m "增加 GitHub Actions 持续集成"
git log --oneline -1
```

记下最新提交前几位编号。此时只是本地保存，GitHub 还没有运行这份新工作流。

## 验收 2：第一次推送并等待绿色

```bash
git push -u origin codex/first-api
```

这会上传当前学习分支并建立跟踪关系，不会把它合并到 main。如果推送失败，先查看错误，不要使用 `--force`。

打开 [仓库 Actions 页面](https://github.com/TWO-I-C/task-board/actions)，找到 **CI - Task board checks** 的本次运行：

- 分支应为 codex/first-api。
- 提交编号应与你刚才记下的一致，不能拿旧提交的绿色结果当作这次通过。
- 等待运行结束，打开 **Lint, builds, API and browser tests** job。
- 权限步骤应有 PASS 1–5；浏览器步骤应有 `5 passed`；整次运行应为成功。

首次运行需下载安装工具，可能花几分钟。本课不会触发只监听 main 的 Pages 推送部署。

也可以用已安装的 GitHub CLI 查询：

```bash
gh run list --repo TWO-I-C/task-board --branch codex/first-api --limit 3
```

如果第一次运行失败，先打开第一个失败的步骤，把步骤名称和末尾相关报错发给我。先让正常版本变绿，再进行下面的故意失败实验；不要反复重跑掩盖环境或代码问题。

## 验收 3：找到日志与报告

在本次成功运行中，打开 **Test browser journeys**，找到五条测试及最终 `5 passed`。

返回运行汇总页，找到 Artifacts 中名称以 `playwright-report-` 开头的报告。下载并解压后，可在终端输入 `npx playwright show-report --host 127.0.0.1 `，末尾保留一个空格，把含 index.html 的解压目录拖进终端，再按回车。查看后按 Control+C 停止本地报告服务。

区分两种证据：日志告诉你哪些步骤和断言通过；报告能提供具体测试步骤，以及失败时的截图与 trace。上传报告成功只代表文件保存成功，不代表测试通过。

报告只包含本次虚构测试环境的数据，保留 7 天；不会把你本机的报告或 `.env` 上传。如果流程在 E2E 开始前就失败，可能没有浏览器报告，此时应查看更早失败步骤的日志。

## 验收 4：让云端发现错误预期

确认正常版本已经绿色，再打开 `tests/e2e/task-board.spec.js`，搜索“失败实验”。只将注释下一行的 1 临时改为 2：

```js
await expect(matchingTasks).toHaveCount(2)
```

保存后，只提交这一份文件并推送：

```bash
git add tests/e2e/task-board.spec.js
git diff --cached
git commit -m "演练 CI 发现错误预期"
git push origin codex/first-api
```

等待这次运行结束，先不要立即恢复，否则新推送可能取消这次运行，无法完整观察失败。

预期 **Test browser journeys** 失败：错误断言显示 Expected 为 2、Received 为 1。工作流为红色，但保留报告的步骤仍可以成功。能说出是哪个测试、哪条断言、什么实际值与预期值不符，才算完成本项。

这是故意写错测试预期的练习，不是发现产品缺陷。不要通过删除断言、跳过测试或加 `continue-on-error` 把失败伪装成成功。

## 验收 5：恢复绿色，并理解它的范围

把同一处的 2 改回 1，保存：

```bash
git add tests/e2e/task-board.spec.js
git diff --cached
git commit -m "恢复正确的任务数量断言"
git push origin codex/first-api
git status
git log --oneline -1
```

等待最新提交的 CI 再次成功，确认工作区 clean、云端运行的提交编号与你本地一致。故意失败的旧记录会保留，这有助于解释修复过程；不需要删除历史或强制推送。

绿色只表示该提交在本次环境下通过了已配置的检查。它不表示账户系统已上线、没有任何漏洞，或旧的失败记录消失了。

还要区分三个机制：

- **CI 检查**：本课新增流程，发现问题并报告。
- **合并要求**：是否强制检查通过才能合并，取决于仓库的分支规则；这份工作流本身不设置这些规则。
- **CD 发布**：现有 deploy.yml 负责发布浏览器版。本课没有把 CI 设为它的发布前置条件，两个工作流相互独立。因此本课只在学习分支实验，不往 main 推送或合并。

CI 报红不会自动撤销提交，也不会自动修复代码。后续再把审查、合并与发布条件连接起来。

## 复盘

完成五项后，发我最终成功运行的链接，并回答：

1. 为什么本机已经 `5 passed`，还要在云端重新安装依赖并测试？云端会使用你电脑里的数据库吗？
2. 为什么“报告上传成功”不能证明测试成功？你会查看哪项结果及哪个提交编号？
3. CI 通过是否代表账户系统已经上线，或者一定能阻止错误代码合并？分别由哪些机制负责？

本课完成条件是实际经历绿色、预期中的红色、恢复绿色，并能解释运行结果。仅创建 ci.yml 或本地检查通过，还不能算云端验收完成。下一步再衔接代码审查与发布条件。
