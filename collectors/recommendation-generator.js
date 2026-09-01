/**
 * 推荐方案生成器 v2 - 更精确的分析
 *
 * 改进：
 * 1. 每场比赛只推荐一个比分
 * 2. 单场推荐 + 合理串关
 * 3. 基于泊松模型 + 赔率隐含概率综合分析
 * 4. 价值评估基于概率优势，而非高赔率
 */

const factorial = (n) => {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
};

const poisson = (k, lambda) => Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);

/**
 * 从赔率估算期望进球数（改进版）
 * 综合考虑胜平负赔率和让球赔率
 */
function estimateXG(spHome, spDraw, spAway, handicap) {
  if (!spHome || !spDraw || !spAway) return { homeXG: 1.3, awayXG: 1.1 };

  // 去除抽水后的隐含概率
  const rawHome = 1 / spHome;
  const rawDraw = 1 / spDraw;
  const rawAway = 1 / spAway;
  const total = rawHome + rawDraw + rawAway;

  const homeWinProb = rawHome / total;
  const drawProb = rawDraw / total;
  const awayWinProb = rawAway / total;

  // 根据胜平负概率估算期望进球
  // 使用经验公式：主场优势约0.3球
  const homeXG = Math.max(0.5, Math.min(3.0, homeWinProb * 2.5 + drawProb * 0.8 + 0.3));
  const awayXG = Math.max(0.3, Math.min(2.8, awayWinProb * 2.5 + drawProb * 0.8));

  return { homeXG, awayXG };
}

/**
 * 计算泊松分布概率矩阵
 */
function calculateProbs(homeXG, awayXG) {
  const probs = { home: 0, draw: 0, away: 0 };
  const scoreProbs = {};

  for (let h = 0; h <= 7; h++) {
    for (let a = 0; a <= 7; a++) {
      const prob = poisson(h, homeXG) * poisson(a, awayXG);
      scoreProbs[`${h}:${a}`] = prob;
      if (h > a) probs.home += prob;
      else if (h === a) probs.draw += prob;
      else probs.away += prob;
    }
  }
  return { probs, scoreProbs };
}

/**
 * 估算让球概率
 */
function estimateHandicapProbs(spfProbs, handicap) {
  if (handicap === 0) return spfProbs;

  let { home, draw, away } = spfProbs;

  if (handicap > 0) {
    const factor = Math.pow(0.5, handicap);
    home *= factor;
    draw *= (1 + (1 - factor) * 0.5);
    away = 1 - home - draw;
  } else {
    const factor = Math.pow(0.5, -handicap);
    away *= factor;
    draw *= (1 + (1 - factor) * 0.5);
    home = 1 - away - draw;
  }

  return {
    home: Math.max(0.01, home),
    draw: Math.max(0.01, draw),
    away: Math.max(0.01, away),
  };
}

/**
 * 分析单场比赛，生成推荐
 */
