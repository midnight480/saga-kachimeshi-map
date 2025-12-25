/**
 * Tabelogから営業時間と支払い情報を取得するスクリプト
 * 
 * ⚠️ 注意: Tabelogの利用規約を確認してください。
 * このスクリプトは個人利用を想定しています。
 * 大量のリクエストを送信する場合は、適切な間隔を空けてください。
 * 
 * 使用方法:
 *   node scripts/update-tabelog-hours.js              # 全店舗を処理
 *   node scripts/update-tabelog-hours.js --test       # テストモード（5店舗のみ）
 *   node scripts/update-tabelog-hours.js --limit=3   # 指定数の店舗のみ処理
 *   node scripts/update-tabelog-hours.js --dry-run    # ドライランモード（保存しない）
 */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../docs/data/shops.json');

// Helper for delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Parse business hours from Tabelog format
function parseTabelogHours(hoursText) {
  if (!hoursText || !hoursText.trim()) return null;

  const result = {
    text: hoursText.trim(),
    parsed: {},
    closed: null
  };

  // Normalize text
  const normalized = hoursText
    .replace(/：/g, ':')
    .replace(/～/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // Day mappings
  const dayMap = {
    '月': 'mon',
    '火': 'tue',
    '水': 'wed',
    '木': 'thu',
    '金': 'fri',
    '土': 'sat',
    '日': 'sun',
    '祝': 'holiday',
    '祝日': 'holiday'
  };

  // Extract closed days
  const closedPatterns = [
    /定休日[：:]\s*([月火水木金土日祝]+)/,
    /休業日[：:]\s*([月火水木金土日祝]+)/,
    /([月火水木金土日祝]+)曜日?定休/,
    /([月火水木金土日祝]+)曜日?休/
  ];

  for (const pattern of closedPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      result.closed = match[1];
      break;
    }
  }

  // Extract time ranges for each day
  // Pattern: "月～金: 11:00-14:00, 17:00-22:00" or "月: 11:00-14:00"
  const dayTimePattern = /([月火水木金土日祝]+)[～〜-]?([月火水木金土日祝]+)?[：:]\s*([\d:,\s-]+)/g;
  let match;

  while ((match = dayTimePattern.exec(normalized)) !== null) {
    const startDay = match[1];
    const endDay = match[2] || startDay;
    const timeStr = match[3].trim();

    // Get day range
    const dayKeys = Object.keys(dayMap);
    const startIdx = dayKeys.indexOf(startDay);
    const endIdx = dayKeys.indexOf(endDay);

    if (startIdx !== -1) {
      const days = startIdx <= endIdx
        ? dayKeys.slice(startIdx, endIdx + 1)
        : [...dayKeys.slice(startIdx), ...dayKeys.slice(0, endIdx + 1)];

      // Parse time ranges (e.g., "11:00-14:00, 17:00-22:00")
      const timeRanges = timeStr.split(/[,、]/).map(t => t.trim()).filter(t => t);
      const formattedTime = timeRanges.join(' / ');

      days.forEach(day => {
        if (dayMap[day]) {
          result.parsed[dayMap[day]] = formattedTime;
        }
      });
    }
  }

  // If no structured parsing, try to extract general hours
  if (Object.keys(result.parsed).length === 0) {
    const generalTimePattern = /(\d{1,2}):(\d{2})\s*[-～〜]\s*(\d{1,2}):(\d{2})/;
    const timeMatch = normalized.match(generalTimePattern);
    if (timeMatch) {
      const timeStr = `${timeMatch[1].padStart(2, '0')}:${timeMatch[3]}-${timeMatch[2].padStart(2, '0')}:${timeMatch[4]}`;
      // Apply to all days if no specific day mentioned
      ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach(day => {
        result.parsed[day] = timeStr;
      });
    }
  }

  return Object.keys(result.parsed).length > 0 || result.closed ? result : null;
}

