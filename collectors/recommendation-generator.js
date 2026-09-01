/**
 * 推荐方案生成器 - Node.js版本
 * 使用泊松模型计算概率，寻找价值投注，生成串关方案
 */

const factorial = (n) => {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
};

const poisson = (k, lambda) => Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);

/**
 * 从赔率计算隐含概率
 */
function impliedProb(odds) {
  if (!odds || odds <= 1) return 0;
  return 1 / odds;
}

/**
 * 使用泊松模型计算比赛概率
 */
function calculateMatchProbs(homeXG, awayXG) {
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
 * 从赔率估算期望进球数
 */
function estimateXG(spHome, spDraw, spAway) {
  if (!spHome || !spDraw || !spAway) return { homeXG: 1.3, awayXG: 1.1 };

  // 使用隐含概率估算期望进球
  const totalProb = (1/spHome) + (1/spDraw) + (1/spAway);
  const homeWinProb = (1/spHome) / totalProb;
  const drawProb = (1/spDraw) / totalProb;
  const awayWinProb = (1/spAway) / totalProb;

  // 简化的期望进球估算
  // 基于胜平负概率反推期望进球
  const homeXG = Math.max(0.3, Math.min(3.5, homeWinProb * 3 + drawProb * 0.5));
  const awayXG = Math.max(0.3, Math.min(3.5, awayWinProb * 3 + drawProb * 0.5));

  return { homeXG, awayXG };
}

/**
 * 寻找价值投注
 */
function findValueBets(match, modelProbs) {
  const values = [];

  // 胜平负价值
  const spfOdds = {
    home: match.sp_home,
    draw: match.sp_draw,
    away: match.sp_away,
  };

  for (const [outcome, odds] of Object.entries(spfOdds)) {
    if (!odds || odds <= 1) continue;
    const modelProb = modelProbs[outcome];
    const implied = impliedProb(odds);
    const valueScore = modelProb / implied;

    if (valueScore > 1.0) {
      values.push({
        match_id: match.match_id,
        home_team: match.home_team,
        away_team: match.away_team,
        league: match.league_name,
        outcome,
        play_type: 'spf',
        odds,
        model_prob: modelProb,
        implied_prob: implied,
        value_score: valueScore,
        handicap: 0,
      });
    }
  }

  // 让球价值
  const handicapOdds = {
    home: match.sp_handicap_home,
    draw: match.sp_handicap_draw,
    away: match.sp_handicap_away,
  };

  if (handicapOdds.home && handicapOdds.draw && handicapOdds.away) {
    const handicap = match.handicap || 0;
    const handicapProbs = estimateHandicapProbs(modelProbs, handicap);

    for (const [outcome, odds] of Object.entries(handicapOdds)) {
      if (!odds || odds <= 1) continue;
      const modelProb = handicapProbs[outcome];
      const implied = impliedProb(odds);
      const valueScore = modelProb / implied;

      if (valueScore > 1.0) {
        values.push({
          match_id: match.match_id,
          home_team: match.home_team,
          away_team: match.away_team,
          league: match.league_name,
          outcome,
          play_type: 'handicap',
          odds,
          model_prob: modelProb,
          implied_prob: implied,
          value_score: valueScore,
          handicap,
        });
      }
    }
  }

  return values;
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
 * 生成串关方案
 */
function generateCombos(valueBets, topScoreBets) {
  const combos = { main: [], backup: [], score: [], total_stake: 0 };

  // 按价值分数排序
  const sorted = [...valueBets].sort((a, b) => b.value_score - a.value_score);

  // 主方案：2-3关，选价值最高的
  if (sorted.length >= 2) {
    const mainBets = sorted.slice(0, Math.min(3, sorted.length));
    const totalOdds = mainBets.reduce((acc, b) => acc * b.odds, 1);
    combos.main.push({
      type: `${mainBets.length}关1`,
      bets: mainBets,
      total_odds: Math.round(totalOdds * 100) / 100,
      stake: 2,
      expected_value: Math.round((totalOdds * mainBets.reduce((acc, b) => acc * b.model_prob, 1) - 1) * 100) / 100,
    });
    combos.total_stake += 2;
  }

  // 备选方案：选不同比赛的价值投注
  if (sorted.length >= 4) {
    const backupBets = sorted.slice(3, Math.min(5, sorted.length));
    if (backupBets.length >= 2) {
      const totalOdds = backupBets.reduce((acc, b) => acc * b.odds, 1);
      combos.backup.push({
        type: `${backupBets.length}关1`,
        bets: backupBets,
        total_odds: Math.round(totalOdds * 100) / 100,
        stake: 2,
        expected_value: Math.round((totalOdds * backupBets.reduce((acc, b) => acc * b.model_prob, 1) - 1) * 100) / 100,
      });
      combos.total_stake += 2;
    }
  }

  // 比分方案
  if (topScoreBets.length >= 2) {
    const scoreBets = topScoreBets.slice(0, 3);
    const totalOdds = scoreBets.reduce((acc, b) => acc * (b.odds || 7), 1);
    combos.score.push({
      type: '比分串关',
      bets: scoreBets,
      total_odds: Math.round(totalOdds * 100) / 100,
      stake: 2,
      expected_value: 0,
    });
    combos.total_stake += 2;
  }

  return combos;
}

/**
 * 生成推荐方案（主入口）
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
    return { main: [], backup: [], score: [], total_stake: 0 };
  }

  const allValueBets = [];
  const allScoreBets = [];

  for (const match of matches) {
    const { homeXG, awayXG } = estimateXG(match.sp_home, match.sp_draw, match.sp_away);
    const { probs, scoreProbs } = calculateMatchProbs(homeXG, awayXG);

    // 价值投注
    const values = findValueBets(match, probs);
    allValueBets.push(...values);

    // 高概率比分
    const sortedScores = Object.entries(scoreProbs)
      .filter(([, p]) => p > 0.05)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [score, prob] of sortedScores) {
      allScoreBets.push({
        match_id: match.match_id,
        home_team: match.home_team,
        away_team: match.away_team,
        league: match.league_name,
        outcome: score,
        model_prob: prob,
        odds: 7, // 默认比分赔率
        play_type: 'score',
      });
    }
  }

  return generateCombos(allValueBets, allScoreBets);
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

module.exports = { generateRecommendations, saveRecommendations };
