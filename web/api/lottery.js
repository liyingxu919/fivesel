const https = require('https');

const SOURCES = {
  dlt: {
    url: 'https://datachart.500.com/dlt/history/newinc/history.php?start=25001&end=26999',
    type: 'html',
  },
  qxc: {
    url: 'https://datachart.500.com/qxc/history/inc/history.php',
    type: 'html',
  },
  ssq: {
    url: 'https://datachart.500.com/ssq/history/newinc/history.php?start=25001&end=26999',
    type: 'html',
  },
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Referer': 'https://datachart.500.com/',
      },
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');

  const type = req.query.type || 'dlt';
  const source = SOURCES[type];
  if (!source) {
    return res.status(400).json({ error: 'unknown type' });
  }

  try {
    const data = await fetchUrl(source.url);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(data);
  } catch (e) {
    res.status(502).json({ error: e.message, fallback: true });
  }
};
