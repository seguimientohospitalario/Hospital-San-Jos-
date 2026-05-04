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

    let accumulatedResults = [];
    let selectedDNIs = []; // DNIs seleccionados para validación
    let crCurrentPage = 1;
    let crRowsPerPage = 10;

    const normalizeText = (text) => {
        if (!text) return '';
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    };

    const saveState = () => {
        try { sessionStorage.setItem('cr_accumulated', JSON.stringify(accumulatedResults)); } catch {}
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
        } catch {}
    };

    const showToast = (message, isError = false) => {
        const toast = document.getElementById('toast');
        const toastText = document.getElementById('toast-text');
        const toastIcon = document.getElementById('toast-icon');

        toast.className = isError ? 'toast-error' : 'toast-success';
        toastIcon.className = isError ? 'fa-solid fa-circle-xmark' : 'fa-solid fa-check-circle';
        toastText.textContent = message;

        toast.style.display = 'flex';
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.style.display = 'none', 400);
        }, 3000);
    };

    const updateActionsBar = () => {
        const selectedCount = document.getElementById('selected-count');
        const btnValidar = document.getElementById('btn-validar');
        
        selectedCount.textContent = selectedDNIs.length;
        btnValidar.disabled = selectedDNIs.length === 0;
    };

    const renderTable = () => {
        tbodyPacientes.innerHTML = '';
        if (accumulatedResults.length === 0) {
            tablePacientes.style.display = 'none';
            paginationContainer.innerHTML = '';
            return;
        }

        const totalPages = Math.ceil(accumulatedResults.length / crRowsPerPage) || 1;
        if (crCurrentPage > totalPages) crCurrentPage = totalPages;

        const start = (crCurrentPage - 1) * crRowsPerPage;
        const pageData = accumulatedResults.slice(start, start + crRowsPerPage);

        pageData.forEach(p => {
            const tr = document.createElement('tr');

            let nacFormateada = p.fecha_nacimiento || 'N/A';
            if (nacFormateada !== 'N/A') {
                const dateParts = nacFormateada.includes('-') ? nacFormateada.split('-') : nacFormateada.split('/');
                if (dateParts[0].length === 4) nacFormateada = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
            }

            tr.innerHTML = `
                <td style="text-align:center;">
                    <input type="checkbox" class="patient-checkbox" data-dni="${p.dni}" ${selectedDNIs.includes(p.dni) ? 'checked' : ''}>
                </td>
                <td>${p.dni}</td>
                <td>${p.apellidos}, ${p.nombres}</td>
                <td>${p.historia_clinica || 'N/A'}</td>
                <td>${nacFormateada}</td>
                <td style="font-weight: 600;">${p.tipo_seguro || 'NO DECLARADO'}</td>
                <td style="text-align:center;">
                    <button class="btn-module primary" style="padding:6px 12px; font-size:12px;" onclick="window.location.href='../seguimiento/seguimiento-pacientes.html?dni=${p.dni}'">
                        <i class="fa-solid fa-eye"></i> Ver Detalle
                    </button>
                </td>
            `;

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

            tbodyPacientes.appendChild(tr);
        });

        tablePacientes.style.display = 'table';
        renderPagination(totalPages);
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
                accumulatedResults = [];
            } else {
                accumulatedResults = data;
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
        renderTable();
    });

    const btnValidar = document.getElementById('btn-validar');
    btnValidar.addEventListener('click', async () => {
        if (selectedDNIs.length === 0) return;
        
        const spinner = document.getElementById('validar-spinner');
        btnValidar.disabled = true;
        spinner.style.display = 'inline-block';
        
        try {
            showToast(`Iniciando validación de ${selectedDNIs.length} pacientes...`);
            
            // Llamada real al backend de Railway
            const response = await fetch('https://hospital-san-jos-production.up.railway.app/validate-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dnis: selectedDNIs })
            });

            if (!response.ok) throw new Error('Error en la respuesta del servidor RPA');

            const result = await response.json();
            
            if (result.success) {
                showToast('Validación completada con éxito');
                
                result.results.forEach(res => {
                    const row = tbodyPacientes.querySelector(`input[data-dni="${res.dni}"]`)?.closest('tr');
                    if (row) {
                        const cellSeguroDeclarado = row.cells[5]; // Seguro que viene de BD
                        const cellSeguroExtraido = row.cells[6] || row.insertCell(6); // Nueva columna para resultado robot
                        
                        const seguroDeclarado = cellSeguroDeclarado.innerText.trim().toUpperCase();
                        const seguroExtraido = res.seguro.toUpperCase();
                        
                        // LÓGICA DE VALIDACIÓN
                        let isValid = false;
                        if (seguroExtraido.includes("NO TIENE DERECHO DE COBERTURA")) {
                            isValid = true;
                        } else if (seguroDeclarado === seguroExtraido || seguroExtraido.includes(seguroDeclarado)) {
                            isValid = true;
                        }

                        if (res.success) {
                            if (isValid) {
                                cellSeguroExtraido.innerHTML = `<span style="color: #10b981; font-weight: 700;">${res.seguro}</span> <br> <span class="badge-ok" style="background:#10b981; color:white; padding:2px 6px; border-radius:4px; font-size:10px;">COINCIDE ✅</span>`;
                            } else {
                                cellSeguroExtraido.innerHTML = `<span style="color: #ef4444; font-weight: 700;">${res.seguro}</span> <br> <span class="badge-alerta" style="background:#ef4444; color:white; padding:2px 6px; border-radius:4px; font-size:10px;">DISCREPANCIA ⚠️</span>`;
                                showToast(`Discrepancia detectada en DNI: ${res.dni}`, true);
                            }
                        } else {
                            cellSeguroExtraido.innerHTML = `<span style="color: #94a3b8;">Error en robot</span>`;
                        }
                    }
                });
            }

        } catch (err) {
            console.error('RPA Error:', err);
            showToast('Error al conectar con el servicio RPA: ' + err.message, true);
        } finally {
            btnValidar.disabled = false;
            spinner.style.display = 'none';
        }
    });

    restoreState();
});

