const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../docs/data/shops.json');

// Parse business hours into structured format
function parseBusinessHours(hoursStr) {
    if (!hoursStr || !hoursStr.trim()) return null;

    const normalized = hoursStr
        .replace(/：/g, ':')
        .replace(/～/g, '-')
        .replace(/\s+/g, ' ')
        .trim();

    const result = {
        raw: hoursStr,
        days: [],
        hours: []
    };

    // Day mappings
    const dayMap = {
        '月': 'Mon', '火': 'Tue', '水': 'Wed', '木': 'Thu', '金': 'Fri', '土': 'Sat', '日': 'Sun',
        '祝': 'Holiday', '祝日': 'Holiday', '祝前': 'PreHoliday'
    };

    // Extract time ranges (HH:MM - HH:MM or HH:MM-HH:MM)
    const timePattern = /(\d{1,2}):(\d{2})\s*[-~～]\s*(\d{1,2}):(\d{2})/g;
    const times = [];
    let match;
    while ((match = timePattern.exec(normalized)) !== null) {
        times.push({
            open: `${match[1].padStart(2, '0')}:${match[2]}`,
            close: `${match[3].padStart(2, '0')}:${match[4]}`
        });
    }

    // Extract days
    const foundDays = [];
    for (const [jp, en] of Object.entries(dayMap)) {
        if (normalized.includes(jp)) {
            foundDays.push(en);
        }
    }

    // If no specific days found, assume all days
    if (foundDays.length === 0 && times.length > 0) {
        result.days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    } else {
        result.days = foundDays;
    }

    result.hours = times;

    return result;
}

// Main processing
function processShopsData() {
    console.log('Reading shops data...');
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    console.log(`Processing ${data.length} shops...`);
    const processed = data.map(shop => {
        const structured = parseBusinessHours(shop.hours);
        return {
            ...shop,
            hours_structured: structured
        };
    });

    console.log('Writing processed data...');
    fs.writeFileSync(DATA_FILE, JSON.stringify(processed, null, 2));
    console.log(`Successfully processed ${processed.length} shops`);

    // Show sample
    console.log('\nSample output:');
    console.log(JSON.stringify(processed[0], null, 2));
}

processShopsData();
