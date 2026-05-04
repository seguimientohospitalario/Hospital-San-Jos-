const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const ESSALUD_URL = 'https://dondemeatiendo.essalud.gob.pe/#/consulta';
const BROWSER_MAX_AGE_MS = 10 * 60 * 1000;  // Reciclar cada 10 min
const POOL_SIZE = parseInt(process.env.POOL_SIZE || '1', 10); // Reducido a 1 por defecto para Render Free
const MAX_RETRIES = 2;

// ── SINGLETON DE BROWSER ──────────────────────────────────────────────────────
let browserInstance = null;
let browserLaunchTime = null;

async function getBrowser() {
    const now = Date.now();
    const isStale = browserLaunchTime && (now - browserLaunchTime > BROWSER_MAX_AGE_MS);

    if (browserInstance && !isStale) {
        try {
            await browserInstance.version();
            return browserInstance;
        } catch {
            browserInstance = null;
        }
    }

    if (browserInstance) {
        for (const p of warmPool) {
            try { await p.close(); } catch {}
        }
        warmPool.length = 0;
        try { await browserInstance.close(); } catch {}
    }

    console.log(`[${new Date().toISOString()}] [Browser] Lanzando Chromium (pool=${POOL_SIZE})...`);
    browserInstance = await puppeteer.launch({
        headless: "new",
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions',
            '--no-first-run',
            '--no-default-browser-check',
            '--single-process',
            '--disable-background-timer-throttling',
            '--memory-pressure-off',
            '--disable-features=TranslateUI',
            '--disable-component-update',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-ipc-flooding-protection',
            '--js-flags=--max-old-space-size=256',
        ]
    });
    browserLaunchTime = Date.now();
    console.log(`[${new Date().toISOString()}] [Browser] Listo.`);

    _fillPool();
    return browserInstance;
}

// ── POOL DE PÁGINAS PRECALENTADAS ─────────────────────────────────────────────
const warmPool = [];
let fillingPool = false;

