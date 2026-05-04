const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Health Check
app.get('/', (req, res) => {
    res.json({ status: 'active', service: 'RPA Backend - Hospital San José', timestamp: new Date().toISOString() });
});

// User-Agents rotativos
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'
];

function getRandomUA() {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Lanzar navegador ligero optimizado para cloud
 */
async function launchBrowser() {
    console.log('[Browser] Lanzando Chromium...');
    const browser = await puppeteer.launch({
        args: chromium.args.concat([
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]),
        defaultViewport: { width: 1280, height: 900 },
        executablePath: await chromium.executablePath(),
        headless: chromium.headless
    });
    console.log('[Browser] Listo.');
    return browser;
}

/**
 * Scraping de un paciente en "¿Dónde me atiendo?" de EsSalud
 * URL: https://dondemeatiendo.essalud.gob.pe/#/consulta
 * 
 * FLUJO COMPLETO:
 * 1. Llenar DNI en input#mat-input-0
 * 2. Llenar Fecha de Nacimiento en input#mat-input-1
 * 3. Llenar CUI (Código Verificación) en input#mat-input-2
 * 4. Click en checkbox de cláusula → abre modal
 * 5. Scrollear modal hasta abajo
 * 6. Click en botón "Aceptar" del modal
 * 7. Click en botón "Consultar"
 * 8. Extraer resultado
 */
async function scrapePaciente(paciente, browser) {
    const { dni, fecha_nacimiento, codigo_verificacion } = paciente;
    const page = await browser.newPage();
    await page.setUserAgent(getRandomUA());

    try {
        console.log(`[RPA] Iniciando consulta DNI: ${dni}`);

        // ========== NAVEGAR AL PORTAL ==========
        await page.goto('https://dondemeatiendo.essalud.gob.pe/#/consulta', {
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        await delay(2000);

        // ========== 1. NÚMERO DE DOCUMENTO (DNI) ==========
        await page.waitForSelector('input#mat-input-0', { timeout: 12000 });
        await page.click('input#mat-input-0');
        await page.type('input#mat-input-0', dni, { delay: 80 });
        console.log(`[RPA] DNI ${dni} ingresado`);
        await delay(500);

        // ========== 2. FECHA DE NACIMIENTO ==========
        if (fecha_nacimiento) {
            // Formatear fecha: si viene como YYYY-MM-DD → DD/MM/YYYY
            let fechaFormateada = fecha_nacimiento;
            if (fecha_nacimiento.includes('-')) {
                const parts = fecha_nacimiento.split('-');
                fechaFormateada = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }
            await page.click('input#mat-input-1');
            await page.type('input#mat-input-1', fechaFormateada, { delay: 60 });
            console.log(`[RPA] Fecha ingresada: ${fechaFormateada}`);
            await delay(500);
        }

        // ========== 3. CUI (DÍGITO VERIFICADOR) ==========
        if (codigo_verificacion) {
            await page.click('input#mat-input-2');
            await page.type('input#mat-input-2', codigo_verificacion, { delay: 80 });
            console.log(`[RPA] CUI ingresado: ${codigo_verificacion}`);
            await delay(500);
        }

        // ========== 4. CHECKBOX DE CLÁUSULA ==========
        // Angular Material MDC: el tag es "mat-checkbox" directamente
        await page.waitForSelector('mat-checkbox', { timeout: 8000 });
        await page.click('mat-checkbox');
        console.log(`[RPA] Checkbox de cláusula clickeado`);
        await delay(1500);

        // ========== 5. SCROLLEAR MODAL HASTA ABAJO ==========
        await page.waitForSelector('mat-dialog-container', { timeout: 8000 });
        console.log(`[RPA] Modal de cláusula abierto`);

        // Scrollear el contenedor del modal hasta el final
        await page.evaluate(() => {
            const dialog = document.querySelector('mat-dialog-container');
            if (dialog) dialog.scrollTop = dialog.scrollHeight;
            const content = dialog?.querySelector('.mat-mdc-dialog-content') ||
                           dialog?.querySelector('[mat-dialog-content]');
            if (content) content.scrollTop = content.scrollHeight;
        });
        await delay(1000);

        // ========== 6. CLICK EN "ACEPTAR" DEL MODAL ==========
        await page.click('mat-dialog-container button.mat-primary');
        console.log(`[RPA] Botón "Aceptar" clickeado`);
        await delay(1500);

        // ========== 7. CLICK EN "CONSULTAR" ==========
        await page.click('button.ess-btn-primary');
        console.log(`[RPA] Botón "Consultar" clickeado`);

        // ========== 8. ESPERAR Y EXTRAER RESULTADO ==========
        await delay(5000);

        const data = await page.evaluate(() => {
            const body = document.body.innerText.toUpperCase();

            let seguro = 'NO ENCONTRADO';
            let cobertura = 'DESCONOCIDO';

            if (body.includes('NO TIENE DERECHO DE COBERTURA') || 
                body.includes('NO SE ENCONTRARON RESULTADOS') ||
                body.includes('NO ACREDITADO')) {
                seguro = 'SIN COBERTURA';
                cobertura = 'NO TIENE DERECHO DE COBERTURA';
            } else if (body.includes('REGULAR') || body.includes('ESSALUD') || body.includes('ACTIVO')) {
                seguro = 'ESSALUD';
                // Intentar extraer el tipo específico
                if (body.includes('REGULAR')) cobertura = 'REGULAR';
                else if (body.includes('POTESTATIVO')) cobertura = 'POTESTATIVO';
                else cobertura = 'ACTIVO';
            }

            // Capturar texto visible para debug
            return { seguro, cobertura, textoVisible: body.substring(0, 800) };
        });

        console.log(`[RPA] DNI ${dni} → Seguro: ${data.seguro} | Cobertura: ${data.cobertura}`);
        return { dni, success: true, seguro: data.seguro, cobertura: data.cobertura };

    } catch (error) {
        console.error(`[RPA] Error DNI ${dni}:`, error.message);
        return { dni, success: false, seguro: 'ERROR', cobertura: error.message };
    } finally {
        await page.close();
    }
}

// ==================== ENDPOINTS ====================

// Validación individual
app.post('/validate', async (req, res) => {
    const { dni, fecha_nacimiento, codigo_verificacion } = req.body;
    if (!dni) return res.status(400).json({ error: 'DNI requerido' });

    let browser;
    try {
        browser = await launchBrowser();
        const result = await scrapePaciente({ dni, fecha_nacimiento, codigo_verificacion }, browser);
        res.json({ success: true, result });
    } catch (err) {
        console.error('[API] Error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

// Validación en lote
app.post('/validate-batch', async (req, res) => {
    const { pacientes } = req.body;
    if (!Array.isArray(pacientes) || pacientes.length === 0) {
        return res.status(400).json({ error: 'Lista de pacientes requerida' });
    }

    console.log(`[RPA] Solicitud batch: ${pacientes.length} pacientes`);

    let browser;
    try {
        browser = await launchBrowser();
        const results = [];

        for (let i = 0; i < pacientes.length; i++) {
            console.log(`[RPA] Procesando ${i + 1}/${pacientes.length}`);
            const result = await scrapePaciente(pacientes[i], browser);
            results.push(result);

            // Pausa entre consultas para estabilizar
            if (i < pacientes.length - 1) await delay(2000);
        }

        const exitosos = results.filter(r => r.success).length;
        console.log(`[RPA] Completado: ${exitosos}/${results.length} exitosos`);

        res.json({ success: true, total: results.length, exitosos, results });
    } catch (err) {
        console.error('[API] Error batch:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        if (browser) await browser.close();
    }
});

app.listen(PORT, () => {
    console.log(`[Server] RPA Backend escuchando en puerto ${PORT}`);
    console.log(`[Server] Endpoints: POST /validate | POST /validate-batch`);
});