function analyzeMatch(match) {
  const spHome = match.sp_home;
  const spDraw = match.sp_draw;
  const spAway = match.sp_away;

  if (!spHome || !spDraw || !spAway) return null;

  const handicap = match.handicap || 0;
  const { homeXG, awayXG } = estimateXG(spHome, spDraw, spAway, handicap);
  const { probs, scoreProbs } = calculateProbs(homeXG, awayXG);

  // 去除抽水后的隐含概率
  const rawTotal = (1/spHome) + (1/spDraw) + (1/spAway);
  const impliedHome = (1/spHome) / rawTotal;
  const impliedDraw = (1/spDraw) / rawTotal;
  const impliedAway = (1/spAway) / rawTotal;

  // 胜平负价值评估
  const spfValues = [];
  const outcomes = [
    { key: 'home', model: probs.home, implied: impliedHome, odds: spHome },
    { key: 'draw', model: probs.draw, implied: impliedDraw, odds: spDraw },
    { key: 'away', model: probs.away, implied: impliedAway, odds: spAway },
  ];

  for (const o of outcomes) {
    // 价值 = 模型概率 / 隐含概率，>1 表示有价值
    const valueScore = o.model / o.implied;
    // 只推荐价值分数 > 1.1 的（有明显概率优势）
    if (valueScore > 1.1) {
      spfValues.push({
        match_id: match.match_id,
        home_team: match.home_team,
        away_team: match.away_team,
        league: match.league_name,
        outcome: o.key,
        play_type: 'spf',
        odds: o.odds,
        model_prob: Math.round(o.model * 1000) / 1000,
        implied_prob: Math.round(o.implied * 1000) / 1000,
        value_score: Math.round(valueScore * 100) / 100,
        handicap: 0,
      });
    }
  }

  // 让球价值评估
  const handicapValues = [];
  const spHandHome = match.sp_handicap_home;
  const spHandDraw = match.sp_handicap_draw;
  const spHandAway = match.sp_handicap_away;

  if (spHandHome && spHandDraw && spHandAway && handicap !== 0) {
    const handProbs = estimateHandicapProbs(probs, handicap);
    const handTotal = (1/spHandHome) + (1/spHandDraw) + (1/spHandAway);
    const handImpliedHome = (1/spHandHome) / handTotal;
    const handImpliedDraw = (1/spHandDraw) / handTotal;
    const handImpliedAway = (1/spHandAway) / handTotal;

    const handOutcomes = [
      { key: 'home', model: handProbs.home, implied: handImpliedHome, odds: spHandHome },
      { key: 'draw', model: handProbs.draw, implied: handImpliedDraw, odds: spHandDraw },
      { key: 'away', model: handProbs.away, implied: handImpliedAway, odds: spHandAway },
    ];

    for (const o of handOutcomes) {
      const valueScore = o.model / o.implied;
      if (valueScore > 1.15) {
        handicapValues.push({
          match_id: match.match_id,
          home_team: match.home_team,
          away_team: match.away_team,
          league: match.league_name,
          outcome: o.key,
          play_type: 'handicap',
          odds: o.odds,
          model_prob: Math.round(o.model * 1000) / 1000,
          implied_prob: Math.round(o.implied * 1000) / 1000,
          value_score: Math.round(valueScore * 100) / 100,
          handicap,
        });
      }
    }
  }

  // 最可能比分（只选1个）
  const sortedScores = Object.entries(scoreProbs)
    .sort((a, b) => b[1] - a[1]);
  const topScore = sortedScores[0];
  const secondScore = sortedScores[1]; // 备选比分

  return {
    match_id: match.match_id,
    home_team: match.home_team,
    away_team: match.away_team,
    league: match.league_name,
    handicap,
    homeXG: Math.round(homeXG * 100) / 100,
    awayXG: Math.round(awayXG * 100) / 100,
    probs: {
      home: Math.round(probs.home * 1000) / 1000,
      draw: Math.round(probs.draw * 1000) / 1000,
      away: Math.round(probs.away * 1000) / 1000,
    },
    best_score: {
      score: topScore[0],
      prob: Math.round(topScore[1] * 1000) / 1000,
    },
    alt_score: {
      score: secondScore[0],
      prob: Math.round(secondScore[1] * 1000) / 1000,
    },
    spfValues,
    handicapValues,
  };
}

/**
 * 生成推荐方案
 */
