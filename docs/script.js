// Initialize map
const map = L.map('map').setView([33.2635, 130.3009], 13); // Default to Saga Station

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Load Shop Data
let allShops = [];
let markers = [];

fetch('data/shops.json')
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(shops => {
        allShops = shops;
        console.log(`Loaded ${shops.length} shops`);
        const withAddr = shops.filter(s => s.address && s.address.trim()).length;
        const withCoords = shops.filter(s => s.lat && s.lng).length;
        console.log(`Shops with address: ${withAddr}, with coordinates: ${withCoords}`);
        
        // Populate category dropdown
        populateCategoryFilter(shops);
        
        // Render all shops initially
        renderMap();
        // Always render list initially (even if map view is active)
        renderList();
    })
    .catch(err => {
        console.error('Error loading shop data:', err);
        // Show error message in list view
        const listContainer = document.getElementById('shop-list');
        if (listContainer) {
            listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #d32f2f;">データの読み込みに失敗しました。ページを再読み込みしてください。</div>';
        }
    });

// Populate genre filter dropdown
function populateCategoryFilter(shops) {
    const categorySelect = document.getElementById('filter-category');
    if (!categorySelect) return;
    
    // Extract unique genres from genre arrays
    const genres = new Set();
    shops.forEach(shop => {
        if (Array.isArray(shop.genre)) {
            shop.genre.forEach(g => {
                if (g && g.trim()) {
                    genres.add(g.trim());
                }
            });
        }
        // Also check category field for backward compatibility
        if (shop.category) {
            shop.category.split(/[,，、]/).forEach(c => {
                const trimmed = c.trim();
                if (trimmed) {
                    genres.add(trimmed);
                }
            });
        }
    });
    
    // Clear existing options (except the first "カテゴリー" option)
    categorySelect.innerHTML = '<option value="">ジャンル</option>';
    
    // Add genre options
    [...genres].sort().forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        categorySelect.appendChild(option);
    });
    
    console.log(`Populated ${genres.size} genres:`, [...genres].sort());
}

// Check if coordinates are in Saga area (rough bounds)
function isInSagaArea(lat, lng) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return false;
    // Saga city approximate bounds: lat 32.8-33.5, lng 130.1-130.5
    return lat >= 32.8 && lat <= 33.5 && lng >= 130.1 && lng <= 130.5;
}

// Note: Client-side geocoding is disabled due to CORS restrictions.
// All geocoding should be done server-side in scrape.js.
// If coordinates are invalid, the scraping script will re-geocode them.

async function renderMap() {
    // Clear existing markers
    markers.forEach(m => map.removeLayer(m));
    markers = [];

    const filterText = document.getElementById('filter-text').value.toLowerCase().trim();
    const filterCategory = document.getElementById('filter-category').value;
    const filterDay = document.getElementById('filter-day').value;
    const filterTime = document.getElementById('filter-time').value;

    const bounds = L.latLngBounds();
    let validShops = 0;

    // First pass: filter shops
    const filteredShops = allShops.filter(shop => {
        // Text Filter - Shop name only
        if (filterText) {
            const searchTerms = filterText.split(/\s+/);
            const shopName = shop.name.toLowerCase();
            
            // All search terms must match in shop name (AND search)
            const allTermsMatch = searchTerms.every(term => shopName.includes(term.toLowerCase()));
            if (!allTermsMatch) return false;
        }

        // Genre Filter
        if (filterCategory) {
            const shopGenres = Array.isArray(shop.genre) ? shop.genre : [];
            const categoryGenres = shop.category ? shop.category.split(/[,，、]/).map(c => c.trim()) : [];
            const allGenres = [...shopGenres, ...categoryGenres];
            if (!allGenres.includes(filterCategory)) return false;
        }

        // Day/Time Filter
        if (filterDay || filterTime) {
            if (!isShopOpen(shop, filterDay, filterTime)) return false;
        }

        return true;
    });

    // Display shops with coordinates
    // Note: Geocoding should be done server-side during scraping
    // Only display shops that already have coordinates in the data
    console.log(`Filtered shops: ${filteredShops.length}`);

    // Display shops with valid coordinates
    // Note: Invalid coordinates should be fixed by re-running scrape.js
    for (const shop of filteredShops) {
        const lat = shop.lat;
        const lng = shop.lng;

        // Only display shops with valid coordinates in Saga area
        if (lat && lng && !isNaN(lat) && !isNaN(lng) && isInSagaArea(lat, lng)) {
            try {
                const marker = L.marker([lat, lng]).addTo(map);
                const modalContent = createShopModalContent(shop);
                marker.bindPopup(modalContent, {
                    maxWidth: 400,
                    className: 'shop-popup'
                });
                marker.on('click', () => {
                    showShopModal(shop);
                });
                markers.push(marker);
                bounds.extend([lat, lng]);
                validShops++;
            } catch (e) {
                console.error(`Error creating marker for ${shop.name}:`, e);
            }
        } else if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
            // Coordinates exist but are outside Saga area
            console.warn(`Skipping ${shop.name}: coordinates [${lat}, ${lng}] are outside Saga area. Please re-run scrape.js to fix.`);
        }
    }

    console.log(`Shops displayed on map: ${validShops} / ${filteredShops.length}`);

    // Update map bounds
    if (validShops > 0) {
        if (bounds.isValid()) {
            try {
                map.fitBounds(bounds, { padding: [50, 50] });
            } catch (e) {
                console.warn('Invalid bounds, using default view');
                map.setView([33.2635, 130.3009], 13);
            }
        }
    } else if (filteredShops.length > 0) {
        // If we have shops but no valid coordinates, show default view
        map.setView([33.2635, 130.3009], 13);
    }

    // Update shop count display
    updateShopCount(validShops, filteredShops.length);
    
    // Also update list view if it's active
    if (document.getElementById('list-view').classList.contains('active')) {
        renderList();
    }
}

