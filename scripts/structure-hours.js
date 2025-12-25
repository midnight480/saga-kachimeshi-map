const fs = require('fs');
const path = require('path');

const shopsPath = path.join(__dirname, '../docs/data/shops.json');
const shops = JSON.parse(fs.readFileSync(shopsPath, 'utf8'));

function parseHours(hoursText) {
  if (!hoursText || !hoursText.trim()) return null;
  
  // 全角数字を半角に変換
  const normalize = (str) => {
    return str
      .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
      .replace(/：/g, ':')
      .replace(/[～〜]/g, '～');
  };
  
  const text = normalize(hoursText);
  
  const result = {
    text: hoursText,
    parsed: {
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
      holiday: null
    },
    closed: null
  };
  
  // 定休日を抽出
  const closedPatterns = [
    /定休日[：:]\s*([^\s■営業]+)/,
    /([月火水木金土日]+)\s*定休日/,
    /定休日\s*([月火水木金土日]+)/
  ];
  
  for (const pattern of closedPatterns) {
    const match = text.match(pattern);
    if (match) {
      result.closed = match[1].trim();
      break;
    }
  }
  
  // 曜日マッピング
  const dayMap = {
    '月': 'mon',
    '火': 'tue', 
    '水': 'wed',
    '木': 'thu',
    '金': 'fri',
    '土': 'sat',
    '日': 'sun',
    '祝': 'holiday',
    '祝日': 'holiday',
    '祝前日': 'holiday',
    '祝後日': 'holiday'
  };
  
  const dayOrder = ['月', '火', '水', '木', '金', '土', '日'];
  
  // 曜日文字列から曜日セットを抽出
  function parseDays(dayStr) {
    const days = new Set();
    
    // 範囲: 月～金
    const ranges = dayStr.matchAll(/([月火水木金土])～([月火水木金土日])/g);
    for (const match of ranges) {
      const start = dayOrder.indexOf(match[1]);
      const end = dayOrder.indexOf(match[2]);
      if (start !== -1 && end !== -1) {
        for (let i = start; i <= end; i++) {
          if (dayMap[dayOrder[i]]) days.add(dayMap[dayOrder[i]]);
        }
      }
    }
    
    // 個別の曜日
    for (const [key, value] of Object.entries(dayMap)) {
      if (dayStr.includes(key) && !dayStr.match(new RegExp(`[月火水木金土]～${key}`))) {
        days.add(value);
      }
    }
    
    return days;
  }
  
  // 時間パターン
  const timePattern = /(\d{1,2}):(\d{2})\s*[～~-]\s*(\d{1,2}):(\d{2})/g;
  
  // （曜日情報）時間 のパターンを抽出
  const blockPattern = /([^（）]*?)（([^）]+)）/g;
  const blocks = [];
  
  for (const match of text.matchAll(blockPattern)) {
    const before = match[1];
    const dayInfo = match[2];
    
    // この前後の時間を探す
    const times = [...before.matchAll(timePattern)];
    if (times.length > 0) {
      const timeStr = times.map(m => `${m[1]}:${m[2]}～${m[3]}:${m[4]}`).join(' / ');
      const days = parseDays(dayInfo);
      blocks.push({ timeStr, days });
    }
  }
  
  // （）なしのパターンも処理
  const lines = text.split(/[■\n]/);
  for (const line of lines) {
    if (line.includes('（') || !line.includes(':')) continue;
    
    const times = [...line.matchAll(timePattern)];
    if (times.length === 0) continue;
    
    const timeStr = times.map(m => `${m[1]}:${m[2]}～${m[3]}:${m[4]}`).join(' / ');
    
    // 曜日情報を抽出
    const dayPart = line.split(/\d/)[0];
    const days = parseDays(dayPart);
    
    blocks.push({ timeStr, days });
  }
  
  // 時間を曜日に割り当て
  blocks.forEach(block => {
    if (block.days.size > 0) {
      block.days.forEach(day => {
        if (result.parsed[day]) {
          if (!result.parsed[day].includes(block.timeStr)) {
            result.parsed[day] += ' / ' + block.timeStr;
          }
        } else {
          result.parsed[day] = block.timeStr;
        }
      });
    } else {
      // 曜日指定なし = 全曜日
      Object.keys(result.parsed).forEach(day => {
        if (!result.parsed[day]) {
          result.parsed[day] = block.timeStr;
        }
      });
    }
  });
  
  // 定休日の曜日をnullに設定
  if (result.closed) {
    for (const [key, value] of Object.entries(dayMap)) {
      if (result.closed.includes(key)) {
        result.parsed[value] = null;
      }
    }
    
    if (result.closed.includes('不定休')) {
      result.closed = '不定休';
    }
  }
  
  return result;
}

let updated = 0;
let failed = 0;

shops.forEach(shop => {
  if (!shop.hours || !shop.hours.trim()) return;
  
  try {
    const structured = parseHours(shop.hours);
    if (structured) {
      shop.hours_structured = structured;
      console.log(`✓ ${shop.name}`);
      updated++;
    }
  } catch (error) {
    console.log(`✗ ${shop.name}: ${error.message}`);
    failed++;
  }
});

fs.writeFileSync(shopsPath, JSON.stringify(shops, null, 2));

console.log('\n✓ 完了');
console.log(`  更新: ${updated}件`);
console.log(`  失敗: ${failed}件`);
