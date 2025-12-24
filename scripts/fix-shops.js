const fs = require('fs');
const shops = require('./data/shops.json');

// Google Maps URLから座標を抽出
function extractCoordsFromUrl(url) {
  if (!url) return null;
  
  // cid形式のURLの場合、座標は含まれていないのでnull
  if (url.includes('cid=')) return null;
  
  // @lat,lng形式
  const match = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (lat >= 33.0 && lat <= 33.5 && lng >= 129.8 && lng <= 130.5) {
      return { lat, lng };
    }
  }
  return null;
}

// 営業時間を構造化
function parseHours(hoursText) {
  if (!hoursText) return null;
  
  const structured = {
    text: hoursText,
    weekday: {},
    special: []
  };
  
  // 曜日パターン
  const dayMap = {
    '月': 'mon', '火': 'tue', '水': 'wed', '木': 'thu',
    '金': 'fri', '土': 'sat', '日': 'sun', '祝': 'holiday'
  };
  
  // パターンマッチング
  const lines = hoursText.split(/[、。\n]/);
  for (const line of lines) {
    for (const [jp, en] of Object.entries(dayMap)) {
      if (line.includes(jp) && /\d{1,2}:\d{2}/.test(line)) {
        const times = line.match(/\d{1,2}:\d{2}/g);
        if (times) {
          structured.weekday[en] = line.trim();
        }
      }
    }
  }
  
  return Object.keys(structured.weekday).length > 0 ? structured : { text: hoursText };
}

// ジャンル抽出
function extractGenre(shop) {
  const genres = [];
  
  if (shop.category) {
    genres.push(...shop.category.split(',').map(g => g.trim()));
  }
  
  // URLからも推測
  const url = shop.url || '';
  const genreMap = {
    'yakiniku': '焼肉',
    'sushi': '寿司',
    'ramen': 'ラーメン',
    'izakaya': '居酒屋',
    'cafe': 'カフェ',
    'bar': 'バー',
    'udon': 'うどん',
    'tempura': '天ぷら',
    'yakitori': '焼鳥'
  };
  
  for (const [key, value] of Object.entries(genreMap)) {
    if (url.includes(key) && !genres.includes(value)) {
      genres.push(value);
    }
  }
  
  return genres.length > 0 ? genres : null;
}

async function fixShops() {
  const fixed = [];
  let geocodedCount = 0;
  let outOfRangeCount = 0;
  
  for (let i = 0; i < shops.length; i++) {
    const shop = { ...shops[i] };
    
    console.log(`Processing ${i + 1}/${shops.length}: ${shop.name}`);
    
    // lat/lng修正
    const isOutOfRange = shop.lat && shop.lng && 
                         (shop.lat < 33.0 || shop.lat > 33.5 || 
                          shop.lng < 129.8 || shop.lng > 130.5);
    
    if (isOutOfRange) {
      console.log(`  ⚠ Out of range: ${shop.lat}, ${shop.lng}`);
      outOfRangeCount++;
      shop.lat = null;
      shop.lng = null;
    }
    
    // Google Maps URLから座標抽出を試みる
    if ((!shop.lat || !shop.lng) && shop.googleMapUrl) {
      const coords = extractCoordsFromUrl(shop.googleMapUrl);
      if (coords) {
        shop.lat = coords.lat;
        shop.lng = coords.lng;
        geocodedCount++;
        console.log(`  ✓ Extracted from URL: ${coords.lat}, ${coords.lng}`);
      }
    }
    
    // 営業時間構造化
    if (shop.hours && typeof shop.hours === 'string') {
      shop.hours_structured = parseHours(shop.hours);
    }
    
    // ジャンル追加
    const genre = extractGenre(shop);
    if (genre) {
      shop.genre = genre;
    }
    
    fixed.push(shop);
  }
  
  fs.writeFileSync('./data/shops.json', JSON.stringify(fixed, null, 2));
  console.log(`\n✓ Complete!`);
  console.log(`  Fixed out of range: ${outOfRangeCount}`);
  console.log(`  Extracted from URL: ${geocodedCount}`);
  console.log(`  Remaining null coords: ${fixed.filter(s => !s.lat || !s.lng).length}`);
}

fixShops().catch(console.error);
