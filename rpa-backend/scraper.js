const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const ESSALUD_URL = 'https://dondemeatiendo.essalud.gob.pe/#/consulta';
const BROWSER_MAX_AGE_MS = 8 * 60 * 1000;  // Reciclar cada 8 min (evita memory leaks)
const POOL_SIZE = parseInt(process.env.POOL_SIZE || '2', 10);
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
        // Limpiar pool antes de reciclar
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
            // Optimizaciones adicionales para 512MB Render
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

    // Precalentar el pool al arrancar el browser
    _fillPool();
    return browserInstance;
}

// ── POOL DE PÁGINAS PRECALENTADAS ─────────────────────────────────────────────
const warmPool = [];
let fillingPool = false;

/**
 * Navega una página hacia el formulario EsSalud bloqueando recursos innecesarios.
 */
async function createWarmPage() {
    try {
        const browser = browserInstance;
        if (!browser) return null;

        const page = await browser.newPage();

        // Timeout global por defecto
        page.setDefaultTimeout(15000);

        // Viewport mínimo para reducir consumo de memoria
        await page.setViewport({ width: 800, height: 600 });

        // Bloquear recursos innecesarios: imágenes, fuentes, media, CSS
        await page.setRequestInterception(true);
        page.on('request', req => {
            const type = req.resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto(ESSALUD_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // Espera inteligente: verificar que el campo de formulario está listo
        await page.waitForSelector('input[formcontrolname="documento"]', { timeout: 12000 });

        return page;
    } catch (err) {
        console.warn(`[${new Date().toISOString()}] [Pool] Error precalentando página:`, err.message);
        return null;
    }
}

/**
 * Rellena el pool hasta POOL_SIZE en background (no bloquea el request actual).
 */
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
        }
    } finally {
        fillingPool = false;
    }
}

/**
 * Obtiene una página del pool o crea una nueva.
 */
async function getPage() {
    await getBrowser();

    if (warmPool.length > 0) {
        const page = warmPool.shift();
        console.log(`[${new Date().toISOString()}] [Pool] Usando página caliente. Restantes: ${warmPool.length}`);
        _fillPool().catch(() => {});
        return { page, wasWarm: true };
    }

    console.log(`[${new Date().toISOString()}] [Pool] Pool vacío, creando página en el momento...`);
    const page = await createWarmPage();
    if (!page) throw new Error('No se pudo crear una página de scraping');
    return { page, wasWarm: false };
}

/**
 * Recicla una página usada o la cierra si el pool ya está lleno.
 */
