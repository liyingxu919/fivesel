const API = '';

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function fetchJSON(url) {
  const resp = await fetch(API + url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (data.success === false) throw new Error(data.error || '请求失败');
  return data;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function initDateSelect() {
  const sel = document.getElementById('dateSelect');
  const today = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const opt = document.createElement('option');
    opt.value = formatDate(d);
    opt.textContent = i === 0 ? `今天 (${formatDate(d)})` : formatDate(d);
    sel.appendChild(opt);
  }
  sel.addEventListener('change', refreshData);
}

function pickClass(outcome) {
  if (outcome === 'home' || outcome === '主胜') return 'home';
  if (outcome === 'draw' || outcome === '平') return 'draw';
  return 'away';
}

function renderRecommendations(recs, analyses) {
  const container = document.getElementById('recommendations');

  let html = '';

  // 显示每场比赛的详细分析
  if (analyses && analyses.length > 0) {
    html += '<div class="section-title">单场分析</div>';
    for (const a of analyses) {
      const probClass = a.probs.home > a.probs.away ? 'prob-home' : a.probs.away > a.probs.home ? 'prob-away' : 'prob-draw';
      html += `
        <div class="analysis-card">
          <div class="analysis-header">
            <span class="analysis-league">${escapeHtml(a.league || '')}</span>
            <span class="analysis-teams">${escapeHtml(a.home_team)} vs ${escapeHtml(a.away_team)}</span>
            ${a.handicap ? `<span class="analysis-handicap">让球(${a.handicap > 0 ? '+' : ''}${a.handicap})</span>` : ''}
          </div>
          <div class="analysis-body">
            <div class="analysis-xg">
              <span>预期进球: ${a.homeXG} - ${a.awayXG}</span>
            </div>
            <div class="analysis-probs">
              <span class="${probClass}">主胜 ${Math.round(a.probs.home * 100)}%</span>
              <span>平 ${Math.round(a.probs.draw * 100)}%</span>
              <span class="${a.probs.away > a.probs.home ? 'prob-away' : ''}">客胜 ${Math.round(a.probs.away * 100)}%</span>
            </div>
            <div class="analysis-score">
              <span>最可能比分: ${a.best_score.score} (${Math.round(a.best_score.prob * 100)}%)</span>
              <span>备选: ${a.alt_score.score} (${Math.round(a.alt_score.prob * 100)}%)</span>
            </div>
            ${a.spfValues.length > 0 ? `
              <div class="analysis-value">
                <span class="value-tag">有价值选项:</span>
                ${a.spfValues.map(v => `<span class="value-item">${v.outcome === 'home' ? '主胜' : v.outcome === 'draw' ? '平' : '客胜'} @${v.odds} (概率优势${Math.round((v.value_score - 1) * 100)}%)</span>`).join(' ')}
              </div>
            ` : ''}
          </div>
        </div>`;
    }
  }

  // 显示推荐方案
  if (recs.length > 0) {
    html += '<div class="section-title">推荐方案</div>';
    for (const rec of recs) {
      const matches = rec.matches_json || [];
      const totalOdds = rec.total_odds || 0;
      const typeName = rec.type || (rec.rec_type === 'main' ? '主力' :
                       rec.rec_type === 'backup' ? '备选' : '比分');

      html += `
        <div class="combo-card">
          <div class="combo-header">
            <span class="combo-type">${escapeHtml(typeName)}</span>
            <span class="combo-odds">${totalOdds.toFixed(2)}x</span>
          </div>
          <div class="combo-meta">
            <span>投入: ${rec.stake}元</span>
            <span>预期回报: ${(rec.stake * totalOdds).toFixed(0)}元</span>
            ${rec.expected_value ? `<span>期望值: ${rec.expected_value.toFixed(2)}</span>` : ''}
          </div>`;

      for (const m of matches) {
        const outcomeLabel = m.outcome === 'home' ? '主胜' :
                      m.outcome === 'draw' ? '平' :
                      m.outcome === 'away' ? '客胜' : m.outcome;
        const isHandicap = m.play_type === 'handicap';
        const isScore = m.play_type === 'score';
        const hStr = m.handicap > 0 ? `+${m.handicap}` : (m.handicap || '');
        let label = outcomeLabel;
        if (isHandicap) label = `让(${hStr})${outcomeLabel}`;
        if (isScore) label = `比分 ${m.outcome}`;

        html += `
          <div class="combo-leg">
            <span class="leg-match">${escapeHtml(m.home_team || '')} vs ${escapeHtml(m.away_team || '')}</span>
            <span class="leg-pick ${pickClass(m.outcome)}">${escapeHtml(label)}</span>
            <span class="leg-odds">@${escapeHtml(String(m.odds || '?'))}</span>
            ${m.value_score ? `<span class="leg-value">+${Math.round((m.value_score - 1) * 100)}%</span>` : ''}
          </div>`;
      }

      html += '</div>';
    }
  }

  if (!html) {
    html = '<div class="empty-state">暂无推荐方案</div>';
  }

  container.innerHTML = html;
}

function renderExtraOdds(m) {
  const parts = [];

  // 总进球
  const goals = m.goals_odds_json ? JSON.parse(m.goals_odds_json) : null;
  if (goals && Object.keys(goals).length > 0) {
    const items = Object.entries(goals).map(([k, v]) => {
      const label = k === '7' ? '7+' : k;
      return `<div class="extra-odd-item"><span class="extra-odd-val">${label}球</span><span class="extra-odd-sp">${v}</span></div>`;
    }).join('');
    parts.push(`<div class="extra-odds-section"><span class="extra-odds-title">总进球</span><div class="extra-odds-row">${items}</div></div>`);
  }

  // 半全场
  const half = m.half_odds_json ? JSON.parse(m.half_odds_json) : null;
  if (half && Object.keys(half).length > 0) {
    const labelMap = { '3-3': '主/主', '3-1': '主/平', '3-0': '主/客', '1-3': '平/主', '1-1': '平/平', '1-0': '平/客', '0-3': '客/主', '0-1': '客/平', '0-0': '客/客' };
    const items = Object.entries(half).map(([k, v]) => {
      return `<div class="extra-odd-item"><span class="extra-odd-val">${labelMap[k] || k}</span><span class="extra-odd-sp">${v}</span></div>`;
    }).join('');
    parts.push(`<div class="extra-odds-section"><span class="extra-odds-title">半全场</span><div class="extra-odds-row">${items}</div></div>`);
  }

  // 比分（折叠显示）
  const scores = m.score_odds_json ? JSON.parse(m.score_odds_json) : null;
  if (scores && Object.keys(scores).length > 0) {
    const popular = ['1:0','2:1','2:0','0:0','1:1','0:1','1:2','0:2'];
    const mainScores = popular.filter(k => scores[k] != null);
    const otherScores = Object.entries(scores).filter(([k]) => !popular.includes(k));
    const mainItems = mainScores.map(k =>
      `<div class="extra-odd-item"><span class="extra-odd-val">${k}</span><span class="extra-odd-sp">${scores[k]}</span></div>`
    ).join('');
    const otherItems = otherScores.map(([k, v]) =>
      `<div class="extra-odd-item"><span class="extra-odd-val">${k}</span><span class="extra-odd-sp">${v}</span></div>`
    ).join('');
    const scoreId = 'score-' + (m.match_id || '').replace(/\s/g, '');
    parts.push(`<div class="extra-odds-section"><span class="extra-odds-title">比分</span><div class="extra-odds-row">${mainItems}</div>${otherScores.length ? `<div class="extra-odds-toggle" onclick="event.stopPropagation();var n=this.nextElementSibling;n.style.display=n.style.display==='none'?'flex':'none';this.textContent=n.style.display==='none'?'展开更多':'收起'">展开更多</div><div class="extra-odds-row extra-odds-more" style="display:none">${otherItems}</div>` : ''}</div>`);
  }

  return parts.length ? `<div class="extra-odds-container">${parts.join('')}</div>` : '';
}

function renderFormBadges(form) {
  if (!form || !Array.isArray(form)) return '';
  return form.map(r => {
    const cls = r === 'W' ? 'form-w' : r === 'L' ? 'form-l' : 'form-d';
    const label = r === 'W' ? '胜' : r === 'L' ? '负' : '平';
    return `<span class="form-badge ${cls}">${label}</span>`;
  }).join('');
}

function renderTeamProfile(profile, side) {
  if (!profile) return '<div class="team-info-empty">暂无资料</div>';
  const label = side === 'home' ? '主队' : '客队';
  return `
    <div class="team-profile">
      <div class="profile-header">
        <span class="profile-name">${escapeHtml(profile.name_en || '')}</span>
        <span class="profile-label">${label}</span>
      </div>
      <div class="profile-row"><span class="profile-key">国家/联赛</span><span>${escapeHtml(profile.country || '')} ${escapeHtml(profile.league || '')}</span></div>
      <div class="profile-row"><span class="profile-key">成立</span><span>${escapeHtml(profile.founded || '')}</span></div>
      <div class="profile-row"><span class="profile-key">球场</span><span>${escapeHtml(profile.stadium || '')}</span></div>
      <div class="profile-row"><span class="profile-key">教练</span><span>${escapeHtml(profile.coach || '')}</span></div>
      <div class="profile-row"><span class="profile-key">风格</span><span>${escapeHtml(profile.style || '')}</span></div>
      <div class="profile-row"><span class="profile-key">优势</span><span class="text-green">${escapeHtml(profile.strength || '')}</span></div>
      <div class="profile-row"><span class="profile-key">劣势</span><span class="text-red">${escapeHtml(profile.weakness || '')}</span></div>
      <div class="profile-row"><span class="profile-key">近期状态</span><span class="form-badges">${renderFormBadges(profile.recent_form)}</span></div>
      <div class="profile-row"><span class="profile-key">状态描述</span><span>${escapeHtml(profile.form_desc || '')}</span></div>
    </div>`;
}

function renderTeamForm(form, teamName) {
  if (!form) return '';
  const summary = form.summary ? `<div class="form-summary">${escapeHtml(form.summary)}</div>` : '';
  const matches = (form.matches || []).slice(0, 8);
  if (!matches.length && !summary) return '';

  let rows = '';
  for (const m of matches) {
    const resultCls = m.result === '胜' ? 'form-w' : m.result === '负' ? 'form-l' : 'form-d';
    rows += `<div class="form-match-row">
      <span class="form-match-league">${escapeHtml(m.league)}</span>
      <span class="form-match-date">${escapeHtml(m.date)}</span>
      <span class="form-match-teams">${escapeHtml(m.homeTeam)} vs ${escapeHtml(m.awayTeam)}</span>
      <span class="form-match-score">${escapeHtml(m.score)}</span>
      <span class="form-badge ${resultCls}">${escapeHtml(m.result)}</span>
    </div>`;
  }

  return `<div class="team-form-section">
    <div class="form-section-title">${escapeHtml(teamName)} 近期战绩</div>
    ${summary}
    ${rows}
  </div>`;
}

function renderOddsAnalysis(m) {
  const spHome = parseFloat(m.sp_home) || 0;
  const spDraw = parseFloat(m.sp_draw) || 0;
  const spAway = parseFloat(m.sp_away) || 0;
  if (!spHome || !spDraw || !spAway) return '';

  const margin = 1/spHome + 1/spDraw + 1/spAway;
  const homeProb = (1/spHome/margin * 100).toFixed(1);
  const drawProb = (1/spDraw/margin * 100).toFixed(1);
  const awayProb = (1/spAway/margin * 100).toFixed(1);

  const avgGoals = 2.6;
  const homeXG = Math.max(0.5, Math.min(3.5, (1/spHome/margin) * avgGoals * 1.1));
  const awayXG = Math.max(0.3, Math.min(3.0, (1/spAway/margin) * avgGoals * 0.9));
  const totalXG = homeXG + awayXG;

  const poisson = (k, lambda) => Math.exp(-lambda) * Math.pow(lambda, k) / [1,1,2,6,24,120][k];
  const scoreProbs = [];
  for (let h = 0; h <= 4; h++) {
    for (let a = 0; a <= 4; a++) {
      const prob = poisson(h, homeXG) * poisson(a, awayXG);
      scoreProbs.push({ score: `${h}:${a}`, prob });
    }
  }
  scoreProbs.sort((a, b) => b.prob - a.prob);
  const topScores = scoreProbs.slice(0, 6);

  const goalsProbs = [];
  for (let g = 0; g <= 6; g++) {
    let prob = 0;
    for (let h = 0; h <= g; h++) prob += poisson(h, homeXG) * poisson(g - h, awayXG);
    goalsProbs.push({ goals: g, prob });
  }
  let p7 = 0;
  for (let h = 0; h <= 8; h++) for (let a = 0; a <= 8; a++) { if (h+a >= 7) p7 += poisson(h, homeXG) * poisson(a, awayXG); }
  goalsProbs.push({ goals: '7+', prob: p7 });

  let prediction, predClass;
  const hp = 1/spHome/margin, ap = 1/spAway/margin;
  if (hp > 0.55) { prediction = '主队优势明显'; predClass = 'text-green'; }
  else if (hp > 0.45) { prediction = '主队略占优'; predClass = 'text-green'; }
  else if (ap > 0.55) { prediction = '客队优势明显'; predClass = 'text-red'; }
  else if (ap > 0.45) { prediction = '客队略占优'; predClass = 'text-red'; }
  else { prediction = '势均力敌'; predClass = ''; }

  let totalPred = totalXG > 3.0 ? '大球概率高' : totalXG > 2.3 ? '进球适中' : '小球概率高';

  return `<div class="odds-analysis">
    <div class="analysis-title">赔率分析</div>
    <div class="analysis-grid">
      <div class="analysis-item">
        <div class="analysis-label">隐含概率</div>
        <div class="prob-bar">
          <span class="prob-home" style="width:${homeProb}%">${homeProb}%</span>
          <span class="prob-draw" style="width:${drawProb}%">${drawProb}%</span>
          <span class="prob-away" style="width:${awayProb}%">${awayProb}%</span>
        </div>
      </div>
      <div class="analysis-item">
        <div class="analysis-label">期望进球</div>
        <div class="xg-display">
          <span class="xg-home">${homeXG.toFixed(1)}</span>
          <span class="xg-sep">-</span>
          <span class="xg-away">${awayXG.toFixed(1)}</span>
          <span class="xg-total">(共${totalXG.toFixed(1)})</span>
        </div>
      </div>
      <div class="analysis-item">
        <div class="analysis-label">预测</div>
        <div class="${predClass}">${prediction} · ${totalPred}</div>
      </div>
    </div>
    <div class="analysis-sub">
      <div class="sub-section">
        <div class="sub-title">比分概率TOP6</div>
        <div class="score-probs">${topScores.map(s => `<span class="score-prob"><em>${s.score}</em>${(s.prob*100).toFixed(1)}%</span>`).join('')}</div>
      </div>
      <div class="sub-section">
        <div class="sub-title">进球数概率</div>
        <div class="goals-probs">${goalsProbs.filter(g => g.prob > 0.01).map(g => `<span class="goal-prob"><em>${g.goals}</em>${(g.prob*100).toFixed(1)}%</span>`).join('')}</div>
      </div>
    </div>
  </div>`;
}

function renderServerOddsAnalysis(oa, m) {
  if (!oa) return '';
  const imp = oa.impliedProb || {};
  const xg = oa.expectedGoals || {};
  const sp = oa.scoreProbs || {};
  const gp = oa.goalsProbs || {};

  const topScores = Object.entries(sp).sort((a,b) => parseFloat(b[1]) - parseFloat(a[1])).slice(0, 6);
  const goalsArr = Object.entries(gp).filter(([k,v]) => parseFloat(v) > 1).sort((a,b) => parseInt(a[0]) - parseInt(b[0]));

  return `<div class="odds-analysis">
    <div class="analysis-title">赔率分析</div>
    <div class="analysis-grid">
      <div class="analysis-item">
        <div class="analysis-label">隐含概率</div>
        <div class="prob-bar">
          <span class="prob-home" style="width:${imp.home||0}%">${imp.home||0}%</span>
          <span class="prob-draw" style="width:${imp.draw||0}%">${imp.draw||0}%</span>
          <span class="prob-away" style="width:${imp.away||0}%">${imp.away||0}%</span>
        </div>
      </div>
      <div class="analysis-item">
        <div class="analysis-label">期望进球</div>
        <div class="xg-display">
          <span class="xg-home">${xg.home||'?'}</span>
          <span class="xg-sep">-</span>
          <span class="xg-away">${xg.away||'?'}</span>
          <span class="xg-total">(共${xg.total||'?'})</span>
        </div>
      </div>
      <div class="analysis-item">
        <div class="analysis-label">预测</div>
        <div class="${oa.prediction === '势均力敌' ? '' : oa.prediction?.includes('主') ? 'text-green' : 'text-red'}">${escapeHtml(oa.prediction||'')} · ${escapeHtml(oa.totalGoals||'')}</div>
      </div>
    </div>
    <div class="analysis-sub">
      <div class="sub-section">
        <div class="sub-title">比分概率TOP6</div>
        <div class="score-probs">${topScores.map(([s,p]) => `<span class="score-prob"><em>${s}</em>${p}%</span>`).join('')}</div>
      </div>
      <div class="sub-section">
        <div class="sub-title">进球数概率</div>
        <div class="goals-probs">${goalsArr.map(([g,p]) => `<span class="goal-prob"><em>${g}</em>${p}%</span>`).join('')}</div>
      </div>
    </div>
  </div>`;
}

function renderH2H(h2h) {
  if (!h2h) return '';
  // FlashScore H2H data is raw, try to extract useful info
  if (typeof h2h === 'string') {
    return `<div class="team-form-section"><div class="form-section-title">历史交锋</div><div class="form-summary">暂无详细交锋数据</div></div>`;
  }
  return '';
}

async function loadMatchDetails(matchId, matchData) {
  const el = document.getElementById('details-' + matchId);
  if (!el) return;

  if (el.style.display !== 'none') {
    el.style.display = 'none';
    return;
  }

  el.style.display = 'block';
  el.innerHTML = '<div class="loading">加载中...</div>';

  try {
    const data = await fetchJSON(`/api/match-details/${matchId}`);

    const hasProfile = data.home_profile || data.away_profile;

    // 赔率分析 - 优先使用服务端计算的，否则用客户端计算
    const oddsHtml = data.odds_analysis ? renderServerOddsAnalysis(data.odds_analysis, matchData) : renderOddsAnalysis(matchData);

    // 球队资料（来自team_profiles.json）
    const profileHtml = hasProfile ? `<div class="details-grid">
      ${renderTeamProfile(data.home_profile, 'home')}
      <div class="vs-divider">VS</div>
      ${renderTeamProfile(data.away_profile, 'away')}
    </div>` : '';

    // 近期战绩（来自500.com）
    const homeForm = renderTeamForm(data.home_form, matchData?.home_team || '主队');
    const awayForm = renderTeamForm(data.away_form, matchData?.away_team || '客队');

    // H2H
    const h2hHtml = data.h2h ? renderH2H(data.h2h) : '';

    el.innerHTML = `<div class="match-details">
      ${profileHtml}
      ${oddsHtml}
      ${homeForm}
      ${awayForm}
      ${h2hHtml}
    </div>`;
  } catch (e) {
    el.innerHTML = '<div class="team-info-empty">加载失败: ' + escapeHtml(e.message) + '</div>';
  }
}

const matchDataStore = {};

function renderMatches(matches) {
  const container = document.getElementById('matches');
  if (!matches.length) {
    container.innerHTML = '<div class="empty-state">暂无比赛数据</div>';
    return;
  }

  let html = '';
  for (const m of matches) {
    matchDataStore[m.match_id] = m;
    const confidence = m.confidence != null ? Math.round(m.confidence * 100) + '%' : null;
    html += `
      <div class="match-card" onclick="loadMatchDetails('${escapeHtml(m.match_id)}', matchDataStore['${escapeHtml(m.match_id)}'])">
        <div class="match-header">
          <span class="match-id">${escapeHtml(m.match_id || '')}</span>
          <span class="match-league">${escapeHtml(m.league_name || '')}</span>
        </div>
        <div class="match-teams">
          <span class="team">${escapeHtml(m.home_team)}</span>
          <span class="vs">VS</span>
          <span class="team">${escapeHtml(m.away_team)}</span>
        </div>
        <div class="match-odds">
          <div class="odd-btn"><div class="label">主胜</div><div class="sp odd-sp-win">${escapeHtml(m.sp_home || '—')}</div></div>
          <div class="odd-btn"><div class="label">平</div><div class="sp odd-sp-draw">${escapeHtml(m.sp_draw || '—')}</div></div>
          <div class="odd-btn"><div class="label">客胜</div><div class="sp odd-sp-lose">${escapeHtml(m.sp_away || '—')}</div></div>
        </div>
        ${m.sp_handicap_home ? `
        <div class="match-handicap">
          <span class="handicap-label">让球(${m.handicap > 0 ? '+' : ''}${m.handicap || 0})</span>
          <div class="handicap-odds">
            <span class="hsp hsp-home">${escapeHtml(m.sp_handicap_home || '—')}</span>
            <span class="hsp hsp-draw">${escapeHtml(m.sp_handicap_draw || '—')}</span>
            <span class="hsp hsp-away">${escapeHtml(m.sp_handicap_away || '—')}</span>
          </div>
        </div>` : ''}
        ${renderExtraOdds(m)}
        ${confidence ? '<div style="text-align:center;margin-top:8px;font-size:11px;color:var(--dim)">置信度: ' + escapeHtml(confidence) + '</div>' : ''}
        <div class="click-hint">点击查看详情</div>
      </div>
      <div id="details-${escapeHtml(m.match_id)}" class="match-details-container" style="display:none"></div>`;
  }

  container.innerHTML = html;
}

async function renderTracking() {
  const container = document.getElementById('tracking');

  try {
    const data = await fetchJSON('/api/recommendations/stats');
    const s = data.stats || {};
    const winRate = s.win_rate || 0;
    const roi = s.roi || 0;
    const roiColor = roi >= 0 ? 'var(--green)' : 'var(--red)';

    container.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${s.total || 0}</div>
          <div class="stat-label">总方案数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--green)">${s.wins || 0}</div>
          <div class="stat-label">命中</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:var(--red)">${s.losses || 0}</div>
          <div class="stat-label">未中</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${winRate}%</div>
          <div class="stat-label">命中率</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${s.total_stake || 0}</div>
          <div class="stat-label">总投入(元)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${s.total_payout || 0}</div>
          <div class="stat-label">总回报(元)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${roiColor}">${roi}%</div>
          <div class="stat-label">收益率(ROI)</div>
        </div>
      </div>`;
  } catch (e) {
    container.innerHTML = '<div class="empty-state">无法加载统计数据: ' + escapeHtml(e.message) + '</div>';
  }
}

async function refreshData() {
  const sel = document.getElementById('dateSelect');
  const date = sel.value;
  const status = document.getElementById('status');
  status.textContent = '加载中...';

  try {
    const [recsData, matchesData] = await Promise.all([
      fetchJSON(`/api/recommendations?date=${date}`),
      fetchJSON(`/api/matches?date=${date}`),
    ]);

    // 如果当天没有比赛，自动跳转到最近有数据的日期
    if ((matchesData.count || 0) === 0) {
      for (let i = 0; i < sel.options.length; i++) {
        const altDate = sel.options[i].value;
        if (altDate === date) continue;
        const altData = await fetchJSON(`/api/matches?date=${altDate}`);
        if ((altData.count || 0) > 0) {
          sel.value = altDate;
          const [altRecs, altMatches] = await Promise.all([
            fetchJSON(`/api/recommendations?date=${altDate}`),
            Promise.resolve(altData),
          ]);
          renderRecommendations(altRecs.recommendations || []);
          renderMatches(altMatches.matches || []);
          status.textContent =
            `${altMatches.count || 0} 场比赛 (${altDate}) | ${altRecs.recommendations?.length || 0} 组方案`;
          return;
        }
      }
    }

    renderRecommendations(recsData.recommendations || [], recsData.analyses || []);
    renderMatches(matchesData.matches || []);
    status.textContent =
      `${matchesData.count || 0} 场比赛 | ${recsData.recommendations?.length || 0} 组方案`;
  } catch (e) {
    status.textContent = '加载失败: ' + e.message;
  }
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab).classList.add('active');
  });
});

// Init
initDateSelect();
refreshData();
renderTracking();