// Render shop list view
function renderList() {
    console.log('renderList called, allShops length:', allShops.length);
    
    const filterText = document.getElementById('filter-text').value.toLowerCase().trim();
    const filterCategory = document.getElementById('filter-category').value;
    const filterDay = document.getElementById('filter-day').value;
    const filterTime = document.getElementById('filter-time').value;

    // Filter shops (same logic as map)
    const filteredShops = allShops.filter(shop => {
        // Text Filter - Shop name only
        if (filterText) {
            const searchTerms = filterText.split(/\s+/);
            const shopName = shop.name.toLowerCase();
            
            // All search terms must match in shop name (AND search)
            const allTermsMatch = searchTerms.every(term => shopName.includes(term.toLowerCase()));
            if (!allTermsMatch) return false;
        }

        // Genre Filter
        if (filterCategory) {
            const shopGenres = Array.isArray(shop.genre) ? shop.genre : [];
            const categoryGenres = shop.category ? shop.category.split(/[,，、]/).map(c => c.trim()) : [];
            const allGenres = [...shopGenres, ...categoryGenres];
            if (!allGenres.includes(filterCategory)) return false;
        }

        // Day/Time Filter
        if (filterDay || filterTime) {
            if (!isShopOpen(shop, filterDay, filterTime)) return false;
        }

        return true;
    });

    console.log('Filtered shops:', filteredShops.length);

    const listContainer = document.getElementById('shop-list');
    if (!listContainer) {
        console.error('shop-list element not found!');
        return;
    }
    
    listContainer.innerHTML = '';

    if (filteredShops.length === 0) {
        listContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: #666;">該当する店舗が見つかりませんでした</div>';
        updateShopCount(0, allShops.length);
        return;
    }

    console.log('Rendering', filteredShops.length, 'shop cards');

    filteredShops.forEach(shop => {
        const card = document.createElement('div');
        card.className = 'shop-card';
        card.onclick = () => {
            // If shop has coordinates, show on map
            if (shop.lat && shop.lng) {
                switchToMapView();
                map.setView([shop.lat, shop.lng], 16);
                // Find and open the marker popup
                setTimeout(() => {
                    markers.forEach(marker => {
                        const markerLat = marker.getLatLng().lat;
                        const markerLng = marker.getLatLng().lng;
                        if (Math.abs(markerLat - shop.lat) < 0.0001 && Math.abs(markerLng - shop.lng) < 0.0001) {
                            marker.openPopup();
                        }
                    });
                }, 500);
            } else {
                // Show modal
                showShopModal(shop);
            }
        };

        // Get genre display text
        let genreDisplay = '';
        if (Array.isArray(shop.genre) && shop.genre.length > 0) {
            genreDisplay = shop.genre.join('、');
        } else if (shop.category) {
            genreDisplay = shop.category;
        }
        
        card.innerHTML = `
            <div class="shop-name">${shop.name}</div>
            ${genreDisplay ? `<div class="shop-category">${genreDisplay}</div>` : ''}
            <div class="shop-info">
                <div class="shop-hours">${getFormattedHours(shop)}</div>
                <div class="shop-address">${shop.address || '住所不明'}</div>
            </div>
            <div class="shop-links">
                <a href="${shop.url}" target="_blank" class="shop-link" onclick="event.stopPropagation()">詳細を見る</a>
            </div>
        `;

        listContainer.appendChild(card);
    });

    updateShopCount(filteredShops.length, allShops.length);
    console.log('List rendering complete');
}

