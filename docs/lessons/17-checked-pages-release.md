# 第三阶段 · 第 4 课：检查通过后发布

项目连续编号第 17 课。预计 90–120 分钟，包括约 15 分钟阅读、PR 检查和发布等待。

第 16 课已经验证：非 Draft 的 PR 在必需 CI 失败时被阻止，恢复后满足合并条件。本课继续连接“检查 → 发布”，并由你完成第一次经过保护规则的合并与上线验收。

本课发布的仍是现有网址上的浏览器任务板。账户系统已经具备本地功能，但线上运行还需要 Node.js、PostgreSQL 和 HTTPS 配置，后续单独完成。

## 起点与本次改动

准备本课时已核验：学习分支最新提交为 d68bc95，PR #1 是 Open、非 Draft、检查通过、合并状态 CLEAN；main 停在 13f3d3e，保护规则生效。Pages 来源为 GitHub Actions，github-pages 环境仅允许 main 分支部署。

本次涉及五个文件：

- 修改 `.github/workflows/ci.yml`：接入依赖检查的发布任务。
- 删除 `.github/workflows/deploy.yml`：发布入口已经移入 ci.yml。
- 修改 README.md 与本次 PR 说明。
- 新增本讲义。

应用功能、数据库结构和测试断言没有变化。提交、推送及实际合并仍由你操作。

## 阅读资源（约 15 分钟）

1. [GitHub：任务依赖 needs](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idneeds)，约 5 分钟，理解前置任务失败时后续任务为什么跳过。
2. [GitHub：使用自定义 Pages 工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)，约 10 分钟，重点看 artifact、environment，以及连接构建和发布任务。

