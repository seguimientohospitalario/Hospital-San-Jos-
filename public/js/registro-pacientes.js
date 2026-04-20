document.addEventListener('DOMContentLoaded', async () => {
    // Inicialización y Auth
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : supabase;
    const { data: { session } } = await client.auth.getSession();
    
    if (!session) {
        window.location.href = '../../index.html';
        return;
    }
    const userId = session.user.id;

    // Referencias del DOM
    const viewLista = document.getElementById('view-lista');
    const viewForm = document.getElementById('view-form');
    const btnNew = document.getElementById('local-new-patient-btn');
    const moduleCommands = document.querySelector('.module-commands');
    
    const form = document.getElementById('registro-form');
    const btnCancelar = document.getElementById('btn-cancelar');
    const btnGuardar = document.getElementById('btn-guardar');
    const textGuardar = document.getElementById('guardar-text');
    const spinnerGuardar = document.getElementById('guardar-spinner');
    
    const toast = document.getElementById('toast');
    const selectSeguro = document.getElementById('paciente-seguro');
    const grupoOtros = document.getElementById('grupo-otros');
    const inputOtros = document.getElementById('paciente-seguro-otros');
    const tbody = document.getElementById('tabla-pacientes');
    const btnSearchDni = document.getElementById('btn-search-dni');
    const btnExecSearch = document.getElementById('execute-search');
    const btnClearSearch = document.getElementById('clear-search');
    const loadingIndicator = document.getElementById('loading-indicator');
    const tableElement = document.getElementById('table-element');
    
    // Referencias para el filtro de Servicio
    const filterServicio = document.getElementById('filter-servicio');
    const btnClearFilterServicio = document.getElementById('clear-filter-servicio');
    const inputDni = document.getElementById('paciente-dni');

    // Utility to strip accents and convert to uppercase
    const normalizeText = (text) => {
        if (!text) return '';
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    };

    // Variables de Paginación Inteligente y DB
    let currentPage = 1;
    let rowsPerPage = 5; 
    let totalRecords = 0;
    let searchQuery = '';
    let filterQuery = ''; // Variable para almacenar el filtro de Servicio

    // ============================================
    // CARGA DINÁMICA DE SERVICIOS
    // ============================================
    const loadServicios = async () => {
        try {
            const { data, error } = await client
                .from('pacientes')
                .select('servicio')
                .not('servicio', 'is', null)
                .order('servicio', { ascending: true });

            if (error) throw error;

            // Eliminar duplicados
            const servicios = [...new Set(data.map(p => p.servicio).filter(s => s && s.trim()))];

            // Limpiar opciones previas (excepto la primera)
            while (filterServicio.options.length > 1) {
                filterServicio.remove(1);
            }

            // Agregar opciones dinámicamente
            servicios.forEach(servicio => {
                const option = document.createElement('option');
                option.value = servicio;
                option.textContent = servicio;
                filterServicio.appendChild(option);
            });
        } catch (error) {
            console.error('Error cargando servicios:', error.message);
        }
    };

    // ============================================
    // CARGA DE DATOS LOCALES VS SERVIDOR (PAGINACIÓN)
    // ============================================
        const loadPacientes = async () => {
        try {
            loadingIndicator.style.display = 'block';
            tableElement.style.display = 'none';

            // Cálculo Matemático (altura adaptativa)
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

            if (filterQuery) {
                queryObj = queryObj.eq('servicio', filterQuery);
            }

            const { data, count, error } = await queryObj;

            if (error) throw error;
            totalRecords = count || 0;
            renderTable(data);
            renderPagination();
        } catch (error) {
            console.error('Error cargando pacientes:', error.message);
        } finally {
            loadingIndicator.style.display = 'none';
            tableElement.style.display = 'table';
        }
    };

    const getCondicionClass = (condicion) => {
        if (condicion === 'Hospitalizado') return 'cond-hospitalizado';
        if (condicion === 'Alta' || condicion === 'Salió de Alta') return 'cond-alta';
        if (condicion === 'Fallecido') return 'cond-fallecido';
        return '';
    };

    const renderTable = (items) => {
        tbody.innerHTML = '';
        if (!items || items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px; color:#94a3b8;">No se encontraron registros.</td></tr>`;
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            const condClass = getCondicionClass(item.condicion);
            
            row.innerHTML = `
                <td><strong>${item.dni}</strong></td>
                <td>${item.apellidos}, ${item.nombres}</td>
                <td>${item.historia_clinica}</td>
                <td>${item.fecha_nacimiento}</td>
                <td><span class="seguro-badge">${item.tipo_seguro}</span></td>
                <td>${item.codigo_verificacion || '-'}</td>
                <td>${item.servicio || '-'}</td>
                <td><span class="condicion-badge ${condClass}">${item.condicion}</span></td>
                <td style="text-align: center;">
                    <button class="action-btn-edit local-edit-btn" data-id="${item.id}" title="Editar Paciente">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Add Edit Hooks
        document.querySelectorAll('.local-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const rowId = e.currentTarget.getAttribute('data-id');
                const p = items.find(x => x.id == rowId);
                if(p) openEditForm(p);
            });
        });
    };

    const openEditForm = (p) => {
        form.reset();
        document.getElementById('paciente-id').value = p.id;
        
        // Block all except the 3 editable fields
        document.getElementById('paciente-dni').value = p.dni;
        document.getElementById('paciente-dni').disabled = true;

        document.getElementById('paciente-hc').value = p.historia_clinica;
        document.getElementById('paciente-hc').disabled = true;

        document.getElementById('paciente-fecha-nac').value = p.fecha_nacimiento;
        document.getElementById('paciente-fecha-nac').disabled = true;

        document.getElementById('paciente-apellidos').value = p.apellidos;
        document.getElementById('paciente-apellidos').disabled = true;

        document.getElementById('paciente-nombres').value = p.nombres;
        document.getElementById('paciente-nombres').disabled = true;

        document.getElementById('paciente-codigo-ver').value = p.codigo_verificacion || '';
        document.getElementById('paciente-codigo-ver').disabled = true;

        // Editable fields
        selectSeguro.value = p.tipo_seguro;
        document.getElementById('paciente-servicio').value = p.servicio || '';
        document.getElementById('paciente-condicion').value = p.condicion;

        if (p.tipo_seguro === 'Otros') {
            grupoOtros.style.display = 'flex';
            inputOtros.value = p.seguro_otros || '';
            inputOtros.required = true;
        } else {
            grupoOtros.style.display = 'none';
            inputOtros.required = false;
        }

        viewLista.style.display = 'none';
        moduleCommands.style.display = 'none'; 
        viewForm.style.display = 'block';
    };

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
        info.innerHTML = `Página <span class="seguro-badge">${currentPage}</span> de ${totalPages}`;
        container.appendChild(info);

        const btnNext = document.createElement('button');
        btnNext.className = 'pagination-btn';
        btnNext.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        btnNext.disabled = currentPage === totalPages;
        btnNext.onclick = () => { currentPage++; loadPacientes(); };
        container.appendChild(btnNext);
    };

    window.addEventListener('resize', () => {
        const oldRows = rowsPerPage;
        const availableHeight = window.innerHeight - 350;
        let calculatedRows = Math.floor(availableHeight / 60);
        calculatedRows = calculatedRows > 2 ? calculatedRows : 3;
        
        if (calculatedRows !== oldRows) {
            currentPage = 1;
            loadPacientes(); // re-fetch si la capacidad visual cambia drásticamente
        }
    });

    // ============================================
    // BÚSQUEDA Y MANEJO DE VISTAS (SPA)
    // ============================================
    const executeSearch = () => {
        const val = btnSearchDni.value.trim();
        if (val) {
            searchQuery = val;
            currentPage = 1;
            btnClearSearch.style.display = 'block';
            loadPacientes();
        }
    };

    btnExecSearch.addEventListener('click', executeSearch);
    btnSearchDni.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') executeSearch();
    });

    btnClearSearch.addEventListener('click', () => {
        searchQuery = '';
        btnSearchDni.value = '';
        btnClearSearch.style.display = 'none';
        currentPage = 1;
        loadPacientes();
    });

    // ============================================
    // FILTRO POR SERVICIO
    // ============================================
    filterServicio.addEventListener('change', (e) => {
        const val = e.target.value.trim();
        if (val) {
            filterQuery = val;
            currentPage = 1;
            btnClearFilterServicio.style.display = 'block';
            loadPacientes();
        } else {
            filterQuery = '';
            btnClearFilterServicio.style.display = 'none';
            currentPage = 1;
            loadPacientes();
        }
    });

    btnClearFilterServicio.addEventListener('click', () => {
        filterQuery = '';
        filterServicio.value = '';
        btnClearFilterServicio.style.display = 'none';
        currentPage = 1;
        loadPacientes();
    });

    // ============================================
    // VALIDACIÓN DE DNI (8 DÍGITOS OBLIGATORIOS)
    // ============================================
    inputDni.addEventListener('blur', () => {
        const dniValue = inputDni.value.trim();
        if (dniValue && dniValue.length !== 8) {
            inputDni.setCustomValidity('El DNI debe contener exactamente 8 dígitos numéricos');
        } else {
            inputDni.setCustomValidity('');
        }
    });

    inputDni.addEventListener('input', () => {
        if (inputDni.value.length === 8) {
            inputDni.setCustomValidity('');
        }
    });

    btnNew.addEventListener('click', () => {
        viewLista.style.display = 'none';
        moduleCommands.style.display = 'none'; // Ocultar módulos operativos locales
        form.reset();
        document.getElementById('paciente-id').value = '';
        
        // Reset disabled states uniformly
        document.querySelectorAll('.standard-input').forEach(el => el.disabled = false);

        grupoOtros.style.display = 'none';
        inputOtros.required = false;

        viewForm.style.display = 'block';
    });

    btnCancelar.addEventListener('click', () => {
        viewForm.style.display = 'none';
        viewLista.style.display = 'block';
        moduleCommands.style.display = 'flex';
    });

    selectSeguro.addEventListener('change', (e) => {
        if (e.target.value === 'Otros') {
            grupoOtros.style.display = 'flex';
            inputOtros.required = true;
        } else {
            grupoOtros.style.display = 'none';
            inputOtros.required = false;
            inputOtros.value = "";
        }
    });

    // ============================================
    // INSERCIÓN DE DATOS (SUPABASE)
    // ============================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Validación de DNI antes de enviar
        const dniValue = document.getElementById('paciente-dni').value.trim();
        if (dniValue && dniValue.length !== 8) {
            document.getElementById('toast-text').textContent = 'El DNI debe contener exactamente 8 dígitos numéricos';
            toast.style.display = 'flex';
            toast.style.background = '#ef4444'; // Rojo error
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.style.display = 'none', 400);
            }, 3500);
            return;
        }
        
        // Estado visual: Bloquear botón y mostrar spinner
        btnGuardar.disabled = true;
        textGuardar.textContent = 'Guardando...';
        spinnerGuardar.style.display = 'inline-block';

        const objectId = document.getElementById('paciente-id').value;

        const payload = {
            tipo_seguro: selectSeguro.value,
            seguro_otros: selectSeguro.value === 'Otros' ? inputOtros.value.trim() : null,
            servicio: document.getElementById('paciente-servicio').value.trim() || null,
            condicion: document.getElementById('paciente-condicion').value,
            creado_por: userId // Supabase migh
        };

        // If newly inserted
        if (!objectId) {
            payload.dni = document.getElementById('paciente-dni').value.trim();
            payload.historia_clinica = document.getElementById('paciente-hc').value.trim();
            payload.fecha_nacimiento = document.getElementById('paciente-fecha-nac').value;
            payload.apellidos = normalizeText(document.getElementById('paciente-apellidos').value.trim());
            payload.nombres = normalizeText(document.getElementById('paciente-nombres').value.trim());
            payload.codigo_verificacion = document.getElementById('paciente-codigo-ver').value.trim() || null;
        }

        try {
            let errorResp;
            if (objectId) {
                const { error } = await client.from('pacientes').update(payload).eq('id', objectId);
                errorResp = error;
                document.getElementById('toast-text').textContent = 'Paciente Actualizado Exitosamente';
            } else {
                const { error } = await client.from('pacientes').insert([payload]);
                errorResp = error;
                document.getElementById('toast-text').textContent = 'Paciente Guardado Exitosamente';
            }
            
            if (errorResp) {
                if (errorResp.code === '23505') throw new Error("El DNI ingresado ya existe en el sistema.");
                throw errorResp;
            }

            // Éxito:
            currentPage = 1;
            await loadPacientes();
            await loadServicios(); // Recargar servicios por si hay nuevos

            viewForm.style.display = 'none';
            viewLista.style.display = 'block';
            moduleCommands.style.display = 'flex';

            document.getElementById('toast-text').textContent = 'Paciente Guardado Exitosamente';
            toast.style.display = 'flex';
            toast.style.background = '#10b981'; // Verde
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.style.display = 'none', 400); // Wait for transition
            }, 3000);

        } catch (err) {
            console.error(err);
            document.getElementById('toast-text').textContent = err.message || 'Error al guardar paciente';
            toast.style.display = 'flex';
            toast.style.background = '#ef4444'; // Rojo error
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.style.display = 'none', 400);
            }, 3500);
        } finally {
            // Restaurar botón
            btnGuardar.disabled = false;
            textGuardar.textContent = 'Guardar Registro';
            spinnerGuardar.style.display = 'none';
        }
    });

    // Carga inicial
    loadServicios();
    loadPacientes();
});
