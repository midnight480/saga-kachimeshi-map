// 検索ヘルパー関数
// フロントエンドで使用する検索ロジック

/**
 * 店舗を検索
 * @param {Array} shops - 店舗データ配列
 * @param {Object} filters - 検索条件
 * @param {string} filters.name - 店舗名（部分一致）
 * @param {Array<string>} filters.genres - ジャンル（OR検索）
 * @param {string} filters.dayOfWeek - 曜日 (mon, tue, wed, thu, fri, sat, sun, holiday)
 * @param {string} filters.time - 営業時間 (HH:mm形式)
 * @returns {Array} フィルタリングされた店舗配列
 */
function searchShops(shops, filters = {}) {
  let results = shops;
  
  // 名前で絞り込み（部分一致）
  if (filters.name) {
    const query = filters.name.toLowerCase().replace(/\s+/g, '');
    results = results.filter(shop => 
      shop.searchKeywords.some(keyword => keyword.includes(query))
    );
  }
  
  // ジャンルで絞り込み（OR検索）
  if (filters.genres && filters.genres.length > 0) {
    results = results.filter(shop =>
      filters.genres.some(genre => shop.genre.includes(genre))
    );
  }
  
  // 曜日で絞り込み
  if (filters.dayOfWeek) {
    results = results.filter(shop => {
      // 定休日でないこと
      if (shop.closedDays.includes(filters.dayOfWeek)) {
        return false;
      }
      // 営業時間が設定されているか、または営業時間情報がない場合は含める
      return shop.openingHours[filters.dayOfWeek] !== null || 
             Object.values(shop.openingHours).every(h => h === null);
    });
  }
  
  // 営業時間で絞り込み
  if (filters.time && filters.dayOfWeek) {
    const targetTime = filters.time.replace(':', '');
    results = results.filter(shop => {
      const hours = shop.openingHours[filters.dayOfWeek];
      if (!hours) {
        // 営業時間情報がない場合は含める
        return Object.values(shop.openingHours).every(h => h === null);
      }
      
      const openTime = hours.open.replace(':', '');
      const closeTime = hours.close.replace(':', '');
      
      // 深夜営業対応（閉店時間が開店時間より小さい場合）
      if (closeTime < openTime) {
        return targetTime >= openTime || targetTime <= closeTime;
      }
      
      return targetTime >= openTime && targetTime <= closeTime;
    });
  }
  
  return results;
}

/**
 * 利用可能なジャンル一覧を取得
 * @param {Object} searchData - shops-search.jsonのデータ
 * @returns {Array<string>} ジャンル配列
 */
function getAvailableGenres(searchData) {
  return searchData.metadata.genres;
}

/**
 * 曜日の日本語名を取得
 * @param {string} dayOfWeek - 曜日コード
 * @returns {string} 日本語の曜日名
 */
function getDayName(dayOfWeek) {
  const dayNames = {
    mon: '月曜日',
    tue: '火曜日',
    wed: '水曜日',
    thu: '木曜日',
    fri: '金曜日',
    sat: '土曜日',
    sun: '日曜日',
    holiday: '祝日'
  };
  return dayNames[dayOfWeek] || '';
}

// 使用例
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    searchShops,
    getAvailableGenres,
    getDayName
  };
}

// ブラウザ用
if (typeof window !== 'undefined') {
  window.ShopSearch = {
    searchShops,
    getAvailableGenres,
    getDayName
  };
}
