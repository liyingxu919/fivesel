const https = require('https');

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'zh-CN,zh;q=0.9',
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

// 天干地支数组
const TIAN_GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
const DI_ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

// 本地计算四柱（备用方案）
function calcSizhuLocal(year, month, day) {
  // 年柱（以立春为界）
  const lichun = new Date(year, 1, 4); // 立春约在2月4日
  const targetDate = new Date(year, month - 1, day);
  let yearForCalc = year;
  if (targetDate < lichun) yearForCalc = year - 1;

  const yearGan = ((yearForCalc - 4) % 10 + 10) % 10;
  const yearZhi = ((yearForCalc - 4) % 12 + 12) % 12;

  // 月柱（简化计算，以节气为界）
  const jieQiDays = [4, 19, 5, 20, 5, 21, 7, 22, 7, 22, 7, 21]; // 每月节气日
  let monthIdx = month - 1; // 0-indexed
  if (month === 2 && day < jieQiDays[0]) monthIdx = 0; // 立春前属正月
  else if (month === 3 && day < jieQiDays[1]) monthIdx = 1;
  else if (month === 4 && day < jieQiDays[2]) monthIdx = 2;
  else if (month === 5 && day < jieQiDays[3]) monthIdx = 3;
  else if (month === 6 && day < jieQiDays[4]) monthIdx = 4;
  else if (month === 7 && day < jieQiDays[5]) monthIdx = 5;
  else if (month === 8 && day < jieQiDays[6]) monthIdx = 6;
  else if (month === 9 && day < jieQiDays[7]) monthIdx = 7;
  else if (month === 10 && day < jieQiDays[8]) monthIdx = 8;
  else if (month === 11 && day < jieQiDays[9]) monthIdx = 9;
  else if (month === 12 && day < jieQiDays[10]) monthIdx = 10;

  const monthGan = ((yearGan % 5) * 2 + monthIdx + 2) % 10;
  const monthZhi = (monthIdx + 2) % 12; // 寅月起

  // 日柱（以2000年1月7日甲子日为基准）
  const baseDate = new Date(2000, 0, 7);
  const diffDays = Math.floor((targetDate - baseDate) / 86400000);
  const dayGan = ((diffDays % 10) + 10) % 10;
  const dayZhi = ((diffDays % 12) + 12) % 12;

  return {
    yearGZ: TIAN_GAN[yearGan] + DI_ZHI[yearZhi],
    monthGZ: TIAN_GAN[monthGan] + DI_ZHI[monthZhi],
    dayGZ: TIAN_GAN[dayGan] + DI_ZHI[dayZhi]
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

  const year = parseInt(req.query.year) || new Date().getFullYear();
  const month = parseInt(req.query.month) || (new Date().getMonth() + 1);
  const day = parseInt(req.query.day) || new Date().getDate();

  // 直接使用本地计算（网站不支持历史日期）
  const local = calcSizhuLocal(year, month, day);

  res.status(200).json({
    date: `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`,
    ...local,
    full: `${local.yearGZ}年 ${local.monthGZ}月 ${local.dayGZ}日`,
    source: 'local-calc'
  });
};
