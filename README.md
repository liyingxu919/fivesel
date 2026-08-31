# 竞彩智能分析系统

以小搏大 -- 基于泊松分布模型、Elo评分和价值评估的竞彩足球分析系统，自动生成串3/串4推荐方案。

## 系统架构

```
collectors/        Node.js 数据采集
  jczq-500.js        500.com 竞彩赔率采集
  flashscore.js       FlashScore 比赛数据采集
  index.js            定时调度器 (node-cron)

analyzer/          Python 分析引擎
  models/             泊松分布 + Elo + 集成模型
  features/           特征工程
  value/              价值评估 + Kelly 公式 + 串关组合
  learning/           结果反馈与学习系统
  main.py             分析主入口

server/            Express API 服务
  routes/matches        比赛数据接口
  routes/recommendations 推荐方案接口

web/               前端页面
  index.html           单页应用 (推荐/全部场次/命中追踪)

data/              SQLite 数据库
scripts/           运维脚本
```

## 快速开始

### 环境要求

- Node.js >= 18
- Python >= 3.10

### 一键初始化

```bash
./scripts/setup.sh
```

该脚本会安装所有 Node.js 和 Python 依赖，并初始化数据库。

### 使用方式

**方式一：手动分步运行**

```bash
# 1. 采集今日竞彩数据
cd collectors && node index.js --now

# 2. 运行分析引擎
cd analyzer && source venv/bin/activate && python main.py

# 3. 启动 Web 服务
cd server && node app.js
# 浏览器访问 http://localhost:3000
```

**方式二：一键每日流程**

```bash
./scripts/daily.sh
```

自动完成数据采集 -> 分析计算 -> 输出推荐方案。

## 分析模型

| 模型 | 说明 |
|------|------|
| 泊松分布 | 基于进攻/防守强度预测进球概率分布 |
| Elo评分 | 动态评估球队实力，含主场加成 |
| 集成模型 | 加权融合各模型输出，XGBoost/LightGBM 集成 |
| 价值评估 | 期望值 > 1.0 的投注标记为有价值，Kelly公式控制仓位 |
| 串关组合 | 自动生成串3、串4和比分串方案，每日投入20元 |

## API 接口

| 路径 | 说明 |
|------|------|
| `GET /api/matches` | 获取比赛列表，支持 `?date=YYYY-MM-DD` |
| `GET /api/recommendations` | 获取推荐方案，支持 `?date=YYYY-MM-DD` |

## 配置

分析参数在 `analyzer/config.py` 中配置：

- `DAILY_BUDGET` -- 每日投入上限（默认20元）
- `COMBO3_COUNT` / `COMBO4_COUNT` -- 串3/串4组数
- `VALUE_THRESHOLD` -- 价值投注阈值
- `ELO_K` -- Elo评分更新系数

## License

MIT