async function createWarmPage() {
    let page = null;
    try {
        const browser = browserInstance;
        if (!browser) return null;

        page = await browser.newPage();
        
        // Timeouts más largos para entornos lentos
        page.setDefaultTimeout(35000);
        await page.setViewport({ width: 800, height: 600 });

        await page.setRequestInterception(true);
        page.on('request', req => {
            const type = req.resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        console.log(`[${new Date().toISOString()}] [Pool] Navegando a EsSalud...`);
        await page.goto(ESSALUD_URL, { waitUntil: 'domcontentloaded', timeout: 45000 });

        // Esperar a que el selector esté listo con un margen amplio
        await page.waitForSelector('input[formcontrolname="documento"]', { timeout: 30000 });

        return page;
    } catch (err) {
        console.warn(`[${new Date().toISOString()}] [Pool] Error precalentando página:`, err.message);
        if (page) try { await page.close(); } catch {}
        return null;
    }
}

async function _fillPool() {
    if (fillingPool) return;
    fillingPool = true;
    try {
        while (warmPool.length < POOL_SIZE && browserInstance) {
            const page = await createWarmPage();
            if (page) {
                warmPool.push(page);
                console.log(`[${new Date().toISOString()}] [Pool] Página caliente lista. Pool: ${warmPool.length}/${POOL_SIZE}`);
            } else {
                break;
            }
            // Pequeño respiro para el CPU entre creaciones
            await new Promise(r => setTimeout(r, 2000));
        }
    } finally {
        fillingPool = false;
    }
}

async function getPage() {
    await getBrowser();

    if (warmPool.length > 0) {
        const page = warmPool.shift();
        console.log(`[${new Date().toISOString()}] [Pool] Usando página caliente. Restantes: ${warmPool.length}`);
        _fillPool().catch(() => {});
        return { page, wasWarm: true };
    }

    console.log(`[${new Date().toISOString()}] [Pool] Pool vacío o cargando, creando página de emergencia...`);
    const page = await createWarmPage();
    if (!page) throw new Error('No se pudo crear una página de scraping (Timeout en carga inicial)');
    return { page, wasWarm: false };
}

async function recyclePage(page) {
    if (!page || page.isClosed()) return;
    if (warmPool.length >= POOL_SIZE) {
        try { await page.close(); } catch {}
        return;
    }
    try {
        await page.goto(ESSALUD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForSelector('input[formcontrolname="documento"]', { timeout: 20000 });
        warmPool.push(page);
        console.log(`[${new Date().toISOString()}] [Pool] Página reciclada. Pool: ${warmPool.length}/${POOL_SIZE}`);
    } catch {
        try { await page.close(); } catch {}
        _fillPool().catch(() => {});
    }
}

// ── SCRAPER PRINCIPAL CON REINTENTOS ──────────────────────────────────────────
async function validarSeguro(dni, cui, fecha_nacimiento) {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const t0 = Date.now();
        let page = null;
        let wasWarm = false;

        try {
            ({ page, wasWarm } = await getPage());
            console.log(`[${new Date().toISOString()}] [Scraper] Intento ${attempt}/${MAX_RETRIES} DNI:${dni} | ${wasWarm ? 'Página caliente ✓' : 'Página nueva'}`);

            // Usar page.type para mayor realismo en entornos lentos
            await page.click('input[formcontrolname="documento"]', { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type('input[formcontrolname="documento"]', dni, { delay: 30 });

            await page.click('input[formcontrolname="digito"]', { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type('input[formcontrolname="digito"]', cui, { delay: 30 });

            await page.click('input[formcontrolname="fechaNacimiento"]', { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type('input[formcontrolname="fechaNacimiento"]', fecha_nacimiento, { delay: 30 });

            // Aceptar política
            try {
                const check = await page.$('input[formcontrolname="politicaPrivacidad"]');
                if (check) await check.click();
            } catch {
                await page.evaluate(() => {
                    const span = document.querySelector('.texto-acepto');
                    if (span) span.click();
                });
            }

            // Manejo de Modal "Aceptar"
            try {
                await page.waitForSelector('.mat-mdc-dialog-content, .mat-dialog-content, .modal-body', { timeout: 6000 });
                await page.evaluate(async () => {
                    const modal = document.querySelector('.mat-mdc-dialog-content, .mat-dialog-content, .modal-body');
                    if (modal) {
                        modal.scrollTo(0, modal.scrollHeight + 1000);
                        await new Promise(r => setTimeout(r, 800));
                    }
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Aceptar'));
                    if (btn && !btn.disabled) btn.click();
                });
                // Esperar a que el modal desaparezca
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                // Modal puede no salir o ya haber sido aceptado
            }

            // Click Consultar
            try {
                const btnConsultar = await page.evaluateHandle(() =>
                    Array.from(document.querySelectorAll('button'))
                        .find(b => b.textContent.toLowerCase().includes('consultar'))
                );
                if (btnConsultar) await btnConsultar.click();
                else await page.click('button.ess-btn-primary');
            } catch {
                try { await page.click('button.ess-btn-primary'); } catch {}
            }

            // Resultado u Resultado Error
            const outcome = await page.waitForFunction(() => {
                const textL = document.body.innerText.toLowerCase();
                if (document.querySelector('.table-responsive, app-resultado')
                    || textL.includes('afiliado a')
                    || textL.includes('no tiene derecho de cobertura')) return 'success';
                const swal = document.querySelector('.swal2-html-container');
                if (swal && swal.innerText.trim()) return 'error_swal';
                if (textL.includes('incorrectos') || textL.includes('no encontrado') || textL.includes('captcha')) return 'error_text';
                return false;
            }, { timeout: 40000 }).then(r => r.jsonValue()).catch(() => 'timeout');

            console.log(`[${new Date().toISOString()}] [Scraper] DNI:${dni} → ${outcome} (${Date.now() - t0}ms)`);

            if (outcome === 'success') {
                const bodyText = await page.evaluate(() => document.body.innerText);
                const lines = bodyText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                let afiliado_a = null;

                for (let i = 0; i < lines.length; i++) {
                    const ll = lines[i].toLowerCase();
                    if (ll.includes('no tiene derecho de cobertura')) {
                        recyclePage(page).catch(() => {});
                        return { success: true, data: 'NO TIENE DERECHO DE COBERTURA' };
                    }
                    if (ll.includes('afiliado a')) {
                        if (ll.includes(':')) {
                            const parts = lines[i].split(':');
                            if (parts.length > 1 && parts[1].trim().length > 0) {
                                afiliado_a = parts[1].trim(); break;
                            }
                        }
                        if (i + 1 < lines.length) {
                            afiliado_a = lines[i + 1].trim();
                            if (!afiliado_a.includes(':') && afiliado_a.length < 50) break;
                        }
                    }
                }
                recyclePage(page).catch(() => {});
                return { success: true, data: afiliado_a || 'Sin información detallada' };
            }

            if (outcome === 'error_swal' || outcome === 'error_text') {
                const errorText = await page.evaluate(() => {
                    const swal = document.querySelector('.swal2-html-container');
                    if (swal) return swal.innerText;
                    for (const el of document.querySelectorAll('mat-error, .alert, span, div')) {
                        const txt = (el.innerText || '').toLowerCase();
                        if (txt.includes('incorrectos') || txt.includes('no encontrado') || txt.includes('captcha')) return el.innerText;
                    }
                    return 'Error en la consulta';
                });

                recyclePage(page).catch(() => {});
                if (errorText.toLowerCase().includes('captcha')) {
                    return { success: false, error: 'CAPTCHA_REQUIRED', message: 'Se detectó CAPTCHA' };
                }
                return { success: false, error: 'CONSULTA_ERROR', message: errorText };
            }

            // Si es timeout, cerramos y reintentamos
            throw new Error('Tiempo de espera agotado esperando resultados');

        } catch (error) {
            console.error(`[${new Date().toISOString()}] [Scraper] Error intento ${attempt}:`, error.message);
            if (page) try { await page.close(); } catch {}
            lastError = { success: false, error: 'SCRAPER_ERROR', message: error.message };
            
            if (attempt < MAX_RETRIES) {
                console.log(`[${new Date().toISOString()}] [Scraper] Reintentando en 3s...`);
                await new Promise(r => setTimeout(r, 3000));
            }
        }
    }

    return lastError || { success: false, error: 'SCRAPER_ERROR', message: 'Fallo tras reintentos' };
}

module.exports = { validarSeguro };

