const fs = require('fs');
const shops = require('./data/shops.json');
const restaurants = require('./data/restaurants.json');

// restaurantsからマッピング作成
const coordsMap = new Map();
restaurants.forEach(r => {
  if (r.url) {
    coordsMap.set(r.url, { 
      address: r.address,
      phone: r.phone 
    });
  }
});

// 営業時間を構造化
function parseHours(hoursText) {
  if (!hoursText) return null;
  
  const structured = {
    text: hoursText,
    parsed: {}
  };
  
  // 定休日抽出
  const closedMatch = hoursText.match(/定休日[：:]\s*([^\s]+)/);
  if (closedMatch) {
    structured.closed = closedMatch[1];
  }
  
  // 曜日範囲パターン（月～金、月・火・水など）
  const rangePatterns = [
    { pattern: /月\s*[～〜~-]\s*金[^土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
    { pattern: /月\s*[～〜~-]\s*木[^金土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, days: ['mon', 'tue', 'wed', 'thu'] },
    { pattern: /火\s*[～〜~-]\s*土[^日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, days: ['tue', 'wed', 'thu', 'fri', 'sat'] },
    { pattern: /月[・･]\s*火[・･]\s*水[^木金土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, days: ['mon', 'tue', 'wed'] },
    { pattern: /月[・･]\s*水[・･]\s*木[^火金土日]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, days: ['mon', 'wed', 'thu'] },
    { pattern: /金[・･]\s*土[^日月火水木]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, days: ['fri', 'sat'] },
    { pattern: /土[・･]\s*日[^月火水木金]*?[:：]?\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, days: ['sat', 'sun'] }
  ];
  
  rangePatterns.forEach(({ pattern, days }) => {
    const matches = [...hoursText.matchAll(pattern)];
    if (matches.length > 0) {
      const time = matches[0][1].trim();
      days.forEach(day => {
        if (!structured.parsed[day]) {
          structured.parsed[day] = time;
        }
      });
    }
  });
  
  // 個別曜日パターン
  const dayPatterns = [
    { pattern: /月[^火水木金土日～〜~・･]*?[:：]\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, day: 'mon' },
    { pattern: /火[^月水木金土日～〜~・･]*?[:：]\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, day: 'tue' },
    { pattern: /水[^月火木金土日～〜~・･]*?[:：]\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, day: 'wed' },
    { pattern: /木[^月火水金土日～〜~・･]*?[:：]\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, day: 'thu' },
    { pattern: /金[^月火水木土日～〜~・･]*?[:：]\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, day: 'fri' },
    { pattern: /土[^月火水木金日～〜~・･]*?[:：]\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, day: 'sat' },
    { pattern: /日[^月火水木金土～〜~・･]*?[:：]\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, day: 'sun' },
    { pattern: /祝[^月火水木金土日～〜~・･]*?[:：]\s*(\d{1,2}:\d{2}\s*[～〜~-]\s*\d{1,2}:\d{2}[^、。\n]*)/g, day: 'holiday' }
  ];
  
  dayPatterns.forEach(({ pattern, day }) => {
    const matches = [...hoursText.matchAll(pattern)];
    if (matches.length > 0 && !structured.parsed[day]) {
      structured.parsed[day] = matches[0][1].trim();
    }
  });
  
  return Object.keys(structured.parsed).length > 0 || structured.closed ? structured : { text: hoursText };
}

// ジャンル抽出
function extractGenre(shop) {
  const genres = new Set();
  
  if (shop.category) {
    shop.category.split(',').forEach(g => genres.add(g.trim()));
  }
  
  // 名前やURLから推測
  const text = `${shop.name} ${shop.url}`.toLowerCase();
  const genreMap = {
    'yakiniku': '焼肉', '焼肉': '焼肉',
    'sushi': '寿司', '鮨': '寿司', 'すし': '寿司',
    'ramen': 'ラーメン', 'らぁめん': 'ラーメン',
    'izakaya': '居酒屋', '居酒屋': '居酒屋',
    'cafe': 'カフェ', 'カフェ': 'カフェ',
    'bar': 'バー', 'バー': 'バー', 'lounge': 'バー', 'pub': 'バー',
    'udon': 'うどん', 'うどん': 'うどん',
    'tempura': '天ぷら', '天ぷら': '天ぷら',
    'yakitori': '焼鳥', '焼鳥': '焼鳥', 'やきとり': '焼鳥',
    'unagi': 'うなぎ', 'うなぎ': 'うなぎ',
    '韓国': '韓国料理', 'korean': '韓国料理',
    '中華': '中華料理', '中国料理': '中華料理',
    '海鮮': '海鮮料理',
    '和食': '和食',
    '洋食': '洋食',
    'snack': 'スナック', 'スナック': 'スナック'
  };
  
  for (const [key, value] of Object.entries(genreMap)) {
    if (text.includes(key)) {
      genres.add(value);
    }
  }
  
  return genres.size > 0 ? Array.from(genres) : null;
}

// 佐賀市の主要エリアの代表座標
const sagaAreas = {
  '大財': { lat: 33.2575, lng: 130.3015 },
  '白山': { lat: 33.2555, lng: 130.3020 },
  '中央本町': { lat: 33.2540, lng: 130.3020 },
  '松原': { lat: 33.2525, lng: 130.3045 },
  '駅前中央': { lat: 33.2640, lng: 130.3000 },
  '唐人': { lat: 33.2580, lng: 130.2995 },
  '呉服元町': { lat: 33.2545, lng: 130.3025 },
  '愛敬町': { lat: 33.2585, lng: 130.3012 },
  '鍋島': { lat: 33.2810, lng: 130.2690 },
  '兵庫北': { lat: 33.2695, lng: 130.3020 }
};

function estimateCoords(address) {
  if (!address) return null;
  
  for (const [area, coords] of Object.entries(sagaAreas)) {
    if (address.includes(area)) {
      return coords;
    }
  }
  
  // デフォルト（佐賀市中心部）
  if (address.includes('佐賀市')) {
    return { lat: 33.2635, lng: 130.3000 };
  }
  
  return null;
}

function fixShops() {
  const fixed = [];
  let coordsFixed = 0;
  let addressUpdated = 0;
  
  for (let i = 0; i < shops.length; i++) {
    const shop = { ...shops[i] };
    
    // addressとphoneをrestaurantsから補完
    const restaurantData = coordsMap.get(shop.url);
    if (restaurantData) {
      if (!shop.address && restaurantData.address) {
        shop.address = restaurantData.address;
        addressUpdated++;
      }
      if (!shop.phone && restaurantData.phone) {
        shop.phone = restaurantData.phone;
      }
    }
    
    // 座標推定
    if ((!shop.lat || !shop.lng) && shop.address) {
      const coords = estimateCoords(shop.address);
      if (coords) {
        shop.lat = coords.lat;
        shop.lng = coords.lng;
        coordsFixed++;
      }
    }
    
    // 営業時間構造化
    if (shop.hours) {
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
  
  const nullCoords = fixed.filter(s => !s.lat || !s.lng).length;
  console.log(`✓ Complete!`);
  console.log(`  Address updated: ${addressUpdated}`);
  console.log(`  Coords estimated: ${coordsFixed}`);
  console.log(`  Remaining null coords: ${nullCoords}`);
  console.log(`  With genre: ${fixed.filter(s => s.genre).length}`);
  console.log(`  With structured hours: ${fixed.filter(s => s.hours_structured?.parsed).length}`);
}

fixShops();
