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

    // State
    let currentPage = 1;
    let rowsPerPage = 5;
    let totalRecords = 0;
    let searchQuery = '';

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

    // ============================================
    // CARGA DE PACIENTES CON DIAS HOSPITALIZADOS
    // ============================================
    const loadPacientes = async () => {
        try {
            loadingIndicator.style.display = 'block';
            tableElement.style.display = 'none';

            const availableHeight = window.innerHeight - 350;
            let calculatedRows = Math.floor(availableHeight / 60);
            rowsPerPage = calculatedRows > 2 ? calculatedRows : 3;

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

            // Obtener historial para calcular dias
            if (pacientes && pacientes.length > 0) {
                const ids = pacientes.map(p => p.id);
                const { data: eventos } = await client
                    .from('historial_eventos')
                    .select('paciente_id, tipo_evento, fecha_evento')
                    .in('paciente_id', ids)
                    .order('fecha_evento', { ascending: true });

                const eventosMap = {};
                if (eventos) {
                    eventos.forEach(e => {
                        if (!eventosMap[e.paciente_id]) eventosMap[e.paciente_id] = [];
                        eventosMap[e.paciente_id].push(e);
                    });
                }

                renderTable(pacientes, eventosMap);
            } else {
                renderTable([], {});
            }

            renderPagination();
        } catch (error) {
            console.error('Error cargando pacientes:', error.message);
            showToast('Error al cargar pacientes: ' + error.message, '#ef4444');
        } finally {
            loadingIndicator.style.display = 'none';
            tableElement.style.display = 'table';
        }
    };

    // ============================================
    // CALCULO DE DIAS HOSPITALIZADOS
    // ============================================
    const calcularDias = (eventos, condicion) => {
        if (!eventos || eventos.length === 0) return { dias: 0, texto: 'Sin registro' };

        // Buscar ultimo ciclo de hospitalizacion
        let ultimoIngreso = null;
        let ultimaAlta = null;

        for (let i = eventos.length - 1; i >= 0; i--) {
            const ev = eventos[i];
            if (ev.tipo_evento === 'Alta' || ev.tipo_evento === 'Fallecido') {
                if (!ultimaAlta) ultimaAlta = new Date(ev.fecha_evento);
            }
            if (ev.tipo_evento === 'Hospitalizado') {
                ultimoIngreso = new Date(ev.fecha_evento);
                break;
            }
        }

        if (!ultimoIngreso) return { dias: 0, texto: 'Sin registro' };

        const fin = (condicion === 'Hospitalizado') ? new Date() : (ultimaAlta || new Date());
        const diffMs = fin - ultimoIngreso;
        const dias = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

        if (condicion === 'Hospitalizado') {
            return { dias, texto: dias + (dias === 1 ? ' d\u00EDa' : ' d\u00EDas'), clase: 'dias-activo' };
        } else if (condicion === 'Alta' || condicion === 'Salió de Alta') {
            return { dias, texto: dias + (dias === 1 ? ' d\u00EDa' : ' d\u00EDas'), clase: 'dias-alta' };
        } else {
            return { dias, texto: dias + (dias === 1 ? ' d\u00EDa' : ' d\u00EDas'), clase: 'dias-fallecido' };
        }
    };

    const getCondicionClass = (condicion) => {
        if (condicion === 'Hospitalizado') return 'cond-hospitalizado';
        if (condicion === 'Alta' || condicion === 'Salió de Alta') return 'cond-alta';
        if (condicion === 'Fallecido') return 'cond-fallecido';
        return '';
    };

    // ============================================
    // RENDER TABLA
    // ============================================
    const renderTable = (items, eventosMap) => {
        tbody.innerHTML = '';
        if (!items || items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px; color:#94a3b8;">No se encontraron pacientes.</td></tr>';
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            const condClass = getCondicionClass(item.condicion);
            const diasInfo = calcularDias(eventosMap[item.id] || [], item.condicion);

            row.innerHTML = `
                <td><strong>${item.dni}</strong></td>
                <td>${item.apellidos}, ${item.nombres}</td>
                <td>${item.historia_clinica}</td>
                <td><span class="seguro-badge">${item.tipo_seguro}</span></td>
                <td><span class="condicion-badge ${condClass}">${item.condicion}</span></td>
                <td><span class="dias-badge ${diasInfo.clase || ''}">${diasInfo.texto}</span></td>
                <td style="text-align: center;">
                    <a href="verificacion-paciente.html?dni=${item.dni}" class="btn-module primary" style="padding: 6px 12px; font-size: 12px; text-decoration: none;">
                        <i class="fa-solid fa-timeline"></i> Historial
                    </a>
                </td>
            `;
            tbody.appendChild(row);
        });
    };

    // ============================================
    // PAGINACION
    // ============================================
    const renderPagination = () => {
        const totalPages = Math.ceil(totalRecords / rowsPerPage);
        const container = document.getElementById('pagination-container');
        container.innerHTML = '';
        if (totalPages <= 1) return;

        const btnPrev = document.createElement('button');
        btnPrev.className = 'pagination-btn';
        btnPrev.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        btnPrev.disabled = currentPage === 1;
        btnPrev.onclick = () => { currentPage--; loadPacientes(); };
        container.appendChild(btnPrev);

        const info = document.createElement('span');
        info.className = 'pagination-info';
        info.innerHTML = 'P\u00E1gina <span class="seguro-badge">' + currentPage + '</span> de ' + totalPages;
        container.appendChild(info);

        const btnNext = document.createElement('button');
        btnNext.className = 'pagination-btn';
        btnNext.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        btnNext.disabled = currentPage === totalPages;
        btnNext.onclick = () => { currentPage++; loadPacientes(); };
        container.appendChild(btnNext);
    };

    // ============================================
    // EVENTOS
    // ============================================
    const executeSearch = () => {
        const val = searchInput.value.trim();
        searchQuery = val;
        currentPage = 1;
        btnClear.style.display = val ? 'block' : 'none';
        loadPacientes();
    };

    btnSearch.addEventListener('click', executeSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') executeSearch();
    });

    btnClear.addEventListener('click', () => {
        searchQuery = '';
        searchInput.value = '';
        btnClear.style.display = 'none';
        currentPage = 1;
        loadPacientes();
    });

    window.addEventListener('resize', () => {
        const availableHeight = window.innerHeight - 350;
        let calculatedRows = Math.floor(availableHeight / 60);
        calculatedRows = calculatedRows > 2 ? calculatedRows : 3;
        if (calculatedRows !== rowsPerPage) {
            currentPage = 1;
            loadPacientes();
        }
    });

    // Carga inicial
    loadPacientes();
});
