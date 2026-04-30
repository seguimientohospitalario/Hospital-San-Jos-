document.addEventListener('DOMContentLoaded', () => {
    const RPA_BACKEND_URL = 'https://rpa-hospital.onrender.com/api/validar-seguro';

    const btnGenerar = document.getElementById('btn-generar-global');
    const btnClear = document.getElementById('btn-clear');
    const tablePacientes = document.getElementById('table-pacientes');
    const tbodyPacientes = document.getElementById('tbody-pacientes');
    const loadingIndicator = document.getElementById('loading-indicator');
    const actionsBar = document.getElementById('actions-bar');

    const btnValidar = document.getElementById('btn-validar');
    const selectedCountSpan = document.getElementById('selected-count');
    const spinner = document.getElementById('validar-spinner');

    let accumulatedResults = [];
    let selectedPatients = [];
    const MAX_LIMIT = 50;

    const saveState = () => {
        try { 
            sessionStorage.setItem('vg_accumulated', JSON.stringify(accumulatedResults));
            // Actualizar IDs procesados hoy
            const today = new Date().toISOString().split('T')[0];
            const processedToday = JSON.parse(sessionStorage.getItem(`processed_today_${today}`) || '[]');
            const currentIds = accumulatedResults.map(p => p.id);
            const combined = [...new Set([...processedToday, ...currentIds])];
            sessionStorage.setItem(`processed_today_${today}`, JSON.stringify(combined));
        } catch {}
    };

    const restoreState = async () => {
        try {
            const saved = sessionStorage.getItem('vg_accumulated');
            if (saved) { 
                accumulatedResults = JSON.parse(saved); 
                await refreshLatestData();
            }
        } catch {}
    };

    const showToast = (message, isError = false) => {
        const toast = document.getElementById('toast');
        const toastIcon = document.getElementById('toast-icon');
        const toastText = document.getElementById('toast-text');
        toast.className = isError ? 'toast-error' : 'toast-success';
        toastIcon.className = isError ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-check-circle';
        toastText.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4000);
    };

    const getBadgeClass = (estado) => {
        if (!estado || estado === 'N/A') return 'badge-na';
        const s = estado.toUpperCase();
        if (s === 'OK' || s === 'CORRECTO') return 'badge-ok';
        if (s === 'ALERTA') return 'badge-alerta';
        if (s === 'ERROR') return 'badge-error';
        return 'badge-na';
    };

    const updateActionsBar = () => {
        selectedCountSpan.textContent = selectedPatients.length;
        btnValidar.disabled = selectedPatients.length === 0 || selectedPatients.length > MAX_LIMIT;
    };

    const renderTable = () => {
        tbodyPacientes.innerHTML = '';
        if (accumulatedResults.length === 0) {
            tablePacientes.style.display = 'none';
            actionsBar.style.display = 'flex'; // Mantener siempre visible
            updateActionsBar();
            return;
        }

        accumulatedResults.forEach(p => {
            const tr = document.createElement('tr');
            if (p.estado_validacion === 'ALERTA') tr.classList.add('row-alerta');

            const tdCheck = document.createElement('td');
            tdCheck.style.textAlign = 'center';
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = !!selectedPatients.find(sp => sp.id === p.id);
            chk.addEventListener('change', (e) => {
                if (e.target.checked) {
                    if (selectedPatients.length >= MAX_LIMIT) {
                        e.target.checked = false;
                        alert(`Máximo ${MAX_LIMIT} registros permitidos.`);
                        return;
                    }
                    selectedPatients.push(p);
                } else {
                    selectedPatients = selectedPatients.filter(sp => sp.id !== p.id);
                }
                updateActionsBar();
            });
            tdCheck.appendChild(chk);

            let ultimaVal = p.fecha_ultima_validacion || '-';
            if (ultimaVal !== '-') {
                const d = new Date(ultimaVal);
                ultimaVal = d.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }

            const hasValidation = p.estado_validacion && p.estado_validacion !== 'N/A';
            const btnDisplay = hasValidation ? 'inline-block' : 'none';

            tr.innerHTML = `
                <td>${p.dni}</td>
                <td>${p.apellidos}, ${p.nombres}</td>
                <td style="font-weight: 600;">${p.tipo_seguro || 'NO DECLARADO'}</td>
                <td>${p.tipo_seguro_validado || '-'}</td>
                <td><span class="${getBadgeClass(p.estado_validacion)}">${p.estado_validacion || 'N/A'}</span></td>
                <td style="color:#64748b; font-size: 12px;">${ultimaVal}</td>
                <td style="text-align:center;">
                    <button class="btn-module primary" style="display:${btnDisplay}; border:none; border-radius:6px; padding:6px 12px; cursor:pointer; font-size:13px;" onclick="window.location.href='../seguimiento/verificacion-paciente.html?dni=${p.dni}&from=global'">
                        <i class="fa-solid fa-rotate"></i>
                    </button>
                </td>
            `;
            tr.insertBefore(tdCheck, tr.firstChild);
            tbodyPacientes.appendChild(tr);
        });

        tablePacientes.style.display = 'table';
        actionsBar.style.display = 'flex';
        updateActionsBar();
    };

    const refreshLatestData = async () => {
        if (accumulatedResults.length === 0) return;
        const ids = accumulatedResults.map(p => p.id);
        const { data, error } = await supabaseClient.from('pacientes').select('*').in('id', ids);
        if (!error && data) {
            accumulatedResults = accumulatedResults.map(p => {
                const latest = data.find(l => l.id === p.id);
                if (!latest) return p;
                let updatedStatus = latest.estado_validacion;
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
                        if (updatedStatus === 'OK' || updatedStatus === 'CORRECTO' || !updatedStatus || updatedStatus === 'N/A') {
                            updatedStatus = 'ALERTA';
                            supabaseClient.from('pacientes').update({ estado_validacion: 'ALERTA' }).eq('id', p.id).then();
                        }
                    }
                }
                return { ...latest, estado_validacion: updatedStatus };
            });
            selectedPatients = selectedPatients.map(sp => accumulatedResults.find(r => r.id === sp.id) || sp);
            renderTable();
        }
    };

    btnGenerar.addEventListener('click', async () => {
        loadingIndicator.style.display = 'block';
        tablePacientes.style.display = 'none';
        actionsBar.style.display = 'none';

        const today = new Date().toISOString().split('T')[0];

        // Obtener pacientes que NO hayan sido validados hoy
        // Universo de 500 para barajar 50
        const { data, error } = await supabaseClient
            .from('pacientes')
            .select('*')
            .or(`fecha_ultima_validacion.is.null,fecha_ultima_validacion.lt.${today}T00:00:00`)
            .order('creado_en', { ascending: false })
            .limit(500);

        loadingIndicator.style.display = 'none';

        if (error || !data) {
            showToast('Error al obtener universo de pacientes', true);
            return;
        }

        if (data.length === 0) {
            showToast('No hay más pacientes pendientes de validación hoy.', true);
            return;
        }

        // Shuffle y pick 50
        const shuffled = data.sort(() => 0.5 - Math.random());
        accumulatedResults = shuffled.slice(0, MAX_LIMIT);
        
        // Auto-seleccionar todos
        selectedPatients = [...accumulatedResults];
        
        renderTable();
        saveState();
    });

    btnClear.addEventListener('click', () => {
        accumulatedResults = [];
        selectedPatients = [];
        sessionStorage.removeItem('vg_accumulated');
        renderTable();
    });

    btnValidar.addEventListener('click', async () => {
        if (selectedPatients.length === 0) return;

        btnValidar.disabled = true;
        spinner.style.display = 'inline-block';

        for (const paciente of selectedPatients) {
            try {
                let fechaArr = (paciente.fecha_nacimiento || '').split('-');
                let fechaStr = fechaArr.length === 3 ? `${fechaArr[2]}/${fechaArr[1]}/${fechaArr[0]}` : paciente.fecha_nacimiento;

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
                    if (extraido === 'NO TIENE DERECHO DE COBERTURA') estadoVal = 'CORRECTO';
                    else if (paciente.tipo_seguro && extraido !== 'SIN RESULTADOS') {
                        if (extraido.toUpperCase().includes(paciente.tipo_seguro.toUpperCase()) ||
                            paciente.tipo_seguro.toUpperCase().includes(extraido.toUpperCase())) {
                            estadoVal = 'OK';
                        }
                    }

                    await supabaseClient.from('pacientes').update({
                        tipo_seguro_validado: extraido,
                        estado_validacion: estadoVal,
                        fecha_ultima_validacion: new Date().toISOString()
                    }).eq('id', paciente.id);

                    const idx = accumulatedResults.findIndex(r => r.id === paciente.id);
                    if (idx !== -1) {
                        accumulatedResults[idx].tipo_seguro_validado = extraido;
                        accumulatedResults[idx].estado_validacion = estadoVal;
                        accumulatedResults[idx].fecha_ultima_validacion = new Date().toISOString();
                    }
                }
            } catch (err) { console.error(err); }
        }

        btnValidar.disabled = false;
        spinner.style.display = 'none';
        saveState();
        renderTable();
        showToast('Validación global completada');
    });

    restoreState();
    window.addEventListener('focus', refreshLatestData);
});
