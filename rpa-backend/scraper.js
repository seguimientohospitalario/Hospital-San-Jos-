const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

// ── SINGLETON DE BROWSER ──────────────────────────────────────────────────────
// En lugar de lanzar/cerrar Chromium en cada request (coste: 10-20s en Render),
// mantenemos una instancia viva y reutilizamos páginas.
let browserInstance = null;
let browserLaunchTime = null;
const BROWSER_MAX_AGE_MS = 10 * 60 * 1000; // Reciclar cada 10 minutos

async function getBrowser() {
    const now = Date.now();
    const isStale = browserLaunchTime && (now - browserLaunchTime > BROWSER_MAX_AGE_MS);

    if (browserInstance && !isStale) {
        try {
            await browserInstance.version(); // ping rápido para verificar que sigue vivo
            return browserInstance;
        } catch {
            browserInstance = null; // muerto, relanzar
        }
    }

    // Cerrar instancia vieja si existe
    if (browserInstance) {
        try { await browserInstance.close(); } catch {}
    }

    console.log(`[${new Date().toISOString()}] [Browser] Lanzando nueva instancia de Chromium...`);
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
            '--single-process',               // Reduce overhead de memoria en containers Linux
            '--disable-background-timer-throttling',
        ]
    });
    browserLaunchTime = Date.now();
    console.log(`[${new Date().toISOString()}] [Browser] Instancia lista.`);
    return browserInstance;
}

