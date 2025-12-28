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
      .replace(/[～〜]/g, '～')
      .replace(/\s+/g, ' ');
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
    /定休日[：:]\s*([^\s■営業]+?)(?:\s|$)/,
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
  
  // 不定休の検出
  if (text.includes('不定休') || text.includes('無休')) {
    if (!result.closed) {
      result.closed = text.includes('無休') ? '無休' : '不定休';
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
    
    // 範囲: 月～金、月〜金など
    const ranges = [...dayStr.matchAll(/([月火水木金土])[～〜~-]([月火水木金土日])/g)];
    for (const match of ranges) {
      const start = dayOrder.indexOf(match[1]);
      const end = dayOrder.indexOf(match[2]);
      if (start !== -1 && end !== -1) {
        for (let i = start; i <= end; i++) {
          if (dayMap[dayOrder[i]]) days.add(dayMap[dayOrder[i]]);
        }
      }
    }
    
    // 個別の曜日（・で区切られた形式: 月・火・水、日・祝など）
    // 「日・祝」のような形式を処理
    if (dayStr.includes('・') || dayStr.includes('･')) {
      // ・で分割して各要素を処理
      const parts = dayStr.split(/[・･]/).map(p => p.trim()).filter(p => p);
      for (const part of parts) {
        // 各文字をチェック
        for (const char of part) {
          if (dayMap[char]) {
            days.add(dayMap[char]);
          }
        }
      }
    }
    
    // 個別の曜日（範囲パターンに含まれていないもの、かつ・で区切られていないもの）
    for (const [key, value] of Object.entries(dayMap)) {
      if (dayStr.includes(key)) {
        // 範囲パターンに含まれていないか確認
        const isInRange = ranges.some(range => {
          const startIdx = dayOrder.indexOf(range[1]);
          const endIdx = dayOrder.indexOf(range[2]);
          const keyIdx = dayOrder.indexOf(key);
          return keyIdx >= startIdx && keyIdx <= endIdx;
        });
        // ・で区切られた形式で既に処理済みか確認
        const isDotSeparated = (dayStr.includes('・') || dayStr.includes('･')) && 
                               dayStr.split(/[・･]/).some(part => part.includes(key));
        if (!isInRange && !isDotSeparated) {
          days.add(value);
        }
      }
    }
    
    return days;
  }
  
  // 時間パターン（より柔軟に）
  const timePattern = /(\d{1,2}):(\d{2})\s*[～~\-]\s*(\d{1,2}):(\d{2})/g;
  
  // パターン1: （曜日情報）時間 の形式
  const blockPattern = /([^（）]*?)[（(]([^）)]+)[）)]/g;
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
  
  // パターン2: 曜日 時間 の形式（（）なし）
  // パターン1で処理されていない部分のみを処理
  // セグメントを分割（、や改行、■で分割）
  const segments = text.split(/[、，\n■]/).map(s => s.trim()).filter(s => s && s.includes(':'));
  
  // パターン1で処理された時間を記録
  const processedTimes = new Set();
  blocks.forEach(block => {
    processedTimes.add(block.timeStr);
  });
  
  for (const segment of segments) {
    // （）を含むセグメントはパターン1で処理済みなのでスキップ
    if (segment.includes('（') || segment.includes('(')) continue;
    
    const times = [...segment.matchAll(timePattern)];
    if (times.length === 0) continue;
    
    const timeStr = times.map(m => `${m[1]}:${m[2]}～${m[3]}:${m[4]}`).join(' / ');
    
    // 既に処理済みの時間はスキップ
    if (processedTimes.has(timeStr)) continue;
    
    // 曜日情報を抽出
    const dayPart = segment.split(/\d/)[0];
    const days = parseDays(dayPart);
    
    if (days.size > 0) {
      blocks.push({ timeStr, days });
    } else {
      // 曜日指定なし = 全曜日（定休日以外）
      blocks.push({ timeStr, days: new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'holiday']) });
    }
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
    }
  });
  
  // 定休日の曜日をnullに設定
  if (result.closed) {
    // 定休日文字列から曜日を正確に抽出（「火曜日」のような形式に対応）
    const closedDays = new Set();
    
    // 「火曜日」「月曜日」などの形式を処理
    for (const [key, value] of Object.entries(dayMap)) {
      // 「火曜日」のような形式をチェック（「火」で始まり「曜日」が続く、または単独の「火」）
      const dayPattern = new RegExp(`^${key}曜日$|^${key}$|${key}[・、]`, 'u');
      if (dayPattern.test(result.closed)) {
        closedDays.add(value);
      }
    }
    
    // 抽出した定休日の曜日をnullに設定
    closedDays.forEach(day => {
      result.parsed[day] = null;
    });
  }
  
  // 全てnullの場合はnullを返す（パース失敗）
  const hasAnyHours = Object.values(result.parsed).some(v => v !== null);
  if (!hasAnyHours && !result.closed) {
    return null;
  }
  
  return result;
}

let updated = 0;
let fixed = 0;
let failed = 0;
const issues = [];

shops.forEach((shop, index) => {
  if (!shop.hours || !shop.hours.trim()) {
    // hoursが空の場合はhours_structuredもnullにする
    if (shop.hours_structured !== null) {
      shop.hours_structured = null;
      updated++;
    }
    return;
  }
  
  try {
    const structured = parseHours(shop.hours);
    
    // 既存のhours_structuredと比較
    const needsUpdate = !shop.hours_structured || 
                       JSON.stringify(shop.hours_structured) !== JSON.stringify(structured);
    
    if (needsUpdate) {
      const wasNull = shop.hours_structured === null;
      const wasEmpty = shop.hours_structured && 
                       Object.values(shop.hours_structured.parsed || {}).every(v => v === null);
      
      shop.hours_structured = structured;
      
      if (wasNull) {
        updated++;
        console.log(`✓ [新規] ${shop.name}`);
      } else if (wasEmpty && structured && Object.values(structured.parsed).some(v => v !== null)) {
        fixed++;
        console.log(`✓ [修正] ${shop.name}`);
      } else {
        updated++;
        console.log(`✓ [更新] ${shop.name}`);
      }
    }
  } catch (error) {
    console.log(`✗ ${shop.name}: ${error.message}`);
    failed++;
    issues.push({ name: shop.name, error: error.message });
  }
});

fs.writeFileSync(shopsPath, JSON.stringify(shops, null, 2));

console.log('\n✓ 完了');
console.log(`  新規作成: ${updated - fixed}件`);
console.log(`  修正: ${fixed}件`);
console.log(`  失敗: ${failed}件`);
if (issues.length > 0) {
  console.log('\n問題のある店舗:');
  issues.forEach(issue => {
    console.log(`  - ${issue.name}: ${issue.error}`);
  });
}

