#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "=== 竞彩每日流程 ==="
echo "时间: $(date)"

# 1. 数据采集
echo "[1/3] 数据采集..."
cd collectors
node -e "
const { initDatabase } = require('./utils/db');
const { fetchAndSaveMatches } = require('./jczq-500');
const db = initDatabase();
fetchAndSaveMatches(db).then(m => {
  console.log('采集完成:', m.length, '场');
  db.close();
}).catch(e => { console.error(e); process.exit(1); });
"
cd ..

# 2. 运行分析引擎
echo "[2/3] 运行分析引擎..."
cd analyzer
source venv/bin/activate
python main.py --date today
deactivate
cd ..

# 3. 完成
echo "[3/3] 每日流程完成!"
echo "查看推荐: http://localhost:3000"
