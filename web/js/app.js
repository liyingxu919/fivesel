const API = '';

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

function renderRecommendations(recs) {
  const container = document.getElementById('recommendations');
  if (!recs.length) {
    container.innerHTML = '<div class="empty-state">暂无推荐方案</div>';
    return;
  }

  let html = '';
  for (const rec of recs) {
    const matches = rec.matches_json || [];
    const totalOdds = rec.total_odds || 0;
    const typeName = rec.rec_type === 'main' ? '主力串3' :
                     rec.rec_type === 'backup' ? '辅助串4' : '比分单挑';

    html += `
      <div class="combo-card">
        <div class="combo-header">
          <span class="combo-type">${typeName}</span>
          <span class="combo-odds">${totalOdds.toFixed(2)}x</span>
        </div>
        <div class="combo-meta">
          <span>投入: ${rec.stake}元</span>
          <span>预期回报: ${(rec.stake * totalOdds).toFixed(0)}元</span>
          <span>期望值: ${(rec.expected_value || 0).toFixed(2)}</span>
        </div>`;

    for (const m of matches) {
      const label = m.outcome === 'home' ? '主胜' :
                    m.outcome === 'draw' ? '平' :
                    m.outcome === 'away' ? '客胜' : m.outcome;
      html += `
        <div class="combo-leg">
          <span class="leg-match">${m.home_team || ''} vs ${m.away_team || ''}</span>
          <span class="leg-pick ${pickClass(m.outcome)}">${label}</span>
          <span class="leg-odds">${m.odds || '?'}</span>
          <span class="leg-value">价值 ${m.value_score || '?'}</span>
        </div>`;
    }

    html += '</div>';
  }

  container.innerHTML = html;
}

function renderMatches(matches) {
  const container = document.getElementById('matches');
  if (!matches.length) {
    container.innerHTML = '<div class="empty-state">暂无比赛数据</div>';
    return;
  }

  let html = '';
  for (const m of matches) {
    const confidence = m.confidence != null ? Math.round(m.confidence * 100) + '%' : null;
    html += `
      <div class="match-card">
        <span class="match-league">${m.league_name || ''}</span>
        <div class="match-teams">
          <span class="team">${m.home_team}</span>
          <span class="vs">VS</span>
          <span class="team">${m.away_team}</span>
        </div>
        <div class="match-odds">
          <div class="odd-btn"><div class="label">主胜</div><div class="sp odd-sp-win">${m.sp_home || '—'}</div></div>
          <div class="odd-btn"><div class="label">平</div><div class="sp odd-sp-draw">${m.sp_draw || '—'}</div></div>
          <div class="odd-btn"><div class="label">客胜</div><div class="sp odd-sp-lose">${m.sp_away || '—'}</div></div>
        </div>
        ${confidence ? '<div style="text-align:center;margin-top:8px;font-size:11px;color:var(--dim)">置信度: ' + confidence + '</div>' : ''}
      </div>`;
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
    container.innerHTML = '<div class="empty-state">无法加载统计数据: ' + e.message + '</div>';
  }
}

async function refreshData() {
  const date = document.getElementById('dateSelect').value;
  const status = document.getElementById('status');
  status.textContent = '加载中...';

  try {
    const [recsData, matchesData] = await Promise.all([
      fetchJSON(`/api/recommendations?date=${date}`),
      fetchJSON(`/api/matches?date=${date}`),
    ]);

    renderRecommendations(recsData.recommendations || []);
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
