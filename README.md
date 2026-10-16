# 个人任务板

用 React、Vite 和 AI 辅助开发的学习项目。支持新增任务、完成与取消完成、编辑名称、删除确认、状态筛选，以及浏览器本地保存。

在线使用：[打开个人任务板](https://two-i-c.github.io/task-board/)

## 数据保存在哪里

任务保存在当前浏览器的 localStorage 中，不会上传到 GitHub，也不会在不同设备或浏览器之间同步。清除网站数据会删除任务。

本地开发地址和线上网址属于不同来源，各自保存自己的任务。首次打开线上网站时看不到本地开发时的任务，这是正常的。

## 本地开发

使用 Node.js 24。在项目目录中执行：

```bash
npm ci
npm run dev
```

打开终端显示的本地网址。已经安装依赖且依赖文件没有变化时，只需执行 `npm run dev`。

## 构建与预览上线版本

```bash
npm run build -- --base=/task-board/
npm run preview -- --base=/task-board/
```

构建产物在 `dist` 目录中。预览仅用于本地检查，不是线上服务器。

## 自动部署到 GitHub Pages

仓库的 Settings → Pages → Source 使用 **GitHub Actions**。

工作流位于 `.github/workflows/deploy.yml`。每次推送到 `main`，它依次执行：安装依赖 → 构建网站 → 上传 `dist` → 发布到 GitHub Pages。也可以在 Actions 页面手动运行。

因为网站部署在 `/task-board/` 路径下，构建时需要指定 `--base=/task-board/`，让页面从正确的位置加载 JavaScript 和 CSS。本地开发配置不变。

可以在 [Actions 页面](https://github.com/TWO-I-C/task-board/actions) 查看发布结果。只有流程成功完成，才能确认该版本已经发布；`git commit` 只在本地保存版本，`git push` 才会触发这里的自动部署。

## 上线后验收

1. 打开线上网址，新增任务、编辑名称、切换完成状态并筛选。
2. 刷新页面，确认任务名称和完成状态保留。
3. 用另一台设备打开同一网址，确认可以使用，且任务列表独立保存。
4. 删除测试任务，确认刷新后不会重新出现。

部署参考：[Vite 官方指南](https://vite.dev/guide/static-deploy.html#github-pages)、[GitHub Pages 工作流说明](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
