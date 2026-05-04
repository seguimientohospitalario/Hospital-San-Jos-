document.addEventListener('DOMContentLoaded', async () => {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : supabase;
    const { data: { session } } = await client.auth.getSession();

    if (!session) {
        window.location.href = '../../index.html';
        return;
    }

    const userId = session.user.id;

    // DOM - Búsqueda (Nuevos IDs de Verificación)
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

    // DOM - Timeline (Diseño Verificación)
    const viewTimeline = document.getElementById('view-timeline');
    const btnBackToList = document.getElementById('btn-back-to-list');
    const bannerNombre = document.getElementById('banner-paciente-nombre');
    const bannerInfo = document.getElementById('banner-paciente-info');
    const bannerDias = document.getElementById('banner-dias');
    const bannerCondicion = document.getElementById('banner-condicion');
    const timelineContainer = document.getElementById('timeline-container');
    const timelineEmpty = document.getElementById('timeline-empty');

    // Formulario de Eventos
    const eventForm = document.getElementById('event-form');
    const eventoTipo = document.getElementById('evento-tipo');
    const eventoDetalle = document.getElementById('evento-detalle');
    const grupoNuevoSeguro = document.getElementById('grupo-nuevo-seguro');
    const eventoNuevoSeguro = document.getElementById('evento-nuevo-seguro');
    const grupoNuevoSeguroOtros = document.getElementById('grupo-nuevo-seguro-otros');
    const eventoNuevoSeguroOtros = document.getElementById('evento-nuevo-seguro-otros');
    const grupoServicioDe = document.getElementById('grupo-servicio-de');
    const eventoServicioDe = document.getElementById('evento-servicio-de');
    const grupoServicioHacia = document.getElementById('grupo-servicio-hacia');
    const eventoServicioHacia = document.getElementById('evento-servicio-hacia');
    const btnRegistrar = document.getElementById('btn-registrar-evento');
    const registrarText = document.getElementById('registrar-text');
    const registrarSpinner = document.getElementById('registrar-spinner');

    // State
    let currentPage = 1;
    let rowsPerPage = 10;
    let totalRecords = 0;
    let selectedPatient = null;
    let currentCiclo = 1;

    const normalizeText = (text) => {
        if (!text) return '';
        return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
    };

    const showToast = (text, isError = false) => {
        const toastText = document.getElementById('toast-text');
        toastText.textContent = text;
        toast.className = isError ? 'toast-error' : 'toast-success';
        toast.style.display = 'flex';
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.style.display = 'none', 400);
        }, 3000);
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
            console.error('Error:', error.message);
            showToast('Error al buscar pacientes', true);
        } finally {
            loadingIndicator.style.display = 'none';
            tablePacientes.style.display = 'table';
        }
    };

    const renderTable = (items) => {
        tbodyPacientes.innerHTML = '';
        if (items.length === 0) {
            tbodyPacientes.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px; color:#94a3b8;">No se encontraron pacientes.</td></tr>';
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            
            const condValue = (item.condicion || '').toLowerCase();
            const condClass = condValue === 'hospitalizado' ? 'cond-hospitalizado' : (condValue === 'fallecido' ? 'cond-fallecido' : 'cond-alta');

            row.innerHTML = `
                <td>${item.dni}</td>
                <td>${item.apellidos}, ${item.nombres}</td>
                <td>${item.historia_clinica}</td>
                <td><span class="seguro-badge">${item.tipo_seguro}</span></td>
                <td>${item.servicio || '-'}</td>
                <td><span class="condicion-badge ${condClass}">${item.condicion}</span></td>
                <td style="text-align: center;">
                    <button class="btn-module primary btn-select-patient" data-id="${item.id}" style="padding: 5px 10px; font-size: 12px;">
                        <i class="fa-solid fa-timeline"></i> Actualizar
                    </button>
                </td>
            `;

            row.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    window.location.href = `detalle-paciente.html?dni=${item.dni}&from=seg`;
                }
            });

            row.querySelector('.btn-select-patient').addEventListener('click', (e) => {
                e.stopPropagation();
                openTimeline(item);
            });

            tbodyPacientes.appendChild(row);
        });
    };

    const openTimeline = async (patient) => {
        selectedPatient = patient;
        
        // DISEÑO VERIFICACIÓN: Ocultar todo lo demás
        searchFilters.style.display = 'none';
        viewResultados.style.display = 'none';
        viewTimeline.style.display = 'block';
        
        const condClass = patient.condicion === 'Hospitalizado' ? 'cond-hospitalizado' : (patient.condicion === 'Fallecido' ? 'cond-fallecido' : 'cond-alta');
        const seguroClass = patient.tipo_seguro.toLowerCase().includes('sis') ? 'badge-sis' : 'badge-otros';

        // Renderizado EXACTO como la imagen del usuario
        bannerNombre.textContent = `PACIENTE: ${patient.apellidos}, ${patient.nombres}`;
        bannerInfo.textContent = `DNI: ${patient.dni} | HC: ${patient.historia_clinica} | Seguro: ${patient.tipo_seguro} | Servicio: ${patient.servicio || 'N/A'}`;
        
        // Reset form
        eventForm.reset();
        grupoNuevoSeguro.style.display = 'none';
        grupoServicioDe.style.display = 'none';
        grupoServicioHacia.style.display = 'none';

        // Cargar ciclo actual
        const { data } = await client.from('historial_eventos').select('ciclo_id').eq('paciente_id', patient.id).order('ciclo_id', { ascending: false }).limit(1);
        currentCiclo = (data && data.length > 0) ? data[0].ciclo_id : 1;

        await loadTimelineEvents();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const loadTimelineEvents = async () => {
        try {
            const { data: eventos, error } = await client
                .from('historial_eventos')
                .select('*')
                .eq('paciente_id', selectedPatient.id)
                .eq('ciclo_id', currentCiclo)
                .order('fecha_evento', { ascending: true });

            if (error) throw error;
            renderTimeline(eventos || []);
            updateStats(eventos || []);
        } catch (error) {
            console.error(error);
        }
    };

    const renderTimeline = (eventos) => {
        const existing = timelineContainer.querySelectorAll('.timeline-event');
        existing.forEach(el => el.remove());

        if (eventos.length === 0) {
            timelineEmpty.style.display = 'block';
            return;
        }
        timelineEmpty.style.display = 'none';

        eventos.forEach(ev => {
            const el = document.createElement('div');
            el.className = 'timeline-event';
            const fecha = new Date(ev.fecha_evento).toLocaleString('es-PE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
            
            const dotClass = ev.tipo_evento === 'Hospitalizado' ? 'dot-hospitalizado' : (ev.tipo_evento === 'Alta' ? 'dot-alta' : (ev.tipo_evento === 'Fallecido' ? 'dot-fallecido' : 'dot-cambio'));
            const iconClass = ev.tipo_evento === 'Hospitalizado' ? 'fa-solid fa-bed' : (ev.tipo_evento === 'Alta' ? 'fa-solid fa-house-medical-circle-check' : (ev.tipo_evento === 'Fallecido' ? 'fa-solid fa-heart-crack' : 'fa-solid fa-rotate'));

            el.innerHTML = `
                <div class="timeline-dot ${dotClass}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-event-header">
                        <span class="timeline-event-type ${dotClass}">${ev.tipo_evento}</span>
                        <span class="timeline-event-date">${fecha}</span>
                    </div>
                    ${ev.detalle ? `<p class="timeline-detail">${ev.detalle}</p>` : ''}
                    ${ev.nuevo_seguro ? `<p style="margin:5px 0 0; font-size:12px; color:#0ea5e9; font-weight:600;">\u2192 Nuevo Seguro: ${ev.nuevo_seguro}</p>` : ''}
                    ${ev.servicio_hacia ? `<p style="margin:2px 0 0; font-size:12px; color:#10b981; font-weight:600;">\u2192 Traslado a: ${ev.servicio_hacia}</p>` : ''}
                </div>
            `;
            timelineContainer.appendChild(el);
        });
    };

    const updateStats = (eventos) => {
        let ingreso = eventos.find(e => e.tipo_evento === 'Hospitalizado');
        let alta = eventos.find(e => e.tipo_evento === 'Alta' || e.tipo_evento === 'Fallecido');
        
        if (ingreso) {
            const start = new Date(ingreso.fecha_evento);
            const end = alta ? new Date(alta.fecha_evento) : new Date();
            const dias = Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
            bannerDias.textContent = `${dias} ${dias === 1 ? 'día' : 'días'}`;
            bannerDias.className = `dias-badge ${alta ? 'dias-alta' : 'dias-activo'}`;
            bannerDias.style.display = 'flex';
        } else {
            bannerDias.style.display = 'none';
        }

        // Mantener la clase de condición basada en el último evento o el estado actual
        const condVal = (selectedPatient.condicion || '').toLowerCase();
        const condClass = condVal === 'hospitalizado' ? 'cond-hospitalizado' : (condVal === 'fallecido' ? 'cond-fallecido' : 'cond-alta');
        bannerCondicion.textContent = selectedPatient.condicion;
        bannerCondicion.className = 'condicion-badge ' + condClass;
    };

    // Form Handlers
    eventoTipo.addEventListener('change', (e) => {
        const v = e.target.value;
        grupoNuevoSeguro.style.display = v === 'Cambio Cobertura' ? 'block' : 'none';
        grupoServicioDe.style.display = v === 'Cambio de Servicio' ? 'block' : 'none';
        grupoServicioHacia.style.display = v === 'Cambio de Servicio' ? 'block' : 'none';
        
        if (v === 'Cambio de Servicio') eventoServicioDe.value = selectedPatient.servicio || 'N/A';
    });

    eventoNuevoSeguro.addEventListener('change', (e) => {
        grupoNuevoSeguroOtros.style.display = e.target.value === 'Otros' ? 'block' : 'none';
    });

    eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        btnRegistrar.disabled = true;
        registrarSpinner.style.display = 'inline-block';
        registrarText.textContent = 'Registrando...';

        try {
            const tipo = eventoTipo.value;
            const payload = {
                paciente_id: selectedPatient.id,
                tipo_evento: tipo,
                detalle: eventoDetalle.value,
                ciclo_id: currentCiclo,
                registrado_por: userId
            };

            if (tipo === 'Cambio Cobertura') {
                payload.nuevo_seguro = eventoNuevoSeguro.value === 'Otros' ? eventoNuevoSeguroOtros.value : eventoNuevoSeguro.value;
            }
            if (tipo === 'Cambio de Servicio') {
                payload.servicio_de = selectedPatient.servicio;
                payload.servicio_hacia = eventoServicioHacia.value;
            }

            const { error } = await client.from('historial_eventos').insert([payload]);
            if (error) throw error;

            const { data: up } = await client.from('pacientes').select('*').eq('id', selectedPatient.id).single();
            selectedPatient = up;
            
            showToast('Evento registrado con éxito');
            eventForm.reset();
            await loadTimelineEvents();
            searchPacientes(); 
        } catch (err) {
            showToast(err.message, true);
        } finally {
            btnRegistrar.disabled = false;
            registrarSpinner.style.display = 'none';
            registrarText.textContent = 'Registrar Evento';
        }
    });

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

    btnBackToList.addEventListener('click', () => {
        viewTimeline.style.display = 'none';
        searchFilters.style.display = 'grid';
        viewResultados.style.display = 'block';
    });

    // AUTO-OPEN TIMELINE SI VIENE DNI POR URL
    const urlParams = new URLSearchParams(window.location.search);
    const dniParam = urlParams.get('dni');
    if (dniParam) {
        setTimeout(async () => {
            const { data: p, error } = await client
                .from('pacientes')
                .select('*')
                .eq('dni', dniParam)
                .single();
            if (p) openTimeline(p);
        }, 500);
    }

    searchPacientes();
});
