/**
 * 竞彩足球分析系统 - 统一入口
 */
console.log('Starting Jingcai Football Analyzer...');
console.log('Node version:', process.version);
console.log('Environment PORT:', process.env.PORT);

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 最简单的健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 静态文件
app.use(express.static(path.join(__dirname, 'web')));

// 简单的 API 测试
app.get('/api/test', (req, res) => {
  res.json({ success: true, message: 'API is working' });
});

// 启动服务器
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://0.0.0.0:${PORT}/health`);
});

// 保持进程运行
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down...');
  server.close(() => {
    process.exit(0);
  });
});

// 错误处理
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

console.log('Jingcai Football Analyzer started successfully');
