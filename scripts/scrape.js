const puppeteer = require('puppeteer');
const NodeGeocoder = require('node-geocoder');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Initialize Geocoder
const geocoder = NodeGeocoder({
    provider: 'openstreetmap',
    headers: {
        'User-Agent': 'SagaKachimeshiMapApp/1.0'
    }
});

const BASE_URL = 'https://www.sagashi-insyoku.com';
const TARGET_URL = `${BASE_URL}/kachimeshi`;
const DATA_FILE = path.join(__dirname, '../docs/data/shops.json');

// Helper for delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Check if coordinates are in Saga area (rough bounds)
function isInSagaArea(lat, lng) {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return false;
    // Saga city approximate bounds: lat 32.8-33.5, lng 130.1-130.5
    return lat >= 32.8 && lat <= 33.5 && lng >= 130.1 && lng <= 130.5;
}

// Google Maps API function to get coordinates from Place ID
async function getCoordinatesFromPlaceId(placeId, apiKey = null) {
    if (!apiKey) {
        // Try to get from environment variable
        apiKey = process.env.GOOGLE_MAPS_API_KEY;
    }
    
    if (!apiKey) {
        console.log('    Google Maps API key not found, skipping Place ID lookup');
        return null;
    }

    try {
        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${apiKey}`;
        const response = await axios.get(url, { timeout: 5000 });
        
        if (response.data && response.data.result && response.data.result.geometry) {
            const location = response.data.result.geometry.location;
            return {
                lat: location.lat,
                lng: location.lng
            };
        }
    } catch (error) {
        console.error(`    Error fetching coordinates from Place ID: ${error.message}`);
    }
    
    return null;
}

// Extract Place ID or coordinates from Google Maps URL
function extractPlaceInfoFromUrl(url) {
    if (!url) return null;
    
    // Pattern 1: /place/PLACE_NAME/@lat,lng,zoom - extract coordinates directly
    const coordsMatch = url.match(/\/place\/[^/]+\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
    if (coordsMatch) {
        return {
            type: 'coordinates',
            lat: parseFloat(coordsMatch[1]),
            lng: parseFloat(coordsMatch[2])
        };
    }
    
    // Pattern 2: /place/PLACE_NAME+PLACE_ID - extract Place ID
    const placeMatch = url.match(/\/place\/[^/]+\+([^/?]+)/);
    if (placeMatch) {
        return {
            type: 'place_id',
            placeId: placeMatch[1]
        };
    }
    
    // Pattern 3: ?cid=CID - this is not a Place ID, but we can try to get coordinates from the URL
    // Note: cid is Customer ID, not Place ID, so we can't use it with Places API
    // But we can try to follow the URL and extract coordinates
    const cidMatch = url.match(/[?&]cid=([^&]+)/);
    if (cidMatch) {
        return {
            type: 'cid',
            cid: cidMatch[1]
        };
    }
    
    return null;
}

// Helper to parse business hours
function parseHours(hoursStr) {
    if (!hoursStr) return null;
    const result = {};
    // Normalize
    const clean = hoursStr.replace(/：/g, ':').replace(/～/g, '~').replace(/\s+/g, ' ').trim();

    // Simple parser for standard formats
    // "Mon-Fri: 10:00-19:00"
    // "月～金: 17:00-24:00"

    const daysMap = {
        '月': 'Mon', '火': 'Tue', '水': 'Wed', '木': 'Thu', '金': 'Fri', '土': 'Sat', '日': 'Sun',
        '祝': 'Hol', '祝前': 'PreHol'
    };

    // If string contains multiple segments separated by "、" or ","
    const segments = clean.split(/[,、]/);

    // Default: if no day specified, assume all days? Or just store as "General"
    // Many strings are just "17:00 ~ 23:00" -> Apply to all days?
    // Let's store "raw" and structured "details"

    // This is complex. For now, let's try to extract time ranges and associate with found days.
    // If no days found, apply to Mon-Sun.

    return {
        text: hoursStr,
        // complex parsing omitted for brevity, will refine if needed
    };
}

// Helper to normalize address
function normalizeAddress(addr) {
    if (!addr) return '';
    return addr.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[−－]/g, '-')
        .replace(/\s+/g, ' ')
        .trim();
}

async function googleSearchFallback(page, shopName) {
    const queries = [
        `${shopName} 佐賀 住所`,
        `${shopName} 佐賀県`,
        `${shopName} 佐賀市`,
        `"${shopName}" 佐賀 所在地`
    ];

    for (const query of queries) {
        const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        console.log(`    Running Google Search: ${url}`);

        try {
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            await sleep(1000); // Wait for page to fully render
            
            const address = await page.evaluate(() => {
                // 1. Knowledge Graph (multiple selectors)
                const kgSelectors = [
                    '.LrzXr',
                    '[data-attrid*="address"]',
                    '[data-attrid*="location"]',
                    '.BNeawe.s3v9rd.AP7Wnd',
                    '.BNeawe.iBp4i.AP7Wnd'
                ];
                
                for (const selector of kgSelectors) {
                    const kg = document.querySelector(selector);
                    if (kg) {
                        const text = kg.textContent.trim();
                        if ((text.includes('佐賀') || text.includes('神埼') || text.includes('鳥栖') || text.includes('小城')) && /\d/.test(text)) {
                            if (text.length < 100 && !text.includes('Pay') && !text.includes('カチメシ') && !text.includes('求人')) {
                                // Extract just the address part
                                const addrMatch = text.match(/([佐賀神埼鳥栖小城][^。\n]{0,50}\d+[^。\n]{0,30})/);
                                if (addrMatch) {
                                    return addrMatch[1].trim();
                                }
                                return text;
                            }
                        }
                    }
                }

                // 2. Look for structured data in search results
                const searchResults = document.querySelectorAll('.g, .tF2Cxc, .yuRUbf');
                for (const result of searchResults) {
                    const text = result.textContent;
                    // Look for address patterns
                    const addrPatterns = [
                        /(佐賀[県市][^。\n]{0,50}\d+[丁目-]?\d+[^。\n]{0,20})/,
                        /(神埼[^。\n]{0,50}\d+[丁目-]?\d+[^。\n]{0,20})/,
                        /(〒\d{3}-?\d{4}\s*[佐賀神埼鳥栖小城][^。\n]{0,50})/,
                        /(所在地[：:]\s*[佐賀神埼鳥栖小城][^。\n]{0,50}\d+[^。\n]{0,20})/
                    ];
                    
                    for (const pattern of addrPatterns) {
                        const match = text.match(pattern);
                        if (match) {
                            let addr = match[1].replace(/^(所在地|住所)[：:]\s*/i, '').trim();
                            if (addr.length > 5 && addr.length < 100 && !addr.includes('Pay') && !addr.includes('カチメシ')) {
                                return addr;
                            }
                        }
                    }
                }

                // 3. Look for "所在地" or "住所" label
                const all = document.querySelectorAll('*');
                for (const el of all) {
                    const text = el.textContent.trim();
                    if (text === '所在地' || text === '住所' || text === 'Address' || text.match(/^所在地[：:]/) || text.match(/^住所[：:]/)) {
                        // Check next sibling
                        let next = el.nextElementSibling;
                        if (next) {
                            const nextText = next.textContent.trim();
                            if ((nextText.includes('佐賀') || nextText.includes('神埼') || nextText.includes('鳥栖')) && /\d/.test(nextText) && nextText.length < 100) {
                                if (!nextText.includes('Pay') && !nextText.includes('カチメシ') && !nextText.includes('求人')) {
                                    return nextText;
                                }
                            }
                        }
                        // Check parent's text
                        if (el.parentElement) {
                            const parentText = el.parentElement.textContent.trim();
                            const addr = parentText.replace(/^(所在地|住所|Address)[：:]\s*/i, '').trim();
                            if ((addr.includes('佐賀') || addr.includes('神埼') || addr.includes('鳥栖')) && /\d/.test(addr) && addr.length < 100) {
                                if (!addr.includes('Pay') && !addr.includes('カチメシ') && !addr.includes('求人')) {
                                    // Extract address part
                                    const addrMatch = addr.match(/([佐賀神埼鳥栖小城][^。\n]{0,50}\d+[^。\n]{0,30})/);
                                    if (addrMatch) {
                                        return addrMatch[1].trim();
                                    }
                                    return addr;
                                }
                            }
                        }
                    }
                }

                // 4. Search for address pattern in visible text (more aggressive)
                for (const el of all) {
                    if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'HEAD', 'META', 'LINK'].includes(el.tagName)) continue;
                    const text = el.textContent.trim();
                    // More flexible pattern matching
                    if ((text.includes('佐賀県') || text.includes('佐賀市') || text.includes('神埼') || text.includes('鳥栖')) && /\d/.test(text) && text.length < 100 && text.length > 5) {
                        if (!text.includes('Pay') && !text.includes('カチメシ') && !text.includes('求人') && !text.includes('電話')) {
                            // Check if it looks like an address
                            if (/\d+[丁目-]?\d+/.test(text) || /〒/.test(text) || /\d+-\d+/.test(text) || text.match(/佐賀[県市][^。]{0,40}\d+/)) {
                                // Extract address part
                                const addrMatch = text.match(/([佐賀神埼鳥栖小城][^。\n]{0,50}\d+[^。\n]{0,30})/);
                                if (addrMatch) {
                                    return addrMatch[1].trim();
                                }
                                return text;
                            }
                        }
                    }
                }

                return null;
            });
            
            if (address) {
                console.log(`    FOUND address with query "${query}": ${address}`);
                return address;
            }
            
            await sleep(1500); // Delay between queries
        } catch (e) {
            console.error(`    Google Search Error for "${query}": ${e.message}`);
            // Continue to next query
        }
    }
    
    return null;
}


async function main() {
    console.log("Starting scraper with Puppeteer...");
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Set User Agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36');
    page.on('console', msg => {
        const text = msg.text();
        if (text.startsWith('PAGE LOG:')) console.log(text);
    });

    try {
        // 1. Fetch List of Shops
        console.log(`Navigating to list page: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });

        // Extract links - Wait for page to fully load
        await sleep(3000); // Give page time to load dynamic content
        
        // Extract shop info from list page (name, category, link)
        const shopListData = await page.evaluate((baseUrl) => {
            const shops = [];
            const uniqueLinks = new Set();
            
            // Method 1: Direct href matching
            const anchors = Array.from(document.querySelectorAll('a[href*="/restaurants/"]'));
            anchors.forEach(a => {
                let href = a.getAttribute('href');
                if (href) {
                    if (!href.startsWith('http')) {
                        href = baseUrl + (href.startsWith('/') ? '' : '/') + href;
                    }
                    // Normalize URL (remove fragments, query params if not needed)
                    const url = new URL(href);
                    url.hash = '';
                    const normalizedUrl = url.toString();
                    uniqueLinks.add(normalizedUrl);
                    
                    // Try to extract shop name and category from the link context
                    const linkText = a.textContent.trim();
                    const parent = a.parentElement;
                    const nextSibling = parent ? parent.nextElementSibling : null;
                    let category = '';
                    
                    // Look for category text (usually after shop name)
                    if (nextSibling) {
                        category = nextSibling.textContent.trim();
                    } else if (parent) {
                        // Category might be in the same parent
                        const parentText = parent.textContent.trim();
                        const parts = parentText.split(/\s+/);
                        if (parts.length > 1) {
                            category = parts.slice(1).join(' ');
                        }
                    }
                    
                    if (linkText && linkText.length > 0) {
                        shops.push({
                            name: linkText,
                            category: category,
                            url: normalizedUrl
                        });
                    }
                }
            });
            
            // Method 2: Look for links in text content that might be restaurant pages
            const allLinks = Array.from(document.querySelectorAll('a'));
            allLinks.forEach(a => {
                const href = a.getAttribute('href');
                if (href && (href.includes('/restaurants/') || href.includes('/restaurant/'))) {
                    if (!href.startsWith('http')) {
                        const fullUrl = baseUrl + (href.startsWith('/') ? '' : '/') + href;
                        const url = new URL(fullUrl);
                        url.hash = '';
                        uniqueLinks.add(url.toString());
                    } else {
                        const url = new URL(href);
                        url.hash = '';
                        uniqueLinks.add(url.toString());
                    }
                }
            });
            
            return {
                links: Array.from(uniqueLinks),
                shopList: shops
            };
        }, BASE_URL);
        
        const links = shopListData.links;
        const shopListMap = new Map(shopListData.shopList.map(s => [s.url, s]));

        console.log(`Found ${links.length} shops.`);
        const shops = [];

        // 2. Iterate and Scrape each shop
        // Limit to first 3 for testing? No, user wants all.
        // But for "Implement Data Scraper" task, I should verify it works.
        // I'll fetch all.

        // Debug subset?
        // const targetLinks = links.slice(0, 5);
        const targetLinks = links;

        for (const [index, link] of targetLinks.entries()) {
            console.log(`[${index + 1}/${targetLinks.length}] Scraping ${link}...`);

            try {
                let retryCount = 0;
                const maxRetries = 3;
                let data = null;

                while (retryCount < maxRetries && !data) {
                try {
                    // Wait before navigation to avoid frame detachment
                    await sleep(1000);
                    
                    // Navigate with better error handling
                    try {
                        await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });
                    } catch (navError) {
                        if (navError.message.includes('detached') || navError.message.includes('frame')) {
                            console.log(`    Navigation error (attempt ${retryCount + 1}), retrying...`);
                            await sleep(2000);
                            retryCount++;
                            continue;
                        }
                        throw navError;
                    }

                    // Wait for page to stabilize
                    await sleep(1500);

                    // Extract Data
                    data = await page.evaluate(() => {
                    // Name: OGP title is usually best
                    let name = document.querySelector('meta[property="og:title"]')?.content;
                    if (!name) {
                        name = document.title.split('|')[0].trim();
                    }

                    let address = '';
                    let hours = '';
                    let googleMapUrl = '';
                    let tabelogUrl = '';
                    let lat = null;
                    let lng = null;

                    // Try to parse Wix Warmup Data first (most reliable for this site)
                    const wixDataScript = document.getElementById('wix-warmup-data');
                    if (wixDataScript) {
                        try {
                            const wixData = JSON.parse(wixDataScript.textContent);

                            // Recursive function to search for VALUES matching criteria
                            const findValues = (obj, predicate) => {
                                let results = [];
                                if (!obj) return results;

                                if (typeof obj === 'string') {
                                    if (predicate(obj)) results.push(obj);
                                    return results;
                                }

                                if (typeof obj === 'object') {
                                    for (const k in obj) {
                                        results = results.concat(findValues(obj[k], predicate));
                                    }
                                }
                                return results;
                            };

                            // Predicate for Address
                            // Matches strings containing '佐賀' and digit, maybe wrapped in HTML
                            const addressPredicate = (val) => {
                                if (val.length > 500) return false; // Avoid huge blocks
                                // Strip HTML to check text content
                                let text = val;
                                if (val.includes('<')) {
                                    try {
                                        const doc = new DOMParser().parseFromString(val, 'text/html');
                                        text = doc.body.textContent || "";
                                    } catch (e) { }
                                }
                                text = text.trim();
                                if (text.length < 5) return false;

                                // Exclude invalid patterns
                                if (text.includes('Pay') || text.includes('カチメシ') || text.includes('詳細') || text.includes('MAP')) return false;

                                return (text.startsWith('佐賀') || text.startsWith('神埼') || text.startsWith('小城') || text.startsWith('鳥栖')) && /\d/.test(text);
                            };

                            // Predicate for Hours
                            const hoursPredicate = (val) => {
                                if (val.length > 500) return false;
                                let text = val;
                                if (val.includes('<')) {
                                    try {
                                        const doc = new DOMParser().parseFromString(val, 'text/html');
                                        text = doc.body.textContent || "";
                                    } catch (e) { }
                                }
                                text = text.trim();
                                return (text.includes('～') || text.includes('~')) && /\d{1,2}:\d{2}/.test(text);
                            };

                            const addressCandidates = findValues(wixData, addressPredicate);
                            const hoursCandidates = findValues(wixData, hoursPredicate);

                            if (addressCandidates.length > 0) {
                                let val = addressCandidates[0];
                                if (val.includes('<')) {
                                    const doc = new DOMParser().parseFromString(val, 'text/html');
                                    address = doc.body.textContent.trim();
                                } else {
                                    address = val.trim();
                                }
                                // console.log('PAGE LOG: Accepted Address: ' + address);
                            }

                            if (hoursCandidates.length > 0) {
                                let val = hoursCandidates[0];
                                if (val.includes('<')) {
                                    const doc = new DOMParser().parseFromString(val, 'text/html');
                                    hours = doc.body.textContent.trim();
                                } else {
                                    hours = val.trim();
                                }
                            }

                        } catch (e) {
                            console.error('Error parsing wix-warmup-data:', e.message);
                        }
                    }

                    // Extract Google Maps and Tabelog URLs
                    const allLinks = document.querySelectorAll('a[href]');
                    for (const link of allLinks) {
                        const href = link.getAttribute('href');
                        if (href) {
                            if (href.includes('google.com/maps') || href.includes('maps.google.com')) {
                                googleMapUrl = href;
                                // Try to extract lat/lng from Google Maps URL
                                // Pattern 1: /@lat,lng,zoom
                                const coordsMatch = href.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                                if (coordsMatch) {
                                    lat = parseFloat(coordsMatch[1]);
                                    lng = parseFloat(coordsMatch[2]);
                                }
                                // Pattern 2: ?q=lat,lng or ?q=address&ll=lat,lng
                                if (!lat || !lng) {
                                    const qMatch = href.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                                    if (qMatch) {
                                        lat = parseFloat(qMatch[1]);
                                        lng = parseFloat(qMatch[2]);
                                    }
                                }
                                // Pattern 3: &ll=lat,lng
                                if (!lat || !lng) {
                                    const llMatch = href.match(/[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                                    if (llMatch) {
                                        lat = parseFloat(llMatch[1]);
                                        lng = parseFloat(llMatch[2]);
                                    }
                                }
                                // Pattern 4: cid=... (Place ID) - we can't extract coords from this, need to follow the link
                            } else if (href.includes('tabelog.com')) {
                                tabelogUrl = href;
                            }
                        }
                    }

                    if (address && hours) return { name, address, hours, googleMapUrl, tabelogUrl, lat, lng };

                    // Method: Extract all text and search line by line (like Python script)
                    if (!address) {
                        const allText = document.body.textContent || document.body.innerText || '';
                        const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                        
                        for (const line of lines) {
                            // Look for address starting with 佐賀市 or 佐賀県
                            if (line.startsWith('佐賀市') || line.startsWith('佐賀県') || line.startsWith('神埼') || line.startsWith('鳥栖') || line.startsWith('小城')) {
                                // Check if it contains numbers (likely an address)
                                if (/\d/.test(line)) {
                                    // Exclude invalid patterns
                                    if (!line.includes('Pay') && !line.includes('カチメシ') && !line.includes('求人') && !line.includes('電話番号') && line.length < 100) {
                                        // Extract address part (before phone number if present)
                                        // Phone pattern: \d{2,4}-\d{2}-\d{4}
                                        const phoneMatch = line.match(/(\d{2,4}-\d{2}-\d{4})/);
                                        if (phoneMatch) {
                                            // Split at phone number
                                            const parts = line.split(phoneMatch[0]);
                                            address = parts[0].trim();
                                        } else {
                                            address = line;
                                        }
                                        break;
                                    }
                                }
                            }
                        }
                    }

                    // Look for "Information" section explicitly
                    if (!address) {
                        // Method 1: Look for heading containing "Information" or "情報"
                        const infoHeadings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [class*="info"], [class*="Information"]'));
                        for (const heading of infoHeadings) {
                            const headingText = heading.textContent.trim().toLowerCase();
                            if (headingText.includes('information') || headingText.includes('情報') || headingText.includes('店舗情報')) {
                                // Look for address in the same section
                                let current = heading.nextElementSibling;
                                let section = heading.parentElement;
                                
                                // Check siblings and children
                                const checkElement = (el) => {
                                    const text = el.textContent.trim();
                                    if ((text.includes('佐賀') || text.includes('神埼') || text.includes('鳥栖') || text.includes('小城')) && /\d/.test(text) && text.length < 100 && text.length > 5) {
                                        if (!text.includes('Pay') && !text.includes('カチメシ') && !text.includes('求人')) {
                                            // Extract address pattern
                                            const addrMatch = text.match(/([佐賀神埼鳥栖小城][^。\n]{0,50}\d+[^。\n]{0,30})/);
                                            if (addrMatch) {
                                                return addrMatch[1].trim();
                                            }
                                            return text;
                                        }
                                    }
                                    return null;
                                };
                                
                                // Check next siblings
                                for (let i = 0; i < 10 && current; i++) {
                                    const found = checkElement(current);
                                    if (found) {
                                        address = found;
                                        break;
                                    }
                                    current = current.nextElementSibling;
                                }
                                
                                // Check section children
                                if (!address && section) {
                                    const children = section.querySelectorAll('*');
                                    for (const child of children) {
                                        const found = checkElement(child);
                                        if (found) {
                                            address = found;
                                            break;
                                        }
                                    }
                                }
                                
                                if (address) break;
                            }
                        }
                        
                        // Method 2: Look for "所在地" or "住所" labels in Information context
                        const addressLabels = document.querySelectorAll('*');
                        for (const el of addressLabels) {
                            const text = el.textContent.trim();
                            if (text === '所在地' || text === '住所' || text === 'Address' || text.match(/^所在地[：:]/) || text.match(/^住所[：:]/)) {
                                // Check if in Information section
                                let parent = el.parentElement;
                                let isInInfoSection = false;
                                while (parent) {
                                    const parentText = parent.textContent.toLowerCase();
                                    if (parentText.includes('information') || parentText.includes('情報') || parentText.includes('店舗情報')) {
                                        isInInfoSection = true;
                                        break;
                                    }
                                    parent = parent.parentElement;
                                }
                                
                                if (isInInfoSection || !address) {
                                    // Check next sibling
                                    let next = el.nextElementSibling;
                                    if (next) {
                                        const nextText = next.textContent.trim();
                                        if ((nextText.includes('佐賀') || nextText.includes('神埼') || nextText.includes('鳥栖')) && /\d/.test(nextText) && nextText.length < 100) {
                                            if (!nextText.includes('Pay') && !nextText.includes('カチメシ')) {
                                                address = nextText;
                                                break;
                                            }
                                        }
                                    }
                                    // Check parent's text
                                    if (!address && el.parentElement) {
                                        const parentText = el.parentElement.textContent.trim();
                                        const addr = parentText.replace(/^(所在地|住所|Address)[：:]\s*/i, '').trim();
                                        if ((addr.includes('佐賀') || addr.includes('神埼') || addr.includes('鳥栖')) && /\d/.test(addr) && addr.length < 100) {
                                            if (!addr.includes('Pay') && !addr.includes('カチメシ')) {
                                                const addrMatch = addr.match(/([佐賀神埼鳥栖小城][^。\n]{0,50}\d+[^。\n]{0,30})/);
                                                if (addrMatch) {
                                                    address = addrMatch[1].trim();
                                                } else {
                                                    address = addr;
                                                }
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    return { name, address, hours, googleMapUrl, tabelogUrl, lat, lng };
                    });
                    
                    // Successfully extracted data
                    break;
                } catch (evalError) {
                    if (evalError.message.includes('detached') || evalError.message.includes('frame')) {
                        console.log(`    Frame detached error (attempt ${retryCount + 1}), retrying...`);
                        retryCount++;
                        await sleep(2000);
                        // Try to reload the page
                        try {
                            await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
                            await sleep(1500);
                        } catch (reloadError) {
                            // If reload fails, try navigating again
                            await sleep(2000);
                        }
                        continue;
                    }
                    throw evalError;
                }
            }

            if (!data) {
                console.error(`    Failed to extract data after ${maxRetries} attempts`);
                continue;
            }

            // Address Fallback: Google Search (with retry)
            if (!data.address || !data.address.trim()) {
                    console.log(`    Missing address for ${data.name}, trying Google Search...`);
                    try {
                        const fallbackAddress = await googleSearchFallback(page, data.name);
                        if (fallbackAddress) {
                            console.log(`    FOUND via Google: ${fallbackAddress}`);
                            data.address = fallbackAddress;
                        } else {
                            // Retry with different query format
                            console.log(`    Retrying Google Search with different query...`);
                            const retryQuery = `${data.name} 佐賀県`;
                            const retryAddress = await googleSearchFallback(page, retryQuery);
                            if (retryAddress) {
                                console.log(`    FOUND via Google (retry): ${retryAddress}`);
                                data.address = retryAddress;
                            }
                        }
                    } catch (searchErr) {
                        console.error(`    Google Search error: ${searchErr.message}`);
                    }
                    await sleep(2000); // Delay between searches
                }

                // Get category from list page if available
                const listInfo = shopListMap.get(link);
                
                // Post-processing
                let shop = {
                    name: data.name || listInfo?.name || "Unknown",
                    url: link,
                    address: normalizeAddress(data.address), // Normalize
                    hours: data.hours,
                    // Parse hours
                    hours_structured: parseHours(data.hours),
                    lat: data.lat || null,
                    lng: data.lng || null,
                    category: listInfo?.category || null,
                    googleMapUrl: data.googleMapUrl || null,
                    tabelogUrl: data.tabelogUrl || null
                };

                // Geocoding - Priority: Get coordinates for all shops with addresses
                // First, try to get coordinates from Google Maps URL
                if (!shop.lat || !shop.lng) {
                    if (shop.googleMapUrl) {
                        const placeInfo = extractPlaceInfoFromUrl(shop.googleMapUrl);
                        if (placeInfo) {
                            if (placeInfo.type === 'coordinates') {
                                // Direct coordinates from URL
                                shop.lat = placeInfo.lat;
                                shop.lng = placeInfo.lng;
                                console.log(`    -> Coordinates from Google Maps URL: [${shop.lat}, ${shop.lng}]`);
                            } else if (placeInfo.type === 'place_id') {
                                // Place ID - use Google Maps API
                                console.log(`    Trying to get coordinates from Google Maps Place ID: ${placeInfo.placeId}`);
                                const coords = await getCoordinatesFromPlaceId(placeInfo.placeId);
                                if (coords) {
                                    shop.lat = coords.lat;
                                    shop.lng = coords.lng;
                                    console.log(`    -> Coordinates from Google Maps API: [${shop.lat}, ${shop.lng}]`);
                                }
                            } else if (placeInfo.type === 'cid') {
                                // CID - try to get coordinates by following the URL
                                console.log(`    Google Maps URL has CID, trying to extract coordinates from page...`);
                                try {
                                    await page.goto(shop.googleMapUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                                    await sleep(2000);
                                    const urlCoords = await page.evaluate(() => {
                                        // Check if URL contains coordinates
                                        const url = window.location.href;
                                        const match = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
                                        if (match) {
                                            return {
                                                lat: parseFloat(match[1]),
                                                lng: parseFloat(match[2])
                                            };
                                        }
                                        return null;
                                    });
                                    if (urlCoords) {
                                        shop.lat = urlCoords.lat;
                                        shop.lng = urlCoords.lng;
                                        console.log(`    -> Coordinates from Google Maps page: [${shop.lat}, ${shop.lng}]`);
                                    }
                                    // Navigate back to shop page
                                    await page.goto(link, { waitUntil: 'networkidle2', timeout: 60000 });
                                    await sleep(1500);
                                } catch (urlErr) {
                                    console.error(`    Error extracting coordinates from Google Maps URL: ${urlErr.message}`);
                                }
                            }
                        }
                    }
                }
                
                // Validate coordinates if they exist
                if (shop.lat && shop.lng) {
                    if (!isInSagaArea(shop.lat, shop.lng)) {
                        console.log(`    -> Invalid coordinates detected: [${shop.lat}, ${shop.lng}] (outside Saga area)`);
                        console.log(`    -> Re-geocoding from address: ${shop.address}`);
                        // Reset coordinates to force re-geocoding
                        shop.lat = null;
                        shop.lng = null;
                    } else {
                        console.log(`    -> Valid coordinates: [${shop.lat}, ${shop.lng}]`);
                    }
                }
                
                // Geocode if we don't have valid coordinates
                if (!shop.lat || !shop.lng) {
                    if (!shop.address || !shop.address.trim()) {
                        console.warn(`    Warning: No address found for ${shop.name}.`);
                    } else {
                        try {
                        console.log(`    Geocoding: ${shop.address}`);
                        const geoRes = await geocoder.geocode(shop.address);
                        if (geoRes && geoRes.length > 0) {
                            shop.lat = geoRes[0].latitude;
                            shop.lng = geoRes[0].longitude;
                            console.log(`    -> SUCCESS: [${shop.lat}, ${shop.lng}]`);
                        } else {
                            // Try cleaning address - multiple strategies
                            let cleanAddr = shop.address.split(' ')[0].split('　')[0];
                            // Remove building names and floor numbers
                            cleanAddr = cleanAddr.replace(/\s*[A-Za-z0-9]+ビル.*$/i, '');
                            cleanAddr = cleanAddr.replace(/\s*\d+F.*$/i, '');
                            cleanAddr = cleanAddr.replace(/\s*\d+階.*$/i, '');
                            cleanAddr = cleanAddr.replace(/\s*[A-Za-z0-9]+マンション.*$/i, '');
                            cleanAddr = cleanAddr.replace(/[，,].*$/, ''); // Remove after comma

                            const strategies = [
                                cleanAddr,
                                cleanAddr.replace(/\s*[A-Za-z0-9]+$/, ''), // Remove trailing alphanumeric
                                cleanAddr.match(/(佐賀[県市]?[^0-9]*\d+[丁目-]?\d+)/)?.[1] || cleanAddr, // Extract city + street
                                cleanAddr.replace(/\d+-\d+-\d+/, (m) => m.split('-').slice(0, 2).join('-')), // Remove sub-lot
                            ].filter(addr => addr && addr.length > 5 && addr !== shop.address);

                            let geocoded = false;
                            for (const strategyAddr of strategies) {
                                if (geocoded) break;
                                try {
                                    console.log(`    Retrying geocoding with: ${strategyAddr}`);
                                    const retryRes = await geocoder.geocode(strategyAddr);
                                    if (retryRes && retryRes.length > 0) {
                                        shop.lat = retryRes[0].latitude;
                                        shop.lng = retryRes[0].longitude;
                                        console.log(`    -> SUCCESS: [${shop.lat}, ${shop.lng}]`);
                                        geocoded = true;
                                    }
                                    await sleep(1000); // Delay between attempts
                                } catch (e) {
                                    // Continue to next strategy
                                }
                            }

                            if (!geocoded) {
                                console.warn(`    Geocoding failed for ${shop.address}`);
                            }
                        }
                        } catch (geoErr) {
                            console.error(`    Geocoding Error: ${geoErr.message}`);
                        }
                        await sleep(1500); // Delay to avoid rate limiting
                        
                        // Validate geocoded coordinates
                        if (shop.lat && shop.lng) {
                            if (!isInSagaArea(shop.lat, shop.lng)) {
                                console.warn(`    -> Geocoded coordinates are outside Saga area: [${shop.lat}, ${shop.lng}]`);
                                console.warn(`    -> Retrying with cleaned address...`);
                                // Try one more time with a simpler address
                                try {
                                    const simpleAddr = shop.address.split(/[，,、]/)[0].trim();
                                    if (simpleAddr && simpleAddr !== shop.address) {
                                        const retryGeo = await geocoder.geocode(simpleAddr);
                                        if (retryGeo && retryGeo.length > 0) {
                                            const retryLat = retryGeo[0].latitude;
                                            const retryLng = retryGeo[0].longitude;
                                            if (isInSagaArea(retryLat, retryLng)) {
                                                shop.lat = retryLat;
                                                shop.lng = retryLng;
                                                console.log(`    -> SUCCESS after retry: [${shop.lat}, ${shop.lng}]`);
                                            } else {
                                                console.warn(`    -> Retry also failed. Keeping original coordinates.`);
                                            }
                                        }
                                        await sleep(1500);
                                    }
                                } catch (retryErr) {
                                    console.warn(`    -> Retry failed: ${retryErr.message}`);
                                }
                            } else {
                                console.log(`    -> Valid coordinates confirmed: [${shop.lat}, ${shop.lng}]`);
                            }
                        }
                    }
                }

                shops.push(shop);
                console.log(`    -> Saved: ${shop.name} | ${shop.address || 'NO ADDR'} | [${shop.lat || '?'}, ${shop.lng || '?'}]`);

            } catch (pageErr) {
                console.error(`    Error scraping page: ${pageErr.message}`);
                // Continue to next shop
            }
            // Increase delay slightly
            await sleep(1500);

            // Incremental Save
            if ((index + 1) % 5 === 0 || (index + 1) === targetLinks.length) {
                const uniqueShops = Array.from(new Map(shops.map(item => [item.url, item])).values());
                const dir = path.dirname(DATA_FILE);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(DATA_FILE, JSON.stringify(uniqueShops, null, 2));
                console.log(`    [Auto-Save] Saved ${uniqueShops.length} shops.`);
            }
        }

        // 3. Save to File
        // Deduplicate
        const uniqueShops = Array.from(new Map(shops.map(item => [item.url, item])).values());

        // Ensure directory exists
        const dir = path.dirname(DATA_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(DATA_FILE, JSON.stringify(uniqueShops, null, 2));
        console.log(`Successfully saved ${uniqueShops.length} unique shops to ${DATA_FILE}`);

    } catch (error) {
        console.error("Fatal Error:", error);
    } finally {
        await browser.close();
    }
}

main();
