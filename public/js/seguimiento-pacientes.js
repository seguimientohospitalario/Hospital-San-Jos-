document.addEventListener('DOMContentLoaded', async () => {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : supabase;
    const { data: { session } } = await client.auth.getSession();

    if (!session) {
        window.location.href = '../../index.html';
        return;
    }

    const userId = session.user.id;

    // DOM - BÃºsqueda (Nuevos IDs de VerificaciÃ³n)
    const searchFilters = document.getElementById('search-filters');
    const filterDniHc = document.getElementById('filter-dni-hc');
    const filterApellidos = document.getElementById('filter-apellidos');
    const filterSeguro = document.getElementById('filter-seguro');
    const btnSearch = document.getElementById('btn-search');
    const btnClear = document.getElementById('btn-clear');
    
    const viewResultados = document.getElementById('view-resultados');
    const tbodyPacientes = document.getElementById('tbody-pacientes');
    const loadingIndicator = document.getElementById('loading-indicator');
    const tablePacientes = document.getElementById('table-pacientes');
    const toast = document.getElementById('toast');

    // State
    let currentPage = 1;
    let rowsPerPage = 10;
    let totalRecords = 0;

    const normalizeText = (text) => {
        if (!text) return '';
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    };

    const showToast = (text, isError = false) => {
        if(window.showSystemTooltip) {
            window.showSystemTooltip(text, isError);
        }
    };

    const searchPacientes = async () => {
        try {
            loadingIndicator.style.display = 'block';
            tablePacientes.style.display = 'none';

            const startRange = (currentPage - 1) * rowsPerPage;
            const endRange = startRange + rowsPerPage - 1;

            let queryObj = client
                .from('pacientes')
                .select('*', { count: 'exact' })
                .order('creado_en', { ascending: false })
                .range(startRange, endRange);

            const dniHcVal = filterDniHc.value.trim();
            const apeVal = filterApellidos.value.trim();
            const seguroVal = filterSeguro.value;

            if (dniHcVal) {
                queryObj = queryObj.or(`dni.ilike.%${dniHcVal}%,historia_clinica.ilike.%${dniHcVal}%`);
            }
            if (apeVal) {
                queryObj = queryObj.ilike('apellidos', `%${normalizeText(apeVal)}%`);
            }
            if (seguroVal) {
                queryObj = queryObj.eq('tipo_seguro', seguroVal.toUpperCase());
            }

            const { data: pacientes, count, error } = await queryObj;
            if (error) throw error;

            totalRecords = count || 0;
            renderTable(pacientes || []);
            renderPagination();
        } catch (error) {

            showToast('Error al buscar pacientes', true);
        } finally {
            loadingIndicator.style.display = 'none';
            tablePacientes.style.display = 'table';
        }
    };

    const renderTable = (items) => {
        tbodyPacientes.innerHTML = '';
        if (items.length === 0) {
            tbodyPacientes.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 30px; color:#94a3b8;">No se encontraron pacientes.</td></tr>';
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            
            const condValue = (item.condicion || '').toLowerCase();
            const condClass = condValue === 'hospitalizado' ? 'cond-hospitalizado' : (condValue === 'fallecido' ? 'cond-fallecido' : 'cond-alta');
            const isFallecido = condValue === 'fallecido';

            row.innerHTML = `
                <td>${item.dni}</td>
                <td>${item.apellidos}, ${item.nombres}</td>
                <td>${item.historia_clinica}</td>
                <td><span class="seguro-badge">${item.tipo_seguro}</span></td>
                <td>${item.servicio || '-'}</td>
                <td><span class="condicion-badge ${condClass}">${item.condicion}</span></td>
            `;

            tbodyPacientes.appendChild(row);
        });
    };

    const renderPagination = () => {
        const totalPages = Math.ceil(totalRecords / rowsPerPage);
        const container = document.getElementById('pagination-container');
        container.innerHTML = '';
        if (totalPages <= 1) return;

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.className = `pagination-btn ${i === currentPage ? 'active' : ''}`;
            btn.addEventListener('click', () => {
                currentPage = i;
                searchPacientes();
            });
            container.appendChild(btn);
        }
    };

    const inputs = [filterDniHc, filterApellidos, filterSeguro];
    inputs.forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                currentPage = 1;
                searchPacientes();
            }
        });
    });

    filterSeguro.addEventListener('change', () => {
        currentPage = 1;
        searchPacientes();
    });

    btnSearch.addEventListener('click', () => {
        currentPage = 1;
        searchPacientes();
    });

    btnClear.addEventListener('click', () => {
        filterDniHc.value = '';
        filterApellidos.value = '';
        filterSeguro.value = '';
        currentPage = 1;
        searchPacientes();
    });

    searchPacientes();
});
