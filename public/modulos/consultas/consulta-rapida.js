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

    // Restore filters from sessionStorage
    if (sessionStorage.getItem('cr_filter_dni')) inputDNI.value = sessionStorage.getItem('cr_filter_dni');
    if (sessionStorage.getItem('cr_filter_hc')) inputHC.value = sessionStorage.getItem('cr_filter_hc');
    if (sessionStorage.getItem('cr_filter_apellidos')) inputApellidos.value = sessionStorage.getItem('cr_filter_apellidos');

    const showToast = (message, isError = false) => {
        const toast = document.getElementById('toast');
        const toastIcon = document.getElementById('toast-icon');
        const toastText = document.getElementById('toast-text');

        toast.className = isError ? 'toast-error' : 'toast-success';
        toastIcon.className = isError ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-check-circle';
        toastText.textContent = message;

        toast.style.display = 'flex';
        setTimeout(() => toast.style.display = 'none', 4000);
    };

    const updateActionsBar = () => {
        selectedCountSpan.textContent = selectedPatients.length;
        if (selectedPatients.length > 0 && selectedPatients.length <= 2) {
            btnValidar.disabled = false;
            btnValidar.style.cursor = 'pointer';
            btnValidar.style.opacity = '1';
        } else {
            btnValidar.disabled = true;
            btnValidar.style.cursor = 'not-allowed';
            btnValidar.style.opacity = '0.6';
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

    const renderAccumulatedTable = () => {
        tbodyPacientes.innerHTML = '';
        if (accumulatedResults.length === 0) {
            tablePacientes.style.display = 'none';
            actionsBar.style.display = 'none';
            return;
        }

        accumulatedResults.forEach(p => {
            const tr = document.createElement('tr');

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

            const badgeClass = p.estado_validacion === 'OK' ? 'badge-ok' : (p.estado_validacion === 'ALERTA' ? 'badge-alerta' : 'badge-na');

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

            tr.innerHTML = `
                <td>${p.dni} <br><small style="color:#64748b;">CUI: ${p.codigo_verificacion || 'N/A'}</small></td>
                <td><strong>${p.apellidos}</strong>, ${p.nombres} <br><small style="color:#64748b;">Nac: ${nacFormateada}</small></td>
                <td style="font-weight: 600;">${p.tipo_seguro || 'NO DECLARADO'}</td>
                <td id="ext-${p.id}" style="color: #475569;">${p.tipo_seguro_validado || '-'}</td>
                <td id="badge-${p.id}"><span class="${badgeClass}">${p.estado_validacion || 'N/A'}</span></td>
            `;

            tr.insertBefore(tdCheck, tr.firstChild);
            tbodyPacientes.appendChild(tr);
        });

        tablePacientes.style.display = 'table';
        actionsBar.style.display = 'flex';
    };

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

        // Agregar resultados únicos al inicio
        data.forEach(newPatient => {
            if (!accumulatedResults.find(p => p.id === newPatient.id)) {
                accumulatedResults.unshift(newPatient);
            }
        });

        // Limitar a máximo 5 usuarios en la tabla
        if (accumulatedResults.length > 5) {
            accumulatedResults = accumulatedResults.slice(0, 5);
        }

        // Limpiar de selectedPatients si fueron eliminados por el límite
        selectedPatients = selectedPatients.filter(sp => accumulatedResults.find(ar => ar.id === sp.id));
        updateActionsBar();

        renderAccumulatedTable();
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
        tbodyPacientes.innerHTML = '';
        tablePacientes.style.display = 'none';
        actionsBar.style.display = 'none';
        selectedPatients = [];
        accumulatedResults = [];
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
                    // Si el bot extrajo datos correctamente (o "NO TIENE DERECHO DE COBERTURA")
                    const extraido = result.tipo_seguro_extraido || 'SIN RESULTADOS';
                    let estadoVal = 'ALERTA';

                    // Simple comparativa con lo declarado
                    if (paciente.tipo_seguro && extraido !== 'SIN RESULTADOS') {
                        // Si el extraído contiene lo declarado (ej: ESSALUD vs ESSALUD Regular)
                        if (extraido.toUpperCase().includes(paciente.tipo_seguro.toUpperCase()) || paciente.tipo_seguro.toUpperCase().includes(extraido.toUpperCase())) {
                            estadoVal = 'OK';
                        }
                    }

                    // Actualizar UI
                    extCell.textContent = extraido;
                    badgeCell.innerHTML = `<span class="${estadoVal === 'OK' ? 'badge-ok' : 'badge-alerta'}">${estadoVal}</span>`;

                    // Guardar en BD
                    await supabaseClient.from('pacientes').update({
                        tipo_seguro_validado: extraido,
                        estado_validacion: estadoVal,
                        fecha_ultima_validacion: new Date().toISOString()
                    }).eq('id', paciente.id);

                    successCount++;
                } else {
                    if (result.error === 'CAPTCHA_REQUIRED') {
                        extCell.innerHTML = '<span style="color: #ef4444; font-size: 12px;"><i class="fa-solid fa-triangle-exclamation"></i> Requiere Validar Captcha Manual</span>';
                        badgeCell.innerHTML = '<span class="badge-alerta">ALERTA</span>';
                    } else {
                        const errorMsg = result.message || 'Datos incorrectos';
                        extCell.innerHTML = `<span style="color: #ef4444; font-size: 12px;"><i class="fa-solid fa-circle-xmark"></i> ${errorMsg}</span>`;
                        badgeCell.innerHTML = '<span class="badge-alerta">ERROR</span>';
                    }
                }
            } catch (err) {
                console.error("Fetch error:", err);
                extCell.innerHTML = `<span style="color: #ef4444; font-size: 12px;">Error de conexión RPA</span>`;
                badgeCell.innerHTML = '<span class="badge-alerta">ERROR</span>';
            }
        }

        // Unblock UI
        const overlayToRemove = document.getElementById('rpa-blocking-overlay');
        if (overlayToRemove) {
            document.body.removeChild(overlayToRemove);
        }

        btnValidar.disabled = false;
        spinner.style.display = 'none';

        // Deseleccionar
        document.querySelectorAll('input[type="checkbox"]').forEach(c => c.checked = false);
        selectedPatients = [];
        updateActionsBar();

        if (successCount > 0) showToast(`Validación completada (${successCount} procesados)`);
    });

    // Carga inicial o Auto-Ejecución desde tabla de registros
    const urlParams = new URLSearchParams(window.location.search);
    const autoDni = urlParams.get('autoRpaDni');

    if (autoDni) {
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
        if (inputDNI.value || inputHC.value || inputApellidos.value) {
            loadPacientes();
        }
    }
});