合并命令有疑问时再查 [gh pr merge](https://cli.github.com/manual/gh_pr_merge)。

## 验收 1：解释两个不同的限制

先打开 `.github/workflows/ci.yml`，找到 `check` 和 `deploy-pages`。前者的显示名称仍为 **Lint, builds, API and browser tests**，因此不用改 main 的必需检查名称。

```text
学习分支 → PR → 必需检查 + 审查 + main 保护规则
                          ↓ 人决定合并
                        main 新提交
                          ↓
       check：lint → 两种构建 → 权限测试 → 浏览器测试
                          ↓ 全部成功
                  上传 dist 发布产物
                          ↓ needs: check
                deploy-pages：发布该产物
                          ↓
                     线上功能验收
```

分支保护限制“能否合并”；`needs: check` 限制“同一次运行中能否继续发布”。main 的合并提交也会重新检查，不能直接拿旧的学习分支绿色记录代替。

| 场景 | check | 发布任务 |
| --- | --- | --- |
| PR 检查成功 | 成功 | Skipped：不是 main 的发布事件 |
| 学习分支 push 成功 | 成功 | Skipped：不是 main |
| main push 或手动运行，检查失败 | 失败 | Skipped：前置任务未成功 |
| main push 或手动运行，检查和产物上传成功 | 成功 | 才开始执行；发布仍可能单独失败 |

发布条件同时检查分支与事件：main 的 push 或 workflow_dispatch。`needs` 使用任务 ID `check`，不是它的显示名称。没有设置 `always()` 或 `continue-on-error` 来绕过检查失败。

`dist` 与 `dist-account` 分别是浏览器版和账户版。上传步骤在全部检查之后，只打包本次运行的 dist；发布任务取同一运行的 github-pages artifact，不另取最新代码再构建。Playwright 报告则是测试证据，两种 artifact 用途不同。

检查任务只有代码读取权限，发布任务才有 Pages 写入和 OIDC 权限。发布任务使用 github-pages 环境；其部署分支限制也只允许 main。

能说明“为什么只创建 PR 不会发布”“为什么 main 上检查失败不会继续发布”“为什么上传测试报告不等于发布网站”，再进入下一项。

## 验收 2：更新现有 PR，确认只检查不发布

在项目目录中确认仍位于 codex/first-api，查看本次变化：

```bash
git branch --show-current
git status --short
git diff -- .github/workflows/ci.yml .github/workflows/deploy.yml
```

工作流中删除 deploy.yml 是有意移除旧入口，不是遗漏。暂存时明确包含这个删除：

```bash
git add .github/workflows/ci.yml .github/workflows/deploy.yml README.md docs/reviews/16-account-system-pr.md docs/lessons/17-checked-pages-release.md
git diff --cached --stat
git commit -m "让 Pages 仅在检查通过后发布"
git push origin codex/first-api
```

推送成功后同步 PR 的最终说明和标题：

```bash
gh pr edit 1 --repo TWO-I-C/task-board --title "整合账户任务系统与检查后发布流程" --body-file docs/reviews/16-account-system-pr.md
```

打开 [PR #1](https://github.com/TWO-I-C/task-board/pull/1) 的最新 Checks，确认：

- Lint, builds, API and browser tests 成功。
- Deploy checked browser edition 显示 Skipped。
- 最新 PR 仍非 Draft，必需检查通过；不要把发布任务加入 main 的必需检查列表，因为 PR 阶段它本来就不发布。

可以用以下命令核对来源提交与检查；工作流可能同时有 push 和 pull_request 两次运行：

```bash
git log --oneline -1
gh pr checks 1 --repo TWO-I-C/task-board --required
gh pr view 1 --repo TWO-I-C/task-board --json isDraft,headRefOid,mergeStateStatus
```

应是最新提交，isDraft 为 false，正常情况下 mergeStateStatus 为 CLEAN。此时页面上的发布 Skipped 来自事件/分支条件，不能把它当作“已在 main 制造检查失败”的实验结果。main 的依赖关系通过配置审查确认，后面实际观察成功时的执行顺序；不向 main 故意引入错误。

## 验收 3：审阅后手动合并

这一步会更新 main，并触发浏览器版的公开发布。执行前在 Files changed 核对新的发布逻辑与最终 PR 说明，确认最新检查通过、没有未解决讨论，且本地工作区干净。若合并状态不是 CLEAN，先查看具体原因，不使用管理员绕过。

本项目保留阶段提交记录，因此采用 Create a merge commit，对应 CLI 的 `--merge`。它会生成新的合并提交，所以合并后的 main SHA 通常不同于学习分支的 SHA。

先核对本地与 PR 的来源提交相同，并检查提交邮箱：

```bash
git status
git rev-parse HEAD
gh pr view 1 --repo TWO-I-C/task-board --json headRefOid
git config user.email
```

两个提交编号应一致；邮箱应是 GitHub noreply 地址。下面命令再次限制只能合并本地当前核对过的提交，并保留 noreply 作者邮箱。如果本地邮箱不是 noreply，它会停止，不会合并：

```bash
reviewed_head=$(git rev-parse HEAD)
merge_author_email=$(git config user.email)
case "$merge_author_email" in
  *@users.noreply.github.com)
    gh pr merge 1 --repo TWO-I-C/task-board --merge --match-head-commit "$reviewed_head" --author-email "$merge_author_email"
    ;;
  *) echo "请先配置 GitHub noreply 邮箱，暂不合并。" ;;
esac
```

`--match-head-commit` 防止核对后来源分支发生变化，却合并了另一个提交；它不替代代码审查。命令没有开启自动合并或绕过保护，也不删除学习分支。

如果命令中断，先回读状态，不要重复点击合并：

```bash
gh pr view 1 --repo TWO-I-C/task-board --json state,mergeCommit,url
```

成功后 state 为 MERGED，记下 mergeCommit.oid。GitHub 上合并成功不代表本机 main 自动更新，也不代表网站已经发布成功。

## 验收 4：确认 main 的检查与发布串行完成

到 [Actions](https://github.com/TWO-I-C/task-board/actions) 找到 **CI - Task board checks** 的 main/push 运行；不要继续看旧的 PR 运行。

```bash
gh run list --repo TWO-I-C/task-board --branch main --limit 3
```

确认运行提交编号等于上一项的 mergeCommit.oid。应先看到 check 成功，且 Upload checked browser edition 上传 github-pages 产物；随后 Deploy checked browser edition 成功，并给出网站地址。

| 观察结果 | 应怎样判断 |
| --- | --- |
| check 失败、发布 Skipped | 新流程没有继续发布；定位第一个失败步骤 |
| check 成功、发布失败 | 检查通过，尚不能认定本次发布成功；看发布日志 |
| 两个任务成功 | 可以开始线上功能验收，不能只停留在日志绿色 |

不通过跳过检查、重开旧 deploy.yml 或强推 main 来处理失败。若是暂时服务问题，确认原因后可在新工作流页面使用 **Run workflow → main** 创建一次完整的新运行；它仍会重新检查，不直接发布。合并前这个手动入口可能尚不可用，因为工作流需要先存在于默认分支。

旧 Deploy 工作流的历史运行可能仍在 Actions 列表中，不代表新提交仍会使用它。以后使用 ci.yml 的入口。

## 验收 5：线上验收，并同步本机 main

打开 [线上浏览器任务板](https://two-i-c.github.io/task-board/)。使用一条容易辨认的临时任务，不改动已有真实任务：

1. 新增“发布验收临时任务”，修改名称并标记完成。
2. 切换全部/未完成/已完成，检查展示与总数。
3. 刷新网页，名称与完成状态应保留；原有浏览器任务也应保留。
4. 删除这条临时任务并刷新，确认它没有回来。

页面应仍是浏览器版，没有账户登录入口。任务保存在当前网站来源的 localStorage，不跨浏览器同步。线上发布不会把本机数据库或 localhost 的任务上传到 Pages。

线上验收成功后，同步本机 main：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git log --oneline -1
git status
```

本地 main 应与远端合并提交一致，工作区 clean。后续功能从这个 main 新建 codex/ 前缀的分支，通过新的 PR 交付；原学习分支及历史可以保留。

## 复盘与完成条件

完成后发我 main 的成功运行链接、线上验收结果，并回答：

1. main 的保护规则与 `needs: check` 分别限制什么？为什么 PR 中发布任务 Skipped 是正常的？
2. PR 检查已经通过，合并后为什么还要看 main 的新运行和提交编号？
3. check 成功、发布成功、线上功能正常分别提供什么证据？为什么这仍不等于账户系统已上线？

本课完成条件是实际合并、main 检查与发布成功、线上功能验收、本机 main 同步完成。当前本地配置与构建检查只是在准备这些步骤，不能代替云端和线上结果。
