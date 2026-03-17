# lichuan-travel

轻量级旅游管理系统（含前端、后台、数据库、静态页面管理界面）。

## 目录结构

- `backend/`  Node.js + Express 后端（API 服务、数据库连接、管理员身份验证）
- `frontend/` 单页 Web 应用（静态资源 + NGINX 反向代理 + API 路由）
- `manager/` 管理后台静态页面（Dashboard / 登录）
- `docker-compose.yml` 本地一键运行组合
- `.env` 数据库及管理员配置

## 快速启动

1. 克隆仓库

```bash
git clone https://github.com/lczhuigz/lichuan-travel.git
cd lichuan-travel
```

2. 准备环境变量 (`.env` 已示例)

```bash
cp .env.example .env
# 如果没有 .env.example，可直接在 .env 里配置
# DB_USER=postgres
# DB_PASSWORD=postgres123
# DB_NAME=lichuan_travel
# ADMIN_USERNAME=admin
# ADMIN_PASSWORD=admin123
```

3. 启动服务

```bash
docker compose up -d --build
```

4. 访问

- 前端: http://localhost
- 管理后台: http://localhost/manager
- API: http://localhost/api/

5. 停止服务（可选）

```bash
docker compose down
```

## 组件说明

### PostgreSQL

- image: `postgres:15-alpine`
- 初始化脚本: `backend/init.sql`
- 持久化卷: `postgres_data`

### 后端服务

- 路径: `backend/server.js`
- 端口: `3000`
- 环境变量参考 `docker-compose.yml`

### NGINX

- 站点根目录: `/usr/share/nginx/html`（映射 `./frontend`）
- 管理后台路径:
  - `location /manager/`（`./manager`）
  - `location /api/` 代理到 `backend`

## 常见问题

1. **NGINX 容器启动报错 `read-only file system`**
   - 请勿同时挂载父目录与子目录。当前配置应为：
     - `./frontend:/usr/share/nginx/html`
     - `./manager:/usr/share/nginx/manager`

2. **访问 `/api` 失败**
   - 确认 `frontend/nginx.conf` 挂载到 `/etc/nginx/conf.d/default.conf`
   - 确认 `backend` 服务可访问（`docker logs lichuan-backend`）

## 开发

- 后端: `cd backend && npm install && npm start`
- 前端: 直接用静态服务器（或 `npm` build 方案）

## 许可证

MIT License（见 `LICENSE`）