async function recyclePage(page) {
    if (warmPool.length >= POOL_SIZE) {
        try { await page.close(); } catch {}
        return;
    }
    try {
        await page.goto(ESSALUD_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForSelector('input[formcontrolname="documento"]', { timeout: 10000 });
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
            console.log(`[${new Date().toISOString()}] [Scraper] Intento ${attempt}/${MAX_RETRIES} DNI:${dni} | página ${wasWarm ? 'caliente ✓' : 'nueva'}`);

            // Escribir en los campos usando evaluate (más rápido que page.type en Render)
            await page.evaluate((d, c, f) => {
                const setVal = (selector, value) => {
                    const el = document.querySelector(selector);
                    if (!el) return;
                    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        window.HTMLInputElement.prototype, 'value'
                    ).set;
                    nativeInputValueSetter.call(el, value);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                };
                setVal('input[formcontrolname="documento"]', d);
                setVal('input[formcontrolname="digito"]', c);
                setVal('input[formcontrolname="fechaNacimiento"]', f);
            }, dni, cui, fecha_nacimiento);

            // Espera inteligente: verificar que Angular procesó los inputs
            await page.waitForFunction(() => {
                const doc = document.querySelector('input[formcontrolname="documento"]');
                return doc && doc.value && doc.value.length > 0;
            }, { timeout: 3000 }).catch(() => {});

            // Click checkbox de política de privacidad
            try {
                await page.click('input[formcontrolname="politicaPrivacidad"]');
            } catch {
                await page.evaluate(() => {
                    const span = document.querySelector('.texto-acepto');
                    if (span) span.click();
                });
            }

            // Esperar modal activamente (con timeout corto)
            try {
                await page.waitForSelector('.mat-mdc-dialog-content, .mat-dialog-content, .modal-body', { timeout: 4000 });
            } catch {
                // Modal puede no aparecer si fue aceptado antes
            }

            // Scroll + aceptar modal
            try {
                await page.evaluate(async () => {
                    const modalBody = document.querySelector('.mat-mdc-dialog-content, .mat-dialog-content, .modal-body');
                    if (modalBody) {
                        modalBody.scrollTo(0, modalBody.scrollHeight + 5000);
                        await new Promise(r => setTimeout(r, 500));
                    }
                    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Aceptar'));
                    if (btn && !btn.disabled) btn.click();
                });
            } catch {}

            // Espera inteligente: que el modal desaparezca
            try {
                await page.waitForFunction(
                    () => !document.querySelector('.mat-mdc-dialog-content, .mat-dialog-content'),
                    { timeout: 3000 }
                );
            } catch {
                // Continuar aunque el modal no desaparezca
            }

            // Click en Consultar
            try {
                const btnHandle = await page.evaluateHandle(() =>
                    Array.from(document.querySelectorAll('button'))
                        .find(b => b.textContent.toLowerCase().includes('consultar'))
                );
                await btnHandle.click();
            } catch {
                try { await page.click('button.ess-btn-primary'); } catch {}
            }

            // Espera inteligente: resultado o error (sin delay fijo)
            const outcome = await page.waitForFunction(() => {
                const textL = document.body.innerText.toLowerCase();
                if (document.querySelector('.table-responsive, app-resultado')
                    || textL.includes('afiliado a')
                    || textL.includes('no tiene derecho de cobertura')) return 'success';
                const swal = document.querySelector('.swal2-html-container');
                if (swal && swal.innerText.trim()) return 'error_swal';
                if (textL.includes('incorrectos') || textL.includes('no encontrado') || textL.includes('captcha')) return 'error_text';
                return false;
            }, { timeout: 15000 }).then(r => r.jsonValue()).catch(() => 'timeout');

            console.log(`[${new Date().toISOString()}] [Scraper] DNI:${dni} → ${outcome} (${Date.now() - t0}ms)`);

            if (outcome === 'error_swal' || outcome === 'error_text') {
                const errorText = await page.evaluate(() => {
                    const swal = document.querySelector('.swal2-html-container');
                    if (swal) return swal.innerText;
                    for (const el of document.querySelectorAll('mat-error, .alert, span, div')) {
                        if (el.innerText && (
                            el.innerText.toLowerCase().includes('incorrectos') ||
                            el.innerText.toLowerCase().includes('no encontrado') ||
                            el.innerText.toLowerCase().includes('captcha')
                        )) return el.innerText;
                    }
                    return 'Datos incorrectos o paciente no encontrado';
                });

                // No reintentar errores de CAPTCHA o datos inválidos
                if (errorText.toLowerCase().includes('captcha')) {
                    recyclePage(page).catch(() => {});
                    return { success: false, error: 'CAPTCHA_REQUIRED', message: 'Se detectó CAPTCHA. Requiere validación manual.' };
                }
                recyclePage(page).catch(() => {});
                return { success: false, error: 'CONSULTA_ERROR', message: errorText };
            }

            if (outcome === 'timeout') {
                // Reintentar en timeouts (error transitorio)
                console.warn(`[${new Date().toISOString()}] [Scraper] Timeout DNI:${dni}, intento ${attempt}/${MAX_RETRIES}`);
                try { await page.close(); } catch {}
                page = null;
                lastError = { success: false, error: 'TIMEOUT', message: 'Datos incorrectos o tiempo de espera agotado' };
                continue; // Reintentar
            }

            // Extraer resultado
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
            return { success: true, data: afiliado_a };

        } catch (error) {
            console.error(`[${new Date().toISOString()}] [Scraper] Error intento ${attempt}:`, error.message);
            if (page) {
                try { await page.close(); } catch {}
            }
            lastError = { success: false, error: 'SCRAPER_ERROR', message: error.message };

            // Solo reintentar en errores de navegación/timeout, no en errores lógicos
            if (attempt < MAX_RETRIES) {
                console.log(`[${new Date().toISOString()}] [Scraper] Reintentando DNI:${dni}...`);
                continue;
            }
        }
    }

    // Todos los intentos fallaron
    return lastError || { success: false, error: 'SCRAPER_ERROR', message: 'Todos los intentos fallaron' };
}

module.exports = { validarSeguro };
