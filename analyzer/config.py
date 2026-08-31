import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'jingcai.db')

# 泊松模型参数
POISSON_MAX_GOALS = 7  # 最大进球数（0-7+）
HOME_ADVANTAGE = 0.25  # 主场进攻加成系数

# Elo 参数
ELO_INITIAL = 1500
ELO_K = 32
ELO_HOME_ADVANTAGE = 100

# 价值评估
VALUE_THRESHOLD = 1.15    # 正期望阈值（提高门槛）
VALUE_HIGH = 1.5          # 高价值阈值
VALUE_VERY_HIGH = 2.0     # 极高价值阈值
MAX_ODDS_RECOMMEND = 5.0  # 最高推荐赔率（超过5倍的冷门不推荐）
MIN_PROB_RECOMMEND = 0.20 # 最低模型概率（低于20%的结果不推荐）

# 串关配置
DAILY_BUDGET = 20         # 每日投入上限（元）
COMBO3_COUNT = 2          # 串3组数
COMBO4_COUNT = 1          # 串4组数
SCORE_COMBO_COUNT = 1     # 比分串组数
STAKE_PER_COMBO = 2       # 每组投入（元）
