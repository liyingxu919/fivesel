# 竞彩足球智能分析系统 - 设计文档

## 1. 项目概述

构建一个专业的中国体彩竞彩足球分析预测系统，通过数据采集、统计分析和机器学习模型，每日自动输出以小搏大的投注方案。

### 核心原则

- **以小搏大**：每日投入 ≤ 20 元，追求高赔大奖
- **串3串4为主**：精选 3-4 场高价值冷门组合，而非大串碰运气
- **只用竞彩官方数据**：比赛场次和 SP 赔率全部来自中国竞彩官方
- **持续迭代**：模型根据实际结果自动学习更新

### 玩法覆盖

| 玩法 | 竞彩类型 | 赔率范围 | 搏冷价值 |
|------|----------|----------|----------|
| 胜平负/让球胜平负 | SPF/HHAD | 1.5-8.0+ | 中等 |
| 总进球数 | ZJQ | 3.0-30.0+ | 高 |
| 比分 | BF | 50-200+ | 极高 |

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    数据采集层 (Node.js)                    │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ 500.com  │  │FlashScore│  │FootballBin│  │ 其他源  │ │
│  │ 竞彩赔率  │  │ 比赛数据  │  │ AI预测    │  │伤停/天气│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       └──────────┬───┴────────────┬┘─────────────┘      │
│                  ▼                                       │
│           ┌─────────────┐                                │
│           │   SQLite DB  │                                │
│           └──────┬──────┘                                │
└──────────────────┼──────────────────────────────────────┘
                   │
┌──────────────────┼──────────────────────────────────────┐
│                  ▼                                       │
│              分析引擎 (Python)                            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  特征工程     │  │  集成模型     │  │  价值评估     │  │
│  │  200+ 特征   │→│  泊松/Elo/   │→│  概率对比     │  │
│  │              │  │  XGBoost     │  │  Kelly公式    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                          │              │
│  ┌──────────────┐  ┌──────────────┐      ▼              │
│  │  回测系统     │  │  学习迭代     │  串关组合生成      │
│  │  历史验证     │←│  结果反馈     │  (串3/串4)        │
│  └──────────────┘  └──────────────┘                    │
└─────────────────────────────────────────────────────────┘
                   │
┌──────────────────┼──────────────────────────────────────┐
│                  ▼                                       │
│              展示层 (Web 前端)                            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  每日推荐     │  │  命中率追踪   │  │  模型仪表板   │  │
│  │  串关方案     │  │  收益曲线     │  │  特征权重     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 数据采集层 (Node.js)

### 3.1 数据源详情

#### 500.com 竞彩数据（核心）

- **URL**: `https://trade.500.com/jczq/`
- **采集内容**:
  - 当前开售的所有竞彩场次
  - 每场比赛的 SP 赔率（胜平负、让球胜平负）
  - 联赛名称、主客队、排名
  - 比赛时间、投注截止时间
  - 让球数
- **频率**: 赛前 4 小时采集，赛前 1 小时更新，赛前 15 分钟最终更新
- **已有基础**: `football-proxy.js` 的解析逻辑可直接复用

#### FlashScore 比赛数据（辅助分析）

- **已有**: football-betting-analysis skill 的 MCP 调用逻辑
- **采集内容**:
  - 近 10 场战绩
  - H2H 历史交锋
  - 联赛排名和积分
  - 比赛统计（射门、控球率等）
  - 阵容信息（如有）
- **频率**: 每场比赛采集一次即可（历史数据变动小）

#### FootballBin AI 预测（参考）

- **已有**: footballbin-predictions skill
- **采集内容**: AI 预测比分、进球数
- **频率**: 每场比赛采集一次

#### 补充数据源

- **竞彩官方**: `https://www.lottery.gov.cn` — 开售场次确认
- **球探网/懂球帝**: 伤停信息、赛前新闻
- **天气 API**: 比赛日当地天气（雨战影响进球数）

### 3.2 数据库设计 (SQLite)