// View switching functions
function switchToMapView() {
    document.getElementById('map').classList.add('active');
    document.getElementById('list-view').classList.remove('active');
    document.querySelectorAll('.view-tab').forEach(tab => {
        if (tab.dataset.view === 'map') {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    // Re-render map to ensure markers are visible
    renderMap();
}

function switchToListView() {
    document.getElementById('map').classList.remove('active');
    document.getElementById('list-view').classList.add('active');
    document.querySelectorAll('.view-tab').forEach(tab => {
        if (tab.dataset.view === 'list') {
            tab.classList.add('active');
        } else {
            tab.classList.remove('active');
        }
    });
    renderList();
}

// Format closed day text
function formatClosedDay(closed) {
    // closed が null の場合は不定休または無休を表す
    if (closed === null || closed === undefined || closed === '') {
        return '不定休';
    }
    
    let formatted = closed.toString();
    
    // "月曜日" → "月", "火曜日" → "火" など、曜日を削除して統一
    // "第1火曜日" → "第1火", "第3火曜日" → "第3火" などのパターンにも対応
    // "日曜日、祝日" → "日、祝日" のように複数の定休日にも対応
    formatted = formatted.replace(/([月火水木金土日])曜日/g, '$1');
    
    return formatted;
}

// Format hours string for display (convert 00:00 → 24:00, 01:00 → 25:00, etc.)
// これは古い hours テキスト用（後方互換性のため）
function formatHoursForDisplay(hours) {
    if (!hours) return hours;
    
    // Match time ranges like "17:00～00:00" or "18:00～01:00" or "20:00～05:00"
    // Only convert the end time (after ～) if it's 00:00-05:59
    return hours.replace(/(\d{1,2}):(\d{2})\s*[～~-]\s*(\d{1,2}):(\d{2})/g, (match, startH, startM, endH, endM) => {
        const startHour = parseInt(startH, 10);
        const endHour = parseInt(endH, 10);
        
        // Convert end time to 24+ hour format if it's 00:00-05:59
        // This indicates late night closing (next day)
        if (endHour >= 0 && endHour <= 5) {
            const newEndHour = 24 + endHour;
            return `${startH}:${startM}～${newEndHour}:${endM}`;
        }
        
        return match;
    });
}

// Format hours_structured data for display (convert 24:00 → 00:00, 25:00 → 01:00, etc.)
// hours_structured のデータは 24:00 表記だが、表示時は 00:00 表記に戻す
function formatHoursFromStructured(hoursStr) {
    if (!hoursStr) return hoursStr;
    
    // Match time ranges like "17:00～24:00" or "18:00～25:00" or "20:00～29:00"
    // 複数の時間帯がある場合（例: "10:00～15:00 / 18:00～22:00"）にも対応
    return hoursStr.replace(/(\d{1,2}):(\d{2})\s*[～~-]\s*(\d{1,2}):(\d{2})/g, (match, startH, startM, endH, endM) => {
        const startHour = parseInt(startH, 10);
        const endHour = parseInt(endH, 10);
        
        // Convert 24+ hour format back to 00:00-05:59 format
        // 24:00 → 00:00, 25:00 → 01:00, 26:00 → 02:00, etc.
        if (endHour >= 24 && endHour <= 29) {
            const newEndHour = endHour - 24;
            const newEndHourStr = newEndHour.toString().padStart(2, '0');
            return `${startH}:${startM}～${newEndHourStr}:${endM}`;
        }
        
        return match;
    });
}

// Get formatted hours for display from shop data
// hours_structured がある場合はそれを使用し、ない場合は hours テキストを使用
function getFormattedHours(shop) {
    if (shop.hours_structured && shop.hours_structured.text) {
        // hours_structured の text を使用（これは元の hours テキストと同じ）
        return formatHoursForDisplay(shop.hours_structured.text);
    }
    // フォールバック: hours テキストを使用
    return formatHoursForDisplay(shop.hours || '営業時間不明');
}

function createShopModalContent(shop) {
    // Get genre display text
    let genreDisplay = '';
    if (Array.isArray(shop.genre) && shop.genre.length > 0) {
        genreDisplay = shop.genre.join('、');
    } else if (shop.category) {
        genreDisplay = shop.category;
    }
    
    const closedDay = shop.hours_structured && shop.hours_structured.closed !== undefined 
        ? formatClosedDay(shop.hours_structured.closed) 
        : null;
    
    const displayHours = getFormattedHours(shop);
    
    return `
        <div class="shop-popup-content">
            <div class="shop-name">${shop.name}</div>
            ${genreDisplay ? `<div class="shop-category">${genreDisplay}</div>` : ''}
            <div class="shop-hours">${displayHours}</div>
            ${closedDay ? `<div class="shop-closed">定休日: ${closedDay}</div>` : ''}
            <div class="shop-address">${shop.address || '住所不明'}</div>
            <div class="shop-links">
                <a href="${shop.url}" target="_blank" class="shop-link">詳細を見る</a>
            </div>
        </div>
    `;
}

function showShopModal(shop) {
    const modal = document.getElementById('shop-modal');
    const modalContent = document.getElementById('shop-modal-content');
    
    // Get genre display text
    let genreDisplay = '';
    if (Array.isArray(shop.genre) && shop.genre.length > 0) {
        genreDisplay = shop.genre.join('、');
    } else if (shop.category) {
        genreDisplay = shop.category;
    }
    
    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>${shop.name}</h2>
            <button class="modal-close" onclick="closeShopModal()">&times;</button>
        </div>
        <div class="modal-body">
            <div class="shop-info">
                ${genreDisplay ? `
                <div class="info-item">
                    <strong>ジャンル:</strong> ${genreDisplay}
                </div>
                ` : ''}
                <div class="info-item">
                    <strong>営業時間:</strong> ${getFormattedHours(shop)}
                </div>
                ${(shop.hours_structured && shop.hours_structured.closed !== undefined) ? `
                <div class="info-item">
                    <strong>定休日:</strong> ${formatClosedDay(shop.hours_structured.closed)}
                </div>
                ` : ''}
                <div class="info-item">
                    <strong>住所:</strong> ${shop.address || '住所不明'}
                </div>
                ${shop.phone && shop.phone.trim() ? `
                <div class="info-item phone-item">
                    <strong>電話番号:</strong>
                    <div class="phone-container">
                        <span class="phone-number">${shop.phone}</span>
                        <button class="copy-phone-btn" onclick="copyPhoneNumber('${shop.phone.replace(/'/g, "\\'")}')" title="電話番号をコピー">
                            📋 コピー
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>
            <div class="shop-links-section">
                <h3>リンク</h3>
                <div class="links-grid">
                    <a href="${shop.url}" target="_blank" class="link-button">詳細ページ</a>
                    ${(shop.tabelogUrl && shop.tabelogUrl.trim()) || (shop.tabelog && shop.tabelog.trim()) ? `<a href="${shop.tabelogUrl || shop.tabelog}" target="_blank" class="link-button tabelog">食べログで見る</a>` : ''}
                </div>
            </div>
            ${(shop.sns && (shop.sns.twitter || shop.sns.instagram || shop.sns.facebook)) ? `
            <div class="sns-section">
                <h3>SNS</h3>
                <div class="sns-links">
                    ${shop.sns.twitter ? `<a href="${shop.sns.twitter.url}" target="_blank" class="sns-link twitter">X (Twitter): @${shop.sns.twitter.handle}</a>` : ''}
                    ${shop.sns.instagram ? `<a href="${shop.sns.instagram.url}" target="_blank" class="sns-link instagram">Instagram: @${shop.sns.instagram.handle}</a>` : ''}
                    ${shop.sns.facebook ? `<a href="${shop.sns.facebook.url}" target="_blank" class="sns-link facebook">Facebook: ${shop.sns.facebook.handle}</a>` : ''}
                </div>
            </div>
            ` : ''}
        </div>
    `;
    
    modal.style.display = 'block';
}

function copyPhoneNumber(phoneNumber) {
    // Remove any HTML entities and clean the phone number
    const cleanPhone = phoneNumber.replace(/&#39;/g, "'").trim();
    
    // Use Clipboard API if available
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(cleanPhone).then(() => {
            showCopyFeedback();
        }).catch(err => {
            console.error('Failed to copy:', err);
            fallbackCopyTextToClipboard(cleanPhone);
        });
    } else {
        // Fallback for older browsers
        fallbackCopyTextToClipboard(cleanPhone);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showCopyFeedback();
        } else {
            alert('コピーに失敗しました。手動でコピーしてください: ' + text);
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
        alert('コピーに失敗しました。手動でコピーしてください: ' + text);
    }
    
    document.body.removeChild(textArea);
}

function showCopyFeedback() {
    // Find the copy button and show feedback
    const copyBtn = document.querySelector('.copy-phone-btn');
    if (copyBtn) {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ コピーしました';
        copyBtn.style.backgroundColor = '#4caf50';
        
        setTimeout(() => {
            copyBtn.textContent = originalText;
            copyBtn.style.backgroundColor = '';
        }, 2000);
    }
}

function closeShopModal() {
    const modal = document.getElementById('shop-modal');
    modal.style.display = 'none';
}

function updateShopCount(displayed, total) {
    const countElement = document.getElementById('shop-count');
    if (countElement) {
        countElement.textContent = `表示中: ${displayed} / ${total}店舗`;
    }
}

// Helper to check openness
function isShopOpen(shop, day, time) {
    // Use structured hours if available
    if (shop.hours_structured && shop.hours_structured.parsed) {
        return isShopOpenStructured(shop, day, time);
    }
    
    // Fallback to text parsing
    const hoursText = shop.hours || "";
    if (!hoursText) return true; // If unknown, keep visible

    // 1. Check Day
    if (day) {
        if (!checkDay(hoursText, day)) return false;
    }

    // 2. Check Time
    if (time) {
        if (!checkTime(hoursText, time)) return false;
    }

    return true;
}

// Check openness using structured hours data
function isShopOpenStructured(shop, day, time) {
    const parsed = shop.hours_structured.parsed;
    if (!parsed || Object.keys(parsed).length === 0) return true;
    
    // Day mapping: Mon -> mon, etc.
    const dayMap = {
        'Mon': 'mon', 'Tue': 'tue', 'Wed': 'wed', 'Thu': 'thu',
        'Fri': 'fri', 'Sat': 'sat', 'Sun': 'sun'
    };
    
    // 1. Check Day
    if (day) {
        const dayKey = dayMap[day];
        if (!dayKey) return true; // Unknown day, keep visible
        
        // Check if shop is closed on this day
        if (shop.hours_structured.closed) {
            const closedDays = shop.hours_structured.closed;
            const closedDayMap = {
                '月': 'mon', '火': 'tue', '水': 'wed', '木': 'thu',
                '金': 'fri', '土': 'sat', '日': 'sun', '祝': 'holiday'
            };
            for (const [jp, en] of Object.entries(closedDayMap)) {
                if (closedDays.includes(jp) && dayKey === en) {
                    return false; // Shop is closed on this day
                }
            }
        }
        
        // Check if shop has hours for this day
        if (!parsed[dayKey] && !parsed.holiday) {
            // If no specific hours for this day, check if it's a general schedule
            // (applies to all days)
            const hasGeneralSchedule = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].some(d => parsed[d]);
            if (!hasGeneralSchedule) return true; // No schedule info, keep visible
            return false; // Has schedule but not for this day
        }
    }
    
    // 2. Check Time
    if (time) {
        const dayKey = day ? dayMap[day] : null;
        let timeStr = dayKey && parsed[dayKey] ? parsed[dayKey] : 
                       parsed.holiday ? parsed.holiday :
                       Object.values(parsed)[0]; // Use first available time
        
        if (!timeStr) return true; // No time info, keep visible
        
        // hours_structured のデータは既に 24:00 表記になっているので、そのまま使用
        // 検索時間（01:00 など）は checkTime 内で 25:00 形式に変換される
        
        if (!checkTime(timeStr, time)) return false;
    }
    
    return true;
}

function checkDay(text, dayCode) {
    // dayCode: Mon, Tue, ...
    const dayMap = { 'Mon': '月', 'Tue': '火', 'Wed': '水', 'Thu': '木', 'Fri': '金', 'Sat': '土', 'Sun': '日' };
    const jaDay = dayMap[dayCode];
    if (!jaDay) return true;

    // Ordered days for range expansion
    const daysOrder = ['月', '火', '水', '木', '金', '土', '日'];

    // Split text by common delimiters for multiple schedules
    // e.g. "月～金: 10:00..., 土: 12:00..."
    // Note: delimiters can be "、", " / ", " "
    // But sometimes "月～金、祝前日" means Mon-Fri AND PreHol.

    // Simplified logic:
    // If the text contains NO days at all (e.g. "17:00-24:00"), assume everyday.
    // Check if text has any day chars.
    const hasDays = /[月火水木金土日]/.test(text);
    if (!hasDays) return true; // No specific days mentioned, assume open.

    // If text mentions days, we must match.
    // Strategy: Split into segments that might differ.
    // "月～金：10-19、土：10-17"
    // segments: "月～金：10-19", "土：10-17"

    // If ANY segment allows the day, return true?
    // Be careful. "定休日：日曜日" means closed on Sunday.
    if (text.includes(`定休日`)) {
        // If "定休日: ... 日 ...", and we selected Sun, return false.
        // Extract the closed part.
        const closedMatch = text.match(/定休日[:：](.+?)(?:$|[\s、])/);
        if (closedMatch) {
            const closedText = closedMatch[1];
            if (isDayInText(closedText, jaDay, daysOrder)) return false;
        }
        // Proceed to check if it's open text
        // Usually if only "定休日" is listed, we assume open other days?
        // if text is just "定休日：日", then Mon is open.
        // If text also has "17:00-23:00", then it handles open times.
    }

    // Positive match
    // Does the text explicitly include the day in an open context?
    // Remove "定休日..." part to avoid false positives?
    const openText = text.replace(/定休日[:：].+?($|[\s、])/g, '');

    return isDayInText(openText, jaDay, daysOrder);
}

function isDayInText(text, jaDay, daysOrder) {
    // 1. Direct match: "月"
    // But avoid matching "1月" (January) if that appears? (Unlikely in hours string)

    // 2. Range match: "月～金"
    // Regex for ranges
    const rangeRegex = /([月火水木金土日])\s*[～~]\s*([月火水木金土日])/g;
    let match;
    while ((match = rangeRegex.exec(text)) !== null) {
        const start = match[1];
        const end = match[2];
        const startIdx = daysOrder.indexOf(start);
        const endIdx = daysOrder.indexOf(end);
        const targetIdx = daysOrder.indexOf(jaDay);

        if (startIdx !== -1 && endIdx !== -1 && targetIdx !== -1) {
            if (startIdx <= endIdx) {
                // Normal: Mon ~ Fri
                if (targetIdx >= startIdx && targetIdx <= endIdx) return true;
            } else {
                // Wrap: Fri ~ Mon (Fri, Sat, Sun, Mon)
                if (targetIdx >= startIdx || targetIdx <= endIdx) return true;
            }
        }
    }

    // 3. List match: "月・火" or just "月"
    // Remove ranges temporarily to avoid double counting? 
    // Actually, just checking bounds is enough.
    // Use simple char check, but ensuring it's not part of a broken range format?
    // E.g. "月" in "月～金" is handled by range. simple check covers it too?
    // No, "火" is NOT explicitly in "月～金" string, but implied.
    // So simple string.includes('火') fails for '月～金'.

    // If checking '火' and text is '月～金', regex matched above.
    // If checking '月' and text is '月～金', regex matched above.
    // So we only need to checking direct presence if it's NOT covered by range?
    // What about "月・水"?

    if (text.includes(jaDay)) return true;

    return false;
}

function checkTime(text, timeStr) {
    if (!timeStr) return true;
    // timeStr: "19:00" or "01:00" (user input)
    // text: "17:00～24:00" or "18:00～25:00" (hours_structured は既に 24:00 表記)
    
    // hours_structured のデータは既に 24:00 表記になっているので、そのまま使用
    // ただし、古いデータ（hours テキスト）の場合は formatHoursForDisplay で変換
    const formattedText = text.includes('～') || text.includes('~') || text.includes('-') 
        ? text 
        : formatHoursForDisplay(text);
    
    // Extract ranges (supports 24:00, 25:00, etc.)
    // 複数の時間帯がある場合（例: "10:00～15:00 / 18:00～22:00"）に対応
    const timeRanges = formattedText.match(/(\d{1,2}):(\d{2})\s*[～~-]\s*(\d{1,2}):(\d{2})/g);
    if (!timeRanges) return true; // No time info found, assume open?

    const [h, m] = timeStr.split(':').map(Number);
    let targetMins = h * 60 + m;
    
    // 検索時間が深夜時間（00:00-05:59）の場合、24+ 時間形式に変換
    // 例: 01:00 → 25:00 (1500分)、02:00 → 26:00 (1560分)
    if (h >= 0 && h <= 5) {
        targetMins = (24 + h) * 60 + m;
    }

    for (const range of timeRanges) {
        const parts = range.split(/[～~-]/);
        if (parts.length < 2) continue;

        const start = parseTime(parts[0].trim());
        const end = parseTime(parts[1].trim());

        if (start === null || end === null) continue;

        // start と end は分単位（24:00 = 1440分、25:00 = 1500分など）
        // hours_structured のデータは既に 24:00 表記なので、そのまま比較
        
        // 検索時間が営業時間範囲内かチェック
        if (targetMins >= start && targetMins < end) return true;
        
        // 通常形式（00:00-23:59）でもチェック（後方互換性のため）
        const normalTargetMins = h * 60 + m;
        if (normalTargetMins >= start && normalTargetMins < end) return true;
    }

    return false;
}

function parseTime(tStr) {
    tStr = tStr.trim();
    const [h, m] = tStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
    // Support 24+ hour format (24:00 = 1440, 25:00 = 1500, etc.)
    return h * 60 + m;
}

// Event Listeners
document.getElementById('filter-text').addEventListener('input', () => {
    renderMap();
    if (document.getElementById('list-view').classList.contains('active')) {
        renderList();
    }
});
document.getElementById('filter-category').addEventListener('change', () => {
    renderMap();
    if (document.getElementById('list-view').classList.contains('active')) {
        renderList();
    }
});
document.getElementById('filter-day').addEventListener('change', () => {
    renderMap();
    if (document.getElementById('list-view').classList.contains('active')) {
        renderList();
    }
});
document.getElementById('filter-time').addEventListener('input', () => {
    renderMap();
    if (document.getElementById('list-view').classList.contains('active')) {
        renderList();
    }
});
document.getElementById('reset-filters').addEventListener('click', () => {
    document.getElementById('filter-text').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-day').value = '';
    document.getElementById('filter-time').value = '';
    renderMap();
    if (document.getElementById('list-view').classList.contains('active')) {
        renderList();
    }
});

// View tab switching
document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const view = tab.dataset.view;
        if (view === 'map') {
            switchToMapView();
        } else if (view === 'list') {
            switchToListView();
        }
    });
});


