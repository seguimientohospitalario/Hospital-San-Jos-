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
    
    const grupoServicioDe = document.getElementById('grupo-servicio-de');
    const grupoServicioHacia = document.getElementById('grupo-servicio-hacia');
    const eventoServicioDe = document.getElementById('evento-servicio-de');
    const eventoServicioHacia = document.getElementById('evento-servicio-hacia');

    const btnRegistrar = document.getElementById('btn-registrar-evento');
    const registrarText = document.getElementById('registrar-text');
    const registrarSpinner = document.getElementById('registrar-spinner');
    const toast = document.getElementById('toast');

    let selectedPatient = null;
    let currentCiclo = null;

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

        sessionStorage.setItem('vp_filter_dni', dni);
        sessionStorage.setItem('vp_filter_hc', hc);
        sessionStorage.setItem('vp_filter_apellidos', apellidos);
        sessionStorage.setItem('vp_filter_nombres', nombres);

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
            tbodyPacientes.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px; color:#94a3b8;">No se encontraron pacientes con esos criterios.</td></tr>';
            return;
        }

        items.forEach((item, idx) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.dni}</td>
                <td>${item.apellidos}, ${item.nombres}</td>
                <td>${item.historia_clinica}</td>
                <td><span class="seguro-badge">${item.tipo_seguro}</span></td>
                <td>${item.servicio || '-'}</td>
                <td><span class="condicion-badge ${getCondicionClass(item.condicion)}">${item.condicion}</span></td>
                <td style="text-align: center;">
                    <button class="btn-module primary btn-select-patient" data-id="${item.id}" style="padding: 5px 10px; font-size: 12px;">
                        <i class="fa-solid fa-timeline"></i> Actualizar
                    </button>
                </td>
            `;
            
            // Click en la fila para ir al detalle (historial real)
            row.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    window.location.href = `detalle-paciente.html?dni=${item.dni}&from=verif`;
                }
            });
            
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
    const openTimeline = async (patient, autoLoadCiclo = null) => {
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
        grupoServicioDe.style.display = 'none';
        grupoServicioHacia.style.display = 'none';

        // Validacion Fallecido
        if (patient.condicion === 'Fallecido') {
            btnRegistrar.disabled = true;
            registrarText.textContent = 'Registro bloqueado (Fallecido)';
            eventoTipo.disabled = true;
            eventoDetalle.disabled = true;
        } else {
            btnRegistrar.disabled = false;
            registrarText.textContent = 'Registrar Evento';
            eventoTipo.disabled = false;
            eventoDetalle.disabled = false;
        }

        eventoServicioDe.disabled = true; // Bloquear 'De' porque siempre es el servicio actual

        if (autoLoadCiclo) {
            currentCiclo = autoLoadCiclo;
        } else if (!urlParams.get('ciclo')) {
            // Fetch max ciclo to load the latest
            const { data } = await client
                .from('historial_eventos')
                .select('ciclo_id')
                .eq('paciente_id', patient.id)
                .order('ciclo_id', { ascending: false })
                .limit(1);
            if (data && data.length > 0) {
                currentCiclo = data[0].ciclo_id;
            } else {
                currentCiclo = 1;
            }
        }

        await loadTimeline();
    };

    const loadTimeline = async () => {
        try {
            let q = client
                .from('historial_eventos')
                .select('*')
                .eq('paciente_id', selectedPatient.id)
                .order('fecha_evento', { ascending: true });

            if (currentCiclo) {
                q = q.eq('ciclo_id', currentCiclo);
            }

            const { data: eventos, error } = await q;

            if (error) throw error;

            // Verificar si el ciclo está cerrado
            const isClosed = eventos.some(ev => ev.tipo_evento === 'Alta' || ev.tipo_evento === 'Fallecido');
            
            if (isClosed) {
                document.querySelector('.event-form-section').style.display = 'none';
                
                if (!document.getElementById('registro-cerrado-banner')) {
                    const closedBanner = document.createElement('div');
                    closedBanner.id = 'registro-cerrado-banner';
                    closedBanner.style.cssText = 'background: #fef2f2; color: #ef4444; padding: 15px; border-radius: 8px; text-align: center; font-weight: 600; margin-top: 20px; border: 1px solid #fca5a5;';
                    closedBanner.innerHTML = '<i class="fa-solid fa-lock" style="margin-right: 8px;"></i>Este registro clínico se encuentra cerrado. No se pueden añadir más eventos.';
                    document.querySelector('.event-form-section').parentElement.appendChild(closedBanner);
                } else {
                    document.getElementById('registro-cerrado-banner').style.display = 'block';
                }
            } else {
                document.querySelector('.event-form-section').style.display = 'block';
                if (document.getElementById('registro-cerrado-banner')) {
                    document.getElementById('registro-cerrado-banner').style.display = 'none';
                }
            }

            // Cambiar titulo
            const timelineHeader = document.querySelector('.timeline-header h3');
            if (timelineHeader) {
                timelineHeader.innerHTML = `<i class="fa-solid fa-timeline" style="color: #3b82f6; margin-right: 10px;"></i>Registro #${currentCiclo || 1}`;
            }

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

        // Determinar fecha del primer ingreso (Hospitalizado) para cálculos de días
        let fechaIngreso = null;
        const primerIngreso = eventos.find(e => e.tipo_evento === 'Hospitalizado');
        if (primerIngreso) {
            fechaIngreso = new Date(primerIngreso.fecha_evento);
        }

        eventos.forEach((ev, index) => {
            const eventEl = document.createElement('div');
            eventEl.className = 'timeline-event';

            const dotClass = getEventDotClass(ev.tipo_evento);
            const iconClass = getEventIcon(ev.tipo_evento);
            const fecha = new Date(ev.fecha_evento);
            const optionsDate = { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' };
            const optionsTime = { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' };
            const fechaStr = fecha.toLocaleDateString('es-PE', optionsDate);
            const horaStr = fecha.toLocaleTimeString('es-PE', optionsTime);

            // Contador de Días en la línea de tiempo (Rango por Evento)
            let diasTranscurridosHTML = '';
            
            if (ev.tipo_evento !== 'Alta' && ev.tipo_evento !== 'Fallecido') {
                const isUltimoEvento = (index === eventos.length - 1);
                const nowPeru = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
                const fechaFin = isUltimoEvento ? nowPeru : new Date(eventos[index + 1].fecha_evento);
                
                // Diferencia en días calendario (sin horas)
                const d1 = new Date(fecha).setHours(0,0,0,0);
                const d2 = new Date(fechaFin).setHours(0,0,0,0);
                const dias = Math.max(0, Math.round((d2 - d1) / 86400000));
                
                const fechaFinStr = isUltimoEvento ? 'Actual' : fechaFin.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Lima' });
                
                diasTranscurridosHTML = `<span style="font-size: 12px; color: #64748b; font-weight: 600; margin-left: auto; background: #f1f5f9; padding: 3px 10px; border-radius: 12px; border: 1px solid #e2e8f0;">${dias} ${dias === 1 ? 'día' : 'días'} | ${fechaStr} - ${fechaFinStr}</span>`;
            } else {
                // Para Alta o Fallecido solo calculamos los dias totales desde el ingreso si queremos, o nada.
                if (fechaIngreso) {
                    const d1 = new Date(fechaIngreso).setHours(0,0,0,0);
                    const d2 = new Date(fecha).setHours(0,0,0,0);
                    const diasTotales = Math.max(0, Math.round((d2 - d1) / 86400000));
                    diasTranscurridosHTML = `<span style="font-size: 12px; color: #10b981; font-weight: 600; margin-left: auto; background: #d1fae5; padding: 3px 10px; border-radius: 12px; border: 1px solid #a7f3d0;">Estancia Total: ${diasTotales} ${diasTotales === 1 ? 'día' : 'días'}</span>`;
                }
            }

            let detalleHTML = ev.detalle ? '<p class="timeline-detail">' + ev.detalle + '</p>' : '';

            if (ev.tipo_evento === 'Cambio Cobertura' && ev.nuevo_seguro) {
                detalleHTML += '<p class="timeline-detail" style="font-style: italic;">Nuevo seguro: <strong>' + ev.nuevo_seguro + '</strong>' + (ev.nuevo_seguro_otros ? ' (' + ev.nuevo_seguro_otros + ')' : '') + '</p>';
            }
            
            if (ev.tipo_evento === 'Cambio de Servicio' && ev.servicio_de && ev.servicio_hacia) {
                detalleHTML += '<p class="timeline-detail" style="font-style: italic;">Traslado: <strong>' + ev.servicio_de + '</strong> \u2192 <strong>' + ev.servicio_hacia + '</strong></p>';
            }

            eventEl.innerHTML = `
                <div class="timeline-dot ${dotClass}">
                    <i class="${iconClass}"></i>
                </div>
                <div class="timeline-content">
                    <div class="timeline-event-header" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <span class="timeline-event-type ${dotClass}">${ev.tipo_evento}</span>
                        <span class="timeline-event-date">${fechaStr} - ${horaStr}</span>
                        ${diasTranscurridosHTML}
                    </div>
                    ${detalleHTML}
                </div>
            `;
            timelineContainer.appendChild(eventEl);
        });
    };

    const getEventDotClass = (tipo) => {
        if (tipo === 'Hospitalizado') return 'dot-hospitalizado';
        if (tipo === 'Cambio Cobertura' || tipo === 'Cambio de Servicio') return 'dot-cambio';
        if (tipo === 'Alta') return 'dot-alta';
        if (tipo === 'Fallecido') return 'dot-fallecido';
        return '';
    };

    const getEventIcon = (tipo) => {
        if (tipo === 'Hospitalizado') return 'fa-solid fa-bed';
        if (tipo === 'Cambio Cobertura') return 'fa-solid fa-shield-halved';
        if (tipo === 'Cambio de Servicio') return 'fa-solid fa-right-left';
        if (tipo === 'Alta') return 'fa-solid fa-house-medical-circle-check';
        if (tipo === 'Fallecido') return 'fa-solid fa-heart-crack';
        return 'fa-solid fa-circle';
    };

    const updateBannerStats = (eventos) => {
        let ultimoIngreso = null;
        let ultimaAlta = null;
        let ultimoCambioServicio = null;

        const eventosOrdenados = [...eventos].sort((a, b) => new Date(a.fecha_evento) - new Date(b.fecha_evento));

        eventosOrdenados.forEach(ev => {
            if (ev.tipo_evento === 'Hospitalizado') {
                ultimoIngreso = new Date(ev.fecha_evento);
                ultimoCambioServicio = null; // Reset CS on new hospitalization
            } else if (ev.tipo_evento === 'Alta' || ev.tipo_evento === 'Fallecido') {
                ultimaAlta = new Date(ev.fecha_evento);
            } else if (ev.tipo_evento === 'Cambio de Servicio') {
                ultimoCambioServicio = new Date(ev.fecha_evento);
            }
        });

        const condicion = selectedPatient.condicion;
        let diasTexto = 'Sin registro';
        let diasClase = '';

        if (ultimoIngreso) {
            const nowPeru = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
            const fin = (condicion === 'Hospitalizado') ? nowPeru : (ultimaAlta || nowPeru);
            const dias = Math.max(0, Math.ceil((fin - ultimoIngreso) / (1000 * 60 * 60 * 24)));
            diasTexto = dias + (dias === 1 ? ' d\u00EDa' : ' d\u00EDas');
            diasClase = condicion === 'Hospitalizado' ? 'dias-activo' : 'dias-alta';
        }

        bannerDias.textContent = diasTexto + " Hospitalizado";
        bannerDias.className = 'dias-badge ' + diasClase;

        // Si el paciente sigue Hospitalizado, el badge de condición es redundante
        // porque bannerDias ya dice "X días Hospitalizado". Solo mostrar para Alta/Fallecido.
        if (condicion === 'Hospitalizado') {
            bannerCondicion.style.display = 'none';
        } else {
            bannerCondicion.style.display = '';
            bannerCondicion.textContent = condicion;
            bannerCondicion.className = 'condicion-badge ' + getCondicionClass(condicion);
        }
    };

    // ============================================
    // MOSTRAR/OCULTAR CAMPOS DE CAMBIO COBERTURA
    // ============================================
    eventoTipo.addEventListener('change', (e) => {
        const val = e.target.value;
        grupoNuevoSeguro.style.display = val === 'Cambio Cobertura' ? 'block' : 'none';
        grupoNuevoSeguroOtros.style.display = 'none';
        
        grupoServicioDe.style.display = val === 'Cambio de Servicio' ? 'block' : 'none';
        grupoServicioHacia.style.display = val === 'Cambio de Servicio' ? 'block' : 'none';

        if (val === 'Cambio Cobertura' && selectedPatient) {
            // Deshabilitar el seguro actual del paciente para evitar re-selección
            const seguroActual = selectedPatient.tipo_seguro;
            Array.from(eventoNuevoSeguro.options).forEach(opt => {
                if (opt.value === seguroActual) {
                    opt.disabled = true;
                    // Marcar visualmente cuál es el actual
                    if (!opt.textContent.includes('(Actual)')) {
                        opt.textContent = opt.textContent + ' (Actual)';
                    }
                } else {
                    opt.disabled = false;
                    // Limpiar marcas previas
                    opt.textContent = opt.textContent.replace(' (Actual)', '');
                }
            });
            eventoNuevoSeguro.value = '';
        }
        
        if (val === 'Cambio de Servicio' && selectedPatient) {
            eventoServicioDe.value = selectedPatient.servicio || '';
            // Inhabilitar "Hacia" si es el mismo
            Array.from(eventoServicioHacia.options).forEach(opt => {
                opt.disabled = opt.value === eventoServicioDe.value && eventoServicioDe.value !== "";
            });
            eventoServicioHacia.value = '';
        }
    });

    eventoServicioDe.addEventListener('change', () => {
        const valDe = eventoServicioDe.value;
        Array.from(eventoServicioHacia.options).forEach(opt => {
            opt.disabled = opt.value === valDe && valDe !== "";
        });
    });

    eventoServicioHacia.addEventListener('change', () => {
        const valHacia = eventoServicioHacia.value;
        Array.from(eventoServicioDe.options).forEach(opt => {
            opt.disabled = opt.value === valHacia && valHacia !== "";
        });
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
        
        if (tipo === 'Cambio de Servicio') {
            if (!eventoServicioDe.value || !eventoServicioHacia.value) {
                showToast('Seleccione ambos servicios (De / Hacia)', '#ef4444');
                return;
            }
            if (eventoServicioDe.value === eventoServicioHacia.value) {
                showToast('El servicio de destino debe ser diferente al de origen', '#ef4444');
                return;
            }
        }

        btnRegistrar.disabled = true;
        registrarText.textContent = 'Registrando...';
        registrarSpinner.style.display = 'inline-block';

        try {
            const payload = {
                paciente_id: selectedPatient.id,
                tipo_evento: tipo,
                detalle: eventoDetalle.value.trim() || null,
                registrado_por: userId,
                ciclo_id: currentCiclo || 1
            };

            if (tipo === 'Cambio Cobertura') {
                payload.nuevo_seguro = eventoNuevoSeguro.value;
                payload.nuevo_seguro_otros = eventoNuevoSeguro.value === 'Otros' ? eventoNuevoSeguroOtros.value.trim() : null;
            }
            
            if (tipo === 'Cambio de Servicio') {
                payload.servicio_de = eventoServicioDe.value;
                payload.servicio_hacia = eventoServicioHacia.value;
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

            eventForm.reset();
            grupoNuevoSeguro.style.display = 'none';
            grupoNuevoSeguroOtros.style.display = 'none';

            // 1. Esperar a que el evento se dibuje en la línea de tiempo
            await loadTimeline();

            if (tipo === 'Alta' || tipo === 'Fallecido') {
                // 2. Modal de confirmación DESPUÉS del renderizado del timeline
                const modalBackdrop = document.createElement('div');
                modalBackdrop.id = 'registro-cerrado-modal-backdrop';
                modalBackdrop.style.cssText = [
                    'position:fixed; top:0; left:0; width:100vw; height:100vh;',
                    'background:rgba(15,23,42,0.6);',
                    'backdrop-filter:blur(8px);',
                    '-webkit-backdrop-filter:blur(8px);',
                    'z-index:9999;',
                    'display:flex; align-items:center; justify-content:center;',
                    'animation: fadeInLayout 0.35s forwards;'
                ].join('');

                const iconColor = tipo === 'Alta' ? '#10b981' : '#ef4444';
                const iconClass = tipo === 'Alta' ? 'fa-house-medical-circle-check' : 'fa-heart-crack';
                const titulo = tipo === 'Alta' ? 'Registro Cerrado — Alta' : 'Registro Cerrado — Fallecimiento';

                modalBackdrop.innerHTML = `
                    <div style="background:#ffffff; border-radius:20px; padding:48px 52px; max-width:480px; width:90%; text-align:center; box-shadow:0 25px 60px rgba(0,0,0,0.4);">
                        <i class="fa-solid ${iconClass}" style="font-size:4rem; color:${iconColor}; margin-bottom:18px;"></i>
                        <h2 style="font-size:1.6rem; font-weight:700; color:#0f172a; margin-bottom:10px;">${titulo}</h2>
                        <p style="color:#64748b; font-size:0.95rem; margin-bottom:28px; line-height:1.6;">El evento ha sido registrado correctamente y la línea de tiempo ha sido actualizada. Serás redirigido al detalle del paciente.</p>
                        <div style="width:100%; background:#e2e8f0; border-radius:99px; height:6px; overflow:hidden;">
                            <div id="modal-progress-bar" style="width:0%; height:100%; background:${iconColor}; border-radius:99px; transition:width 3s linear;"></div>
                        </div>
                    </div>
                `;
                document.body.appendChild(modalBackdrop);

                // Animar barra de progreso
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        const bar = document.getElementById('modal-progress-bar');
                        if (bar) bar.style.width = '100%';
                    });
                });

                setTimeout(() => {
                    window.location.href = `detalle-paciente.html?dni=${selectedPatient.dni}`;
                }, 3200);
            } else {
                showToast('Evento registrado exitosamente', '#10b981');
            }
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
        const fromParam = new URLSearchParams(window.location.search).get('from');
        if (fromParam === 'rpa') {
            window.location.href = '../consultas/consulta-rapida.html';
        } else if (fromParam === 'detalle') {
            // Volver a la pantalla de Registros de Hospitalización del paciente
            const dni = selectedPatient ? selectedPatient.dni : new URLSearchParams(window.location.search).get('dni');
            window.location.href = `detalle-paciente.html?dni=${dni}`;
        } else {
            window.location.href = 'verificacion-paciente.html';
        }
    });

    btnSearch.addEventListener('click', searchPacientes);

    [filterDni, filterHc, filterApellidos, filterNombres].forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') searchPacientes();
        });
    });

    btnClear.addEventListener('click', () => {
        // Limpiar todos los campos de búsqueda
        filterDni.value = '';
        filterHc.value = '';
        filterApellidos.value = '';
        filterNombres.value = '';
        
        // Limpiar persistencia
        sessionStorage.removeItem('vp_filter_dni');
        sessionStorage.removeItem('vp_filter_hc');
        sessionStorage.removeItem('vp_filter_apellidos');
        sessionStorage.removeItem('vp_filter_nombres');
        
        // Limpiar resultados
        tbodyPacientes.innerHTML = '';
        tablePacientes.style.display = 'none';
    });

    // ============================================
    // AUTO-CARGA POR QUERY PARAM
    // ============================================
    const urlParams = new URLSearchParams(window.location.search);
    const dniParam = urlParams.get('dni');
    const cicloParam = urlParams.get('ciclo');

    if (dniParam) {
        if (cicloParam) currentCiclo = parseInt(cicloParam, 10);
        
        filterDni.value = dniParam;
        // Mostrar estado de carga inmediato para mejorar UX
        searchFilters.style.display = 'none';
        viewResultados.style.display = 'none';
        loadingIndicator.style.display = 'block';
        
        try {
            const { data, error } = await client
                .from('pacientes')
                .select('*')
                .eq('dni', dniParam)
                .single();

            if (error) throw error;
            if (data) {
                loadingIndicator.style.display = 'none';
                openTimeline(data);
            }
        } catch (err) {
            loadingIndicator.style.display = 'none';
            searchFilters.style.display = 'grid';
            console.error('Error cargando paciente por DNI:', err.message);
            showToast('No se encontr\u00F3 paciente con DNI ' + dniParam, '#ef4444');
        }
    } else {
        if (sessionStorage.getItem('vp_filter_dni')) filterDni.value = sessionStorage.getItem('vp_filter_dni');
        if (sessionStorage.getItem('vp_filter_hc')) filterHc.value = sessionStorage.getItem('vp_filter_hc');
        if (sessionStorage.getItem('vp_filter_apellidos')) filterApellidos.value = sessionStorage.getItem('vp_filter_apellidos');
        if (sessionStorage.getItem('vp_filter_nombres')) filterNombres.value = sessionStorage.getItem('vp_filter_nombres');
        
        if (filterDni.value || filterHc.value || filterApellidos.value || filterNombres.value) {
            searchPacientes();
        }
    }
});
