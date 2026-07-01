import puppeteer from '@cloudflare/puppeteer';

// Harde restrictie: deze worker mag NOOIT naar een ander domein dan scoutinghub.nl.
const ALLOWED_BASE = 'https://www.scoutinghub.nl';

// Vaste, vooraf goedgekeurde schermen — geen vrije URL-invoer toegestaan.
const SCREENS = {
  dashboard: '/#dashboard',
  spelers: '/#database',
  programma: '/#programma',
  ritten: '/#ritten',
  tips: '/#tips',
  toernooien: '/#toernooien',
  login: '/'
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response('', { status: 204, headers: CORS });
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ ok: false, error: 'Gebruik POST' }), { status: 405, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
    if (env.RATE_LIMIT) {
      try {
        const key = 'rl:shot:' + ip;
        const cur = await env.RATE_LIMIT.get(key);
        const n = cur ? parseInt(cur, 10) : 0;
        if (n >= 20) {
          return new Response(JSON.stringify({ ok: false, error: 'Te veel screenshots aangevraagd, probeer later opnieuw.' }), { status: 429, headers: { 'Content-Type': 'application/json', ...CORS } });
        }
        await env.RATE_LIMIT.put(key, String(n + 1), { expirationTtl: 3600 });
      } catch (_) {}
    }

    let body = {};
    try { body = await request.json(); } catch (_) {}
    const screenKey = String(body.screen || 'dashboard').trim();
    const path = SCREENS[screenKey];
    if (!path) {
      return new Response(JSON.stringify({ ok: false, error: 'Onbekend scherm. Toegestaan: ' + Object.keys(SCREENS).join(', ') }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    }
    // Extra veiligheidsslot: target-URL wordt altijd server-side samengesteld uit ALLOWED_BASE, nooit uit input.
    const targetUrl = ALLOWED_BASE + path;

    if (!env.DEMO_EMAIL || !env.DEMO_PASSWORD) {
      return new Response(JSON.stringify({ ok: false, error: 'DEMO_EMAIL/DEMO_PASSWORD niet ingesteld op deze worker.' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    let browser;
    try {
      browser = await puppeteer.launch(env.MYBROWSER);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });

      await page.goto(ALLOWED_BASE + '/', { waitUntil: 'networkidle0', timeout: 30000 });

      if (screenKey !== 'login') {
        // Landingpagina toont geen loginformulier direct — eerst op "Inloggen" klikken om het overlay te openen.
        await page.waitForSelector('.lp-nav-login', { timeout: 10000 });
        await page.click('.lp-nav-login');
        await page.waitForSelector('#login-email', { visible: true, timeout: 10000 });
        await page.type('#login-email', env.DEMO_EMAIL, { delay: 15 });
        await page.type('#login-pw', env.DEMO_PASSWORD, { delay: 15 });
        await Promise.all([
          page.click('#login-btn'),
          page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 20000 }).catch(() => {})
        ]);
        await new Promise((r) => setTimeout(r, 1500)); // extra tijd voor auth-redirect/app-boot
        await page.goto(targetUrl, { waitUntil: 'networkidle0', timeout: 20000 });
        await new Promise((r) => setTimeout(r, 1200)); // extra render-tijd voor SPA
      }

      const shot = await page.screenshot({ type: 'png' });
      await browser.close();

      const bytes = new Uint8Array(shot);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
      }
      const b64 = btoa(binary);
      return new Response(JSON.stringify({ ok: true, b64, screen: screenKey }), { headers: { 'Content-Type': 'application/json', ...CORS } });
    } catch (err) {
      try { if (browser) await browser.close(); } catch (_) {}
      return new Response(JSON.stringify({ ok: false, error: 'Screenshot mislukt: ' + (err && err.message ? err.message : 'onbekende fout') }), { status: 502, headers: { 'Content-Type': 'application/json', ...CORS } });
    }
  }
};
