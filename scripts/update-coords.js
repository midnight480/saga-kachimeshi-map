const https = require('https');
const fs = require('fs');
const shops = require('./data/shops.json');

async function geocode(address) {
  return new Promise((resolve) => {
    if (!address || address.length < 5) {
      resolve(null);
      return;
    }
    
    const query = address.startsWith('佐賀') ? address : '佐賀県' + address;
    const url = 'https://www.geocoding.jp/api/?q=' + encodeURIComponent(query);
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const latMatch = data.match(/<lat>([^<]+)<\/lat>/);
        const lngMatch = data.match(/<lng>([^<]+)<\/lng>/);
        if (latMatch && lngMatch) {
          const lat = parseFloat(latMatch[1]);
          const lng = parseFloat(lngMatch[1]);
          if (lat >= 33.0 && lat <= 33.5 && lng >= 129.8 && lng <= 130.5) {
            resolve({ lat, lng });
            return;
          }
        }
        resolve(null);
      });
    }).on('error', () => resolve(null));
  });
}

async function updateAll() {
  const startTime = Date.now();
  console.log('='.repeat(60));
  console.log('全店舗の座標を更新します');
  console.log('制約: 10秒に1回のペース');
  console.log('推定時間:', Math.ceil(shops.length * 10 / 60), '分');
  console.log('='.repeat(60));
  console.log('');
  
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < shops.length; i++) {
    const shop = shops[i];
    const progress = `[${i+1}/${shops.length}]`;
    const percent = Math.round((i+1) / shops.length * 100);
    
    console.log(`${progress} (${percent}%) ${shop.name}`);
    
    if (!shop.address) {
      console.log(`  → スキップ（住所なし）`);
      skipped++;
    } else {
      console.log(`  住所: ${shop.address}`);
      const coords = await geocode(shop.address);
      
      if (coords) {
        const oldLat = shop.lat;
        const oldLng = shop.lng;
        shop.lat = coords.lat;
        shop.lng = coords.lng;
        
        if (oldLat && oldLng) {
          const diff = Math.sqrt(Math.pow(oldLat - coords.lat, 2) + Math.pow(oldLng - coords.lng, 2));
          if (diff > 0.001) {
            console.log(`  ✓ 更新: ${coords.lat}, ${coords.lng} (差分: ${diff.toFixed(4)})`);
          } else {
            console.log(`  ✓ 確認: ${coords.lat}, ${coords.lng} (変更なし)`);
          }
        } else {
          console.log(`  ✓ 新規: ${coords.lat}, ${coords.lng}`);
        }
        updated++;
      } else {
        console.log(`  ✗ 取得失敗`);
        failed++;
      }
    }
    
    // 中間保存（10件ごと）
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync('./data/shops.json', JSON.stringify(shops, null, 2));
      console.log(`  💾 中間保存完了`);
    }
    
    if (i < shops.length - 1) {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const remaining = Math.round((shops.length - i - 1) * 10);
      console.log(`  ⏳ 待機中... (経過: ${elapsed}秒 / 残り: ${remaining}秒)`);
      console.log('');
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  
  fs.writeFileSync('./data/shops.json', JSON.stringify(shops, null, 2));
  
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log('');
  console.log('='.repeat(60));
  console.log('✓ 完了');
  console.log(`  更新: ${updated}件`);
  console.log(`  失敗: ${failed}件`);
  console.log(`  スキップ: ${skipped}件`);
  console.log(`  所要時間: ${Math.floor(totalTime / 60)}分${totalTime % 60}秒`);
  console.log('='.repeat(60));
}

updateAll().catch(console.error);
