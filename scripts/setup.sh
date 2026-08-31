#!/bin/bash
set -e
echo "=== 竞彩智能分析系统 - 环境初始化 ==="

cd "$(dirname "$0")/.."

# Node.js 依赖
echo "[1/4] 安装 Node.js 依赖..."
cd collectors && npm install && cd ..
cd server && npm install && cd ..

# Python 环境
echo "[2/4] 配置 Python 环境..."
cd analyzer
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..

# 初始化数据库
echo "[3/4] 初始化数据库..."
cd collectors && node -e "require('./utils/db').initDatabase()" && cd ..

echo "[4/4] 初始化完成!"
echo ""
echo "使用方式:"
echo "  1. 采集数据: cd collectors && node index.js --now"
echo "  2. 运行分析: cd analyzer && source venv/bin/activate && python main.py"
echo "  3. 启动 Web: cd server && node app.js"
echo "  4. 一键运行: ./scripts/daily.sh"