function generateRecommendations(db, dateStr) {
  // 获取当日比赛和赔率
  const matches = db.prepare(`
    SELECT m.*, o.sp_home, o.sp_draw, o.sp_away,
           o.sp_handicap_home, o.sp_handicap_draw, o.sp_handicap_away,
           o.score_odds_json
    FROM matches m
    LEFT JOIN (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY match_id ORDER BY snapshot_time DESC) as rn
      FROM odds_snapshots
    ) o ON m.match_id = o.match_id AND o.rn = 1
    WHERE m.match_date = ? AND m.status = 'notstarted'
    ORDER BY m.match_time
  `).all(dateStr);

  if (!matches || matches.length === 0) {
    return { main: [], backup: [], score: [], total_stake: 0, analyses: [] };
  }

  const analyses = [];
  const allValueBets = [];

  for (const match of matches) {
    const analysis = analyzeMatch(match);
    if (analysis) {
      analyses.push(analysis);
      allValueBets.push(...analysis.spfValues, ...analysis.handicapValues);
    }
  }

  // 按价值分数排序
  const sortedBets = [...allValueBets].sort((a, b) => b.value_score - a.value_score);

  const combos = { main: [], backup: [], score: [], total_stake: 0 };

  // 主方案：2关（最有价值的2场）
  if (sortedBets.length >= 2) {
    const bets = sortedBets.slice(0, 2);
    // 确保不是同一场比赛
    if (bets[0].match_id !== bets[1].match_id) {
      const totalOdds = bets.reduce((acc, b) => acc * b.odds, 1);
      combos.main.push({
        type: '2关1',
        bets,
        total_odds: Math.round(totalOdds * 100) / 100,
        stake: 2,
        expected_value: Math.round((totalOdds * bets.reduce((acc, b) => acc * b.model_prob, 1) - 1) * 100) / 100,
      });
      combos.total_stake += 2;
    }
  }

  // 主方案备选：3关
  if (sortedBets.length >= 3) {
    const bets = sortedBets.slice(0, 3);
    const matchIds = new Set(bets.map(b => b.match_id));
    if (matchIds.size === 3) { // 确保是不同比赛
      const totalOdds = bets.reduce((acc, b) => acc * b.odds, 1);
      combos.main.push({
        type: '3关1',
        bets,
        total_odds: Math.round(totalOdds * 100) / 100,
        stake: 2,
        expected_value: Math.round((totalOdds * bets.reduce((acc, b) => acc * b.model_prob, 1) - 1) * 100) / 100,
      });
      combos.total_stake += 2;
    }
  }

  // 备选方案：选不同比赛的价值投注
  if (sortedBets.length >= 4) {
    const usedIds = new Set(combos.main.flatMap(c => c.bets.map(b => b.match_id)));
    const remaining = sortedBets.filter(b => !usedIds.has(b.match_id));
    if (remaining.length >= 2) {
      const bets = remaining.slice(0, 2);
      if (bets[0].match_id !== bets[1].match_id) {
        const totalOdds = bets.reduce((acc, b) => acc * b.odds, 1);
        combos.backup.push({
          type: '2关1',
          bets,
          total_odds: Math.round(totalOdds * 100) / 100,
          stake: 2,
          expected_value: Math.round((totalOdds * bets.reduce((acc, b) => acc * b.model_prob, 1) - 1) * 100) / 100,
        });
        combos.total_stake += 2;
      }
    }
  }

  // 比分推荐：每场比赛只推荐1个比分
  for (const analysis of analyses) {
    if (analysis.best_score.prob > 0.08) { // 概率>8%的比分才推荐
      combos.score.push({
        type: '单场比分',
        bets: [{
          match_id: analysis.match_id,
          home_team: analysis.home_team,
          away_team: analysis.away_team,
          league: analysis.league,
          outcome: analysis.best_score.score,
          model_prob: analysis.best_score.prob,
          odds: 7, // 默认比分赔率
          play_type: 'score',
        }],
        total_odds: 7,
        stake: 2,
        expected_value: 0,
      });
    }
  }

  return { ...combos, analyses };
}

/**
 * 保存推荐方案到数据库
 */
function saveRecommendations(db, dateStr, combos) {
  // 清除当日旧推荐
  db.prepare('DELETE FROM recommendations WHERE rec_date = ?').run(dateStr);

  const insertRec = db.prepare(`
    INSERT INTO recommendations (rec_date, rec_type, matches_json, total_odds, stake, expected_value)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const recType of ['main', 'backup', 'score']) {
    for (const combo of (combos[recType] || [])) {
      insertRec.run(
        dateStr,
        recType,
        JSON.stringify(combo.bets.map(b => ({
          match_id: b.match_id,
          outcome: b.outcome,
          odds: b.odds,
          value_score: b.value_score || 0,
          play_type: b.play_type || 'spf',
          handicap: b.handicap || 0,
          home_team: b.home_team || '',
          away_team: b.away_team || '',
          league: b.league || '',
        }))),
        combo.total_odds,
        combo.stake,
        combo.expected_value || 0
      );
    }
  }
}

module.exports = { generateRecommendations, saveRecommendations, analyzeMatch };
