const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

async function loadCookiesIfAvailable(page, cookiePath) {
  try {
    if (fs.existsSync(cookiePath)) {
      const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf8'));
      if (Array.isArray(cookies) && cookies.length) {
        await page.setCookie(...cookies);
      }
    }
  } catch (e) {
    // Non-fatal: continue without cookies
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 500;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 400);
    });
  });
}

// --- Keyword-based Facebook search for videos ---
async function scrapeFacebookVideosByKeyword(keyword) {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  const cookiePath = path.join(__dirname, 'cookies.json');
  await loadCookiesIfAvailable(page, cookiePath);

  // Use Facebook search for videos by keyword
  const searchUrl = `https://www.facebook.com/search/videos?q=${encodeURIComponent(keyword)}`;
  const resp = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Try to accept cookie dialog
  try {
    await page.waitForSelector('div[role="dialog"] button', { timeout: 5000 });
    const buttons = await page.$$('div[role="dialog"] button');
    for (const b of buttons) {
      const txt = await page.evaluate((el) => el.textContent?.toLowerCase() || '', b);
      if (txt.includes('allow') || txt.includes('accept') || txt.includes('agree')) {
        await b.click();
        break;
      }
    }
  } catch (_) {}

  // Aggressive scroll and attempt to expand content
  for (let i = 0; i < 5; i++) {
    try { await autoScroll(page); } catch (_) {}
    // Try clicking generic "See more"/"Show more" buttons to load more results
    try {
      const candidates = await page.$$('div[role="button"], a, button');
      for (const el of candidates) {
        const txt = await page.evaluate((node) => (node.textContent || '').toLowerCase(), el);
        if (/(see more|show more|load more)/i.test(txt)) {
          try { await el.click(); } catch (_) {}
        }
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 1200));
  }

  const html = await page.content();
  const $ = cheerio.load(html);

  // Collect links that look like Facebook video pages
  const links = new Set();
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;
    const full = href.startsWith('http') ? href : `https://www.facebook.com${href}`;
    const clean = full.split('?')[0];
    // Exclude generic landing pages
    const isVideoLike = (/\/videos\//.test(clean) || /\/reel\//.test(clean) || /\/watch\//.test(clean));
    const isLanding = /facebook\.com\/watch\/?$/.test(clean) || /facebook\.com\/search\/videos\/?$/.test(clean);
    if (isVideoLike && !isLanding) links.add(clean);
  });

  await browser.close();
  return { status: resp?.status?.() || null, links: Array.from(links) };
}

module.exports.scrapeFacebookVideosByKeyword = scrapeFacebookVideosByKeyword;

// --- Multi-keyword orchestrator ---
async function scrapeFacebookVideosByKeywords(keywords) {
  if (!Array.isArray(keywords) || keywords.length === 0) {
    throw new Error('scrapeFacebookVideosByKeywords requires a non-empty array of keywords');
  }
  // Run all keyword scrapes in parallel
  const settled = await Promise.all(
    keywords.map(async (kw) => {
      try {
        const { links } = await scrapeFacebookVideosByKeyword(kw);
        return [kw, links];
      } catch (_) {
        return [kw, []];
      }
    })
  );
  const results = Object.fromEntries(settled);
  return results;
}

// CLI: multiple keywords
if (require.main === module && process.argv.length > 2) {
  (async () => {
    const raw = process.argv.slice(2);
    const keywords = raw
      .flatMap((s) => s.split(','))
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      const results = await scrapeFacebookVideosByKeywords(keywords);
      for (const kw of keywords) {
        const links = results[kw] || [];
        console.log(`\nKeyword: ${kw}`);
        console.log(`Count: ${links.length}`);
        if (links.length) {
          console.log('Links:');
          for (const l of links) console.log(`- ${l}`);
        }
      }
    } catch (err) {
      console.error('Multi-keyword search failed:', err.message || err);
    }
  })();
}

module.exports.scrapeFacebookVideosByKeywords = scrapeFacebookVideosByKeywords;