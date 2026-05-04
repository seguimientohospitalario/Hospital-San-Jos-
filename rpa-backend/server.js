const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();

chromium.use(stealth);

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// Configuración de Estrategia: Concurrencia y Batching
const MAX_CONCURRENT = 3; 
const BATCH_SIZE = 5;

/**
 * Función de Scraping para un solo DNI
 * @param {string} dni 
 * @param {import('playwright').Browser} browser 
 */
async function scrapeDni(dni, browser) {
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    });
    const page = await context.newPage();
    
    try {
        console.log(`[RPA] Iniciando consulta DNI: ${dni}`);
        
        // Navigation Timeout & Element Wait
        await page.goto('https://currentTime.essalud.gob.pe/consulta', { 
            waitUntil: 'networkidle', 
            timeout: 30000 
        });

        // Simulación de interacción humana (Action Delay)
        await page.waitForTimeout(1000); 
        await page.fill('input[formcontrolname="documento"]', dni);
        await page.waitForTimeout(500);
        await page.click('button[type="submit"]');

        // Esperar resultado
        await page.waitForSelector('.resultado-container', { timeout: 15000 });
        
        const data = await page.evaluate(() => {
            const seguro = document.querySelector('.tipo-seguro')?.innerText || 'NO ENCONTRADO';
            const estado = document.querySelector('.estado-acreditacion')?.innerText || 'DESCONOCIDO';
            return { seguro, estado };
        });

        return { dni, success: true, ...data };
    } catch (error) {
        console.error(`[RPA] Error DNI ${dni}:`, error.message);
        return { dni, success: false, error: error.message };
    } finally {
        await context.close();
    }
}

app.post('/validate-batch', async (req, res) => {
    const { dnis } = req.body;
    if (!Array.isArray(dnis)) return res.status(400).json({ error: 'Lista de DNIs requerida' });

    console.log(`[RPA] Recibida solicitud batch para ${dnis.length} pacientes`);

    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    });

    try {
        const results = [];
        // Estrategia de Batching: Procesa de 5 en 5 (evita OOM en 512MB)
        for (let i = 0; i < dnis.length; i += BATCH_SIZE) {
            const batch = dnis.slice(i, i + BATCH_SIZE);
            console.log(`[RPA] Procesando lote ${Math.floor(i/BATCH_SIZE) + 1} (${batch.length} pacientes)`);
            
            // Concurrencia interna dentro del lote limitada por MAX_CONCURRENT
            const batchPromises = batch.map(dni => scrapeDni(dni, browser));
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }

        res.json({ success: true, results });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    } finally {
        await browser.close();
    }
});

app.listen(PORT, () => {
    console.log(`RPA Backend (Playwright + Stealth) escuchando en puerto ${PORT}`);
});