```sql
-- 比赛基础信息
CREATE TABLE matches (
    match_id TEXT PRIMARY KEY,        -- 竞彩编号 如 "周四001"
    match_date DATE,
    match_time TIME,
    buy_deadline DATETIME,
    league_name TEXT,
    home_team TEXT,
    away_team TEXT,
    home_rank INTEGER,
    away_rank INTEGER,
    handicap INTEGER DEFAULT 0,       -- 让球数
    status TEXT DEFAULT 'notstarted', -- notstarted/inprogress/finished
    home_score INTEGER,
    away_score INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 赔率快照（多次采集，追踪变动）
CREATE TABLE odds_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT REFERENCES matches(match_id),
    snapshot_time DATETIME,
    -- 胜平负 SP
    sp_home REAL,
    sp_draw REAL,
    sp_away REAL,
    -- 让球胜平负 SP
    sp_handicap_home REAL,
    sp_handicap_draw REAL,
    sp_handicap_away REAL,
    -- 总进球 SP
    sp_goals_0 REAL,
    sp_goals_1 REAL,
    sp_goals_2 REAL,
    sp_goals_3 REAL,
    sp_goals_4 REAL,
    sp_goals_5 REAL,
    sp_goals_6 REAL,
    sp_goals_7plus REAL,
    -- 比分 SP (JSON 存储，字段太多)
    sp_scores_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FlashScore 详细数据
CREATE TABLE match_details (
    match_id TEXT PRIMARY KEY REFERENCES matches(match_id),
    flashscore_id TEXT,
    home_form_json TEXT,      -- 近 N 场战绩
    away_form_json TEXT,
    h2h_json TEXT,            -- 历史交锋
    home_stats_json TEXT,     -- 赛季统计
    away_stats_json TEXT,
    standings_json TEXT,      -- 联赛排名
    lineups_json TEXT,        -- 阵容
    missing_players_json TEXT, -- 伤停
    weather TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 模型预测结果
CREATE TABLE predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT REFERENCES matches(match_id),
    model_version TEXT,
    -- 胜平负概率
    prob_home REAL,
    prob_draw REAL,
    prob_away REAL,
    -- 让球胜平负概率
    prob_handicap_home REAL,
    prob_handicap_draw REAL,
    prob_handicap_away REAL,
    -- 总进球概率分布 (JSON)
    prob_goals_json TEXT,
    -- 比分概率矩阵 (JSON)
    prob_scores_json TEXT,
    -- 价值评估
    value_spf_json TEXT,       -- 胜平负价值得分
    value_hhspf_json TEXT,     -- 让球胜平负价值得分
    value_goals_json TEXT,     -- 总进球价值得分
    value_scores_json TEXT,    -- 比分价值得分
    confidence REAL,           -- 综合置信度
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 每日推荐方案
CREATE TABLE recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    rec_date DATE,
    rec_type TEXT,             -- main/backup/score (主力/辅助/比分)
    -- 串关组合
    matches_json TEXT,         -- [{match_id, pick, odds, value_score}, ...]
    total_odds REAL,           -- 总赔率
    stake REAL,                -- 建议投入
    expected_value REAL,       -- 期望值
    -- 结果追踪
    result TEXT,               -- pending/won/lost
    actual_payout REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 模型版本管理
CREATE TABLE model_versions (
    version TEXT PRIMARY KEY,
    created_at DATETIME,
    features_json TEXT,        -- 使用的特征列表
    hyperparams_json TEXT,     -- 超参数
    -- 性能指标
    accuracy REAL,
    log_loss REAL,
    roi REAL,                  -- 投资回报率
    brier_score REAL,
    is_active BOOLEAN DEFAULT 0
);

-- 学习记录（每场比赛结果反馈）
CREATE TABLE learning_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT,
    model_version TEXT,
    predicted_outcome TEXT,
    predicted_prob REAL,
    actual_outcome TEXT,
    was_correct BOOLEAN,
    odds_at_time REAL,
    profit_loss REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.3 采集调度

```
每日流程（自动）:
  08:00  采集当日竞彩开售场次
  08:30  采集 FlashScore 历史数据
  09:00  采集 FootballBin 预测
  10:00  采集补充数据（伤停、天气）
  ── 运行分析模型，生成推荐 ──
  12:00  首次赔率快照
  赛前1h  赔率更新快照
  赛前15m 最终赔率快照（最终推荐）
  ── 比赛进行 ──
  赛后    采集比赛结果，反馈学习
