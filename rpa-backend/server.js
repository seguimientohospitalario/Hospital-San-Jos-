const express = require('express');
const cors = require('cors');
const { validarSeguro } = require('./scraper');

const app = express();
app.use(cors());
app.use(express.json());

// ── RATE LIMITING EN MEMORIA (sin dependencias extra) ─────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX = 5; // Max 5 requests por IP por minuto

const rateLimiter = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, []);
    }

    const timestamps = rateLimitMap.get(ip).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    rateLimitMap.set(ip, timestamps);

    if (timestamps.length >= RATE_LIMIT_MAX) {
        const retryAfter = Math.ceil((timestamps[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
        return res.status(429).json({
            error: 'RATE_LIMIT',
            message: `Demasiadas solicitudes. Intente en ${retryAfter} segundos.`,
            retryAfter
        });
    }

    timestamps.push(now);
    next();
};

// Limpiar entradas expiradas del rate limiter cada 5 minutos
setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of rateLimitMap.entries()) {
        const filtered = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
        if (filtered.length === 0) {
            rateLimitMap.delete(ip);
        } else {
            rateLimitMap.set(ip, filtered);
        }
    }
}, 5 * 60 * 1000);

// ── TIMEOUT MIDDLEWARE ────────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 60000; // Aumentado a 60 segundos para dar margen al scraper

const timeoutMiddleware = (req, res, next) => {
    const timer = setTimeout(() => {
        if (!res.headersSent) {
            res.status(504).json({
                error: 'TIMEOUT',
                message: 'La solicitud excedió el tiempo máximo de espera (60s).'
            });
        }
    }, REQUEST_TIMEOUT_MS);

    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
};

// ── ENDPOINT PRINCIPAL ────────────────────────────────────────────────────────
app.post('/api/validar-seguro', rateLimiter, timeoutMiddleware, async (req, res) => {
    const t0 = Date.now();
    const { dni, codigo_verificacion, fecha_nacimiento } = req.body;

    if (!dni || !codigo_verificacion || !fecha_nacimiento) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos (dni, codigo_verificacion, fecha_nacimiento)' });
    }

    // Normalizar formato de fecha a DD/MM/YYYY requerido por EsSalud
    let fecha_formateada = fecha_nacimiento;
    if (fecha_nacimiento.includes('-')) {
        const parts = fecha_nacimiento.split('-');
        if (parts[0].length === 4) fecha_formateada = `${parts[2]}/${parts[1]}/${parts[0]}`;
    } else if (fecha_nacimiento.includes('/')) {
        const parts = fecha_nacimiento.split('/');
        if (parts[0].length === 4) fecha_formateada = `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    console.log(`[${new Date().toISOString()}] [API] Solicitud DNI: ${dni} | Fecha: ${fecha_formateada}`);

    const result = await validarSeguro(dni, codigo_verificacion, fecha_formateada);

    const elapsed = Date.now() - t0;
    console.log(`[${new Date().toISOString()}] [API] Respuesta DNI: ${dni} → ${result.success ? 'OK' : 'FALLO'} (${elapsed}ms total)`);

    if (res.headersSent) return; // Evitar doble respuesta si timeout ya respondió

    if (result.success) {
        res.json({ success: true, tipo_seguro_extraido: result.data });
    } else {
        res.status(500).json({ success: false, error: result.error, message: result.message });
    }
});

// Endpoint de health check — útil para el keep-alive de Render
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[${new Date().toISOString()}] RPA Backend escuchando en el puerto ${PORT}`);
});
