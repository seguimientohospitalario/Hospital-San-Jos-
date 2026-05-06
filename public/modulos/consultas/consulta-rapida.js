document.addEventListener('DOMContentLoaded', async () => {
    const btnSearch = document.getElementById('btn-search');
    const btnClear = document.getElementById('btn-clear');
    const inputDNI = document.getElementById('filter-dni');
    const inputHC = document.getElementById('filter-hc');
    const inputApellidos = document.getElementById('filter-apellidos');

    const tablePacientes = document.getElementById('table-pacientes');
    const tbodyPacientes = document.getElementById('tbody-pacientes');
    const loadingIndicator = document.getElementById('loading-indicator');
    const paginationContainer = document.getElementById('pagination-consulta');
    const blockingOverlay = document.getElementById('blocking-overlay');
    const templateAlerta = document.getElementById('template-alerta');
    const templateProgreso = document.getElementById('template-progreso');

    let isValidating = false; // Bandera para pausar alerta roja durante RPA
    let countdownInterval = null;

    let accumulatedResults = [];
    let selectedDNIs = [];
    let crCurrentPage = 1;
    let crRowsPerPage = 10;
    let modalPacienteActual = null;

    const normalizeText = (text) => {
        if (!text) return '';
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    };

    const saveState = () => {
        try { sessionStorage.setItem('cr_accumulated', JSON.stringify(accumulatedResults)); } catch { }
    };

    const restoreState = async () => {
        try {
            const savedDNI = sessionStorage.getItem('cr_filter_dni');
            const savedHC = sessionStorage.getItem('cr_filter_hc');
            const savedApellidos = sessionStorage.getItem('cr_filter_apellidos');

            if (savedDNI) inputDNI.value = savedDNI;
            if (savedHC) inputHC.value = savedHC;
            if (savedApellidos) inputApellidos.value = savedApellidos;

            const saved = sessionStorage.getItem('cr_accumulated');
            if (saved) {
                accumulatedResults = JSON.parse(saved);
                renderTable();
            }
        } catch { }
    };

    const showToast = (message, isError = false) => {
        if (window.showSystemTooltip) {
            window.showSystemTooltip(message, isError);
        }
    };

    const updateActionsBar = () => {
        const selectedCount = document.getElementById('selected-count');
        const btnValidar = document.getElementById('btn-validar');

        selectedCount.textContent = selectedDNIs.length;
        btnValidar.disabled = selectedDNIs.length === 0;
    };

    // ========== GESTIÓN ALERTA FLOTANTE (Inyección en Header) ==========
    const updateAlertaBanner = () => {
        if (isValidating) return; // No mostrar alerta roja si estamos validando (banner azul activo)

        const tryInject = () => {
            const header = document.querySelector('.top-header');
            if (!header) {
                setTimeout(tryInject, 100);
                return;
            }

            let banner = document.getElementById('alerta-banner');
            const hayAlerta = accumulatedResults.some(p => {
                const estado = p.estado_rpa || p._estado_rpa;
                return estado === 'ALERTA';
            });

            if (hayAlerta) {
                if (!banner) {
                    const clone = templateAlerta.content.cloneNode(true);
                    banner = clone.querySelector('#alerta-banner');
                    banner.style.position = 'fixed';
                    banner.style.left = '50%';
                    banner.style.top = '35px';
                    banner.style.transform = 'translate(-50%, -50%)';
                    banner.style.zIndex = '10001';
                    document.body.appendChild(banner);
                }
            } else {
                if (banner) {
                    banner.style.animation = 'fluidSlideDown 0.4s reverse cubic-bezier(0.16, 1, 0.3, 1) forwards';
                    setTimeout(() => banner.remove(), 400);
                }
            }
        };

        tryInject();
    };

    // ========== GESTIÓN BANNER PROGRESO (Azul) ==========
    const showProgresoBanner = (segundos) => {
        isValidating = true;
        const header = document.querySelector('.top-header');
        if (!header) return;

        // Quitar alerta roja si existe
        const alertaRoja = document.getElementById('alerta-banner');
        if (alertaRoja) alertaRoja.remove();

        const clone = templateProgreso.content.cloneNode(true);
        const banner = clone.querySelector('#progreso-banner');
        const countSpan = banner.querySelector('#countdown-val');

        banner.style.position = 'fixed';
        banner.style.left = '50%';
        banner.style.top = '35px';
        banner.style.transform = 'translate(-50%, -50%)';
        banner.style.zIndex = '10001'; // Superior al overlay

        document.body.appendChild(banner);

        let rem = segundos;
        countSpan.textContent = rem;

        countdownInterval = setInterval(() => {
            rem--;
            if (rem < 0) rem = 0;
            countSpan.textContent = rem;
        }, 1000);
    };

    const hideProgresoBanner = () => {
        isValidating = false;
        if (countdownInterval) clearInterval(countdownInterval);
        const banner = document.getElementById('progreso-banner');
        if (banner) {
            banner.style.animation = 'fluidSlideDown 0.4s reverse cubic-bezier(0.16, 1, 0.3, 1) forwards';
            setTimeout(() => {
                banner.remove();
                updateAlertaBanner(); // Restaurar alerta roja si aplica
            }, 400);
        }
    };

    // ========== OBTENER ESTADO EFECTIVO ==========
    const getEstadoEfectivo = (p) => p._estado_rpa || p.estado_rpa || null;
    const getSeguroExtraido = (p) => p._seguro_extraido || p.seguro_extraido || null;
    const getUltimaValidacion = (p) => p._ultima_validacion_rpa || p.ultima_validacion_rpa || null;

    // ========== RENDER TABLE ==========
    const renderTable = () => {
        tbodyPacientes.innerHTML = '';
        if (accumulatedResults.length === 0) {
            tablePacientes.style.display = 'none';
            paginationContainer.innerHTML = '';
            updateAlertaBanner();
            return;
        }

        const totalPages = Math.ceil(accumulatedResults.length / crRowsPerPage) || 1;
        if (crCurrentPage > totalPages) crCurrentPage = totalPages;

        const start = (crCurrentPage - 1) * crRowsPerPage;
        const pageData = accumulatedResults.slice(start, start + crRowsPerPage);

        pageData.forEach(p => {
            const tr = document.createElement('tr');

            let nacFormateada = p.fecha_nacimiento || '';
            if (nacFormateada && nacFormateada.includes('-')) {
                const dateParts = nacFormateada.split('-');
                nacFormateada = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            }

            const seguroExtraido = getSeguroExtraido(p);
            const estadoRPA = getEstadoEfectivo(p);
            const ultimaValidacion = getUltimaValidacion(p);

            // Badge Seguro Declarado
            const seguroDeclarado = p.tipo_seguro || 'NO DECLARADO';
            const seguroDeclaradoHTML = `<span class="seguro-badge">${seguroDeclarado}</span>`;

            // Badge Seguro Extraído
            let seguroExtraidoHTML;
            if (seguroExtraido) {
                seguroExtraidoHTML = `<span class="seguro-badge" style="color: #0f172a;">${seguroExtraido}</span>`;
            } else {
                seguroExtraidoHTML = `<span class="condicion-badge" style="background:#f1f5f9; color:#94a3b8; border-left:3px solid #cbd5e1;">N/A</span>`;
            }

            // Badge Estado
            let estadoHTML;
            if (estadoRPA === 'ÉXITO' || estadoRPA === 'EXITO') {
                estadoHTML = `<span class="condicion-badge cond-alta">ÉXITO</span>`;
            } else if (estadoRPA === 'ALERTA') {
                estadoHTML = `<span class="condicion-badge cond-fallecido">ALERTA</span>`;
                tr.classList.add('row-alerta');
            } else if (estadoRPA === 'ERROR') {
                estadoHTML = `<span class="condicion-badge" style="background:#fef3c7; color:#d97706; border-left:3px solid #f59e0b;">ERROR</span>`;
            } else {
                estadoHTML = `<span class="condicion-badge" style="background:#f1f5f9; color:#94a3b8; border-left:3px solid #cbd5e1;">N/A</span>`;
            }

            // Última validación
            let ultValidacionHTML = '<span style="color:#94a3b8; font-size:12px;">—</span>';
            if (ultimaValidacion) {
                const fecha = new Date(ultimaValidacion);
                ultValidacionHTML = `<span style="font-size:12px; color:#475569;">${fecha.toLocaleDateString('es-PE')} ${fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>`;
            }

            // Botón de acción (solo si NO es ÉXITO)
            let accionHTML = `<span style="color:#cbd5e1; font-size:14px;">—</span>`;
            if (seguroExtraido && estadoRPA !== 'ÉXITO' && estadoRPA !== 'EXITO') {
                accionHTML = `<button class="btn-revalidar" data-dni="${p.dni}" title="${estadoRPA === 'ALERTA' ? 'Corregir cobertura' : 'Re-validar'}" style="background:none; border:1px solid #e2e8f0; border-radius:8px; padding:6px 10px; cursor:pointer; color:${estadoRPA === 'ALERTA' ? '#ef4444' : '#3b82f6'}; transition:all 0.2s;">
                    <i class="fa-solid fa-rotate-right"></i>
                </button>`;
            }

            tr.innerHTML = `
                <td style="text-align:center;">
                    <input type="checkbox" class="patient-checkbox" data-dni="${p.dni}" ${selectedDNIs.includes(p.dni) ? 'checked' : ''}>
                </td>
                <td>${p.dni}</td>
                <td>
                    <div style="color:#0f172a;">${p.apellidos}, ${p.nombres}</div>
                    ${nacFormateada ? `<div style="font-size:11px; color:#94a3b8; margin-top:2px;"><i class="fa-regular fa-calendar" style="margin-right:3px;"></i>${nacFormateada}</div>` : ''}
                </td>
                <td>${p.historia_clinica || 'N/A'}</td>
                <td>${seguroDeclaradoHTML}</td>
                <td>${seguroExtraidoHTML}</td>
                <td>${estadoHTML}</td>
                <td>${ultValidacionHTML}</td>
                <td style="text-align:center;">${accionHTML}</td>
            `;

            // Checkbox handler
            const checkbox = tr.querySelector('.patient-checkbox');
            checkbox.addEventListener('change', (e) => {
                const dni = e.target.getAttribute('data-dni');
                if (e.target.checked) {
                    if (selectedDNIs.length >= 2) {
                        e.target.checked = false;
                        showToast('Solo puede seleccionar un máximo de 2 registros para validación rápida.', true);
                        return;
                    }
                    selectedDNIs.push(dni);
                } else {
                    selectedDNIs = selectedDNIs.filter(d => d !== dni);
                }
                updateActionsBar();
            });

            // Botón refresh handler
            const btnRevalidar = tr.querySelector('.btn-revalidar');
            if (btnRevalidar) {
                btnRevalidar.addEventListener('click', () => {
                    const dni = btnRevalidar.getAttribute('data-dni');
                    const paciente = accumulatedResults.find(p => p.dni === dni);
                    const estado = getEstadoEfectivo(paciente);

                    if (estado === 'ALERTA') {
                        // Abrir modal de cambio de cobertura
                        openModalCambioCobertura(paciente);
                    } else {
                        // Re-validar normalmente
                        if (!selectedDNIs.includes(dni)) {
                            if (selectedDNIs.length >= 2) {
                                showToast('Desmarque un paciente para re-validar este.', true);
                                return;
                            }
                            selectedDNIs.push(dni);
                            updateActionsBar();
                        }
                        document.getElementById('btn-validar').click();
                    }
                });
            }

            tbodyPacientes.appendChild(tr);
        });

        tablePacientes.style.display = 'table';
        renderPagination(totalPages);
        updateAlertaBanner();
    };

    const renderPagination = (totalPages) => {
        paginationContainer.innerHTML = '';
        if (totalPages <= 1) return;

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.className = `pagination-btn ${i === crCurrentPage ? 'active' : ''}`;
            btn.addEventListener('click', () => {
                crCurrentPage = i;
                renderTable();
            });
            paginationContainer.appendChild(btn);
        }
    };

    // ========== BÚSQUEDA ACUMULATIVA ==========
    const loadPacientes = async () => {
        const dni = inputDNI.value.trim();
        const hc = inputHC.value.trim();
        const apellidos = inputApellidos.value.trim();

        sessionStorage.setItem('cr_filter_dni', dni);
        sessionStorage.setItem('cr_filter_hc', hc);
        sessionStorage.setItem('cr_filter_apellidos', apellidos);

        if (!dni && !hc && !apellidos) {
            showToast('Use los filtros para buscar pacientes.', true);
            return;
        }

        loadingIndicator.style.display = 'block';
        tablePacientes.style.display = 'none';

        try {
            let query = supabaseClient.from('pacientes').select('*').order('creado_en', { ascending: false });

            if (dni) query = query.ilike('dni', `%${dni}%`);
            if (hc) query = query.ilike('historia_clinica', `%${hc}%`);
            if (apellidos) query = query.ilike('apellidos', `%${normalizeText(apellidos)}%`);

            const { data, error } = await query;

            if (error) throw error;

            if (data.length === 0) {
                showToast('No se encontraron pacientes.', true);
            } else {
                // ACUMULAR: agregar pacientes nuevos sin duplicar
                data.forEach(nuevo => {
                    const existente = accumulatedResults.findIndex(p => p.id === nuevo.id);
                    if (existente >= 0) {
                        accumulatedResults[existente] = nuevo; // Actualizar datos
                    } else {
                        accumulatedResults.unshift(nuevo); // Agregar al inicio
                    }
                });
                crCurrentPage = 1;
            }

            renderTable();
            saveState();
        } catch (err) {
            console.error(err);
            showToast('Error al buscar pacientes', true);
        } finally {
            loadingIndicator.style.display = 'none';
        }
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
        accumulatedResults = [];
        selectedDNIs = [];
        updateActionsBar();
        renderTable();
    });

    // ========== VALIDACIÓN RPA ==========
    const btnValidar = document.getElementById('btn-validar');
    btnValidar.addEventListener('click', async () => {
        if (selectedDNIs.length === 0) return;

        btnValidar.disabled = true;
        blockingOverlay.style.display = 'flex';

        // Mostrar banner azul con estimado (aprox 12s por lote de 1-2)
        showProgresoBanner(15);

        try {
            const pacientesParaValidar = selectedDNIs.map(dni => {
                const paciente = accumulatedResults.find(p => p.dni === dni);
                return {
                    dni: paciente.dni,
                    fecha_nacimiento: paciente.fecha_nacimiento || '',
                    codigo_verificacion: paciente.codigo_verificacion || ''
                };
            });

            const response = await fetch('https://hospital-san-jos-production.up.railway.app/validate-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pacientes: pacientesParaValidar })
            });

            if (!response.ok) throw new Error('Error en la respuesta del servidor RPA');

            const result = await response.json();

            if (result.success) {
                const ahora = new Date().toISOString();

                for (const res of result.results) {
                    const paciente = accumulatedResults.find(p => p.dni === res.dni);
                    if (!paciente) continue;

                    const seguroDeclarado = (paciente.tipo_seguro || '').toUpperCase();
                    const seguroExtraido = (res.seguro || '').toUpperCase();

                    // Lógica de validación: ÉXITO, ALERTA o ERROR
                    let estado;
                    if (seguroExtraido.includes('SIN COBERTURA') || seguroExtraido.includes('NO TIENE')) {
                        estado = 'ÉXITO';
                    } else if (seguroDeclarado === seguroExtraido || seguroExtraido.includes(seguroDeclarado) || seguroDeclarado.includes(seguroExtraido)) {
                        estado = 'ÉXITO';
                    } else if (!res.success) {
                        estado = 'ERROR';
                    } else {
                        estado = 'ALERTA'; // Seguro declarado ≠ seguro extraído
                    }

                    // Actualizar datos locales
                    paciente._seguro_extraido = res.seguro;
                    paciente._estado_rpa = estado;
                    paciente._ultima_validacion_rpa = ahora;

                    // Guardar en BD
                    try {
                        await supabaseClient.from('pacientes').update({
                            seguro_extraido: res.seguro,
                            estado_rpa: estado,
                            ultima_validacion_rpa: ahora
                        }).eq('id', paciente.id);

                        await supabaseClient.from('validaciones_rpa').insert({
                            paciente_id: paciente.id,
                            dni: res.dni,
                            seguro_declarado: paciente.tipo_seguro,
                            seguro_extraido: res.seguro,
                            cobertura_extraida: res.cobertura || '',
                            estado_validacion: estado,
                            fecha_validacion: ahora
                        });
                    } catch (dbErr) {
                        console.warn('[BD] Error guardando resultado:', dbErr.message);
                    }

                    if (estado === 'ALERTA') {
                        showToast(`⚠️ Alerta en DNI: ${res.dni} — Seguro no coincide`, true);
                    }
                }

                showToast('Validación completada');

                selectedDNIs = [];
                updateActionsBar();
                renderTable();
                saveState();
            }

        } catch (err) {
            console.error('RPA Error:', err);
            showToast('Error al conectar con el servicio RPA: ' + err.message, true);
        } finally {
            btnValidar.disabled = false;
            blockingOverlay.style.display = 'none';
            hideProgresoBanner();
        }
    });

    // ========== MODAL CAMBIO COBERTURA ==========
    const modalOverlay = document.getElementById('modal-overlay');
    const modalClose = document.getElementById('modal-close');
    const modalGuardar = document.getElementById('modal-guardar');
    const modalNuevoSeguro = document.getElementById('modal-nuevo-seguro');

    const openModalCambioCobertura = (paciente) => {
        modalPacienteActual = paciente;

        document.getElementById('modal-paciente-nombre').textContent = `${paciente.apellidos}, ${paciente.nombres}`;
        document.getElementById('modal-paciente-info').textContent = `DNI: ${paciente.dni} | HC: ${paciente.historia_clinica || 'N/A'}`;

        const seguroActual = paciente.tipo_seguro || '';
        document.getElementById('modal-seguro-actual').value = seguroActual;
        document.getElementById('modal-seguro-extraido').value = getSeguroExtraido(paciente) || '';

        // Inhabilitar la opción del seguro actual en el select
        const opciones = modalNuevoSeguro.querySelectorAll('option');
        opciones.forEach(opt => {
            opt.disabled = opt.value && opt.value.toUpperCase() === seguroActual.toUpperCase();
        });
        modalNuevoSeguro.value = '';
        document.getElementById('modal-observacion').value = '';

        modalOverlay.style.display = 'flex';
    };

    const closeModal = () => {
        modalOverlay.style.display = 'none';
        modalPacienteActual = null;
    };

    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    modalGuardar.addEventListener('click', async () => {
        if (!modalPacienteActual) return;
        const nuevoSeguro = modalNuevoSeguro.value;
        if (!nuevoSeguro) {
            showToast('Seleccione un nuevo tipo de seguro', true);
            return;
        }

        const spinner = document.getElementById('modal-spinner');
        const guardarText = document.getElementById('modal-guardar-text');
        modalGuardar.disabled = true;
        spinner.style.display = 'inline-block';
        guardarText.textContent = 'Guardando...';

        try {
            const paciente = modalPacienteActual;
            const ahora = new Date().toISOString();
            const seguroExtraido = getSeguroExtraido(paciente) || '';

            // 1. Registrar evento de Cambio Cobertura en historial
            await supabaseClient.from('historial_eventos').insert({
                paciente_id: paciente.id,
                tipo_evento: 'Cambio Cobertura',
                detalle: document.getElementById('modal-observacion').value || `Cambio por validación RPA: ${paciente.tipo_seguro} → ${nuevoSeguro}`,
                nuevo_seguro: nuevoSeguro,
                fecha_evento: ahora
            });

            // 2. Comparar nuevo seguro con extraído
            const nuevoUpper = nuevoSeguro.toUpperCase();
            const extraidoUpper = seguroExtraido.toUpperCase();
            const nuevoEstado = (nuevoUpper === extraidoUpper || extraidoUpper.includes(nuevoUpper) || nuevoUpper.includes(extraidoUpper)) ? 'ÉXITO' : 'ALERTA';

            // 3. Actualizar paciente en BD
            await supabaseClient.from('pacientes').update({
                tipo_seguro: nuevoSeguro.toUpperCase(),
                estado_rpa: nuevoEstado,
                ultima_validacion_rpa: ahora
            }).eq('id', paciente.id);

            // 4. Registrar auditoría
            await supabaseClient.from('validaciones_rpa').insert({
                paciente_id: paciente.id,
                dni: paciente.dni,
                seguro_declarado: nuevoSeguro.toUpperCase(),
                seguro_extraido: seguroExtraido,
                estado_validacion: nuevoEstado,
                fecha_validacion: ahora
            });

            // 5. Actualizar datos locales ANTES de cerrar el modal
            paciente.tipo_seguro = nuevoSeguro.toUpperCase();
            paciente._estado_rpa = nuevoEstado;
            paciente.estado_rpa = nuevoEstado;
            paciente._ultima_validacion_rpa = ahora;

            // 6. Re-renderizar la tabla (fila deja de estar roja si es ÉXITO)
            renderTable();
            saveState();

            if (nuevoEstado === 'ÉXITO') {
                showToast('Cobertura actualizada correctamente ✅');
            } else {
                showToast('Cobertura actualizada — aún hay discrepancia', true);
            }

            // 7. Cerrar modal después de actualizar todo
            closeModal();

        } catch (err) {
            console.error('Error guardando cambio:', err);
            showToast('Error al guardar el cambio de cobertura', true);
        } finally {
            modalGuardar.disabled = false;
            spinner.style.display = 'none';
            guardarText.textContent = 'Actualizar Cobertura';
        }
    });

    restoreState();

    // ========== AUTO RPA ==========
    const params = new URLSearchParams(window.location.search);
    const autoRpaDni = params.get('autoRpaDni');
    if (autoRpaDni) {
        inputDNI.value = autoRpaDni;
        // Limpiar la URL para evitar que se vuelva a ejecutar al recargar la página
        window.history.replaceState({}, document.title, window.location.pathname);

        await loadPacientes(); // Esperar a que busque en la base de datos

        // Buscar el checkbox del DNI en la tabla recién renderizada
        const checkbox = tbodyPacientes.querySelector(`.patient-checkbox[data-dni="${autoRpaDni}"]`);
        if (checkbox) {
            // Simular el clic en el checkbox para activar el botón
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change'));

            // Simular clic en el botón Validar con un pequeñísimo delay para que la UI se actualice
            setTimeout(() => {
                btnValidar.click();
            }, 200);
        }
    }
});
