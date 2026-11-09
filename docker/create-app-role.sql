-- PostgreSQL 首次初始化练习数据库时执行。应用用自己的角色建表和读写。
\getenv app_password TASK_BOARD_APP_PASSWORD
CREATE ROLE task_board_app LOGIN PASSWORD :'app_password';
GRANT USAGE, CREATE ON SCHEMA public TO task_board_app;
