const express = require('express');
const cors = require('cors');
const path = require('path');
const matchesRouter = require('./routes/matches');
const recommendationsRouter = require('./routes/recommendations');
const matchDetailsRouter = require('./routes/match_details');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web')));

app.use('/api/matches', matchesRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/match-details', matchDetailsRouter);

app.listen(PORT, () => {
  console.log(`竞彩分析服务已启动: http://localhost:${PORT}`);
});

module.exports = app;
