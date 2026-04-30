document.addEventListener('DOMContentLoaded', async () => {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : supabase;
    const { data: { session } } = await client.auth.getSession();

    if (!session) {
        window.location.href = '../../index.html';
        return;
    }

    // DOM
    const searchInput = document.getElementById('search-input');
    const btnSearch = document.getElementById('btn-search');
    const btnClear = document.getElementById('btn-clear');
    const tbody = document.getElementById('tabla-pacientes');
    const loadingIndicator = document.getElementById('loading-indicator');
    const tableElement = document.getElementById('table-element');
    const toast = document.getElementById('toast');

    // Inline History DOM
    const viewHistoryInline = document.getElementById('view-history-inline');
    const historyPatientName = document.getElementById('history-patient-name');
    const btnCloseHistory = document.getElementById('btn-close-history');
    const historyKpis = document.getElementById('history-kpis');
    const historyRecordsButtons = document.getElementById('history-records-buttons');
    const historyTimelineContainer = document.getElementById('history-timeline-container');

    // State
    let currentPage = 1;
    let rowsPerPage = 5;
    let totalRecords = 0;
    let searchQuery = '';
    let selectedPatient = null;

    const normalizeText = (text) => {
        if (!text) return '';
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    };

    const showToast = (text, color) => {
        document.getElementById('toast-text').textContent = text;
        toast.style.display = 'flex';
        toast.style.background = color;
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.style.display = 'none', 400);
        }, 3000);
    };

    const loadPacientes = async () => {
        try {
            loadingIndicator.style.display = 'block';
            tableElement.style.display = 'none';

            // Cálculo dinámico de filas visibles
            if (typeof DynamicTable !== 'undefined') {
                rowsPerPage = DynamicTable.calcRowsPerPage({
                    excludeSelectors: ['.top-header', '.module-commands', '.pagination-controls']
                });
            } else {
                const availableHeight = window.innerHeight - 450;
                let calculatedRows = Math.floor(availableHeight / 60);
                rowsPerPage = calculatedRows > 2 ? calculatedRows : 3;
            }

            const startRange = (currentPage - 1) * rowsPerPage;
            const endRange = startRange + rowsPerPage - 1;

            let queryObj = client
                .from('pacientes')
                .select('*', { count: 'exact' })
                .order('creado_en', { ascending: false })
                .range(startRange, endRange);

            if (searchQuery) {
                const normQuery = normalizeText(searchQuery);
                queryObj = queryObj.or('dni.ilike.%' + normQuery + '%,apellidos.ilike.%' + normQuery + '%,nombres.ilike.%' + normQuery + '%');
            }

            const { data: pacientes, count, error } = await queryObj;
            if (error) throw error;

            totalRecords = count || 0;

            let eventosMap = {};
            if (pacientes && pacientes.length > 0) {
                const ids = pacientes.map(p => p.id);
                const { data: eventos } = await client
                    .from('historial_eventos')
                    .select('paciente_id, tipo_evento, fecha_evento')
                    .in('paciente_id', ids)
                    .order('fecha_evento', { ascending: true });

                if (eventos) {
                    eventos.forEach(e => {
                        if (!eventosMap[e.paciente_id]) eventosMap[e.paciente_id] = [];
                        eventosMap[e.paciente_id].push(e);
                    });
                }
                renderTable(pacientes, eventosMap, startRange);
            } else {
                renderTable([], {}, startRange);
            }
            renderPagination();
        } catch (error) {
            console.error('Error cargando pacientes:', error.message);
            showToast('Error al cargar pacientes', '#ef4444');
        } finally {
            loadingIndicator.style.display = 'none';
            tableElement.style.display = 'table';
        }
    };

    const calcularDiasTotales = (eventos, condicion) => {
        if (!eventos || eventos.length === 0) return 0;
        let total = 0;
        const nowPeru = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
        
        const evs = [...eventos].sort((a, b) => new Date(a.fecha_evento) - new Date(b.fecha_evento));
        evs.forEach(ev => {
            if (ev.tipo_evento === 'Hospitalizado') ingreso = new Date(ev.fecha_evento);
            else if ((ev.tipo_evento === 'Alta' || ev.tipo_evento === 'Fallecido') && ingreso) {
                total += Math.max(0, Math.ceil((new Date(ev.fecha_evento) - ingreso) / (1000 * 60 * 60 * 24)));
                ingreso = null;
            }
        });
        if (ingreso && condicion === 'Hospitalizado') {
            total += Math.max(0, Math.ceil((nowPeru - ingreso) / (1000 * 60 * 60 * 24)));
        }
        return total;
    };

    const renderTable = (items, eventosMap, startIndex = 0) => {
        tbody.innerHTML = '';
        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px; color:#94a3b8;">No se encontraron pacientes.</td></tr>';
            return;
        }

        items.forEach((item, idx) => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            const condClass = item.condicion === 'Hospitalizado' ? 'cond-hospitalizado' : (item.condicion === 'Fallecido' ? 'cond-fallecido' : 'cond-alta');
            const totalDias = calcularDiasTotales(eventosMap[item.id] || [], item.condicion);

            row.innerHTML = `
                <td>${item.dni}</td>
                <td>${item.apellidos}, ${item.nombres}</td>
                <td>${item.historia_clinica}</td>
                <td><span class="seguro-badge">${item.tipo_seguro}</span></td>
                <td><span class="condicion-badge ${condClass}">${item.condicion}</span></td>
                <td><span class="dias-badge ${item.condicion === 'Hospitalizado' ? 'dias-activo' : 'dias-alta'}">${totalDias} d\u00EDas</span></td>
                <td style="text-align: center;">
                    <button class="btn-module primary btn-history" data-id="${item.id}" style="padding: 6px 12px; font-size: 12px;">
                        <i class="fa-solid fa-timeline"></i> Historial
                    </button>
                </td>
            `;
            // La fila ya no será accionable, todo el control pasa al botón
            row.style.cursor = 'default';
            
            const btn = row.querySelector('.btn-history');
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.location.href = `detalle-paciente.html?dni=${item.dni}`;
            });

            tbody.appendChild(row);
        });
    };

    // Paginacion y Busqueda (igual que antes)
    const renderPagination = () => {
        const totalPages = Math.ceil(totalRecords / rowsPerPage);
        const container = document.getElementById('pagination-container');
        container.innerHTML = '';
        if (totalPages <= 1) return;

        if (typeof DynamicTable !== 'undefined') {
            DynamicTable.renderPagination({
                containerId: 'pagination-container',
                currentPage,
                totalPages,
                onPageChange: (page) => { currentPage = page; loadPacientes(); }
            });
        } else {
            const btnPrev = document.createElement('button');
            btnPrev.className = 'pagination-btn';
            btnPrev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
            btnPrev.disabled = currentPage === 1;
            btnPrev.onclick = () => { currentPage--; loadPacientes(); };
            container.appendChild(btnPrev);
            const info = document.createElement('span');
            info.className = 'pagination-info';
            info.innerHTML = `Página <span class="seguro-badge">${currentPage}</span> de ${totalPages}`;
            container.appendChild(info);
            const btnNext = document.createElement('button');
            btnNext.className = 'pagination-btn';
            btnNext.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
            btnNext.disabled = currentPage === totalPages;
            btnNext.onclick = () => { currentPage++; loadPacientes(); };
            container.appendChild(btnNext);
        }
    };

    btnSearch.addEventListener('click', () => {
        searchQuery = searchInput.value.trim();
        sessionStorage.setItem('sp_search_query', searchQuery);
        currentPage = 1;
        loadPacientes();
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') btnSearch.click();
    });

    btnClear.addEventListener('click', () => {
        searchQuery = '';
        searchInput.value = '';
        sessionStorage.removeItem('sp_search_query');
        // Si hay otros filtros en el futuro, se limpian aquí
        currentPage = 1;
        loadPacientes();
    });

    if (sessionStorage.getItem('sp_search_query')) {
        searchInput.value = sessionStorage.getItem('sp_search_query');
        searchQuery = searchInput.value;
    }

    loadPacientes();
});
