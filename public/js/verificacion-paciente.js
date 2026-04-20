document.addEventListener('DOMContentLoaded', async () => {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : supabase;
    const { data: { session } } = await client.auth.getSession();

    if (!session) {
        window.location.href = '../../index.html';
        return;
    }
    const userId = session.user.id;

    // DOM - Filtros
    const filterDni = document.getElementById('filter-dni');
    const filterHc = document.getElementById('filter-hc');
    const filterApellidos = document.getElementById('filter-apellidos');
    const filterNombres = document.getElementById('filter-nombres');
    const btnSearch = document.getElementById('btn-search');
    const btnClear = document.getElementById('btn-clear');

    // DOM - Vistas
    const searchFilters = document.getElementById('search-filters');
    const viewResultados = document.getElementById('view-resultados');
    const viewTimeline = document.getElementById('view-timeline');
    const tablePacientes = document.getElementById('table-pacientes');
    const tbodyPacientes = document.getElementById('tbody-pacientes');
    const loadingIndicator = document.getElementById('loading-indicator');

    // DOM - Timeline
    const timelineContainer = document.getElementById('timeline-container');
    const timelineEmpty = document.getElementById('timeline-empty');
    const bannerNombre = document.getElementById('banner-paciente-nombre');
    const bannerInfo = document.getElementById('banner-paciente-info');
    const bannerDias = document.getElementById('banner-dias');
    const bannerCondicion = document.getElementById('banner-condicion');
    const btnBackToList = document.getElementById('btn-back-to-list');

    // DOM - Formulario
    const eventForm = document.getElementById('event-form');
    const eventoTipo = document.getElementById('evento-tipo');
    const eventoDetalle = document.getElementById('evento-detalle');
    const eventoNuevoSeguro = document.getElementById('evento-nuevo-seguro');
    const eventoNuevoSeguroOtros = document.getElementById('evento-nuevo-seguro-otros');
    const grupoNuevoSeguro = document.getElementById('grupo-nuevo-seguro');
    const grupoNuevoSeguroOtros = document.getElementById('grupo-nuevo-seguro-otros');
    const btnRegistrar = document.getElementById('btn-registrar-evento');
    const registrarText = document.getElementById('registrar-text');
    const registrarSpinner = document.getElementById('registrar-spinner');
    const toast = document.getElementById('toast');

    let selectedPatient = null;

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

    const getCondicionClass = (condicion) => {
        if (condicion === 'Hospitalizado') return 'cond-hospitalizado';
        if (condicion === 'Alta' || condicion === 'Sali\u00F3 de Alta') return 'cond-alta';
        if (condicion === 'Fallecido') return 'cond-fallecido';
        return '';
    };

    // ============================================
    // BUSQUEDA DE PACIENTES
    // ============================================
    const searchPacientes = async () => {
        const dni = filterDni.value.trim();
        const hc = filterHc.value.trim();
        const apellidos = normalizeText(filterApellidos.value.trim());
        const nombres = normalizeText(filterNombres.value.trim());

        if (!dni && !hc && !apellidos && !nombres) {
            showToast('Ingrese al menos un criterio de b\u00FAsqueda', '#ef4444');
            return;
        }

        try {
            loadingIndicator.style.display = 'block';
            tablePacientes.style.display = 'none';
            tbodyPacientes.innerHTML = '';

            let query = client.from('pacientes').select('*');

            if (dni) query = query.ilike('dni', '%' + dni + '%');
            if (hc) query = query.ilike('historia_clinica', '%' + hc + '%');
            if (apellidos) query = query.ilike('apellidos', '%' + apellidos + '%');
            if (nombres) query = query.ilike('nombres', '%' + nombres + '%');

            const { data, error } = await query.limit(10);
            if (error) throw error;

            renderSearchTable(data);
        } catch (error) {
            console.error('Error buscando pacientes:', error.message);
            showToast('Error al buscar pacientes', '#ef4444');
        } finally {
            loadingIndicator.style.display = 'none';
            tablePacientes.style.display = 'table';
        }
    };

    const renderSearchTable = (items) => {
        tbodyPacientes.innerHTML = '';
        if (!items || items.length === 0) {
            tbodyPacientes.innerHTML = '<tr><td colspan="7" style="text-align:center; padding: 30px; color:#94a3b8;">No se encontraron pacientes con esos criterios.</td></tr>';
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${item.dni}</strong></td>
                <td>${item.apellidos}, ${item.nombres}</td>
                <td>${item.historia_clinica}</td>
                <td><span class="seguro-badge">${item.tipo_seguro}</span></td>
                <td>${item.servicio || '-'}</td>
                <td><span class="condicion-badge ${getCondicionClass(item.condicion)}">${item.condicion}</span></td>
                <td style="text-align: center;">
                    <button class="btn-module primary btn-select-patient" data-id="${item.id}" style="padding: 5px 10px; font-size: 12px;">
                        <i class="fa-solid fa-timeline"></i> Verificar
                    </button>
                </td>
            `;
            tbodyPacientes.appendChild(row);
        });

        document.querySelectorAll('.btn-select-patient').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const patient = items.find(p => p.id == id);
                if (patient) openTimeline(patient);
            });
        });
    };

    // ============================================
    // TIMELINE
    // ============================================
    const openTimeline = async (patient) => {
        selectedPatient = patient;

        // Ocultar busqueda, mostrar timeline
        searchFilters.style.display = 'none';
        viewResultados.style.display = 'none';
        viewTimeline.style.display = 'block';

        // Banner
        bannerNombre.textContent = 'PACIENTE: ' + patient.apellidos + ', ' + patient.nombres;
        bannerInfo.textContent = 'DNI: ' + patient.dni + ' | HC: ' + patient.historia_clinica + ' | Seguro: ' + patient.tipo_seguro + (patient.seguro_otros ? ' (' + patient.seguro_otros + ')' : '') + ' | Servicio: ' + (patient.servicio || 'N/A');

        // Reset form
        eventForm.reset();
        grupoNuevoSeguro.style.display = 'none';
        grupoNuevoSeguroOtros.style.display = 'none';

        await loadTimeline();
    };

    const loadTimeline = async () => {
        try {
            const { data: eventos, error } = await client
                .from('historial_eventos')
                .select('*')
                .eq('paciente_id', selectedPatient.id)
                .order('fecha_evento', { ascending: true });

            if (error) throw error;

            renderTimeline(eventos || []);
            updateBannerStats(eventos || []);
        } catch (error) {
            console.error('Error cargando timeline:', error.message);
            showToast('Error al cargar historial', '#ef4444');
        }
    };

    const renderTimeline = (eventos) => {
        // Limpiar contenedor (excepto el empty msg)
        const existingEvents = timelineContainer.querySelectorAll('.timeline-event');
        existingEvents.forEach(el => el.remove());

        if (!eventos || eventos.length === 0) {
            timelineEmpty.style.display = 'block';
            return;
        }

        timelineEmpty.style.display = 'none';

        eventos.forEach(ev => {
            const eventEl = document.createElement('div');
            eventEl.className = 'timeline-event';

            const dotClass = getEventDotClass(ev.tipo_evento);
            const iconClass = getEventIcon(ev.tipo_evento);
            const fecha = new Date(ev.fecha_evento);
            const fechaStr = fecha.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const horaStr = fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

            let detalleHTML = ev.detalle ? '<p class="timeline-detail">' + ev.detalle + '</p>' : '';

            if (ev.tipo_evento === 'Cambio Cobertura' && ev.nuevo_seguro) {
                detalleHTML += '<p class="timeline-detail" style="font-style: italic;">Nuevo seguro: <strong>' + ev.nuevo_seguro + '</strong>' + (ev.nuevo_seguro_otros ? ' (' + ev.nuevo_seguro_otros + ')' : '') + '</p>';
            }

            eventEl.innerHTML = `
                <div class="timeline-dot ${dotClass}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-event-header">
                        <span class="timeline-event-type ${dotClass}">${ev.tipo_evento}</span>
                        <span class="timeline-event-date">${fechaStr} - ${horaStr}</span>
                    </div>
                    ${detalleHTML}
                </div>
            `;
            timelineContainer.appendChild(eventEl);
        });
    };

    const getEventDotClass = (tipo) => {
        if (tipo === 'Hospitalizado') return 'dot-hospitalizado';
        if (tipo === 'Cambio Cobertura') return 'dot-cambio';
        if (tipo === 'Alta') return 'dot-alta';
        if (tipo === 'Fallecido') return 'dot-fallecido';
        return '';
    };

    const getEventIcon = (tipo) => {
        if (tipo === 'Hospitalizado') return 'fa-solid fa-bed';
        if (tipo === 'Cambio Cobertura') return 'fa-solid fa-shield-halved';
        if (tipo === 'Alta') return 'fa-solid fa-house-medical-circle-check';
        if (tipo === 'Fallecido') return 'fa-solid fa-heart-crack';
        return 'fa-solid fa-circle';
    };

    const updateBannerStats = (eventos) => {
        // Refrescar condicion del paciente desde BD
        // Calcular dias
        let ultimoIngreso = null;
        let ultimaAlta = null;

        for (let i = eventos.length - 1; i >= 0; i--) {
            const ev = eventos[i];
            if ((ev.tipo_evento === 'Alta' || ev.tipo_evento === 'Fallecido') && !ultimaAlta) {
                ultimaAlta = new Date(ev.fecha_evento);
            }
            if (ev.tipo_evento === 'Hospitalizado') {
                ultimoIngreso = new Date(ev.fecha_evento);
                break;
            }
        }

        const condicion = selectedPatient.condicion;
        let diasTexto = 'Sin registro';
        let diasClase = '';

        if (ultimoIngreso) {
            const fin = (condicion === 'Hospitalizado') ? new Date() : (ultimaAlta || new Date());
            const dias = Math.max(0, Math.ceil((fin - ultimoIngreso) / (1000 * 60 * 60 * 24)));
            diasTexto = dias + (dias === 1 ? ' d\u00EDa' : ' d\u00EDas');
            diasClase = condicion === 'Hospitalizado' ? 'dias-activo' : 'dias-alta';
        }

        bannerDias.textContent = diasTexto;
        bannerDias.className = 'dias-badge ' + diasClase;
        bannerCondicion.textContent = condicion;
        bannerCondicion.className = 'condicion-badge ' + getCondicionClass(condicion);
    };

    // ============================================
    // MOSTRAR/OCULTAR CAMPOS DE CAMBIO COBERTURA
    // ============================================
    eventoTipo.addEventListener('change', (e) => {
        if (e.target.value === 'Cambio Cobertura') {
            grupoNuevoSeguro.style.display = 'block';
        } else {
            grupoNuevoSeguro.style.display = 'none';
            grupoNuevoSeguroOtros.style.display = 'none';
        }
    });

    eventoNuevoSeguro.addEventListener('change', (e) => {
        if (e.target.value === 'Otros') {
            grupoNuevoSeguroOtros.style.display = 'block';
        } else {
            grupoNuevoSeguroOtros.style.display = 'none';
        }
    });

    // ============================================
    // REGISTRAR EVENTO
    // ============================================
    eventForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tipo = eventoTipo.value;
        if (!tipo) {
            showToast('Seleccione un tipo de evento', '#ef4444');
            return;
        }

        // Validaciones
        if (tipo === 'Cambio Cobertura' && !eventoNuevoSeguro.value) {
            showToast('Seleccione el nuevo tipo de seguro', '#ef4444');
            return;
        }

        btnRegistrar.disabled = true;
        registrarText.textContent = 'Registrando...';
        registrarSpinner.style.display = 'inline-block';

        try {
            const payload = {
                paciente_id: selectedPatient.id,
                tipo_evento: tipo,
                detalle: eventoDetalle.value.trim() || null,
                registrado_por: userId
            };

            if (tipo === 'Cambio Cobertura') {
                payload.nuevo_seguro = eventoNuevoSeguro.value;
                payload.nuevo_seguro_otros = eventoNuevoSeguro.value === 'Otros' ? eventoNuevoSeguroOtros.value.trim() : null;
            }

            const { error } = await client.from('historial_eventos').insert([payload]);
            if (error) throw error;

            // Refrescar datos del paciente (el trigger pudo haber cambiado la condicion/seguro)
            const { data: updatedPatient } = await client
                .from('pacientes')
                .select('*')
                .eq('id', selectedPatient.id)
                .single();

            if (updatedPatient) {
                selectedPatient = updatedPatient;
                // Actualizar banner info
                bannerInfo.textContent = 'DNI: ' + selectedPatient.dni + ' | HC: ' + selectedPatient.historia_clinica + ' | Seguro: ' + selectedPatient.tipo_seguro + (selectedPatient.seguro_otros ? ' (' + selectedPatient.seguro_otros + ')' : '') + ' | Servicio: ' + (selectedPatient.servicio || 'N/A');
            }

            showToast('Evento registrado exitosamente', '#10b981');
            eventForm.reset();
            grupoNuevoSeguro.style.display = 'none';
            grupoNuevoSeguroOtros.style.display = 'none';

            await loadTimeline();
        } catch (err) {
            console.error('Error registrando evento:', err);
            showToast(err.message || 'Error al registrar evento', '#ef4444');
        } finally {
            btnRegistrar.disabled = false;
            registrarText.textContent = 'Registrar Evento';
            registrarSpinner.style.display = 'none';
        }
    });

    // ============================================
    // NAVEGACION
    // ============================================
    btnBackToList.addEventListener('click', () => {
        viewTimeline.style.display = 'none';
        viewResultados.style.display = 'block';
        searchFilters.style.display = 'grid';
        selectedPatient = null;
    });

    btnSearch.addEventListener('click', searchPacientes);

    [filterDni, filterHc, filterApellidos, filterNombres].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchPacientes();
        });
    });

    btnClear.addEventListener('click', () => {
        filterDni.value = '';
        filterHc.value = '';
        filterApellidos.value = '';
        filterNombres.value = '';
        tbodyPacientes.innerHTML = '';
        tablePacientes.style.display = 'none';
    });

    // ============================================
    // AUTO-CARGA POR QUERY PARAM
    // ============================================
    const urlParams = new URLSearchParams(window.location.search);
    const dniParam = urlParams.get('dni');

    if (dniParam) {
        filterDni.value = dniParam;
        try {
            const { data, error } = await client
                .from('pacientes')
                .select('*')
                .eq('dni', dniParam)
                .single();

            if (error) throw error;
            if (data) {
                openTimeline(data);
            }
        } catch (err) {
            console.error('Error cargando paciente por DNI:', err.message);
            showToast('No se encontr\u00F3 paciente con DNI ' + dniParam, '#ef4444');
        }
    }
});
