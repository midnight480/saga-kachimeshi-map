const fs = require('fs');
const path = require('path');

const shopsPath = path.join(__dirname, '../docs/data/shops.json');
const shops = JSON.parse(fs.readFileSync(shopsPath, 'utf8'));

// 除外するキーワード
const excludePatterns = [
  '佐賀市',
  '佐賀駅',
  '佐賀・鳥栖',
  '佐賀',
  '鍋島駅',
  '×',
  '-',
  '￥',
  '～'
];

let updated = 0;

shops.forEach(shop => {
  if (!shop.genre || shop.genre.length === 0) return;
  
  const originalLength = shop.genre.length;
  
  // 除外パターンに一致するジャンルを削除
  shop.genre = shop.genre.filter(genre => {
    return !excludePatterns.some(pattern => genre.includes(pattern));
  });
  
  // 重複を削除
  shop.genre = [...new Set(shop.genre)];
  
  if (shop.genre.length !== originalLength) {
    console.log(`${shop.name}: ${originalLength}件 → ${shop.genre.length}件`);
    updated++;
  }
});

fs.writeFileSync(shopsPath, JSON.stringify(shops, null, 2));

console.log('\n✓ 完了');
console.log(`  更新: ${updated}件`);
