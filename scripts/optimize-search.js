const fs = require('fs');
const shops = require('./data/shops.json');

function normalizeTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }
  return null;
}

function parseTimeRange(timeStr) {
  if (!timeStr) return null;
  
  const times = timeStr.match(/(\d{1,2}:\d{2})/g);
  if (times && times.length >= 2) {
    return {
      open: normalizeTime(times[0]),
      close: normalizeTime(times[times.length - 1])
    };
  }
  return null;
}

function buildSearchData(shop) {
  const searchData = {
    id: shop.url?.split('/').pop() || shop.name.replace(/\s+/g, '_'),
    name: shop.name,
    nameKana: shop.name, // 必要に応じてひらがな変換
    genre: shop.genre || [],
    address: shop.address || '',
    phone: shop.phone || '',
    lat: shop.lat,
    lng: shop.lng,
    googleMapUrl: shop.googleMapUrl,
    tabelogUrl: shop.tabelogUrl,
    url: shop.url,
    
    // 検索用: 営業時間（曜日別）
    openingHours: {
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: null,
      holiday: null
    },
    
    // 元の営業時間テキスト
    hoursText: shop.hours || '',
    closedDays: []
  };
  
  // 営業時間を曜日別に設定
  if (shop.hours_structured?.parsed) {
    Object.entries(shop.hours_structured.parsed).forEach(([day, timeStr]) => {
      const range = parseTimeRange(timeStr);
      if (range) {
        searchData.openingHours[day] = range;
      }
    });
  }
  
  // 定休日
  if (shop.hours_structured?.closed) {
    const closed = shop.hours_structured.closed;
    const dayMap = {
      '月': 'mon', '火': 'tue', '水': 'wed', '木': 'thu',
      '金': 'fri', '土': 'sat', '日': 'sun', '祝': 'holiday'
    };
    
    Object.entries(dayMap).forEach(([jp, en]) => {
      if (closed.includes(jp)) {
        searchData.closedDays.push(en);
      }
    });
  }
  
  // 検索用キーワード（名前の正規化）
  searchData.searchKeywords = [
    shop.name.toLowerCase(),
    shop.name.replace(/\s+/g, ''),
    ...(Array.isArray(shop.genre) ? shop.genre.map(g => g.toLowerCase()) : [])
  ];
  
  return searchData;
}

// 検索用インデックスも作成
function buildSearchIndex(shops) {
  const genreIndex = {};
  const areaIndex = {};
  
  shops.forEach((shop, idx) => {
    // ジャンル別インデックス
    if (Array.isArray(shop.genre)) {
      shop.genre.forEach(g => {
        if (!genreIndex[g]) genreIndex[g] = [];
        genreIndex[g].push(idx);
      });
    }
    
    // エリア別インデックス（住所から）
    if (shop.address) {
      const area = shop.address.match(/佐賀市([^\d]+)/)?.[1];
      if (area) {
        if (!areaIndex[area]) areaIndex[area] = [];
        areaIndex[area].push(idx);
      }
    }
  });
  
  return {
    genres: Object.keys(genreIndex).sort(),
    genreIndex,
    areas: Object.keys(areaIndex).sort(),
    areaIndex
  };
}

const searchableShops = shops.map(buildSearchData);
const searchIndex = buildSearchIndex(searchableShops);

// 検索用データを保存
fs.writeFileSync(
  './data/shops-search.json',
  JSON.stringify({
    shops: searchableShops,
    index: searchIndex,
    metadata: {
      totalShops: searchableShops.length,
      withCoords: searchableShops.filter(s => s.lat && s.lng).length,
      genres: searchIndex.genres,
      areas: searchIndex.areas,
      updatedAt: new Date().toISOString()
    }
  }, null, 2)
);

console.log('✓ Search data created!');
console.log('  Total shops:', searchableShops.length);
console.log('  Genres:', searchIndex.genres.length);
console.log('  Areas:', searchIndex.areas.length);
console.log('  With opening hours:', searchableShops.filter(s => 
  Object.values(s.openingHours).some(h => h !== null)
).length);
