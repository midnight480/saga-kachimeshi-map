const fs = require('fs');
const https = require('https');
const path = require('path');
const { parseString } = require('xml2js');

const shopsPath = path.join(__dirname, '../docs/data/shops.json');
const shops = JSON.parse(fs.readFileSync(shopsPath, 'utf8'));

// Geocoding.jp APIで住所から座標を取得
function geocode(address) {
  return new Promise((resolve) => {
    if (!address || address.length < 5) {
      resolve(null);
      return;
    }
    
    // 佐賀県を明示的に追加
    const query = address.startsWith('佐賀') ? address : `佐賀県${address}`;
    const url = `https://www.geocoding.jp/api/?q=${encodeURIComponent(query)}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        parseString(data, (err, result) => {
          if (err || !result?.result?.coordinate?.[0]) {
            resolve(null);
            return;
          }
          
          const lat = parseFloat(result.result.coordinate[0].lat[0]);
          const lng = parseFloat(result.result.coordinate[0].lng[0]);
          
          // 佐賀県の範囲チェック
          if (lat >= 33.0 && lat <= 33.5 && lng >= 129.8 && lng <= 130.5) {
            resolve({ lat, lng });
          } else {
            resolve(null);
          }
        });
      });
    }).on('error', () => resolve(null));
  });
}

async function updateCoordinates() {
  const startFrom = parseInt(process.argv[2] || '0');
  
  console.log('Geocoding.jp APIで座標を更新します');
  console.log('制約: 10秒に1回のペースで実行します');
  if (startFrom > 0) {
    console.log(`開始位置: ${startFrom + 1}店舗目から\n`);
  } else {
    console.log('');
  }
  
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = startFrom; i < shops.length; i++) {
    const shop = shops[i];
    
    if (!shop.address) {
      console.log(`[${i+1}/${shops.length}] ${shop.name} - スキップ（住所なし）`);
      skipped++;
      continue;
    }
    
    console.log(`[${i+1}/${shops.length}] ${shop.name}`);
    console.log(`  住所: ${shop.address}`);
    console.log(`  現在: ${shop.lat}, ${shop.lng}`);
    
    const coords = await geocode(shop.address);
    
    if (coords) {
      shop.lat = coords.lat;
      shop.lng = coords.lng;
      console.log(`  ✓ 更新: ${coords.lat}, ${coords.lng}`);
      updated++;
    } else {
      console.log(`  ✗ 取得失敗`);
      failed++;
    }
    
    // 10秒待機（API制約）
    if (i < shops.length - 1) {
      console.log('  待機中... (10秒)\n');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  fs.writeFileSync(shopsPath, JSON.stringify(shops, null, 2));
  
  console.log('\n✓ 完了');
  console.log(`  更新: ${updated}件`);
  console.log(`  失敗: ${failed}件`);
  console.log(`  スキップ: ${skipped}件`);
  console.log(`  座標あり: ${shops.filter(s => s.lat && s.lng).length}/${shops.length}件`);
}

updateCoordinates().catch(console.error);
