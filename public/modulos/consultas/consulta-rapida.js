document.addEventListener('DOMContentLoaded', () => {
    const RPA_BACKEND_URL = 'https://rpa-hospital.onrender.com/api/validar-seguro';

    const btnSearch = document.getElementById('btn-search');
    const btnClear = document.getElementById('btn-clear');
    const inputDNI = document.getElementById('filter-dni');
    const inputHC = document.getElementById('filter-hc');
    const inputApellidos = document.getElementById('filter-apellidos');

    const tablePacientes = document.getElementById('table-pacientes');
    const tbodyPacientes = document.getElementById('tbody-pacientes');
    const loadingIndicator = document.getElementById('loading-indicator');
    const actionsBar = document.getElementById('actions-bar');

    const btnValidar = document.getElementById('btn-validar');
    const selectedCountSpan = document.getElementById('selected-count');
    const spinner = document.getElementById('validar-spinner');

    let selectedPatients = [];
    let accumulatedResults = [];
    let crCurrentPage = 1;
    let crRowsPerPage = 10;

    // ── PERSISTENCIA DE RESULTADOS ─────────────────────────────────────────────
    const saveState = () => {
        try { sessionStorage.setItem('cr_accumulated', JSON.stringify(accumulatedResults)); } catch {}
    };

    // Función para refrescar los datos de los pacientes acumulados desde la BD (Tiempo Real)
    const refreshLatestData = async () => {
        if (accumulatedResults.length === 0) return;
        
        const ids = accumulatedResults.map(p => p.id);
        const { data, error } = await supabaseClient
            .from('pacientes')
            .select('*')
            .in('id', ids);

        if (!error && data) {
            // Actualizar acumulados y RE-EVALUAR ALERTAS si el seguro cambió
            accumulatedResults = accumulatedResults.map(p => {
                const latest = data.find(l => l.id === p.id);
                if (!latest) return p;

                let updatedStatus = latest.estado_validacion;
                let updatedExt = latest.tipo_seguro_validado;

                // Lógica Bidireccional: Comparar Declarado vs Extraído si hay una validación previa
                if (latest.tipo_seguro_validado && !latest.tipo_seguro_validado.includes('COBERTURA') && latest.estado_validacion !== 'ERROR') {
                    const decl = (latest.tipo_seguro || '').toUpperCase();
                    const ext = (latest.tipo_seguro_validado || '').toUpperCase();
                    
                    const matches = decl && ext && (ext.includes(decl) || decl.includes(ext));
                    
                    if (matches) {
                        if (updatedStatus !== 'OK' && updatedStatus !== 'CORRECTO') {
                            updatedStatus = 'OK';
                            supabaseClient.from('pacientes').update({ estado_validacion: 'OK' }).eq('id', p.id).then();
                        }
                    } else {
                        // NO coinciden. Si antes estaba OK, ahora debe ser ALERTA
                        if (updatedStatus === 'OK' || updatedStatus === 'CORRECTO' || !updatedStatus || updatedStatus === 'N/A') {
                            updatedStatus = 'ALERTA';
                            supabaseClient.from('pacientes').update({ estado_validacion: 'ALERTA' }).eq('id', p.id).then();
                        }
                    }
                }

                return { ...latest, estado_validacion: updatedStatus, tipo_seguro_validado: updatedExt };
            });
            
            // Sincronizar selección
            selectedPatients = selectedPatients.map(sp => {
                const upd = accumulatedResults.find(r => r.id === sp.id);
                return upd ? upd : sp;
            });

            renderAccumulatedTable();
        }
    };

    const restoreState = async () => {
        try {
            // Restaurar inputs
            const savedDNI = sessionStorage.getItem('cr_filter_dni');
            const savedHC = sessionStorage.getItem('cr_filter_hc');
            const savedApellidos = sessionStorage.getItem('cr_filter_apellidos');

            if (savedDNI) inputDNI.value = savedDNI;
            if (savedHC) inputHC.value = savedHC;
            if (savedApellidos) inputApellidos.value = savedApellidos;

            // Restaurar tabla
            const saved = sessionStorage.getItem('cr_accumulated');
            if (saved) { 
                accumulatedResults = JSON.parse(saved); 
                // Refrescar con datos reales de la BD para evitar datos obsoletos (Seguro, etc)
                await refreshLatestData();
            }
        } catch {}
    };

    const showToast = (message, isError = false) => {
        const toast = document.getElementById('toast');
        const toastIcon = document.getElementById('toast-icon');
        const toastText = document.getElementById('toast-text');

        // Reset classes
        toast.className = isError ? 'toast-error' : 'toast-success';
        toastIcon.className = isError ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-check-circle';
        toastText.textContent = message;

        // Force reflow
        void toast.offsetWidth;
        
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4000);
    };

    const updateActionsBar = () => {
        selectedCountSpan.textContent = selectedPatients.length;
        if (selectedPatients.length > 0 && selectedPatients.length <= 2) {
            btnValidar.disabled = false;
            btnValidar.style.cursor = 'pointer';
        } else {
            btnValidar.disabled = true;
            btnValidar.style.cursor = 'not-allowed';
        }
    };

    const handleCheckboxChange = (e, paciente) => {
        if (e.target.checked) {
            if (selectedPatients.length >= 2) {
                e.preventDefault();
                e.target.checked = false;
                alert('Solo puede seleccionar un máximo de 2 pacientes para consulta rápida.');
                return;
            }
            selectedPatients.push(paciente);
        } else {
            selectedPatients = selectedPatients.filter(p => p.id !== paciente.id);
        }
        updateActionsBar();
    };

    // ── HELPER: obtener clase CSS del badge según estado ─────────────────────
    const getBadgeClass = (estado) => {
        if (!estado || estado === 'N/A') return 'badge-na';
        const s = estado.toUpperCase();
        if (s === 'OK' || s === 'CORRECTO') return 'badge-ok';
        if (s === 'ALERTA') return 'badge-alerta';
        if (s === 'ERROR') return 'badge-error';
        if (s === 'EN PROCESO') return 'badge-na';
        return 'badge-na';
    };

    // ── BANNER DE ALERTA GLOBAL (debajo del encabezado) ──────────────────────
    const updateAlertaBanner = () => {
        const hasAlerta = accumulatedResults.some(p => p.estado_validacion === 'ALERTA');
        let banner = document.getElementById('rpa-alerta-banner');

        if (hasAlerta) {
            if (!banner) {
                banner = document.createElement('div');
                banner.id = 'rpa-alerta-banner';
                banner.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Realizar cambio de cobertura, Alta Administrativa';
                // Insertar debajo del encabezado de la página (page-header)
                const pageHeader = document.querySelector('.page-header');
                if (pageHeader && pageHeader.nextSibling) {
                    pageHeader.parentNode.insertBefore(banner, pageHeader.nextSibling);
                } else {
                    const pageContent = document.getElementById('page-content');
                    if (pageContent) {
                        const searchFilters = pageContent.querySelector('.search-filters-container');
                        if (searchFilters) pageContent.insertBefore(banner, searchFilters);
                        else pageContent.appendChild(banner);
                    }
                }
            }
            banner.classList.add('show');
        } else {
            if (banner) banner.classList.remove('show');
        }
    };

    const renderAccumulatedTable = () => {
        tbodyPacientes.innerHTML = '';
        if (accumulatedResults.length === 0) {
            tablePacientes.style.display = 'none';
            actionsBar.style.display = 'flex'; // Mantener siempre visible
            updateAlertaBanner();
            document.getElementById('pagination-consulta').innerHTML = '';
            updateActionsBar(); // Asegurar que el contador diga 0 y el botón esté deshabilitado
            return;
        }

        // Calculate dynamic rows per page
        if (typeof DynamicTable !== 'undefined') {
            crRowsPerPage = DynamicTable.calcRowsPerPage({
                tableContainerId: 'view-resultados',
                excludeSelectors: ['.top-header', '.page-header', '.search-filters-container', '#actions-bar', '.pagination-controls', '#rpa-alerta-banner']
            });
        }

        const totalPages = Math.ceil(accumulatedResults.length / crRowsPerPage) || 1;
        if (crCurrentPage > totalPages) crCurrentPage = totalPages;

        const start = (crCurrentPage - 1) * crRowsPerPage;
        const pageData = accumulatedResults.slice(start, start + crRowsPerPage);

        pageData.forEach(p => {
            const tr = document.createElement('tr');

            // Sombrear fila si el paciente tiene estado ALERTA
            if (p.estado_validacion === 'ALERTA') {
                tr.classList.add('row-alerta');
            }

            // Checkbox td
            const tdCheck = document.createElement('td');
            tdCheck.style.textAlign = 'center';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.style.cursor = 'pointer';
            if (selectedPatients.find(sp => sp.id === p.id)) {
                chk.checked = true;
            }
            chk.addEventListener('change', (e) => handleCheckboxChange(e, p));
            tdCheck.appendChild(chk);

            const badgeClass = getBadgeClass(p.estado_validacion);

            // Formatear fecha para mostrar en la tabla
            let nacFormateada = p.fecha_nacimiento || 'N/A';
            if (nacFormateada !== 'N/A') {
                if (nacFormateada.includes('-')) {
                    const parts = nacFormateada.split('-');
                    if (parts[0].length === 4) nacFormateada = `${parts[2]}/${parts[1]}/${parts[0]}`;
                } else if (nacFormateada.includes('/')) {
                    const parts = nacFormateada.split('/');
                    if (parts[0].length === 4) nacFormateada = `${parts[2]}/${parts[1]}/${parts[0]}`;
                }
            }

            // Determinar si el botón de acción debe ser visible (ya fue validado)
            const hasValidation = p.estado_validacion && p.estado_validacion !== 'N/A';
            const btnDisplay = hasValidation ? 'inline-block' : 'none';

            // Renderizar la celda de "Seguro Extraído" con estilo de error si aplica
            let extCellHTML = p.tipo_seguro_validado || '-';
            const estadoUpper = (p.estado_validacion || '').toUpperCase();
            if (estadoUpper === 'ERROR' && p.tipo_seguro_validado) {
                extCellHTML = `<span style="color: #ef4444; font-size: 12px;"><i class="fa-solid fa-circle-xmark"></i> ${p.tipo_seguro_validado}</span>`;
            } else if (estadoUpper === 'ALERTA' && p.tipo_seguro_validado && !p.tipo_seguro_validado.includes('COBERTURA')) {
                extCellHTML = `<span style="color: #d97706; font-size: 12px;"><i class="fa-solid fa-triangle-exclamation"></i> ${p.tipo_seguro_validado}</span>`;
            }

            // Formatear fecha de última validación
            let ultimaVal = p.fecha_ultima_validacion || '-';
            if (ultimaVal !== '-') {
                const d = new Date(ultimaVal);
                ultimaVal = d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }

            tr.innerHTML = `
                <td>${p.dni} <br><small style="color:#64748b;">CUI: ${p.codigo_verificacion || 'N/A'}</small></td>
                <td>${p.apellidos}, ${p.nombres} <br><small style="color:#64748b;">Nac: ${nacFormateada}</small></td>
                <td style="font-weight: 600;">${p.tipo_seguro || 'NO DECLARADO'}</td>
                <td id="ext-${p.id}" style="color: #475569;">${extCellHTML}</td>
                <td id="badge-${p.id}"><span class="${badgeClass}">${p.estado_validacion || 'N/A'}</span></td>
                <td style="color:#64748b; font-size: 12px;">${ultimaVal}</td>
                <td style="text-align:center;">
                    <button id="btn-redirect-${p.id}" class="btn-module primary" style="display:${btnDisplay}; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px;" title="Ver registro del paciente" onclick="window.location.href='../seguimiento/verificacion-paciente.html?dni=${p.dni}&from=rapida'">
                        <i class="fa-solid fa-rotate"></i>
                    </button>
                </td>
            `;

            tr.insertBefore(tdCheck, tr.firstChild);
            tbodyPacientes.appendChild(tr);

            // Bind redirect button con el dni del paciente
            const btnRedir = document.getElementById(`btn-redirect-${p.id}`);
            if (btnRedir) {
                btnRedir.addEventListener('click', () => {
                    // Pasar from=rpa para que el botón "Volver" regrese aquí
                    window.location.href = `../seguimiento/verificacion-paciente.html?dni=${p.dni}&from=rpa`;
                });
            }
        });

        tablePacientes.style.display = 'table';
        actionsBar.style.display = 'flex';
        updateAlertaBanner();

        // Render pagination
        if (typeof DynamicTable !== 'undefined') {
            DynamicTable.renderPagination({
                containerId: 'pagination-consulta',
                currentPage: crCurrentPage,
                totalPages,
                onPageChange: (page) => { crCurrentPage = page; renderAccumulatedTable(); }
            });
        }
    };

    // Recalculate rows on resize (debounced)
    if (typeof DynamicTable !== 'undefined') {
        DynamicTable.onResize(() => {
            if (accumulatedResults.length > 0) renderAccumulatedTable();
        });
    }

    const loadPacientes = async () => {
        const dni = inputDNI.value.trim();
        const hc = inputHC.value.trim();
        const apellidos = inputApellidos.value.trim().toUpperCase();

        // Save filters
        sessionStorage.setItem('cr_filter_dni', dni);
        sessionStorage.setItem('cr_filter_hc', hc);
        sessionStorage.setItem('cr_filter_apellidos', apellidos);

        if (!dni && !hc && !apellidos) {
            showToast('Use los filtros para buscar pacientes.', true);
            return;
        }

        loadingIndicator.style.display = 'block';

        let query = supabaseClient.from('pacientes').select('*').order('creado_en', { ascending: false }).limit(5);

        if (dni) query = query.eq('dni', dni);
        if (hc) query = query.eq('historia_clinica', hc);
        if (apellidos) query = query.ilike('apellidos', `%${apellidos}%`);

        const { data, error } = await query;

        loadingIndicator.style.display = 'none';

        if (error) {
            console.error(error);
            showToast('Error al cargar pacientes', true);
            return;
        }

        if (data.length === 0) {
            showToast('No se encontraron pacientes con esos datos.', true);
            return;
        }

        // Agregar o Actualizar resultados
        data.forEach(newPatient => {
            const existingIdx = accumulatedResults.findIndex(p => p.id === newPatient.id);
            if (existingIdx !== -1) {
                // Actualizar datos de BD (Seguro, etc)
                accumulatedResults[existingIdx] = { ...newPatient };
            } else {
                accumulatedResults.unshift(newPatient);
            }
        });

        // Limitar a máximo 50 usuarios para no saturar memoria
        if (accumulatedResults.length > 50) accumulatedResults = accumulatedResults.slice(0, 50);

        // Limpiar de selectedPatients si fueron eliminados por el límite
        selectedPatients = selectedPatients.filter(sp => accumulatedResults.find(ar => ar.id === sp.id));
        
        renderAccumulatedTable();
        saveState();
        
        // Ejecutar comparación automática inmediatamente tras cargar nuevos datos
        refreshLatestData();
    };

    btnSearch.addEventListener('click', loadPacientes);

    [inputDNI, inputHC, inputApellidos].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadPacientes();
        });
    });

    btnClear.addEventListener('click', () => {
        inputDNI.value = '';
        inputHC.value = '';
        inputApellidos.value = '';
        sessionStorage.removeItem('cr_filter_dni');
        sessionStorage.removeItem('cr_filter_hc');
        sessionStorage.removeItem('cr_filter_apellidos');
        sessionStorage.removeItem('cr_accumulated');
        tbodyPacientes.innerHTML = '';
        tablePacientes.style.display = 'none';
        actionsBar.style.display = 'none';
        selectedPatients = [];
        accumulatedResults = [];
        updateActionsBar();
        renderAccumulatedTable();
    });

    btnValidar.addEventListener('click', async () => {
        if (selectedPatients.length === 0) return;

        // Block UI
        const overlay = document.createElement('div');
        overlay.id = 'rpa-blocking-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
        overlay.style.zIndex = '9999';
        overlay.style.cursor = 'wait';
        document.body.appendChild(overlay);

        btnValidar.disabled = true;
        spinner.style.display = 'inline-block';

        let successCount = 0;

        for (const paciente of selectedPatients) {
            const extCell = document.getElementById(`ext-${paciente.id}`);
            const badgeCell = document.getElementById(`badge-${paciente.id}`);

            extCell.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color: #8b5cf6;"></i> Consultando...';
            badgeCell.innerHTML = '<span class="badge-na">EN PROCESO</span>';

            // Formatear fecha a DD/MM/YYYY si viene en YYYY-MM-DD
            let fechaArr = (paciente.fecha_nacimiento || '').split('-');
            let fechaStr = fechaArr.length === 3 ? `${fechaArr[2]}/${fechaArr[1]}/${fechaArr[0]}` : paciente.fecha_nacimiento;

            try {
                const response = await fetch(RPA_BACKEND_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        dni: paciente.dni,
                        codigo_verificacion: paciente.codigo_verificacion || '',
                        fecha_nacimiento: fechaStr
                    })
                });

                const result = await response.json();

                if (result.success) {
                    const extraido = result.tipo_seguro_extraido || 'SIN RESULTADOS';
                    let estadoVal = 'ALERTA';

                    if (extraido === 'NO TIENE DERECHO DE COBERTURA') {
                        // Resultado válido del sistema EsSalud → CORRECTO
                        estadoVal = 'CORRECTO';
                    } else if (paciente.tipo_seguro && extraido !== 'SIN RESULTADOS') {
                        if (extraido.toUpperCase().includes(paciente.tipo_seguro.toUpperCase()) ||
                            paciente.tipo_seguro.toUpperCase().includes(extraido.toUpperCase())) {
                            estadoVal = 'OK';
                        }
                    }

                    const badgeClass = getBadgeClass(estadoVal);

                    // Actualizar UI
                    extCell.textContent = extraido;
                    badgeCell.innerHTML = `<span class="${badgeClass}">${estadoVal}</span>`;

                    // Sombrear fila si es ALERTA
                    const row = extCell.closest('tr');
                    if (row) {
                        row.classList.toggle('row-alerta', estadoVal === 'ALERTA');
                    }

                    // Actualizar objeto en accumulatedResults para persistencia
                    const idx = accumulatedResults.findIndex(r => r.id === paciente.id);
                    if (idx !== -1) {
                        accumulatedResults[idx].tipo_seguro_validado = extraido;
                        accumulatedResults[idx].estado_validacion = estadoVal;
                    }

                    // Guardar en BD (Formato ISO para Supabase)
                    await supabaseClient.from('pacientes').update({
                        tipo_seguro_validado: extraido,
                        estado_validacion: estadoVal,
                        fecha_ultima_validacion: new Date().toISOString()
                    }).eq('id', paciente.id);

                    successCount++;
                } else {
                    let estadoError = 'ERROR';
                    let errorDisplayMsg = 'Datos incorrectos o paciente no encontrado';
                    if (result.error === 'CAPTCHA_REQUIRED') {
                        errorDisplayMsg = 'Requiere Validar Captcha Manual';
                        extCell.innerHTML = `<span style="color: #d97706; font-size: 12px;"><i class="fa-solid fa-triangle-exclamation"></i> ${errorDisplayMsg}</span>`;
                        estadoError = 'ALERTA';
                    } else {
                        extCell.innerHTML = `<span style="color: #ef4444; font-size: 12px;"><i class="fa-solid fa-circle-xmark"></i> ${errorDisplayMsg}</span>`;
                    }
                    badgeCell.innerHTML = `<span class="${getBadgeClass(estadoError)}">${estadoError}</span>`;

                    // Sombrear fila si es ALERTA
                    const row = extCell.closest('tr');
                    if (row) {
                        row.classList.toggle('row-alerta', estadoError === 'ALERTA');
                    }

                    // Persistir estado y mensaje de error para sessionStorage
                    const idx = accumulatedResults.findIndex(r => r.id === paciente.id);
                    if (idx !== -1) {
                        accumulatedResults[idx].estado_validacion = estadoError;
                        accumulatedResults[idx].tipo_seguro_validado = errorDisplayMsg;
                    }

                    // GUARDAR ERROR/ALERTA EN BD TAMBIÉN
                    await supabaseClient.from('pacientes').update({
                        tipo_seguro_validado: errorDisplayMsg,
                        estado_validacion: estadoError,
                        fecha_ultima_validacion: new Date().toISOString()
                    }).eq('id', paciente.id);
                }
            } catch (err) {
                console.error("Fetch error:", err);
                const catchMsg = 'Error de conexión RPA';
                extCell.innerHTML = `<span style="color: #ef4444; font-size: 12px;"><i class="fa-solid fa-circle-xmark"></i> ${catchMsg}</span>`;
                badgeCell.innerHTML = `<span class="${getBadgeClass('ERROR')}">ERROR</span>`;

                // Persistir estado y mensaje de error para sessionStorage
                const idx = accumulatedResults.findIndex(r => r.id === paciente.id);
                if (idx !== -1) {
                    accumulatedResults[idx].estado_validacion = 'ERROR';
                    accumulatedResults[idx].tipo_seguro_validado = catchMsg;
                }

                // GUARDAR FALLO DE CONEXIÓN EN BD TAMBIÉN
                await supabaseClient.from('pacientes').update({
                    tipo_seguro_validado: catchMsg,
                    estado_validacion: 'ERROR',
                    fecha_ultima_validacion: new Date().toISOString()
                }).eq('id', paciente.id);
            }

            // Mostrar botón de redirección siempre tras completar el RPA del paciente
            const btnRedir = document.getElementById(`btn-redirect-${paciente.id}`);
            if (btnRedir) btnRedir.style.display = 'inline-block';
        }

        // Unblock UI
        const overlayToRemove = document.getElementById('rpa-blocking-overlay');
        if (overlayToRemove) document.body.removeChild(overlayToRemove);

        btnValidar.disabled = false;
        spinner.style.display = 'none';

        // Deseleccionar
        document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
        selectedPatients = [];
        updateActionsBar();

        // Persistir resultados para que al volver al módulo sigan visibles
        saveState();
        updateAlertaBanner();

        if (successCount > 0) showToast(`Validación completada (${successCount} procesados)`);
    });

    // Carga inicial o Auto-Ejecución desde tabla de registros
    const urlParams = new URLSearchParams(window.location.search);
    const autoDni = urlParams.get('autoRpaDni');

    if (autoDni) {
        // Limpiar URL para que al refrescar no se vuelva a autoejecutar
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        inputDNI.value = autoDni;
        loadPacientes().then(() => {
            setTimeout(() => {
                const chk = document.querySelector('input[type="checkbox"]');
                if (chk) {
                    chk.checked = true;
                    chk.dispatchEvent(new Event('change'));
                    btnValidar.click();
                }
            }, 500); // Pequeño retardo para asegurar que la tabla renderizó
        });
    } else {
        // Restaurar tabla/resultados de sesión anterior
        restoreState();
    }

    // Refrescar al recuperar foco (por si el usuario volvió tras editar un paciente en otra pestaña)
    window.addEventListener('focus', refreshLatestData);
});
