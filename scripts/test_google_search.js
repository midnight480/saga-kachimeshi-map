const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36');

    const query = '青い月 佐賀 住所';
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;

    console.log(`Searching: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // Try to find address in Knowledge Graph or generic snippets
    const address = await page.evaluate(() => {
        // 1. Knowledge Graph (often has class LrzXr)
        const kg = document.querySelector('.LrzXr');
        if (kg) {
            const text = kg.textContent;
            if (text.includes('佐賀') || /\d/.test(text)) return text;
        }

        // 2. Look for "所在地" or "Address" label
        const all = document.querySelectorAll('*');
        for (const el of all) {
            if (el.textContent.trim() === '所在地' || el.textContent.trim() === '住所') {
                // Address often in next sibling or parent's next sibling
                let next = el.nextElementSibling;
                if (next && (next.textContent.includes('佐賀') || /\d/.test(next.textContent))) return next.textContent;

                // Check parent's text
                if (el.parentElement && el.parentElement.textContent.length < 100) return el.parentElement.textContent.replace('所在地', '').replace('住所', '').trim();
            }
        }

        // 3. Generic text search for likely address pattern "佐賀市...番号"
        // Google often formats addresses like "〒840-0826 佐賀県佐賀市..."
        // Or in map snippets
        for (const el of all) {
            // Optimization: skip script/style/hidden
            if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
            // Check leaf nodes
            if (el.children.length === 0) {
                const text = el.textContent;
                // Matches "佐賀県佐賀市..." or "佐賀市..." and has digits
                if ((text.includes('佐賀県') || text.includes('佐賀市')) && /\d/.test(text) && text.length < 50) {
                    return text;
                }
            }
        }

        return null;
    });

    console.log(`Found Address: ${address}`);
    await browser.close();
})();