// Make closeShopModal and copyPhoneNumber available globally
window.closeShopModal = closeShopModal;
window.copyPhoneNumber = copyPhoneNumber;

// Info Modal Functions
function showInfoModal(title, content) {
    const modal = document.getElementById('info-modal');
    const titleElement = document.getElementById('info-modal-title');
    const bodyElement = document.getElementById('info-modal-body');
    
    titleElement.textContent = title;
    bodyElement.innerHTML = content;
    modal.style.display = 'block';
}

function closeInfoModal() {
    const modal = document.getElementById('info-modal');
    modal.style.display = 'none';
}

// Make closeInfoModal available globally
window.closeInfoModal = closeInfoModal;

// Menu Toggle
document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.getElementById('menu-toggle');
    const headerNav = document.getElementById('header-nav');
    
    if (menuToggle && headerNav) {
        menuToggle.addEventListener('click', function() {
            menuToggle.classList.toggle('active');
            headerNav.classList.toggle('active');
        });
    }

    // Info modal links
    const aboutLink = document.getElementById('about-link');
    const privacyLink = document.getElementById('privacy-link');
    const contactLink = document.getElementById('contact-link');

    if (aboutLink) {
        aboutLink.addEventListener('click', function(e) {
            e.preventDefault();
            showInfoModal('このサイトについて', `
                <p>このサイトは、<strong>佐賀カチメシPay2</strong>の対象店舗を地図上で確認できる非公式のマップサイトです。</p>
                <p><strong>非公式サイトであること</strong></p>
                <p>このサイトは個人が運営する非公式のサイトです。佐賀市や佐賀カチメシPay事務局とは一切関係ありません。</p>
                <p>店舗情報は公式サイト（<a href="https://www.sagashi-insyoku.com/kachimeshi" target="_blank" rel="noopener noreferrer">https://www.sagashi-insyoku.com/kachimeshi</a>）を参考にしていますが、最新の情報については公式サイトをご確認ください。</p>
                <p>店舗の営業時間や定休日などの情報が変更されている可能性があります。実際にご利用の際は、各店舗に直接お問い合わせください。</p>
            `);
            menuToggle.classList.remove('active');
            headerNav.classList.remove('active');
        });
    }

    if (privacyLink) {
        privacyLink.addEventListener('click', function(e) {
            e.preventDefault();
            showInfoModal('プライバシーポリシー', `
                <p><strong>アクセスログについて</strong></p>
                <p>このサイトでは、サイトの運営・改善のため、アクセスログを取得しています。</p>
                <p>取得する情報には以下のようなものがあります：</p>
                <ul>
                    <li>アクセスした日時</li>
                    <li>アクセス元のIPアドレス</li>
                    <li>使用しているブラウザの種類</li>
                    <li>アクセスしたページのURL</li>
                </ul>
                <p>これらの情報は、サイトの利用状況の分析や、問題の解決のためにのみ使用されます。個人を特定できる情報の収集は行っておりません。</p>
            `);
            menuToggle.classList.remove('active');
            headerNav.classList.remove('active');
        });
    }

    if (contactLink) {
        contactLink.addEventListener('click', function(e) {
            e.preventDefault();
            showInfoModal('お問い合わせ先', `
                <p>このサイトに関するお問い合わせは、以下のGoogleフォームからお願いいたします。</p>
                <p style="text-align: center; margin: 20px 0;">
                    <a href="https://docs.google.com/forms/d/e/1FAIpQLSdXiwsfg34vKjdj8vVjlQZf1qYnyuAlhRM7Iim0cB66oGHI9Q/viewform" target="_blank" rel="noopener noreferrer" class="link-button" style="display: inline-block;">お問い合わせフォーム</a>
                </p>
                <p><small>※GitHubのIssueに直接記載頂いても構いません。<br>
                <a href="https://github.com/midnight480/saga-kachimeshi-map/issues/new" target="_blank" rel="noopener noreferrer">https://github.com/midnight480/saga-kachimeshi-map/issues/new</a></small></p>
            `);
            menuToggle.classList.remove('active');
            headerNav.classList.remove('active');
        });
    }
});

// Close info modal when clicking outside
window.onclick = function(event) {
    const shopModal = document.getElementById('shop-modal');
    const infoModal = document.getElementById('info-modal');
    if (event.target == shopModal) {
        closeShopModal();
    }
    if (event.target == infoModal) {
        closeInfoModal();
    }
}

// Current Location Control
const locateControl = L.Control.extend({
    options: {
        position: 'topright'
    },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
        container.style.backgroundColor = 'white';
        container.style.width = '30px';
        container.style.height = '30px';
        container.style.lineHeight = '30px';
        container.style.textAlign = 'center';
        container.style.cursor = 'pointer';
        container.innerHTML = '📍';
        container.title = "現在地を表示";

        container.onclick = function () {
            map.locate({ setView: true, maxZoom: 16 });
        }
        return container;
    }
});

map.addControl(new locateControl());

// Handle location found
map.on('locationfound', function (e) {
    const radius = e.accuracy / 2;
    L.circle(e.latlng, radius).addTo(map)
        .bindPopup("現在地 (" + radius + "m 以内)").openPopup();
});

map.on('locationerror', function (e) {
    alert("現在地を取得できませんでした: " + e.message);
});

