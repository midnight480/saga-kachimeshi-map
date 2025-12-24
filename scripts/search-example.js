// 検索機能のテスト例

const searchData = require('./data/shops-search.json');
const { searchShops, getAvailableGenres, getDayName } = require('./search-helper.js');

console.log('=== 検索機能テスト ===\n');

// 1. 名前で検索
console.log('1. 名前で検索: "すし"');
let results = searchShops(searchData.shops, { name: 'すし' });
console.log(`   結果: ${results.length}件`);
results.slice(0, 3).forEach(s => console.log(`   - ${s.name}`));

// 2. ジャンルで検索
console.log('\n2. ジャンルで検索: "居酒屋"');
results = searchShops(searchData.shops, { genres: ['居酒屋'] });
console.log(`   結果: ${results.length}件`);
results.slice(0, 3).forEach(s => console.log(`   - ${s.name} (${s.genre.join(', ')})`));

// 3. 曜日で検索
console.log('\n3. 金曜日営業の店舗');
results = searchShops(searchData.shops, { dayOfWeek: 'fri' });
console.log(`   結果: ${results.length}件`);

// 4. 複合検索
console.log('\n4. 複合検索: ジャンル"和食" + 金曜日営業');
results = searchShops(searchData.shops, { 
  genres: ['和食'],
  dayOfWeek: 'fri'
});
console.log(`   結果: ${results.length}件`);
results.slice(0, 3).forEach(s => console.log(`   - ${s.name}`));

// 5. 時間指定検索
console.log('\n5. 金曜日20:00に営業している店舗');
results = searchShops(searchData.shops, { 
  dayOfWeek: 'fri',
  time: '20:00'
});
console.log(`   結果: ${results.length}件`);
results.slice(0, 5).forEach(s => {
  const hours = s.openingHours.fri;
  const hoursText = hours ? `${hours.open}-${hours.close}` : '時間情報なし';
  console.log(`   - ${s.name} (${hoursText})`);
});

// 利用可能なジャンル一覧
console.log('\n=== 利用可能なジャンル ===');
const genres = getAvailableGenres(searchData);
console.log(genres.join(', '));