// ── SCRAPER PRINCIPAL ─────────────────────────────────────────────────────────
async function validarSeguro(dni, cui, fecha_nacimiento) {
    const t0 = Date.now();
    let page = null;

    try {
        const browser = await getBrowser();
        page = await browser.newPage();

        // Bloquear imágenes, fuentes, media y CSS — no son necesarios para scraping
        // Ahorro: 1-3 segundos en descarga innecesaria
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const tipo = req.resourceType();
            if (['image', 'font', 'media', 'stylesheet'].includes(tipo)) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // domcontentloaded es suficiente para iniciar Angular; networkidle2 puede
        // bloquearse en Render por la latencia red hacia PE (~200ms) y conexiones SSE abiertas
        try {
            await page.goto('https://dondemeatiendo.essalud.gob.pe/#/consulta', {
                waitUntil: 'domcontentloaded',
                timeout: 20000
            });
        } catch (gotoErr) {
            console.error(`[${new Date().toISOString()}] Error cargando página EsSalud:`, gotoErr.message);
            return { success: false, error: 'CONNECTION_ERROR', message: 'Servicio de EsSalud no disponible' };
        }

        // Esperar el selector real (más confiable que networkidle)
        await page.waitForSelector('input[formcontrolname="documento"]', { timeout: 12000 });

        // Typeado con delay mínimo (20ms entre teclas) para Angular detecte cambios
        await page.type('input[formcontrolname="documento"]', dni, { delay: 20 });
        await page.type('input[formcontrolname="digito"]', cui, { delay: 20 });
        await page.type('input[formcontrolname="fechaNacimiento"]', fecha_nacimiento, { delay: 20 });

        const delay = ms => new Promise(res => setTimeout(res, ms));

        // Click checkbox de política de privacidad
        try {
            await page.click('input[formcontrolname="politicaPrivacidad"]');
        } catch {
            await page.evaluate(() => {
                const span = document.querySelector('.texto-acepto');
                if (span) span.click();
            });
        }

        // Esperar modal activamente en vez de delay fijo (1500ms → detecta inmediatamente)
        try {
            await page.waitForSelector('.mat-mdc-dialog-content, .mat-dialog-content, .modal-body', {
                timeout: 5000
            });
        } catch {
            // Modal puede no aparecer si ya fue aceptado antes
        }

        // Scroll al fondo del modal y aceptar
        try {
            await page.evaluate(async () => {
                const modalBody = document.querySelector('.mat-mdc-dialog-content, .mat-dialog-content, .modal-body');
                if (modalBody) {
                    modalBody.scrollTo(0, modalBody.scrollHeight + 5000);
                    await new Promise(r => setTimeout(r, 800));
                }
                const aceptarBtn = Array.from(document.querySelectorAll('button'))
                    .find(b => b.textContent.includes('Aceptar'));
                if (aceptarBtn && !aceptarBtn.disabled) aceptarBtn.click();
            });
        } catch {}

        // Esperar que el modal DESAPAREZCA en vez de delay fijo (1000ms → 0-500ms)
        try {
            await page.waitForFunction(() => {
                return !document.querySelector('.mat-mdc-dialog-content, .mat-dialog-content');
            }, { timeout: 3000 });
        } catch {
            await delay(400); // fallback mínimo
        }

        // Click en botón Consultar
        try {
            const btnHandle = await page.evaluateHandle(() => {
                return Array.from(document.querySelectorAll('button'))
                    .find(b => b.textContent.toLowerCase().includes('consultar'));
            });
            await btnHandle.click();
        } catch {
            await page.click('button.ess-btn-primary');
        }

        // Esperar resultados o errores
        const firstToHappen = await page.waitForFunction(() => {
            const textL = document.body.innerText.toLowerCase();
            if (document.querySelector('.table-responsive, app-resultado')
                || textL.includes('afiliado a')
                || textL.includes('no tiene derecho de cobertura')) return 'success';
            const swal = document.querySelector('.swal2-html-container');
            if (swal && swal.innerText.trim() !== '') return 'error_swal';
            if (textL.includes('incorrectos') || textL.includes('no encontrado') || textL.includes('captcha')) return 'error_text';
            return false;
        }, { timeout: 15000 }).then(r => r.jsonValue()).catch(() => 'timeout');

        console.log(`[${new Date().toISOString()}] DNI: ${dni} → ${firstToHappen} (${Date.now() - t0}ms)`);

        if (firstToHappen === 'error_swal' || firstToHappen === 'error_text') {
            const errorText = await page.evaluate(() => {
                const swal = document.querySelector('.swal2-html-container');
                if (swal) return swal.innerText;
                const els = document.querySelectorAll('mat-error, .alert, .error-text, span, div');
                for (let e of els) {
                    if (e.innerText && (
                        e.innerText.toLowerCase().includes('incorrectos') ||
                        e.innerText.toLowerCase().includes('no encontrado') ||
                        e.innerText.toLowerCase().includes('captcha')
                    )) return e.innerText;
                }
                return 'Datos incorrectos o paciente no encontrado';
            });
            if (errorText.toLowerCase().includes('captcha')) {
                return { success: false, error: 'CAPTCHA_REQUIRED', message: 'Se detectó CAPTCHA. Requiere validación manual.' };
            }
            return { success: false, error: 'CONSULTA_ERROR', message: errorText };
        }

        if (firstToHappen === 'timeout') {
            return { success: false, error: 'TIMEOUT', message: 'Datos incorrectos o tiempo de espera agotado' };
        }

        // Extraer resultado
        const extractedData = await page.evaluate(() => document.body.innerText);
        const lines = extractedData.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let afiliado_a = null;

        for (let i = 0; i < lines.length; i++) {
            const ll = lines[i].toLowerCase();
            if (ll.includes('no tiene derecho de cobertura')) {
                return { success: true, data: 'NO TIENE DERECHO DE COBERTURA' };
            }
            if (ll.includes('afiliado a')) {
                if (ll.includes(':')) {
                    const parts = lines[i].split(':');
                    if (parts.length > 1 && parts[1].trim().length > 0) {
                        afiliado_a = parts[1].trim();
                        break;
                    }
                }
                if (i + 1 < lines.length) {
                    afiliado_a = lines[i + 1].trim();
                    if (!afiliado_a.includes(':') && afiliado_a.length < 50) break;
                }
            }
        }

        return { success: true, data: afiliado_a };

    } catch (error) {
        console.error(`[${new Date().toISOString()}] [Scraper] Error:`, error.message);
        // No cerrar el browser singleton — solo la página
        return { success: false, error: 'SCRAPER_ERROR', message: error.message };
    } finally {
        // Cerrar SOLO la página, nunca el browser (singleton reutilizable)
        if (page) {
            try { await page.close(); } catch {}
        }
    }
}

module.exports = { validarSeguro };
