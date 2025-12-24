const fs = require('fs');
const NodeGeocoder = require('node-geocoder');

const DATA_FILE = 'docs/data/shops.json';

const geocoder = NodeGeocoder({
    provider: 'openstreetmap',
    // Optional: Add headers if needed
    headers: { 'User-Agent': 'SagaKachimeshiMap/1.0' },
    language: 'ja',
    email: 'test@example.com' // polite to provide email for OSM
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseHoursStructured(hoursStr) {
    if (!hoursStr) return null;
    const clean = hoursStr.replace(/：/g, ':').replace(/～/g, '~').replace(/\s+/g, ' ').trim();

    // Simple parser: Extract start and end time if looking standard "17:00 ~ 23:00"
    // Also extract days if present.

    const result = {
        text: hoursStr,
        isOpenToday: (day, time) => {
            // Placeholder logic for frontend use? No, this is for backend JSON.
            // We should output ranges.
            return true;
        },
        ranges: []
    };

    // Try to find time ranges
    // Regex for "HH:MM ~ HH:MM"
    const timeMatch = clean.match(/(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})/);
    if (timeMatch) {
        result.ranges.push({
            start: timeMatch[1],
            end: timeMatch[2]
        });
    }

    return result;
}

async function main() {
    if (!fs.existsSync(DATA_FILE)) {
        console.error('shops.json not found!');
        return;
    }

    const shops = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    console.log(`Loaded ${shops.length} shops.`);

    let updatedCount = 0;

    for (const shop of shops) {
        let modified = false;

        // 1. Refine Hours
        if (shop.hours && (!shop.hours_structured || !shop.hours_structured.ranges)) {
            shop.hours_structured = parseHoursStructured(shop.hours);
            modified = true;
        }

        // 2. Retry Geocoding if missing lat/lng but has address
        if (shop.address && (!shop.lat || !shop.lng)) {
            console.log(`Processing ${shop.name}: Address "${shop.address}"`);

            // cleanup strategies
            const cleanAddr = shop.address.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/[−－]/g, '-');
            // Strategy 1: Full address (clean)
            // Strategy 2: Cut after first space
            // Strategy 3: Append "Saga, Japan"? OpenStreetMap likes "City, Country" or local.

            const strategies = [
                cleanAddr,
                cleanAddr.split(' ')[0], // Remove building
                cleanAddr.split(' ')[0].replace(/(\d+-\d+)-\d+/, '$1'), // Remove sub-lot?
                // `佐賀県${cleanAddr}` // Prepend prefecture if missing? Most have it or City.
            ];

            for (const addr of strategies) {
                if (!addr || addr.length < 5) continue;
                console.log(`  Trying geocoding: ${addr}`);
                try {
                    const res = await geocoder.geocode(addr);
                    if (res && res.length > 0) {
                        shop.lat = res[0].latitude;
                        shop.lng = res[0].longitude;
                        console.log(`  -> SUCCESS: ${shop.lat}, ${shop.lng}`);
                        modified = true;
                        break;
                    }
                } catch (e) {
                    console.error(`  -> Error: ${e.message}`);
                }
                await sleep(1500);
            }
        }

        if (modified) updatedCount++;
    }

    if (updatedCount > 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(shops, null, 2));
        console.log(`Updated ${updatedCount} shops. Saved to ${DATA_FILE}.`);
    } else {
        console.log('No updates needed.');
    }
}

main();
