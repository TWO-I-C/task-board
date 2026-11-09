# 第 21 课 · 备份数据库并实际恢复

第三阶段第 8 课，预计 45–60 分钟。你将导出数据库，暂停原系统，再把备份文件恢复到另一套 PostgreSQL。通过任务 ID、标题、归属和完成状态核对恢复结果。

本课使用同一个终端完成命令，保留其中的 `backup_file` 和 `restore_project` 两个变量。原系统的 Compose 项目名是 `task-board-lesson19`。恢复环境会使用新生成的项目名和独立数据卷。

## 验收 1 · 准备一条可核对的任务

```bash
cd /Users/two-i-c/Documents/Codex/learning-projects/task-board
docker compose --env-file .env.compose -p task-board-lesson19 up -d --wait
```

打开 [账户任务板](http://127.0.0.1:8080)，登录练习账号。新增“备份前的任务21”，勾选完成，然后刷新页面。确认名称和完成状态仍能读回。

执行下面的 SQL，记下属于该账号的任务 ID、标题、`completed` 和用户名。若之前已有同名任务，给本次任务改成独有标题，并同步修改后面的查询条件。

```bash
docker compose --env-file .env.compose -p task-board-lesson19 exec db psql -U task_board_app -d task_board_practice -c "SELECT t.id, t.title, t.completed, u.username FROM tasks t JOIN users u ON u.id=t.owner_id WHERE t.title='备份前的任务21';"
```

## 验收 2 · 导出并检查备份文件

下面的命令会创建一个新的备份目录，放在 Mac 的项目目录之外。数据库备份含有账号和任务数据，目录权限设置为仅当前 Mac 用户可以访问。每次执行都会生成新的子目录。

```bash
backup_dir="$HOME/Documents/Codex/learning-backups/task-board"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
backup_run="$(mktemp -d "$backup_dir/lesson21-XXXXXXXX")"
backup_file="${backup_run:?请先创建备份目录}/task-board.dump"
(
  umask 077
  docker compose --env-file .env.compose -p task-board-lesson19 exec -T db pg_dump -U task_board_app -d task_board_practice -Fc > "${backup_file:?请先设置备份路径}.partial"
) && mv "$backup_file.partial" "$backup_file" && printf '备份文件已生成 %s\n' "$backup_file"
```

看到“备份文件已生成”和完整路径后，检查文件大小与备份目录。

```bash
ls -lh "${backup_file:?请先完成备份}"
docker compose --env-file .env.compose -p task-board-lesson19 exec -T db pg_restore --list < "${backup_file:?请先完成备份}"
```

预期文件大小大于 0，目录中能找到 `tasks`、`users`、`sessions` 和 `schema_migrations` 的条目。记下备份完整路径，后面恢复会读取这个文件。

`-Fc` 选择 PostgreSQL 的自定义归档格式。`>` 把导出内容写到 Mac 的文件中，`-T` 关闭伪终端以传输归档数据。导出过程中使用 `.partial` 文件，导出成功后才改成 `.dump`。文件大小与目录检查完成后，还要通过后面的实际恢复来检验数据能否使用。

## 验收 3 · 新增一条任务，再准备恢复环境

回到原页面，新增“备份后的任务21”，刷新确认已保存。此时预测恢复结果应该包含哪条任务，再暂停原系统。

```bash
docker compose --env-file .env.compose -p task-board-lesson19 stop
restore_project="task-board-restore21-$(uuidgen | tr '[:upper:]' '[:lower:]')"
printf '恢复项目名 %s\n' "$restore_project"
docker compose --env-file .env.compose -p "${restore_project:?请先生成恢复项目名}" up -d --wait db
docker volume ls --filter "label=com.docker.compose.project=${restore_project:?请先生成恢复项目名}"
```

记录新的项目名。卷列表应显示以这个名字开头的 `_pgdata` 卷。Compose 使用 `-p` 指定的项目名为这次运行创建资源。[Compose 项目名](https://docs.docker.com/compose/how-tos/project-name/)

检查目标库当前有多少张应用表。

```bash
docker compose --env-file .env.compose -p "${restore_project:?请先完成验收3}" exec db psql -U task_board_app -d task_board_practice -c "SELECT count(*) AS application_tables FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';"
```

预期返回 0。这个数据库已经准备好应用角色，表和数据将在恢复时建立。继续之前核对终端命令中的项目名与刚刚创建的恢复项目一致。

## 验收 4 · 恢复并核对数据

以下命令把 Mac 上的备份文件送进恢复数据库。恢复操作放在一个事务中，出现错误时会回滚这次恢复。

```bash
docker compose --env-file .env.compose -p "${restore_project:?请先完成验收3}" exec -T db pg_restore -U task_board_app -d task_board_practice --no-owner --no-privileges --single-transaction < "${backup_file:?请先完成验收2}" && printf '恢复命令成功结束\n'
```

看到成功提示后，用 SQL 验证两条任务。

```bash
docker compose --env-file .env.compose -p "${restore_project:?请先完成验收3}" exec db psql -U task_board_app -d task_board_practice -c "SELECT t.id, t.title, t.completed, u.username FROM tasks t JOIN users u ON u.id=t.owner_id WHERE t.title IN ('备份前的任务21','备份后的任务21') ORDER BY t.title;"
```

预期查到“备份前的任务21”，它的 ID、完成状态和归属都与验收 1 一致。“备份后的任务21”是在导出结束后新增的，本次归档覆盖的是更早的数据库状态。

目标库如果已有应用表，重复恢复可能报表已存在。先核对目标项目和上次恢复结果，再决定是否生成一个新的恢复项目进行演练。

## 验收 5 · 恢复原系统并对照时间点

重新启动原系统，打开 8080 页面登录。

```bash
docker compose --env-file .env.compose -p task-board-lesson19 up -d --wait
```

原系统应能读到“备份前的任务21”和“备份后的任务21”。对照两边结果，说明归档文件保留了哪个时点的数据。如果明天要从这份备份恢复，导出结束后的变化还需要什么备份才能找回？

完成后按下面两行收尾。记下备份文件路径、恢复项目名和这次恢复核对的任务 ID，保留文件供后续练习使用。

```bash
docker compose --env-file .env.compose -p "${restore_project:?请先核对恢复项目名}" down
docker compose --env-file .env.compose -p task-board-lesson19 down
```

## 阅读与复盘

用约 5 分钟读 `pg_dump` 的 Description 和 `--format`。它导出单个数据库的一致快照。为便于观察，本课在导出成功之后才新增第二条任务。[PostgreSQL pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html)

再用约 5 分钟读 `pg_restore` 的 `--list`、`--no-owner` 和 `--single-transaction`。本课先创建目标应用角色，再使用该角色恢复表与数据。[PostgreSQL pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html)

完成后回答三个问题。

1. 哪些证据说明恢复环境的数据来自这份备份文件？
2. 原数据卷损坏时，本次保存在 Mac 上的归档有什么作用？如果 Mac 的磁盘也损坏，还需要准备什么？
3. 为什么新恢复的数据库里只有备份前的那条任务？如果希望最多丢失一小时的新增数据，你会怎样安排备份，并怎样验证安排有效？

五项验收通过后，把讲义与资源索引保存为一次 Git 提交。