```

---

## 4. 分析引擎 (Python)

### 4.1 特征工程

分为 5 大类，约 200+ 个特征：

#### A. 基础实力特征 (40+)
- 近 5/10 场胜平负战绩
- 近 5/10 场进球/失球数
- 主客场分别战绩
- 联赛排名、积分、净胜球
- 赛季场均进球/失球

#### B. 对阵特征 (30+)
- H2H 近 5/10 场战绩
- H2H 主客场分别战绩
- H2H 近期进球趋势
- 联赛类型（同联赛/杯赛/国际赛）

#### C. 状态与趋势特征 (30+)
- 近 5 场走势（连胜/连败/起伏）
- 进攻效率趋势（射门转化率变化）
- 防守稳定性（失球方差）
- 连续不失球场次
- 连续进球场次

#### D. 赔率特征 (40+)
- 竞彩 SP 原始赔率
- 反推隐含概率（去除抽水后）
- 赔率变动幅度（首次 vs 最新）
- 赔率方向（升/降/稳）
- 市场共识（多家数据源对比）
- 冷门指数（高赔选项的价值偏差）

#### E. 环境特征 (20+)
- 主客场因素
- 赛程密度（近 7 天比赛数）
- 天气条件
- 比赛重要性（保级/争冠/无欲无求）

### 4.2 集成预测模型

#### 模型 1：泊松分布进球模型

```
核心思想：足球进球近似泊松分布

输入：主队攻击力(λ_home)、客队攻击力(λ_away)
输出：每个比分的概率矩阵

P(主队进n球) = (λ_home^n × e^(-λ_home)) / n!
P(客队进m球) = (λ_away^m × e^(-λ_away)) / m!
P(比分n:m) = P(主队进n球) × P(客队进m球)

λ 由以下因素调整：
- 球队赛季平均进球/失球
- 对手防守/进攻强度
- 主客场因素
- 近期状态
```

**用途**：比分预测、总进球数预测

#### 模型 2：Elo 评分系统

```
核心思想：动态实力评分

初始 Elo = 1500（可按联赛水平调整）
赛后更新：R_new = R_old + K × (S - E)
  K = 32（可调）
  S = 实际结果（1/0.5/0）
  E = 期望胜率 = 1 / (1 + 10^((R_opponent - R_self)/400))

扩展：
- 主场优势加成 (+100 Elo)
- 近期权重加权（近场权重更高）
- 联赛级别差异调整
```

**用途**：实力评估、胜平负概率

#### 模型 3：XGBoost/LightGBM 集成

```
核心思想：机器学习特征组合

输入：上述 200+ 特征
输出：胜平负概率、进球数概率、比分概率

训练数据：历史竞彩比赛 + 结果
优化目标：log_loss（概率校准）

关键：
- 使用 Platt Scaling 校准输出概率
- 特征重要性排序，剔除噪音特征
- 防过拟合：正则化 + 交叉验证
```

**用途**：综合预测，融合所有特征

#### 模型集成策略

```
最终概率 = w1 × 泊松概率 + w2 × Elo概率 + w3 × XGBoost概率

权重 w1/w2/w3 通过历史回测自动优化
每个玩法（SPF/HHAD/ZJQ/BF）使用不同的最优权重组合
```

### 4.3 价值评估与串关生成

#### 价值得分计算

```
对于每个选项（如 "主胜"、"比分2:1"、"总进球3个"）：

赔率隐含概率 = 1 / SP赔率
模型概率 = 集成模型输出

价值得分 = 模型概率 / 赔率隐含概率

价值得分 > 1.0 → 正期望（有价值）
价值得分 > 1.5 → 高价值（值得投注）
价值得分 > 2.0 → 极高价值（重点推荐）

