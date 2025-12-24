const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../docs/data/shops.json');

// 営業時間を構造化（曜日ごとにパース）
function parseHours(hoursText) {
  if (!hoursText || !hoursText.trim()) return null;
  
  const structured = {
    text: hoursText,
    parsed: {}
  };
  
  // 定休日抽出
  const closedMatch = hoursText.match(/定休日[：:]\s*([^\s、。]+)/);
  if (closedMatch) {
    structured.closed = closedMatch[1];
  }
  
  // 曜日マッピング
  const dayMap = {
    '月': 'mon', '火': 'tue', '水': 'wed', '木': 'thu',
    '金': 'fri', '土': 'sat', '日': 'sun', '祝': 'holiday', '祝日': 'holiday', '祝前日': 'preHoliday', '祝後日': 'postHoliday'
  };
  
  // セグメント分割（、や改行で分割）
  const segments = hoursText.split(/[、，\n]/).map(s => s.trim()).filter(s => s);
  
  // 各セグメントを処理
  segments.forEach(segment => {
    // 曜日範囲パターン（月～金、月・火・水など）
    const rangePatterns = [
      { pattern: /月\s*[～〜~-]\s*金[^土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
      { pattern: /月\s*[～〜~-]\s*木[^金土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['mon', 'tue', 'wed', 'thu'] },
      { pattern: /月\s*[～〜~-]\s*水[^木金土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['mon', 'tue', 'wed'] },
      { pattern: /火\s*[～〜~-]\s*土[^日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['tue', 'wed', 'thu', 'fri', 'sat'] },
      { pattern: /火\s*[～〜~-]\s*金[^土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['tue', 'wed', 'thu', 'fri'] },
      { pattern: /金\s*[～〜~-]\s*土[^日月火水木]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['fri', 'sat'] },
      { pattern: /土\s*[～〜~-]\s*日[^月火水木金]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['sat', 'sun'] },
      { pattern: /月\s*[・･]\s*火[・･]\s*水[^木金土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['mon', 'tue', 'wed'] },
      { pattern: /月\s*[・･]\s*水[・･]\s*木[^火金土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['mon', 'wed', 'thu'] },
      { pattern: /金\s*[・･]\s*土[^日月火水木]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['fri', 'sat'] },
      { pattern: /土\s*[・･]\s*日[^月火水木金]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/, days: ['sat', 'sun'] }
    ];
    
    // 範囲パターンをチェック
    for (const { pattern, days } of rangePatterns) {
      const match = segment.match(pattern);
      if (match) {
        const timeStr = match[1].trim();
        days.forEach(day => {
          if (!structured.parsed[day]) {
            structured.parsed[day] = timeStr;
          }
        });
        return;
      }
    }
    
    // 個別曜日パターン
    for (const [jp, en] of Object.entries(dayMap)) {
      if (segment.includes(jp)) {
        // 時間範囲を抽出
        const timeMatch = segment.match(/(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2})/);
        if (timeMatch) {
          structured.parsed[en] = timeMatch[1].trim();
        }
      }
    }
  });
  
  // 曜日が指定されていない場合（例: "17:00 ～ 23:00"）
  if (Object.keys(structured.parsed).length === 0) {
    const timeMatch = hoursText.match(/(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2})/);
    if (timeMatch) {
      // 全曜日に適用
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach(day => {
        structured.parsed[day] = timeMatch[1].trim();
      });
    }
  }
  
  return Object.keys(structured.parsed).length > 0 ? structured : { text: hoursText };
}

// ジャンルを統一（categoryからgenreへ変換）
function normalizeGenre(shop) {
  let genres = [];
  
  // genre配列が既にある場合
  if (Array.isArray(shop.genre)) {
    genres = [...shop.genre];
  }
  
  // categoryフィールドがある場合、それをジャンルとして追加
  if (shop.category) {
    const categoryGenres = shop.category.split(/[,，、]/).map(c => c.trim()).filter(c => c);
    categoryGenres.forEach(cat => {
      if (!genres.includes(cat)) {
        genres.push(cat);
      }
    });
  }
  
  return genres.length > 0 ? genres : [];
}

// メイン処理
function enhanceShopsData() {
  console.log('Reading shops data...');
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  
  console.log(`Processing ${data.length} shops...`);
  const processed = data.map(shop => {
    const enhanced = { ...shop };
    
    // ジャンルを統一
    enhanced.genre = normalizeGenre(shop);
    
    // 営業時間を構造化
    if (shop.hours) {
      enhanced.hours_structured = parseHours(shop.hours);
    } else if (!shop.hours_structured) {
      enhanced.hours_structured = null;
    }
    
    // 古いフィールド名を統一（tabelog -> tabelogUrl, google_map -> googleMapUrl）
    if (shop.tabelog && !shop.tabelogUrl) {
      enhanced.tabelogUrl = shop.tabelog;
    }
    if (shop.google_map && !shop.googleMapUrl) {
      enhanced.googleMapUrl = shop.google_map;
    }
    
    return enhanced;
  });
  
  console.log('Writing enhanced data...');
  fs.writeFileSync(DATA_FILE, JSON.stringify(processed, null, 2));
  console.log(`Successfully enhanced ${processed.length} shops`);
  
  // 統計情報
  const withGenre = processed.filter(s => s.genre && s.genre.length > 0).length;
  const withParsedHours = processed.filter(s => s.hours_structured && s.hours_structured.parsed && Object.keys(s.hours_structured.parsed).length > 0).length;
  console.log(`\nStatistics:`);
  console.log(`- Shops with genre: ${withGenre}`);
  console.log(`- Shops with parsed hours: ${withParsedHours}`);
  
  // サンプル出力
  const sample = processed.find(s => s.hours_structured && s.hours_structured.parsed && Object.keys(s.hours_structured.parsed).length > 0);
  if (sample) {
    console.log('\nSample enhanced shop:');
    console.log(JSON.stringify({
      name: sample.name,
      genre: sample.genre,
      hours_structured: sample.hours_structured
    }, null, 2));
  }
}

enhanceShopsData();

