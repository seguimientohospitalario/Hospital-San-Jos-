/**
 * Dynamic Table Utility — Hospital San José
 * Calcula automáticamente cuántas filas caben en la pantalla sin scroll vertical.
 * Provee paginación integrada reutilizable en todos los módulos.
 */
const DynamicTable = (() => {
    const DEFAULT_ROW_HEIGHT = 52;
    const MIN_ROWS = 3;
    const PADDING_BUFFER = 40; // margen extra de seguridad

    /**
     * Calcula cuántas filas caben en la pantalla sin generar scroll.
     * @param {Object} opts
     * @param {string} opts.tableContainerId - ID del contenedor de la tabla
     * @param {string[]} opts.excludeSelectors - Selectores de elementos a excluir del cálculo (header, filtros, paginación, etc.)
     * @param {number} [opts.rowHeight] - Altura promedio por fila (px)
     * @returns {number}
     */
    const calcRowsPerPage = (opts = {}) => {
        const rowHeight = opts.rowHeight || DEFAULT_ROW_HEIGHT;
        const viewportHeight = window.innerHeight;

        // Calcular espacio ocupado por elementos fijos
        let occupiedHeight = PADDING_BUFFER;
        const defaultExcludes = [
            '.top-header',
            '.page-header',
            '.search-filters-container',
            '#actions-bar',
            '.pagination-controls',
            '#rpa-alerta-banner'
        ];
        const selectors = opts.excludeSelectors || defaultExcludes;

        selectors.forEach(sel => {
            const el = document.querySelector(sel);
            if (el) {
                const rect = el.getBoundingClientRect();
                occupiedHeight += rect.height + parseFloat(getComputedStyle(el).marginTop || 0) + parseFloat(getComputedStyle(el).marginBottom || 0);
            }
        });

        // Sumar padding del page-content
        const pageContent = document.querySelector('.page-content');
        if (pageContent) {
            const cs = getComputedStyle(pageContent);
            occupiedHeight += parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
        }

        // Sumar header de la tabla (th)
        const tableContainer = opts.tableContainerId ? document.getElementById(opts.tableContainerId) : document.querySelector('.data-table-container');
        if (tableContainer) {
            const thead = tableContainer.querySelector('thead');
            if (thead) occupiedHeight += thead.getBoundingClientRect().height;
        }

        const available = viewportHeight - occupiedHeight;
        return Math.max(MIN_ROWS, Math.floor(available / rowHeight));
    };

    /**
     * Renderiza los controles de paginación.
     * @param {Object} opts
     * @param {string} opts.containerId - ID del contenedor donde insertar la paginación
     * @param {number} opts.currentPage - Página actual (1-indexed)
     * @param {number} opts.totalPages - Total de páginas
     * @param {Function} opts.onPageChange - Callback al cambiar de página
     */
    const renderPagination = (opts) => {
        const container = document.getElementById(opts.containerId);
        if (!container) return;

        if (opts.totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        const maxVisible = 5;
        let startPage = Math.max(1, opts.currentPage - Math.floor(maxVisible / 2));
        let endPage = Math.min(opts.totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }

        let html = `
            <button class="pagination-btn" ${opts.currentPage === 1 ? 'disabled' : ''} data-page="${opts.currentPage - 1}" title="Anterior">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
        `;

        if (startPage > 1) {
            html += `<button class="pagination-btn" data-page="1">1</button>`;
            if (startPage > 2) html += `<span style="color:#94a3b8; padding: 0 4px;">…</span>`;
        }

        for (let i = startPage; i <= endPage; i++) {
            const isActive = i === opts.currentPage;
            html += `<button class="pagination-btn ${isActive ? 'active' : ''}" data-page="${i}" ${isActive ? 'style="background:#3b82f6;color:white;border-color:#3b82f6;"' : ''}>${i}</button>`;
        }

        if (endPage < opts.totalPages) {
            if (endPage < opts.totalPages - 1) html += `<span style="color:#94a3b8; padding: 0 4px;">…</span>`;
            html += `<button class="pagination-btn" data-page="${opts.totalPages}">${opts.totalPages}</button>`;
        }

        html += `
            <button class="pagination-btn" ${opts.currentPage === opts.totalPages ? 'disabled' : ''} data-page="${opts.currentPage + 1}" title="Siguiente">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
            <span style="font-size:12px; color:#94a3b8; margin-left:8px;">
                Página ${opts.currentPage} de ${opts.totalPages}
            </span>
        `;

        container.innerHTML = html;

        // Bind click events
        container.querySelectorAll('.pagination-btn:not(:disabled)').forEach(btn => {
            btn.addEventListener('click', () => {
                const page = parseInt(btn.dataset.page);
                if (page >= 1 && page <= opts.totalPages) {
                    opts.onPageChange(page);
                }
            });
        });
    };

    /**
     * Configura recálculo automático al redimensionar ventana.
     * @param {Function} callback - Función a ejecutar al redimensionar
     * @param {number} [debounceMs=250] - Debounce en ms
     * @returns {Function} cleanup function
     */
    const onResize = (callback, debounceMs = 250) => {
        let timer;
        const handler = () => {
            clearTimeout(timer);
            timer = setTimeout(callback, debounceMs);
        };
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    };

    return { calcRowsPerPage, renderPagination, onResize };
})();
