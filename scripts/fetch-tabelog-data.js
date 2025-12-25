const fs = require('fs');
const https = require('https');
const path = require('path');
const { JSDOM } = require('jsdom');

const shopsPath = path.join(__dirname, '../docs/data/shops.json');
const shops = JSON.parse(fs.readFileSync(shopsPath, 'utf8'));

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseTabelog(html) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  
  const result = {
    hours: null,
    genre: [],
    payment: []
  };
  
  // 営業時間を取得
  const hoursTable = doc.querySelector('table.c-table--form');
  if (hoursTable) {
    const rows = hoursTable.querySelectorAll('tr');
    rows.forEach(row => {
      const th = row.querySelector('th');
      const td = row.querySelector('td');
      if (th && td && th.textContent.includes('営業時間')) {
        result.hours = td.textContent.trim().replace(/\s+/g, ' ');
      }
    });
  }
  
  // ジャンルを取得
  const genreLinks = doc.querySelectorAll('.rdheader-subinfo__item-text a');
  genreLinks.forEach(link => {
    const genre = link.textContent.trim();
    if (genre && !result.genre.includes(genre)) {
      result.genre.push(genre);
    }
  });
  
  // 支払い方法を取得
  const paymentSection = Array.from(doc.querySelectorAll('th')).find(
    th => th.textContent.includes('カード')
  );
  if (paymentSection) {
    const td = paymentSection.nextElementSibling;
    if (td) {
      const text = td.textContent.trim();
      if (text.includes('可')) {
        result.payment.push('カード可');
      }
      if (text.includes('電子マネー')) {
        result.payment.push('電子マネー可');
      }
      if (text.includes('QRコード')) {
        result.payment.push('QRコード決済可');
      }
    }
  }
  
  return result;
}

async function updateFromTabelog() {
  const startFrom = parseInt(process.argv[2] || '0');
  
  console.log('食べログから情報を取得します');
  console.log('制約: 5秒に1回のペースで実行します\n');
  
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  
  for (let i = startFrom; i < shops.length; i++) {
    const shop = shops[i];
    
    if (!shop.tabelog || !shop.tabelog.trim()) {
      console.log(`[${i+1}/${shops.length}] ${shop.name} - スキップ（食べログURLなし）`);
      skipped++;
      continue;
    }
    
    console.log(`[${i+1}/${shops.length}] ${shop.name}`);
    console.log(`  URL: ${shop.tabelog}`);
    
    try {
      const html = await fetchPage(shop.tabelog);
      const data = parseTabelog(html);
      
      let shopUpdated = false;
      
      // 営業時間を更新（既存の値もチェック）
      if (data.hours) {
        const oldHours = shop.hours || '';
        if (oldHours !== data.hours) {
          console.log(`  営業時間: "${oldHours}" → "${data.hours.substring(0, 50)}..."`);
          shop.hours = data.hours;
          shopUpdated = true;
        }
      }
      
      // ジャンルを追加
      if (data.genre.length > 0) {
        const newGenres = data.genre.filter(g => !shop.genre.includes(g));
        if (newGenres.length > 0) {
          shop.genre = [...new Set([...shop.genre, ...newGenres])];
          console.log(`  ✓ ジャンル追加: ${newGenres.join(', ')}`);
          shopUpdated = true;
        }
      }
      
      // 支払い方法を追加
      if (data.payment.length > 0) {
        if (!shop.payment) shop.payment = [];
        const newPayments = data.payment.filter(p => !shop.payment.includes(p));
        if (newPayments.length > 0) {
          shop.payment = [...new Set([...shop.payment, ...newPayments])];
          console.log(`  ✓ 支払い方法: ${newPayments.join(', ')}`);
          shopUpdated = true;
        }
      }
      
      if (shopUpdated) {
        updated++;
      } else {
        console.log(`  - 更新なし`);
      }
      
    } catch (error) {
      console.log(`  ✗ 取得失敗: ${error.message}`);
      failed++;
    }
    
    // 5秒待機
    if (i < shops.length - 1) {
      console.log('  待機中... (5秒)\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
  
  fs.writeFileSync(shopsPath, JSON.stringify(shops, null, 2));
  
  console.log('\n✓ 完了');
  console.log(`  更新: ${updated}件`);
  console.log(`  失敗: ${failed}件`);
  console.log(`  スキップ: ${skipped}件`);
}

updateFromTabelog().catch(console.error);
