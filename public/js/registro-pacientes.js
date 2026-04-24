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

    // Inicializar Flatpickr con m\u00e1scara autom\u00e1tica dd/mm/yyyy
    const fpInstance = flatpickr("#paciente-fecha-nac", {
        locale: "es",
        dateFormat: "d/m/Y",
        allowInput: true,
        maxDate: "today",
        // Parsear siempre en formato d/m/Y sin depender de la locale del OS
        parseDate: (dateStr, format) => {
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const day   = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // meses 0-indexed
                const year  = parseInt(parts[2], 10);
                if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                    return new Date(year, month, day);
                }
            }
            return null;
        },
        onReady(_, __, instance) {
            // M\u00e1scara: inserta '/' autom\u00e1ticamente al escribir d\u00edgitos
            instance.input.addEventListener('input', function (e) {
                // Si el usuario est\u00e1 borrando, no interferir
                if (e.inputType && e.inputType.startsWith('delete')) return;

                let digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                let masked = digits;

                if (digits.length > 2) {
                    masked = digits.slice(0, 2) + '/' + digits.slice(2);
                }
                if (digits.length > 4) {
                    masked = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);
                }

                e.target.value = masked;

                // Si ya tiene 10 caracteres (dd/mm/yyyy), forzar parseo en Flatpickr
                if (masked.length === 10) {
                    instance.setDate(masked, true, 'd/m/Y');
                }
            });
        }
    });

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
            const predefinedServicios = [
                "Shock trauma", "Salud mental", "UVI", "Medicina", 
                "Cirugía", "Pediatría", "Neonatología", "Ginecología", "Puerperio"
            ];

            // Limpiar opciones previas (excepto la primera)
            while (filterServicio.options.length > 1) {
                filterServicio.remove(1);
            }

            // Agregar opciones predefinidas
            predefinedServicios.forEach(servicio => {
                const option = document.createElement('option');
                option.value = servicio;
                option.textContent = servicio;
                filterServicio.appendChild(option);
            });

            if (sessionStorage.getItem('rp_filter_servicio')) {
                filterServicio.value = sessionStorage.getItem('rp_filter_servicio');
                filterQuery = filterServicio.value;
                btnClearFilterServicio.style.display = 'block';
            }
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
                <td style="text-align: center; display: flex; justify-content: center; gap: 8px;">
                    <button class="action-btn-edit local-edit-btn" data-id="${item.id}" title="Editar Paciente">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="action-btn-edit local-rpa-btn" data-dni="${item.dni}" title="Ejecutar Consulta RPA" style="color: #3b82f6;">
                        <i class="fa-solid fa-clipboard-check"></i>
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

        // Add RPA Hooks
        document.querySelectorAll('.local-rpa-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const dni = e.currentTarget.getAttribute('data-dni');
                if (dni) {
                    window.location.href = `../consultas/consulta-rapida.html?autoRpaDni=${dni}`;
                }
            });
        });
    };

    const openEditForm = (p) => {
        form.reset();
        document.getElementById('paciente-id').value = p.id;
        
        // Bloquear todos los campos temporalmente
        document.querySelectorAll('.standard-input').forEach(el => el.disabled = true);

        // Volcar data
        document.getElementById('paciente-dni').value = p.dni;
        document.getElementById('paciente-hc').value = p.historia_clinica;
        
        // Formatear fecha para Flatpickr (Y-m-d a d/m/Y si viene de BD, aunque Flatpickr puede parsearlo si se setea via instance)
        // La forma más fácil es usar la instancia de flatpickr
        const fp = document.getElementById('paciente-fecha-nac')._flatpickr;
        if (fp) {
            fp.setDate(p.fecha_nacimiento);
        } else {
            document.getElementById('paciente-fecha-nac').value = p.fecha_nacimiento;
        }

        document.getElementById('paciente-apellidos').value = p.apellidos;
        document.getElementById('paciente-nombres').value = p.nombres;
        document.getElementById('paciente-codigo-ver').value = p.codigo_verificacion || '';
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

        // Si falleció, NO permitir editar nada
        if (p.condicion === 'Fallecido') {
            btnGuardar.style.display = 'none';
            // Crear/mostrar un mensajito si se quiere
        } else {
            btnGuardar.style.display = 'flex';
            // Rehabilitar solo los 2 campos
            selectSeguro.disabled = false;
            document.getElementById('paciente-servicio').disabled = false;
            if (p.tipo_seguro === 'Otros') inputOtros.disabled = false;
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
            sessionStorage.setItem('rp_search_query', val);
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
        sessionStorage.removeItem('rp_search_query');
        btnClearSearch.style.display = 'none';
        currentPage = 1;
        loadPacientes();
    });

    // ============================================
    // FILTRO POR SERVICIO
    // ============================================
    const applyFilterServicio = (val) => {
        if (val) {
            filterQuery = val;
            sessionStorage.setItem('rp_filter_servicio', val);
            currentPage = 1;
            btnClearFilterServicio.style.display = 'block';
            loadPacientes();
        } else {
            filterQuery = '';
            sessionStorage.removeItem('rp_filter_servicio');
            btnClearFilterServicio.style.display = 'none';
            currentPage = 1;
            loadPacientes();
        }
    };

    filterServicio.addEventListener('change', (e) => {
        applyFilterServicio(e.target.value.trim());
    });
    
    filterServicio.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') applyFilterServicio(e.target.value.trim());
    });

    btnClearFilterServicio.addEventListener('click', () => {
        filterQuery = '';
        filterServicio.value = '';
        sessionStorage.removeItem('rp_filter_servicio');
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
        
        // Limpiar flatpickr
        const fp = document.getElementById('paciente-fecha-nac')._flatpickr;
        if (fp) fp.clear();
        
        // Reset disabled states uniformly
        document.querySelectorAll('.standard-input').forEach(el => el.disabled = false);
        
        // Forzar Condición "Hospitalizado" al registrar nuevo y bloquear
        const condicionSelect = document.getElementById('paciente-condicion');
        condicionSelect.value = 'Hospitalizado';
        condicionSelect.disabled = true;

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
            
            // Obtener fecha en formato ISO (Y-m-d) para Supabase desde Flatpickr
            const fp = document.getElementById('paciente-fecha-nac')._flatpickr;
            if (fp && fp.selectedDates.length > 0) {
                payload.fecha_nacimiento = fp.formatDate(fp.selectedDates[0], "Y-m-d");
            } else {
                payload.fecha_nacimiento = document.getElementById('paciente-fecha-nac').value; // fallback
            }

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
                const { data: newPatient, error } = await client.from('pacientes').insert([payload]).select().single();
                errorResp = error;
                
                if (!error && newPatient && payload.condicion === 'Hospitalizado') {
                    // Crear evento automático de Hospitalizado
                    await client.from('historial_eventos').insert([{
                        paciente_id: newPatient.id,
                        tipo_evento: 'Hospitalizado',
                        detalle: `Ingreso inicial al servicio de ${payload.servicio}`,
                        registrado_por: userId
                    }]);
                }
                
                document.getElementById('toast-text').textContent = 'Paciente Guardado Exitosamente';
            }
            
            if (errorResp) {
                if (errorResp.code === '23505') throw new Error("El DNI ingresado ya existe en el sistema.");
                throw errorResp;
            }

            // Éxito:
            currentPage = 1;
            await loadPacientes();

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
    if (sessionStorage.getItem('rp_search_query')) {
        btnSearchDni.value = sessionStorage.getItem('rp_search_query');
        searchQuery = btnSearchDni.value;
        btnClearSearch.style.display = 'block';
    }

    loadServicios().then(() => {
        loadPacientes();
    });
});