// Extract business hours and payment info from Tabelog page
async function extractTabelogInfo(page, tabelogUrl) {
  try {
    console.log(`    Accessing Tabelog: ${tabelogUrl}`);
    await page.goto(tabelogUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(2000); // Wait for page to load

    const info = await page.evaluate(() => {
      const result = {
        hours: null,
        hoursText: null,
        payment: null,
        phone: null
      };

      // Extract business hours
      // Tabelog typically has hours in various locations
      const hoursSelectors = [
        '.rdheader-subinfo__table .rdheader-subinfo__table-item:has(.rdheader-subinfo__table-title:contains("営業時間"))',
        '.rdheader-subinfo__table .rdheader-subinfo__table-item:has(.rdheader-subinfo__table-title:contains("営業"))',
        '[data-detail="hours"]',
        '.rstinfo-table tr:has(th:contains("営業時間"))',
        '.rstinfo-table tr:has(th:contains("営業"))'
      ];

      // Try to find hours text
      const allText = document.body.textContent || '';
      const hoursPatterns = [
        /営業時間[：:]\s*([^\n]{10,200})/,
        /営業[：:]\s*([^\n]{10,200})/
      ];

      for (const pattern of hoursPatterns) {
        const match = allText.match(pattern);
        if (match && match[1]) {
          const hoursText = match[1].trim();
          // Clean up the text
          const cleaned = hoursText
            .replace(/\s+/g, ' ')
            .replace(/定休日.*$/, '')
            .trim();
          if (cleaned.length > 5 && cleaned.length < 200) {
            result.hoursText = cleaned;
            break;
          }
        }
      }

      // Try to find structured hours in table
      const tables = document.querySelectorAll('.rstinfo-table, .rdheader-subinfo__table');
      for (const table of tables) {
        const rows = table.querySelectorAll('tr, .rdheader-subinfo__table-item');
        for (const row of rows) {
          const text = row.textContent || '';
          if (text.includes('営業時間') || text.includes('営業')) {
            const timeCell = row.querySelector('td, .rdheader-subinfo__table-data');
            if (timeCell) {
              const timeText = timeCell.textContent.trim();
              if (timeText.length > 5 && timeText.length < 200) {
                result.hoursText = timeText;
                break;
              }
            }
          }
        }
        if (result.hoursText) break;
      }

      // Extract payment methods
      const paymentPatterns = [
        /支払方法[：:]\s*([^\n]{5,100})/,
        /支払[：:]\s*([^\n]{5,100})/
      ];

      for (const pattern of paymentPatterns) {
        const match = allText.match(pattern);
        if (match && match[1]) {
          result.payment = match[1].trim();
          break;
        }
      }

      // Try to find payment in table
      for (const table of tables) {
        const rows = table.querySelectorAll('tr, .rdheader-subinfo__table-item');
        for (const row of rows) {
          const text = row.textContent || '';
          if (text.includes('支払') || text.includes('決済')) {
            const paymentCell = row.querySelector('td, .rdheader-subinfo__table-data');
            if (paymentCell) {
              result.payment = paymentCell.textContent.trim();
              break;
            }
          }
        }
        if (result.payment) break;
      }

      // Extract phone number
      const phonePattern = /(\d{2,4}[-\s]?\d{2,4}[-\s]?\d{3,4})/;
      const phoneMatch = allText.match(phonePattern);
      if (phoneMatch) {
        result.phone = phoneMatch[1].replace(/\s/g, '-');
      }

      return result;
    });

    return info;
  } catch (error) {
    console.error(`    Error extracting Tabelog info: ${error.message}`);
    return null;
  }
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  const testMode = args.includes('--test') || args.includes('-t');
  const limitArg = args.find(arg => arg.startsWith('--limit=')) || args.find(arg => arg.startsWith('-l='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : (testMode ? 5 : null);
  const dryRun = args.includes('--dry-run') || args.includes('-d');

  if (testMode || limit) {
    console.log(`🧪 TEST MODE: Processing ${limit || 5} shops only`);
  }
  if (dryRun) {
    console.log(`🔍 DRY RUN MODE: No changes will be saved`);
  }

  console.log('Reading shops data...');
  const shops = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

  // Filter shops with Tabelog URLs
  const shopsWithTabelog = shops.filter(shop => {
    const tabelogUrl = shop.tabelog || shop.tabelogUrl;
    return tabelogUrl && tabelogUrl.includes('tabelog.com');
  });

  // Limit for test mode
  const targetShops = limit ? shopsWithTabelog.slice(0, limit) : shopsWithTabelog;

  console.log(`Found ${shopsWithTabelog.length} shops with Tabelog URLs`);
  if (limit) {
    console.log(`Processing first ${limit} shops for testing`);
  }
  console.log('Starting browser...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  let updatedCount = 0;
  let skippedCount = 0;

  for (const [index, shop] of targetShops.entries()) {
    const tabelogUrl = shop.tabelog || shop.tabelogUrl;
    
    console.log(`[${index + 1}/${shopsWithTabelog.length}] Processing: ${shop.name}`);

    // Skip if hours already exist and are not empty
    if (shop.hours && shop.hours.trim() && shop.hours_structured) {
      console.log(`    Skipping (already has hours): ${shop.hours.substring(0, 50)}...`);
      skippedCount++;
      continue;
    }

    try {
      const info = await extractTabelogInfo(page, tabelogUrl);

      if (info && info.hoursText) {
        console.log(`    ✓ Found hours: ${info.hoursText.substring(0, 60)}...`);
        if (info.payment) {
          console.log(`    ✓ Found payment: ${info.payment}`);
        }
        if (info.phone) {
          console.log(`    ✓ Found phone: ${info.phone}`);
        }

        if (!dryRun) {
          // Update shop data
          const shopIndex = shops.findIndex(s => s.url === shop.url);
          if (shopIndex !== -1) {
            shops[shopIndex].hours = info.hoursText;
            shops[shopIndex].hours_structured = parseTabelogHours(info.hoursText);

            // Update payment info if available
            if (info.payment && !shops[shopIndex].payment) {
              shops[shopIndex].payment = info.payment;
            }

            // Update phone if missing
            if (info.phone && !shops[shopIndex].phone) {
              shops[shopIndex].phone = info.phone;
            }

            updatedCount++;
          }
        } else {
          console.log(`    [DRY RUN] Would update: ${shop.name}`);
          updatedCount++;
        }
      } else {
        console.log(`    ✗ No hours found on Tabelog`);
      }

      // Delay between requests
      await sleep(2000);

      // Save periodically (skip in dry-run mode)
      if (!dryRun && (index + 1) % 10 === 0) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(shops, null, 2));
        console.log(`    [Auto-Save] Progress saved`);
      }
    } catch (error) {
      console.error(`    Error processing ${shop.name}: ${error.message}`);
    }
  }

  // Final save (skip in dry-run mode)
  if (!dryRun) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(shops, null, 2));
  } else {
    console.log('\n[DRY RUN] No changes were saved to file');
  }

  console.log('\n=== Summary ===');
  console.log(`Total shops processed: ${targetShops.length}`);
  if (limit) {
    console.log(`(Test mode: limited to ${limit} shops)`);
  }
  console.log(`Updated: ${updatedCount}`);
  console.log(`Skipped (already has hours): ${skippedCount}`);
  console.log(`Failed: ${targetShops.length - updatedCount - skippedCount}`);

  await browser.close();
  console.log('Done!');
}

main().catch(console.error);

