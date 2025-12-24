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

// Populate category filter dropdown
function populateCategoryFilter(shops) {
    const categorySelect = document.getElementById('filter-category');
    if (!categorySelect) return;
    
    // Extract unique categories
    const categories = [...new Set(shops
        .map(s => s.category)
        .filter(c => c && c.trim())
    )].sort();
    
    // Clear existing options (except the first "カテゴリー" option)
    categorySelect.innerHTML = '<option value="">カテゴリー</option>';
    
    // Add category options
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categorySelect.appendChild(option);
    });
    
    console.log(`Populated ${categories.length} categories:`, categories);
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

        // Category Filter
        if (filterCategory) {
            if (!shop.category || shop.category !== filterCategory) return false;
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

        // Category Filter
        if (filterCategory) {
            if (!shop.category || shop.category !== filterCategory) return false;
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

        card.innerHTML = `
            <div class="shop-name">${shop.name}</div>
            ${shop.category ? `<div class="shop-category">${shop.category}</div>` : ''}
            <div class="shop-info">
                <div class="shop-hours">${shop.hours || '営業時間不明'}</div>
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

function createShopModalContent(shop) {
    return `
        <div class="shop-popup-content">
            <div class="shop-name">${shop.name}</div>
            ${shop.category ? `<div class="shop-category">${shop.category}</div>` : ''}
            <div class="shop-hours">${shop.hours || '営業時間不明'}</div>
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
    
    modalContent.innerHTML = `
        <div class="modal-header">
            <h2>${shop.name}</h2>
            <button class="modal-close" onclick="closeShopModal()">&times;</button>
        </div>
        <div class="modal-body">
            ${shop.category ? `<div class="shop-category">${shop.category}</div>` : ''}
            <div class="shop-info">
                <div class="info-item">
                    <strong>営業時間:</strong> ${shop.hours || '営業時間不明'}
                </div>
                <div class="info-item">
                    <strong>住所:</strong> ${shop.address || '住所不明'}
                </div>
            </div>
            <div class="shop-links-section">
                <h3>リンク</h3>
                <div class="links-grid">
                    <a href="${shop.url}" target="_blank" class="link-button">詳細ページ</a>
                    ${shop.tabelogUrl && shop.tabelogUrl.trim() ? `<a href="${shop.tabelogUrl}" target="_blank" class="link-button tabelog">食べログで見る</a>` : ''}
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
    const hoursText = shop.hours || "";
    if (!hoursText) return true; // If unknown, keep visible? Or hide? Usually keep visible.

    // Normalize text
    // "月・火..." -> "月火..." for easier matching?
    // "月～金" -> need range expansion.

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
    // timeStr: "19:00"
    // text: "17:00 ～ 23:30"

    // Extract ranges
    const timeRanges = text.match(/(\d{1,2}:\d{2})\s*[～~-]\s*(\d{1,2}:\d{2})/g);
    if (!timeRanges) return true; // No time info found, assume open?

    const [h, m] = timeStr.split(':').map(Number);
    const targetMins = h * 60 + m;

    for (const range of timeRanges) {
        const parts = range.split(/[～~-]/);
        if (parts.length < 2) continue;

        const start = parseTime(parts[0]);
        let end = parseTime(parts[1]);

        if (start === null || end === null) continue;

        // Handle Late night: 26:00 or 02:00 (next day)
        // If end < start, add 24h?
        // Usually 17:00 - 02:00
        if (end < start) end += 24 * 60;

        // Check if target matches normal
        if (targetMins >= start && targetMins < end) return true;

        // Check if target is late night (e.g. searching for 01:00)
        // 01:00 becomes 25:00
        if ((targetMins + 24 * 60) >= start && (targetMins + 24 * 60) < end) return true;
    }

    return false;
}

function parseTime(tStr) {
    tStr = tStr.trim();
    const [h, m] = tStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return null;
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

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('shop-modal');
    if (event.target == modal) {
        closeShopModal();
    }
}

// Make closeShopModal available globally
window.closeShopModal = closeShopModal;

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