示例：
  竞彩 "客胜" SP = 5.00 → 隐含概率 = 20%
  模型计算客胜概率 = 35%
  价值得分 = 35% / 20% = 1.75 → 高价值
```

#### Kelly 公式（投注比例）

```
f* = (bp - q) / b

f* = 最优投注比例
b = 赔率净收益 (SP - 1)
p = 模型概率
q = 1 - p

实际使用半 Kelly（f*/2）降低波动

示例：
  SP = 5.00, 模型概率 = 35%
  f* = (4 × 0.35 - 0.65) / 4 = 0.1875
  实际投注 = 0.1875 / 2 = 9.4% 的资金
```

#### 串关组合生成（串3/串4）

```
输入：所有场次的价值得分排序

策略：
1. 从高价值选项中筛选赔率 > 2.0 的选项（博冷）
2. 按价值得分降序排列
3. 生成串3组合：选前 3 高价值选项
4. 生成串4组合：选前 4 高价值选项
5. 计算组合总赔率 = 各选项 SP 相乘
6. 计算组合期望值 = 模型联合概率 × 总赔率

约束：
- 每日总投入 ≤ 20 元
- 主力方案：2-3 组串3（每组 2 元，共 6 元）
- 辅助方案：1-2 组串4（每组 2 元，共 4 元）
- 比分单挑：1 组比分串（每组 2 元）
- 剩余资金：灵活分配

避免：
- 同一联赛选太多场（相关性高）
- 同一时间点选太多场（容易同时爆冷或同时正路）
- 纯高赔无价值（赔率高但模型也认为概率低的）
```

---

## 5. 学习迭代系统

### 5.1 在线学习流程

```
每场比赛结束后：
    │
    ├── 采集比赛结果
    ├── 对比预测 vs 实际
    │     ├── 预测正确 → 增加该模型/特征权重
    │     └── 预测错误 → 分析偏差原因
    │
    ├── 更新 Elo 评分
    ├── 更新球队近期状态
    │
    └── 每周批量重训练
          ├── 重新训练 XGBoost 模型
          ├── 优化集成权重
          ├── 更新特征选择
          └── 保存新模型版本
```

### 5.2 模型评估指标

| 指标 | 含义 | 目标 |
|------|------|------|
| Log Loss | 概率预测准确度 | < 0.90 |
| Brier Score | 概率校准度 | < 0.20 |
| ROI | 投资回报率 | > 0%（长期正期望） |
| 命中率 | 预测正确比例 | 参考值，非核心 |
| 价值命中率 | 价值推荐的命中率 | > 模型概率 |

### 5.3 自动优化机制

```
月度优化：
1. 分析过去 30 天的预测结果
2. 计算各模型的单独表现
3. 重新优化集成权重
4. 识别失效特征，剔除或降低权重
5. 生成月度报告

季度优化：
1. 重新评估整个特征体系
2. 尝试新特征（如 xG 数据、球员数据）
3. 尝试新模型（如神经网络）
4. 大规模回测验证
```

---

## 6. 展示层 (Web 前端)

### 6.1 页面结构

```
首页（每日推荐）
├── 今日竞彩场次概览
├── 价值排名 TOP 10
├── 推荐串关方案
│   ├── 主力串3（2 组）
│   ├── 辅助串4（1 组）
│   └── 比分单挑（1 组）
└── 今日投入/预期回报

场次详情页
├── 比赛基本信息
├── 赔率与价值分析
├── 模型概率分布
├── 历史交锋 & 近期战绩
└── 特征雷达图

命中率追踪页
├── 历史推荐汇总
├── 命中率曲线
├── 收益曲线（ROI）
├── 各玩法命中率对比
└── 按联赛/时间段分析

