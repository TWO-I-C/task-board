# 第三阶段 · 第 3 课：PR、代码审查与合并规则

项目连续编号第 16 课。预计 90–150 分钟，包括约 20 分钟阅读与云端检查等待。

上一课让 CI 发现错误。本课学习如何提出合并申请、用代码与测试证据审查改动，并把指定 CI 设为合并条件。

完成时应有一个经过审查练习、最新检查通过的 PR，以及实际生效的 main 保护规则。PR 保持打开；实际合并与发布放在后续步骤，因为当前合入 main 会触发现有 GitHub Pages 发布。

## 当前起点与本课材料

准备本课时（2026-11-03），已核验：

- 当前分支为 `codex/first-api`，本地与远端都是 `2e19c26`，工作区干净。
- main 停留在 `13f3d3e`；仓库没有 PR、classic branch protection 或 ruleset。
- 最近一次 CI 已通过。检查名称是 `Lint, builds, API and browser tests`，提供者为 GitHub Actions，App ID 为 15368。
- 学习分支相对 main 已累计 45 个变更文件。本课增加材料后还会增加，所以本次 PR 包含第二阶段以来的完整改动，不能只描述成“新增讲义”。以后围绕较小功能及时提交 PR，会更容易审查。

本课准备了四个文件：README.md、本讲义、[PR 说明草稿](../reviews/16-account-system-pr.md)、[main 规则配置](16-main-protection.json)。没有修改应用、数据库或工作流；远端操作由你逐项执行。

## 先理解四个动作

```text
学习分支提交并推送
    ↓
创建 PR：codex/first-api → main
    ↓
阅读改动、讨论、运行 CI
    ↓
GitHub 根据 main 的规则判断是否满足合并条件
    ↓
人决定合并后，main 才更新，现有 Pages 发布才会被触发
```

| 名词 | 本项目中的含义 |
| --- | --- |
| base | 接收改动的目标分支：main |
| compare / head | 提供改动的来源分支：codex/first-api |
| Draft PR | 尚在准备的申请，不能合并，但可以查看改动和运行本项目 CI |
| Ready for review | 结束草稿状态，可以进入正常审查与合并判断；不等于批准或自动合并 |
| Required check | main 规则指定的必需检查，其失败会阻止受规则约束的合并 |

PR 不是复制一个项目，也不是发布网站。继续向同一个来源分支推送提交，已有 PR 会随之更新，无需每次新建 PR。

## 阅读资源（约 20 分钟）

1. [GitHub：创建 PR](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request)，约 5 分钟，看 base、compare、Draft。
2. [GitHub：审查改动](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request)，约 8 分钟，看 Files changed、逐行审查、Viewed 和提交意见。
3. [GitHub：管理分支保护](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule)，约 7 分钟，看必需 PR、必需检查、管理员适用规则。

API 配置有疑问时再查[官方字段说明](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection)，本课无需通读。

## 验收 1：创建方向正确的草稿 PR

