const fs = require('fs');
const path = require('path');

const shopsPath = path.join(__dirname, '../docs/data/shops.json');
const restaurantsPath = path.join(__dirname, '../docs/data/restaurants.json');

const shops = JSON.parse(fs.readFileSync(shopsPath, 'utf8'));
const restaurants = JSON.parse(fs.readFileSync(restaurantsPath, 'utf8'));

// 店舗名でマッピング
const restaurantMap = new Map();
restaurants.forEach(r => {
  restaurantMap.set(r.name, r);
});

let updated = 0;
let phoneUpdated = 0;
let tabelogUpdated = 0;
let googleMapUpdated = 0;

shops.forEach(shop => {
  const restaurant = restaurantMap.get(shop.name);
  if (!restaurant) {
    console.log(`マッチなし: ${shop.name}`);
    return;
  }
  
  let shopUpdated = false;
  
  // phoneが空の場合、restaurantsから取得
  if (!shop.phone && restaurant.phone) {
    console.log(`${shop.name}: phone更新 "${restaurant.phone}"`);
    shop.phone = restaurant.phone;
    phoneUpdated++;
    shopUpdated = true;
  }
  
  // tabelogが空の場合、restaurantsから取得
  if (!shop.tabelog && restaurant.tabelog) {
    console.log(`${shop.name}: tabelog更新`);
    shop.tabelog = restaurant.tabelog;
    tabelogUpdated++;
    shopUpdated = true;
  }
  
  // google_mapが空の場合、restaurantsから取得
  if (!shop.google_map && restaurant.google_map) {
    console.log(`${shop.name}: google_map更新`);
    shop.google_map = restaurant.google_map;
    googleMapUpdated++;
    shopUpdated = true;
  }
  
  if (shopUpdated) updated++;
});

fs.writeFileSync(shopsPath, JSON.stringify(shops, null, 2));

console.log('✓ 完了');
console.log(`  更新店舗数: ${updated}件`);
console.log(`  phone: ${phoneUpdated}件`);
console.log(`  tabelog: ${tabelogUpdated}件`);
console.log(`  google_map: ${googleMapUpdated}件`);
