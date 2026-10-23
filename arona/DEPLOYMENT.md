# 部署 阿罗娜的小窝

## 配置

复制 `.env.example` 为 `.env`，填入自己的阿里云 Key、口令和 HTTPS 域名。`npm start` 自动读取当前目录的 `.env`；已注入的环境变量优先。直接运行 `node server.mjs` 仍只读取进程环境，或使用 `node --env-file-if-exists=.env server.mjs`。无需安装第三方运行依赖。

服务器地址、SSH 用户、远程目录和反向代理端口放在 `deploy.env`（从 `deploy.env.example` 复制）。两个真实配置文件都已被 Git 忽略，模板只含占位值。`deploy.env` 仅供运维命令使用，不会由应用读取；本项目不自动 SSH 或修改服务器。

本地默认只监听 `127.0.0.1`。对外服务必须设置 `NODE_ENV=production`、`HOST=0.0.0.0`、`PORT=4173`、`APP_ORIGIN=https://自己的域名` 和独立的 `SORA_ACCESS_PASSWORD`。默认口令至少 16 位。两个版本使用独立数据库、环境文件和域名，不共享私人记录。

## Docker 示例

在服务器本项目目录准备 `.env`，数据库路径设为 `/app/data/sora.sqlite`。镜像只复制代码和公开素材，不包含 `.env`、数据库或验证文件。

```sh
# deploy.env 是管理员自己填写的可信配置；以下命令在服务器执行。
. ./deploy.env
chmod 600 .env deploy.env
docker build -t sora-companion:local .
docker run -d --name sora-companion --restart unless-stopped \
  --env-file .env \
  -p "127.0.0.1:${INTERNAL_PORT}:4173" \
  -v sora-companion-data:/app/data \
  --security-opt no-new-privileges --cap-drop ALL \
  sora-companion:local
```

已有同名容器时先按自己的更新流程处理旧容器，不重复运行首次启动命令。保留原数据卷和旧镜像以便回退，不清空数据库。

反向代理以 `APP_ORIGIN` 的域名提供 HTTPS，转发到 `127.0.0.1:INTERNAL_PORT`。保留 Host，关闭流式响应缓冲，请求体上限至少 7MB，并配置足够的流式读取超时。SSH 连接可在本机可信 shell 中加载 `deploy.env` 后运行 `ssh "$SSH_TARGET"`，代码目标目录使用 `$REMOTE_DIR`；不要把配置文件放进公开发布包。

上线后检查未登录 API 拒绝访问、口令登录、聊天、记事、音频播放。缺少 Key 时预设互动仍可用，自由聊天/识别/实时配音会报告未配置。测试通过不代表已经部署或通过实体手机验收。