先在项目终端执行：

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
git branch --show-current
git status --short
git diff -- README.md
```

当前应是 codex/first-api，本课变化应是上面四个文件。打开两个 Markdown 和 JSON 新文件，确认内容后保存：

```bash
git add README.md docs/lessons/16-pull-requests-review-rules.md docs/lessons/16-main-protection.json docs/reviews/16-account-system-pr.md
git diff --cached --stat
git commit -m "增加 PR 审查与合并规则课程"
git push origin codex/first-api
```

然后创建一次草稿 PR：

```bash
gh pr create --repo TWO-I-C/task-board --base main --head codex/first-api --draft --title "整合账户任务系统与自动化检查" --body-file docs/reviews/16-account-system-pr.md
```

这条命令会把说明发布到你的公开仓库，并返回 PR 链接，不会合并代码。若命令报错或连接中断，先用下面的只读命令确认是否已创建，避免重复创建：

```bash
gh pr list --repo TWO-I-C/task-board --head codex/first-api --state open
```

打开返回的 PR 链接，确认目标 main、来源 codex/first-api、状态 Draft。查看 Commits、Files changed 和 Checks，等待 PR 对应的 CI 成功。

本项目同时监听 push 和 pull_request，因此一个新提交可能有两次 CI；这是两个触发事件。审查 PR 时查看 PR 的检查，不只看上一课 push 的绿色记录。pull_request 测试可能使用 GitHub 生成的临时合并提交，其 SHA 可以不同于来源提交；应确认它对应当前 PR 的最新来源提交与目标分支。

## 验收 2：做三项有依据的代码审查

在 PR 的 Files changed 中按路径找文件；也可在本地打开同名文件。读过并理解后再标记 Viewed。先以这三条链路练习，不要求一次背下所有代码。

| 审查目标 | 阅读位置 | 需要回答的问题 |
| --- | --- | --- |
| 他人任务不能被改名 | server/index.js 的 currentUser、server/database.js 的 setTaskTitle、tests/task-permissions.mjs 的“越权改名” | ownerId 来自哪里？SQL 为什么同时限制 id 和 owner_id？测试除 404 外还查了什么？ |
| 合并后的发布内容明确 | src/App.jsx 的 accountMode、package.json 的两个 build、.github/workflows/deploy.yml | 默认构建显示哪种界面？Pages 发布 dist 还是 dist-account？它会运行后端吗？ |
| 测试覆盖与需求匹配 | tests/e2e/task-board.spec.js 的“编辑、筛选与刷新保留” | 哪些步骤有断言？“修改名称后取消，刷新仍是原名称”是否已覆盖？ |

审查要沿着“需求 → 实现 → 验证”检查。只看到某一行有 owner_id，或只看到 CI 绿色，都不足以得出整个权限系统没有问题。

在 PR 说明的“审查记录”中填写自己的判断，并勾选实际完成的项。可按“文件/函数 → 观察到的行为 → 测试证据/缺口”写三条记录。网页修改 PR 说明不会修改本地 Markdown，也不会产生 Git 提交。

发现缺少测试时，区分“覆盖缺口”与“已复现的产品错误”。本课可以记录后续补测任务；不要把没有测试直接写成产品必然有 bug。

GitHub review 的 Comment 是反馈，Approve 是认可，Request changes 是要求修改。你可以审查自己的代码并留下记录；GitHub 不允许作者批准自己的 PR，这也不等于另一位审查者的独立批准。团队合作时再要求合适的其他人批准。参见[批准与必需审查说明](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/approving-a-pull-request-with-required-reviews)。

## 验收 3：应用并回读 main 规则

打开 [16-main-protection.json](16-main-protection.json)，对照下表理解即将修改的设置：

| 配置 | 效果 |
| --- | --- |
| required_pull_request_reviews 对象，批准人数为 0 | 要经过 PR，个人练习不强制另一人批准 |
| checks 中的准确名称与 app_id 15368 | 必需检查由 GitHub Actions 提供，名称为 Lint, builds, API and browser tests |
| strict: true | 合并前来源分支需包含最新 main；目标分支更新后应更新并重新检查 |
| enforce_admins: true | 你是管理员，也要遵守这些合并条件 |
| required_conversation_resolution: true | 行内审查讨论需处理并解决；不等于自动修复代码 |
| allow_force_pushes / allow_deletions: false | 不允许强推或删除受保护的 main |

JSON 中 contexts 是兼容 API 的空列表，具体检查由 checks 指定。这里写的是 job 显示名称，不是 workflow 名称 CI - Task board checks，也不是报告上传步骤名称。

个人练习的批准人数为 0，仍会要求 PR 和 CI。以后有协作者时再增加批准人数，不能把自己的检查记录当成另一人的批准。管理员受合并规则约束，但仓库所有者仍能修改规则；这不等于规则不可更改。

先只读核对当前设置：

```bash
gh api repos/TWO-I-C/task-board/branches/main/protection
gh api repos/TWO-I-C/task-board/rulesets --jq 'length'
```

本课起点预期第一条返回 404 且明确写着 Branch not protected，第二条返回 0。这说明尚未配置，不是测试失败。如果出现其他错误、已有规则或非零 ruleset，先发结果给我，避免用下面的 PUT 覆盖后来新增的设置。

确认仍是上述起点后，执行一次以下命令，实际修改 GitHub 上 main 的合并要求：

```bash
gh api --method PUT repos/TWO-I-C/task-board/branches/main/protection --input docs/lessons/16-main-protection.json --jq '{checks: .required_status_checks.checks, strict: .required_status_checks.strict, enforce_admins: .enforce_admins.enabled, approvals: .required_pull_request_reviews.required_approving_review_count, resolve_conversations: .required_conversation_resolution.enabled}'
```

再用独立读取确认，不只看写入命令退出成功：

```bash
gh api repos/TWO-I-C/task-board/branches/main/protection --jq '{checks: .required_status_checks.checks, strict: .required_status_checks.strict, enforce_admins: .enforce_admins.enabled, approvals: .required_pull_request_reviews.required_approving_review_count, resolve_conversations: .required_conversation_resolution.enabled}'
```

应看到正确检查名称与 app_id，strict、enforce_admins、resolve_conversations 为 true，approvals 为 0。也可到 [Settings → Branches](https://github.com/TWO-I-C/task-board/settings/branches) 查看 main 的规则。

提交 JSON 只保存方案；PUT 才修改远端设置。`git revert` 这个 JSON 文件也不会撤销远端规则。

回到 PR，处理已有行内讨论并确认当前检查通过后，点击 Ready for review，结束草稿状态。此操作不会合并。先观察指定检查是否显示为 Required，当前是否满足合并条件。

## 验收 4：观察必需检查失败时的合并拦截

PR 必须已经结束 Draft，否则“不能合并”可能只是草稿造成的，不能证明检查规则有效。

打开 tests/e2e/task-board.spec.js，搜索“失败实验”，只把紧接的 `toHaveCount(1)` 改成 `toHaveCount(2)`。保存后：

```bash
git add tests/e2e/task-board.spec.js
git diff --cached
git commit -m "验证必需 CI 失败时阻止 PR 合并"
git push origin codex/first-api
```

等待这次 PR 检查真正结束，不要立即恢复而把旧运行取消。应再次看到同名任务测试 Expected 2、Received 1。

这次重点是 PR 合并区域：指定的 Required 检查失败，正常合并被阻止。记录失败检查和页面给出的原因。不要点击最终确认合并来试探，也不要使用管理员绕过、删规则或跳过测试来“修复”。

如果检查红色但仍允许正常合并，核对规则是否匹配 main、指定的 job 名称是否正确、是否对管理员生效。若显示 Draft、尚未同步 main 或讨论未解决，则是其他条件造成的拦截，不能代替“必需 CI 失败”的证据。

## 验收 5：修复后重新审查最新结果

将同一处的 2 改回 1：

```bash
git add tests/e2e/task-board.spec.js
git diff --cached
git commit -m "恢复 PR 的正确任务数量断言"
git push origin codex/first-api
git status
git log --oneline -1
```

等待 PR 最新检查成功。核对来源提交与本地一致、工作区 clean、Required 检查通过，且没有其他合并阻塞原因。修复提交会更新原 PR；旧失败记录可以保留。

若 main 在练习期间有新提交，strict 规则可能要求更新分支；此时先发状态，我们再练习同步，不用强推。绿色但仍有未解决审查讨论时，读懂并处理后再 Resolve；不要为了消除提示而忽略问题。

最终 PR 保持 Open、非 Draft、尚未合并，不开启自动合并。将 PR 链接和三项审查记录发给我，我会核对规则与实际检查。

现在验证的是合并条件。main 上的 CI 与 Pages 发布仍是独立工作流，尚没有发布前检查依赖；下一步再处理发布条件和实际合并。Pages 只能发布浏览器版，完整账户服务仍需线上后端与数据库。

## 复盘

1. 本次 PR 的 base 和 head 分别是什么？继续推送同一学习分支后，为什么不用重建 PR？
2. 你怎样证明“用户不能改名别人的任务”？请把身份来源、SQL 条件和测试断言连接起来，不能只回答“CI 已通过”。
3. 你是仓库管理员，为什么必需 CI 失败时仍不能正常合并？检查已通过但 PR 仍是 Draft 或存在未解决讨论，又能否合并？

本课验收依据：方向正确的 PR、有证据的审查记录、回读确认的规则，以及 Required 检查失败时被拦截、修复后满足条件的实际结果。仅保存本课文件或看到 Actions 绿色，还没有完成这些验收。