模型仪表板
├── 模型版本历史
├── 特征重要性排名
├── 概率校准图
├── 回测结果
└── 参数调优记录
```

### 6.2 技术选型

- **前端**: HTML/CSS/JS（保持轻量，你已有 football.html 基础）
- **后端**: Node.js Express API
- **通信**: REST API，Python 分析结果写入 SQLite，Node.js 读取展示
- **图表**: Chart.js 或 ECharts

---

## 7. 项目目录结构

```
football-jingcai/
├── docs/                           # 文档
│   └── 2026-08-28-jingcai-system-design.md
│
├── collectors/                     # 数据采集 (Node.js)
│   ├── package.json
│   ├── index.js                    # 采集调度器
│   ├── jczq-500.js                # 500.com 竞彩数据采集
│   ├── flashscore.js              # FlashScore 数据采集
│   ├── footballbin.js             # FootballBin 预测采集
│   ├── supplementary.js           # 补充数据（伤停、天气）
│   └── utils/
│       ├── db.js                  # 数据库操作封装
│       ├── logger.js              # 日志
│       └── scheduler.js           # 定时任务
│
├── analyzer/                       # 分析引擎 (Python)
│   ├── requirements.txt
│   ├── config.py                  # 配置
│   ├── features/
│   │   ├── base.py                # 特征基类
│   │   ├── team_strength.py       # 基础实力特征
│   │   ├── matchup.py             # 对阵特征
│   │   ├── form.py                # 状态趋势特征
│   │   ├── odds_features.py       # 赔率特征
│   │   └── environment.py         # 环境特征
│   ├── models/
│   │   ├── poisson.py             # 泊松分布模型
│   │   ├── elo.py                 # Elo 评分系统
│   │   ├── gradient_boost.py      # XGBoost/LightGBM
│   │   ├── ensemble.py            # 集成模型
│   │   └── calibrator.py          # 概率校准
│   ├── value/
│   │   ├── evaluator.py           # 价值评估
│   │   ├── kelly.py               # Kelly 公式
│   │   └── combiner.py            # 串关组合生成
│   ├── learning/
│   │   ├── feedback.py            # 结果反馈
│   │   ├── retrain.py             # 模型重训练
│   │   └── optimizer.py           # 参数优化
│   └── main.py                    # 分析主入口
│
├── server/                         # Web 后端 (Node.js)
│   ├── package.json
│   ├── app.js                     # Express 服务
│   ├── routes/
│   │   ├── matches.js             # 比赛数据 API
│   │   ├── predictions.js         # 预测结果 API
│   │   ├── recommendations.js     # 推荐方案 API
│   │   └── stats.js               # 统计数据 API
│   └── middleware/
│       └── cors.js
│
├── web/                            # 前端 (HTML/CSS/JS)
│   ├── index.html                 # 首页（每日推荐）
│   ├── match.html                 # 场次详情
│   ├── tracking.html              # 命中率追踪
│   ├── dashboard.html             # 模型仪表板
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       ├── charts.js
│       └── api.js
│
├── data/                           # 数据存储
│   ├── jingcai.db                 # SQLite 数据库
│   └── models/                    # 训练好的模型文件
│
├── scripts/                        # 运维脚本
│   ├── setup.sh                   # 环境初始化
│   ├── daily.sh                   # 每日定时任务
│   ├── backtest.py                # 回测脚本
│   └── retrain.py                 # 重训练脚本
│
└── README.md
```

---

## 8. 实施优先级

### Phase 1：数据基础（核心）
1. SQLite 数据库初始化
2. 500.com 竞彩数据采集（复用已有代码）
3. FlashScore 数据采集
4. 基础 Web 展示页面

### Phase 2：分析引擎
5. 泊松分布模型
6. Elo 评分系统
7. 特征工程
8. 价值评估系统

### Phase 3：预测与推荐
9. XGBoost 集成模型
10. 串关组合生成
11. 每日自动推荐流程

### Phase 4：学习迭代
12. 结果反馈系统
13. 模型自动重训练
14. 回测验证系统

### Phase 5：完善体验
15. 完整 Web 仪表板
16. 命中率追踪
17. 模型性能监控

---

## 9. 关键约束

- **只用竞彩官方赔率**：不使用任何国际博彩公司赔率
- **只分析竞彩开售场次**：不分析未开售的比赛
- **概率语言**：所有推荐使用概率语言，不说"必中"
- **投入上限**：每日 ≤ 20 元，严格执行
- **数据合规**：采集频率合理，不给源站造成压力
