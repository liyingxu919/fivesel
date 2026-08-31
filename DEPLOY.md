# 部署到 Railway.app

## 步骤

1. **注册 Railway 账号**
   - 访问 https://railway.app
   - 用 GitHub 账号登录

2. **推送代码到 GitHub**
   ```bash
   git init
   git add .
   git commit -m "init: 竞彩足球分析系统"
   git remote add origin https://github.com/你的用户名/jingcai-football.git
   git push -u origin main
   ```

3. **在 Railway 创建项目**
   - 点击 "New Project" → "Deploy from GitHub repo"
   - 选择你的仓库
   - Railway 会自动检测 `railway.toml` 并部署

4. **配置环境变量（可选）**
   - `PORT` - 默认3000，Railway 会自动设置

5. **获取公网地址**
   - 部署完成后，Railway 会分配一个域名如 `xxx.up.railway.app`
   - 在 Settings → Networking 可以绑定自定义域名

## 注意事项

- Railway 免费额度每月$5，够用
- SQLite 数据库在重新部署后会清空，系统会在下次定时采集时自动补充
- 定时任务每天08:00自动采集，每小时更新赔率
- 如需持久化存储，可升级 Railway 的 Volume 功能

## 手动触发采集

访问 `https://你的域名.up.railway.app` 后，数据会在启动时自动采集。
