const { parseScoreHTML, parseGoalsHTML, parseHalfHTML } = require('../jczq-extra');

describe('parseScoreHTML', () => {
  test('parses score odds from HTML', () => {
    // 比分页面结构：matchnum行后跟多个bf数据行
    const html = `
      <tr class="bet-tb-tr" data-matchnum="周一001" data-fixtureid="123">
        <td>周一001</td>
      </tr>
      <tr class="bet-more-wrap">
        <td>展开</td>
      </tr>
      <tr>
        <p class="sbetbtn" data-type="bf" data-value="1:0" data-sp="8.50">1:0<i>8.50</i></p>
        <p class="sbetbtn" data-type="bf" data-value="2:0" data-sp="12.00">2:0<i>12.00</i></p>
        <p class="sbetbtn" data-type="bf" data-value="2:1" data-sp="7.75">2:1<i>7.75</i></p>
        <p class="sbetbtn" data-type="bf" data-value="胜其它" data-sp="70.00">胜其它<i>70.00</i></p>
      </tr>
      <tr>
        <p class="sbetbtn" data-type="bf" data-value="0:0" data-sp="13.00">0:0<i>13.00</i></p>
        <p class="sbetbtn" data-type="bf" data-value="1:1" data-sp="7.00">1:1<i>7.00</i></p>
        <p class="sbetbtn" data-type="bf" data-value="平其它" data-sp="300.00">平其它<i>300.00</i></p>
      </tr>
      <tr>
        <p class="sbetbtn" data-type="bf" data-value="0:1" data-sp="10.00">0:1<i>10.00</i></p>
        <p class="sbetbtn" data-type="bf" data-value="负其它" data-sp="90.00">负其它<i>90.00</i></p>
      </tr>
      <tr class="bet-tb-tr" data-matchnum="周一002" data-fixtureid="124">
        <td>周一002</td>
      </tr>`;

    const result = parseScoreHTML(html);
    expect(result.length).toBe(1);
    expect(result[0].matchId).toBe('周一001');
    expect(result[0].scores['1:0']).toBe(8.50);
    expect(result[0].scores['2:1']).toBe(7.75);
    expect(result[0].scores['胜其它']).toBe(70.00);
    expect(result[0].scores['0:0']).toBe(13.00);
    expect(result[0].scores['平其它']).toBe(300.00);
    expect(result[0].scores['负其它']).toBe(90.00);
  });

  test('returns empty array for no matches', () => {
    expect(parseScoreHTML('')).toEqual([]);
    expect(parseScoreHTML('<html>no data</html>')).toEqual([]);
  });
});

describe('parseGoalsHTML', () => {
  test('parses goals odds from HTML', () => {
    const html = `
      <tr data-matchnum="周一001">
        <td data-value="0" data-sp="13.00">0球 13.00</td>
        <td data-value="1" data-sp="4.85">1球 4.85</td>
        <td data-value="2" data-sp="3.50">2球 3.50</td>
        <td data-value="3" data-sp="3.65">3球 3.65</td>
        <td data-value="4" data-sp="5.50">4球 5.50</td>
        <td data-value="5" data-sp="10.00">5球 10.00</td>
        <td data-value="6" data-sp="21.00">6球 21.00</td>
        <td data-value="7" data-sp="32.00">7+球 32.00</td>
      </tr>`;

    const result = parseGoalsHTML(html);
    expect(result.length).toBe(1);
    expect(result[0].matchId).toBe('周一001');
    expect(result[0].goals['0']).toBe(13.00);
    expect(result[0].goals['1']).toBe(4.85);
    expect(result[0].goals['2']).toBe(3.50);
    expect(result[0].goals['7']).toBe(32.00);
  });
});

describe('parseHalfHTML', () => {
  test('parses half/full time odds from HTML', () => {
    const html = `
      <tr data-matchnum="周一001">
        <td data-value="3-3" data-sp="3.60">主/主</td>
        <td data-value="3-1" data-sp="13.00">主/平</td>
        <td data-value="3-0" data-sp="32.00">主/客</td>
        <td data-value="1-3" data-sp="5.50">平/主</td>
        <td data-value="1-1" data-sp="5.80">平/平</td>
        <td data-value="1-0" data-sp="7.00">平/客</td>
        <td data-value="0-3" data-sp="28.00">客/主</td>
        <td data-value="0-1" data-sp="13.00">客/平</td>
        <td data-value="0-0" data-sp="4.80">客/客</td>
      </tr>`;

    const result = parseHalfHTML(html);
    expect(result.length).toBe(1);
    expect(result[0].matchId).toBe('周一001');
    expect(result[0].halfFull['3-3']).toBe(3.60);
    expect(result[0].halfFull['1-1']).toBe(5.80);
    expect(result[0].halfFull['0-0']).toBe(4.80);
  });
});
