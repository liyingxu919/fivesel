FROM node:20-slim

# 安装编译依赖
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制依赖文件
COPY package.json package-lock.json ./

# 安装依赖
RUN npm ci --production

# 复制项目文件
COPY . .

# 确保data目录存在
RUN mkdir -p data

# 暴露端口
EXPOSE 3000

# 启动
CMD ["node", "start.js"]
