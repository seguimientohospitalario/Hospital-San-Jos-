document.addEventListener('DOMContentLoaded', async () => {
    // Tooltip logic (Est&#225;ndar del sistema)
    if (window.showGuideTooltip) {
        window.showGuideTooltip(
            'detalle_pacs', 
            'Elija una fecha en el calendario para iniciar', 
            5000, // 5 segundos de duraci&#243;n
            true, // Mostrar checkbox "No volver a mostrar"
            { oncePerSession: false } // Reaparece cada vez que se carga la p&#225;gina
        );
    }

    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : supabase;
    const { data: { session } } = await client.auth.getSession();

    if (!session) { window.location.href = '../../index.html'; return; }
    const userId = session.user.id;

    // ── Timezone Peru ──
    const now = new Date();
    const peruDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const today = peruDate;
    let viewMonth = today.getMonth();
    let viewYear = today.getFullYear();
    let selectedDate = null;

    // Hora actual Perú en formato HH:MM (24h)
    const getPeruTimeNow = () => {
        const d = new Date();
        return d.toLocaleTimeString('en-GB', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
    };

    const monthNames = [
        'Enero','Febrero','Marzo','Abril','Mayo','Junio',
        'Julio','Agosto','Setiembre','Octubre','Noviembre','Diciembre'
    ];

    // ── DOM refs ──
    const calTitle = document.getElementById('cal-title');
    let calGrid = document.getElementById('cal-days-grid');
    const calPrev = document.getElementById('cal-prev');
    const calNext = document.getElementById('cal-next');
    const filterMonth = document.getElementById('filter-month');
    const filterYear = document.getElementById('filter-year');
    const ingresoPopover = document.getElementById('ingreso-popover');
    const eventsCard = document.getElementById('events-card');

    // ── State ──
    let paciente = null;
    let hospitalizaciones = [];
    let activeHosp = null;      // hospitalización activa actual
    let activeEvents = [];      // eventos de la hospitalización activa
    let allEventsMap = {};      // { hospId: [events] } — para sombrear todos los registros
    let pendingIngresoDate = null;

    // ── URL param ──
    const params = new URLSearchParams(window.location.search);
    const pacienteId = params.get('id');

    if (!pacienteId) {
        document.getElementById('p-nombre-completo').textContent = 'Paciente no especificado';
        return;
    }

    // ═══════════════════════════════════════
    // UTILIDADES
    // ═══════════════════════════════════════
    const fmtDate = (d) => {
        if (!d) return '—';
        const parts = d.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    const toIso = (year, month, day) =>
        `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    const parseIso = (iso) => {
        const p = iso.split('-');
        return new Date(+p[0], +p[1]-1, +p[2]);
    };

    const isSameDay = (d1, d2) =>
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate();

    const daysBetween = (startIso, startTime, endDate, endTime) => {
        // Combinar fecha + hora para precisión de 24h
        // startIso: 'YYYY-MM-DD', startTime: 'HH:MM' o 'HH:MM:SS'
        // endDate: Date object o 'YYYY-MM-DD' string, endTime: 'HH:MM'
        const startStr = `${startIso}T${startTime || '08:00'}`;
        const start = new Date(startStr);

        let end;
        if (typeof endDate === 'string') {
            end = new Date(`${endDate}T${endTime || '08:00'}`);
        } else {
            // endDate es un Date object (hoy con hora actual)
            if (endTime) {
                const iso = `${endDate.getFullYear()}-${String(endDate.getMonth()+1).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;
                end = new Date(`${iso}T${endTime}`);
            } else {
                end = endDate; // usar la hora actual del objeto Date
            }
        }

        const diffMs = end - start;
        const diffHours = diffMs / (1000 * 60 * 60);
        return Math.max(1, Math.floor(diffHours / 24) + 1);
    };

    const dotClass = (tipo) => {
        const map = {
            'Hospitalizado': 'dot-hospitalizado',
            'Cambio Cobertura': 'dot-cambio-cobertura',
            'Cambio de Servicio': 'dot-cambio-servicio',
            'Alta': 'dot-alta',
            'Fallecido': 'dot-fallecido'
        };
        return map[tipo] || 'dot-hospitalizado';
    };

    const tlClass = (tipo) => {
        const map = {
            'Hospitalizado': 'tl-hospitalizado',
            'Cambio Cobertura': 'tl-cambio-cobertura',
            'Cambio de Servicio': 'tl-cambio-servicio',
            'Alta': 'tl-alta',
            'Fallecido': 'tl-fallecido'
        };
        return map[tipo] || 'tl-hospitalizado';
    };

    const dotIcon = (tipo) => {
        const map = {
            'Hospitalizado': 'fa-solid fa-right-to-bracket',
            'Cambio Cobertura': 'fa-solid fa-shield-halved',
            'Cambio de Servicio': 'fa-solid fa-arrows-rotate',
            'Alta': 'fa-solid fa-door-open',
            'Fallecido': 'fa-solid fa-cross'
        };
        return map[tipo] || 'fa-solid fa-circle';
    };

    // ═══════════════════════════════════════
    // CARGA DE DATOS
    // ═══════════════════════════════════════
    async function loadPatient() {
        const { data, error } = await client
            .from('pacientes').select('*').eq('id', pacienteId).single();
        if (error || !data) {
            document.getElementById('p-nombre-completo').textContent = 'Error al cargar datos';
            return;
        }
        paciente = data;
        document.getElementById('p-nombre-completo').textContent =
            `${data.apellidos || ''}, ${data.nombres || ''}`.trim() || '—';
        document.getElementById('stat-servicio').textContent = data.servicio || '—';

        // Condición badge
        updateCondicionBadge();

        // Bloqueo fallecido: solo bloquear calendario, NO la tarjeta de eventos
        if (data.condicion && data.condicion.toUpperCase() === 'FALLECIDO') {
            calGrid.style.pointerEvents = 'none';
            calGrid.style.opacity = '0.5';
        }

        // Ficha del paciente
        await renderFichaPaciente();
    }

    async function loadHospitalizaciones() {
        const { data, error } = await client
            .from('hospitalizaciones')
            .select('*')
            .eq('paciente_id', pacienteId)
            .order('numero_registro', { ascending: true });
        if (error) { hospitalizaciones = []; return; }
        hospitalizaciones = data || [];
        activeHosp = hospitalizaciones.find(h => h.activa) || null;

        // Cargar eventos de TODOS los registros (para sombrear calendario)
        allEventsMap = {};
        for (const h of hospitalizaciones) {
            allEventsMap[h.id] = await loadEvents(h.id);
        }

        // Stats
        document.getElementById('stat-ingresos').textContent = hospitalizaciones.length || '0';
        updateDiasHospitalizado();
    }

    function updateDiasHospitalizado() {
        // Regla: floor(diffHoras / 24) + 1
        // Caso 1: mismo día, mismas horas → floor(7/24)+1 = 1
        // Caso 2: 5 días 22h → floor(118/24)+1 = 5
        // Caso 3: 5 días 1h → floor(121/24)+1 = 6
        let totalDias = 0;
        for (const h of hospitalizaciones) {
            if (h.activa) {
                // Registro activo: contar desde ingreso hasta ahora (hora actual Perú)
                totalDias += daysBetween(h.fecha_ingreso, h.hora_ingreso, today, null);
            } else if (h.fecha_alta) {
                // Registro cerrado: contar desde ingreso hasta alta con horas
                totalDias += daysBetween(h.fecha_ingreso, h.hora_ingreso, h.fecha_alta, h.hora_alta || '08:00');
            } else {
                totalDias += 1;
            }
        }
        document.getElementById('stat-dias').textContent = totalDias || '0';
    }

    async function loadEvents(hospId) {
        const { data, error } = await client
            .from('historial_eventos')
            .select('*')
            .eq('hospitalizacion_id', hospId)
            .order('fecha_evento', { ascending: true })
            .order('creado_en', { ascending: true });
        if (error) return [];
        return data || [];
    }

    // ═══════════════════════════════════════
    // RENDERIZAR LÍNEA DE TIEMPO
    // ═══════════════════════════════════════
    function renderTimeline(events, containerId, isClosed) {
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (!events || events.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8; font-size:13px; text-align:center; padding:20px;">Sin eventos registrados</p>';
            return;
        }

        const timeline = document.createElement('div');
        timeline.className = 'timeline';

        events.forEach((ev, idx) => {
            const item = document.createElement('div');
            item.className = 'timeline-item';
            item.style.animationDelay = `${idx * 80}ms`;

            item.innerHTML = `
                <div class="timeline-dot ${dotClass(ev.tipo_evento)}">
                    <i class="${dotIcon(ev.tipo_evento)}"></i>
                </div>
                <div class="timeline-content ${tlClass(ev.tipo_evento)}">
                    <p class="timeline-event-name">${ev.tipo_evento}</p>
                    <p class="timeline-event-detail">${ev.detalle || ''}</p>
                    <span class="timeline-event-date">${fmtDate(ev.fecha_evento)}</span>
                </div>
            `;
            timeline.appendChild(item);
        });

        container.appendChild(timeline);

        if (isClosed) {
            const badge = document.createElement('div');
            badge.className = 'timeline-closed-badge';
            badge.innerHTML = '<i class="fa-solid fa-lock"></i> Registro cerrado';
            container.appendChild(badge);
        }
    }

    // ═══════════════════════════════════════
    // VISTA DE EVENTOS: Cambiar entre estados
    // ═══════════════════════════════════════
    function hideAllEventViews() {
        document.getElementById('events-empty').style.display = 'none';
        document.getElementById('events-timeline-view').style.display = 'none';
        document.getElementById('events-folders-view').style.display = 'none';
        document.getElementById('events-folder-detail').style.display = 'none';
        document.getElementById('event-register-popover').style.display = 'none';
    }

    async function updateEventsView() {
        hideAllEventViews();

        const isFallecido = paciente && paciente.condicion &&
            paciente.condicion.toUpperCase() === 'FALLECIDO';

        if (hospitalizaciones.length === 0) {
            // Sin registros: mostrar empty (si fallecido y sin registros, igual mostrar empty)
            document.getElementById('events-empty').style.display = 'flex';
            return;
        }

        const hasActive = !!activeHosp;

        if (isFallecido) {
            // Fallecido: mostrar carpetas (todos los registros están cerrados)
            showFoldersView();
        } else if (hasActive) {
            // Mostrar línea de tiempo del registro activo
            document.getElementById('events-timeline-view').style.display = 'flex';
            const badge = document.getElementById('events-registro-badge');
            badge.textContent = `Registro #${activeHosp.numero_registro}`;
            badge.classList.remove('closed');
            activeEvents = allEventsMap[activeHosp.id] || [];
            renderTimeline(activeEvents, 'timeline-container', false);
            // Botón volver: solo visible si hay más de 1 registro
            document.getElementById('btn-timeline-back').style.display =
                hospitalizaciones.length > 1 ? 'flex' : 'none';
        } else {
            // Todos cerrados (no fallecido): mostrar carpetas + permitir nuevo ingreso
            showFoldersView();
        }
    }

    function showFoldersView() {
        hideAllEventViews();
        document.getElementById('events-folders-view').style.display = 'flex';
        const container = document.getElementById('folders-container');
        container.innerHTML = '';

        hospitalizaciones.forEach(h => {
            const item = document.createElement('div');
            item.className = `folder-item ${h.activa ? 'folder-active' : ''}`;
            const iconClass = h.activa ? 'active' : 'closed';
            const statusClass = h.activa ? 'status-active' : 'status-closed';
            const statusText = h.activa ? 'Abierto' : 'Cerrado';
            const iconName = h.activa ? 'fa-folder-open' : 'fa-folder';

            // Calcular días de este registro
            let dias = 0;
            if (h.activa) {
                dias = daysBetween(h.fecha_ingreso, h.hora_ingreso, today, null);
            } else if (h.fecha_alta) {
                dias = daysBetween(h.fecha_ingreso, h.hora_ingreso, h.fecha_alta, h.hora_alta || '08:00');
            } else {
                dias = 1;
            }

            item.innerHTML = `
                <div class="folder-icon ${iconClass}">
                    <i class="fa-solid ${iconName}"></i>
                </div>
                <div class="folder-info">
                    <p class="folder-title">Registro #${h.numero_registro}</p>
                    <p class="folder-dates">${fmtDate(h.fecha_ingreso)} — ${h.fecha_alta ? fmtDate(h.fecha_alta) : 'En curso'}</p>
                </div>
                <div class="folder-days">
                    <span class="folder-days-value">${dias}</span>
                    <span class="folder-days-label">días</span>
                </div>
                <span class="folder-status ${statusClass}">${statusText}</span>
            `;

            item.addEventListener('click', () => openFolderDetail(h));
            container.appendChild(item);
        });
    }

    async function openFolderDetail(hosp) {
        hideAllEventViews();
        document.getElementById('events-folder-detail').style.display = 'flex';
        const badge = document.getElementById('folder-detail-badge');
        badge.textContent = `Registro #${hosp.numero_registro}`;
        badge.className = `events-registro-badge ${hosp.activa ? '' : 'closed'}`;

        const events = await loadEvents(hosp.id);
        renderTimeline(events, 'folder-detail-timeline', !hosp.activa);
    }

    document.getElementById('btn-folder-back').addEventListener('click', () => {
        showFoldersView();
    });

    document.getElementById('btn-timeline-back').addEventListener('click', () => {
        showFoldersView();
    });

    // ═══════════════════════════════════════
    // POPOVER: FECHA DE INGRESO
    // ═══════════════════════════════════════
    function showIngresoPopover(dayEl, dateStr) {
        pendingIngresoDate = dateStr;
        const rect = dayEl.getBoundingClientRect();

        // Posicionar con fixed para que flote sobre todo el layout
        ingresoPopover.style.display = 'block';
        ingresoPopover.style.position = 'fixed';
        // Esquina superior derecha del día seleccionado
        ingresoPopover.style.top = (rect.top - 10) + 'px';
        ingresoPopover.style.left = (rect.right + 8) + 'px';

        // Ajustar si sale de pantalla
        requestAnimationFrame(() => {
            const popRect = ingresoPopover.getBoundingClientRect();
            if (popRect.right > window.innerWidth - 20) {
                // Posicionar a la izquierda del día
                ingresoPopover.style.left = (rect.left - popRect.width - 8) + 'px';
            }
            if (popRect.top < 10) {
                ingresoPopover.style.top = (rect.bottom + 8) + 'px';
            }
            if (popRect.bottom > window.innerHeight - 10) {
                ingresoPopover.style.top = (rect.top - popRect.height - 8) + 'px';
            }
        });

        document.getElementById('ingreso-popover-date').textContent = fmtDate(dateStr);
        document.getElementById('ingreso-hora').value = getPeruTimeNow();
    }

    function hideIngresoPopover() {
        ingresoPopover.style.display = 'none';
        pendingIngresoDate = null;
    }

    document.getElementById('btn-ingreso-accept').addEventListener('click', async () => {
        if (!pendingIngresoDate || !paciente) return;

        const btn = document.getElementById('btn-ingreso-accept');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i>';

        const nextNum = hospitalizaciones.length + 1;

        const horaIngreso = document.getElementById('ingreso-hora').value || '08:00';

        const { error } = await client.from('hospitalizaciones').insert([{
            paciente_id: pacienteId,
            fecha_ingreso: pendingIngresoDate,
            hora_ingreso: horaIngreso,
            servicio: paciente.servicio || 'No especificado',
            activa: true,
            creado_por: userId,
            numero_registro: nextNum
        }]);

        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Aceptar';
        hideIngresoPopover();

        if (error) {
            if (window.showSystemTooltip) window.showSystemTooltip('Error al crear registro: ' + error.message, true);
            return;
        }

        // Actualizar condición si venía de Alta (re-hospitalización)
        if (paciente.condicion && paciente.condicion.toUpperCase() !== 'HOSPITALIZADO') {
            await client.from('pacientes').update({ condicion: 'Hospitalizado' }).eq('id', pacienteId);
        }

        if (window.showSystemTooltip) window.showSystemTooltip('Registro de hospitalización creado');
        await reload();
    });

    document.getElementById('btn-ingreso-reject').addEventListener('click', hideIngresoPopover);

    // ═══════════════════════════════════════
    // POPOVER: REGISTRO DE EVENTOS
    // ═══════════════════════════════════════
    let eventRegisterDate = null;

    function showEventPopover(dateStr) {
        eventRegisterDate = dateStr;

        // Asegurar que estamos en la vista de línea de tiempo activa
        hideAllEventViews();
        document.getElementById('events-timeline-view').style.display = 'flex';
        // Mostrar badge y renderizar si es necesario (o confiar en que reload/update lo hizo)
        if (activeHosp) {
            const badge = document.getElementById('events-registro-badge');
            badge.textContent = `Registro #${activeHosp.numero_registro}`;
            badge.classList.remove('closed');
            activeEvents = allEventsMap[activeHosp.id] || [];
            renderTimeline(activeEvents, 'timeline-container', false);
        }

        const popover = document.getElementById('event-register-popover');
        popover.style.display = 'block';
        document.getElementById('event-register-date').textContent = `Evento para: ${fmtDate(dateStr)}`;
        document.getElementById('event-tipo').value = '';
        document.getElementById('group-nuevo-seguro').style.display = 'none';
        document.getElementById('group-seguro-otros').style.display = 'none';
        document.getElementById('group-nuevo-servicio').style.display = 'none';
        document.getElementById('group-hora-alta').style.display = 'none';
        document.getElementById('event-hora-alta').value = getPeruTimeNow();
    }

    document.getElementById('event-register-close').addEventListener('click', () => {
        document.getElementById('event-register-popover').style.display = 'none';
        eventRegisterDate = null;
        // Si no hay evento seleccionado, volver a la vista normal
        updateEventsView();
    });

    // Tipo de evento: mostrar/ocultar campos dinámicos
    document.getElementById('event-tipo').addEventListener('change', (e) => {
        const val = e.target.value;
        document.getElementById('group-nuevo-seguro').style.display = val === 'Cambio Cobertura' ? 'flex' : 'none';
        document.getElementById('group-seguro-otros').style.display = 'none';
        document.getElementById('group-nuevo-servicio').style.display = val === 'Cambio de Servicio' ? 'flex' : 'none';
        // Mostrar hora para Alta y Fallecido
        document.getElementById('group-hora-alta').style.display =
            (val === 'Alta' || val === 'Fallecido') ? 'flex' : 'none';

        // Deshabilitar opción actual
        if (val === 'Cambio Cobertura' && paciente) {
            const sel = document.getElementById('event-nuevo-seguro');
            Array.from(sel.options).forEach(opt => {
                opt.disabled = opt.value && opt.value.toUpperCase() === (paciente.tipo_seguro || '').toUpperCase();
            });
            sel.value = '';
        }
        if (val === 'Cambio de Servicio' && paciente) {
            const sel = document.getElementById('event-nuevo-servicio');
            Array.from(sel.options).forEach(opt => {
                opt.disabled = opt.value && opt.value.toUpperCase() === (paciente.servicio || '').toUpperCase();
            });
            sel.value = '';
        }
    });

    document.getElementById('event-nuevo-seguro').addEventListener('change', (e) => {
        document.getElementById('group-seguro-otros').style.display =
            e.target.value === 'Otros' ? 'flex' : 'none';
    });

    document.getElementById('btn-guardar-evento').addEventListener('click', async () => {
        if (!eventRegisterDate || !activeHosp) return;

        const tipo = document.getElementById('event-tipo').value;
        if (!tipo) {
            if (window.showSystemTooltip) window.showSystemTooltip('Seleccione un tipo de evento', true);
            return;
        }

        const payload = {
            paciente_id: pacienteId,
            hospitalizacion_id: activeHosp.id,
            tipo_evento: tipo,
            fecha_evento: eventRegisterDate,
            registrado_por: userId
        };

        // Detalle según tipo
        if (tipo === 'Cambio Cobertura') {
            const nuevoSeguro = document.getElementById('event-nuevo-seguro').value;
            if (!nuevoSeguro) {
                if (window.showSystemTooltip) window.showSystemTooltip('Seleccione el nuevo tipo de seguro', true);
                return;
            }
            payload.nuevo_seguro = nuevoSeguro;
            payload.detalle = `Cambio de ${paciente.tipo_seguro} a ${nuevoSeguro.toUpperCase()}`;
            if (nuevoSeguro === 'Otros') {
                const otros = document.getElementById('event-seguro-otros').value.trim();
                if (!otros) {
                    if (window.showSystemTooltip) window.showSystemTooltip('Especifique el nombre del seguro', true);
                    return;
                }
                payload.nuevo_seguro_otros = otros;
                payload.detalle += ` (${otros})`;
            }
        } else if (tipo === 'Cambio de Servicio') {
            const nuevoServ = document.getElementById('event-nuevo-servicio').value;
            if (!nuevoServ) {
                if (window.showSystemTooltip) window.showSystemTooltip('Seleccione el nuevo servicio', true);
                return;
            }
            payload.detalle = nuevoServ;
        } else if (tipo === 'Alta') {
            payload.detalle = 'Paciente dado de alta';
        } else if (tipo === 'Fallecido') {
            payload.detalle = 'Paciente fallecido';
        }

        // UI: loading
        const btn = document.getElementById('btn-guardar-evento');
        const txt = document.getElementById('guardar-evento-text');
        const spin = document.getElementById('guardar-evento-spinner');
        btn.disabled = true;
        txt.textContent = 'Guardando...';
        spin.style.display = 'inline-block';

        const { error } = await client.from('historial_eventos').insert([payload]);

        // Si es Alta o Fallecido, actualizar hora_alta en la hospitalización
        if (!error && (tipo === 'Alta' || tipo === 'Fallecido')) {
            const horaAlta = document.getElementById('event-hora-alta').value || '08:00';
            await client.from('hospitalizaciones')
                .update({ hora_alta: horaAlta })
                .eq('id', activeHosp.id);
        }

        btn.disabled = false;
        txt.textContent = 'Guardar Evento';
        spin.style.display = 'none';

        if (error) {
            if (window.showSystemTooltip) window.showSystemTooltip('Error: ' + error.message, true);
            return;
        }

        document.getElementById('event-register-popover').style.display = 'none';
        eventRegisterDate = null;
        if (window.showSystemTooltip) window.showSystemTooltip('Evento registrado correctamente');
        await reload();
    });

    // ═══════════════════════════════════════
    // CALENDARIO: RENDERIZADO
    // ═══════════════════════════════════════
    function populateFilters() {
        monthNames.forEach((name, i) => {
            const opt = document.createElement('option');
            opt.value = i; opt.textContent = name;
            filterMonth.appendChild(opt);
        });
        const yearNow = today.getFullYear();
        for (let y = yearNow - 5; y <= yearNow + 5; y++) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = y;
            filterYear.appendChild(opt);
        }
    }

    function syncFilters() {
        filterMonth.value = viewMonth;
        filterYear.value = viewYear;
    }

    function renderCalendar(direction) {
        hideIngresoPopover();
        const firstDay = new Date(viewYear, viewMonth, 1);
        const lastDay = new Date(viewYear, viewMonth + 1, 0);
        const startDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

        calTitle.textContent = `${monthNames[viewMonth]}, ${viewYear}`;
        syncFilters();

        const grid = document.createElement('div');
        grid.className = 'cal-days-grid';
        if (direction === 'prev') grid.classList.add('cal-slide-left');
        else if (direction === 'next') grid.classList.add('cal-slide-right');

        const totalCells = Math.ceil((startDayOfWeek + daysInMonth) / 7) * 7;

        // Precompute ALL hospitalization ranges and event dates (for shading)
        const hospRanges = hospitalizaciones.map(h => ({
            start: parseIso(h.fecha_ingreso),
            end: h.fecha_alta ? parseIso(h.fecha_alta) : (h.activa ? today : parseIso(h.fecha_ingreso)),
            ingreso: h.fecha_ingreso,
            activa: h.activa
        }));

        // All event dates across all hospitalizations
        const eventDates = new Set();
        Object.values(allEventsMap).forEach(events => {
            events.forEach(ev => eventDates.add(ev.fecha_evento));
        });

        // Active hospitalization range (for click interactivity)
        let activeStart = null, activeEnd = null;
        if (activeHosp) {
            activeStart = parseIso(activeHosp.fecha_ingreso);
            activeEnd = today;
        }

        const isFallecido = paciente && paciente.condicion &&
            paciente.condicion.toUpperCase() === 'FALLECIDO';
        const canCreateIngreso = !activeHosp && !isFallecido;
        const canCreateEvent = !!activeHosp && !isFallecido;

        let dayIndex = 0;
        for (let i = 0; i < totalCells; i++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'cal-day';
            let dayNumber, isCurrentMonth = true;

            if (i < startDayOfWeek) {
                dayNumber = daysInPrevMonth - startDayOfWeek + i + 1;
                isCurrentMonth = false;
                dayEl.classList.add('cal-day-other');
            } else if (dayIndex >= daysInMonth) {
                dayNumber = i - startDayOfWeek - daysInMonth + 1;
                isCurrentMonth = false;
                dayEl.classList.add('cal-day-other');
            } else {
                dayNumber = dayIndex + 1;
            }

            if (!isCurrentMonth) {
                dayEl.textContent = dayNumber;
                grid.appendChild(dayEl);
                if (i >= startDayOfWeek) dayIndex++;
                continue;
            }

            dayEl.textContent = dayNumber;
            const dateStr = toIso(viewYear, viewMonth, dayNumber);
            const thisDate = new Date(viewYear, viewMonth, dayNumber);
            dayEl.dataset.date = dateStr;

            // Hoy
            if (isSameDay(thisDate, today)) {
                dayEl.classList.add('cal-day-today');
            }

            // Sombrear TODOS los rangos de hospitalización
            let isInAnyHosp = false;
            let isIngreso = false;
            for (const r of hospRanges) {
                if (thisDate >= r.start && thisDate <= r.end) {
                    isInAnyHosp = true;
                }
                if (dateStr === r.ingreso) {
                    isIngreso = true;
                }
            }
            if (isInAnyHosp) {
                dayEl.classList.add('cal-day-hospitalized');
            }
            if (isIngreso) {
                dayEl.classList.add('cal-day-ingreso');
            }

            // Día con evento
            if (eventDates.has(dateStr)) {
                dayEl.classList.add('cal-day-has-event');
            }

            // Seleccionado
            if (selectedDate && isSameDay(thisDate, selectedDate)) {
                dayEl.classList.add('cal-day-selected');
            }

            // Interactividad
            const isFutureDay = thisDate > today;

            if (isFallecido || isFutureDay) {
                dayEl.classList.add('cal-day-disabled');
            } else if (canCreateIngreso) {
                // Modo asignar ingreso
                dayEl.addEventListener('click', () => {
                    selectedDate = thisDate;
                    renderCalendar();
                    // Re-query el dayEl porque renderCalendar lo recrea
                    const newGrid = document.getElementById('cal-days-grid') || calGrid;
                    const newDayEl = newGrid.querySelector(`[data-date="${dateStr}"]`);
                    if (newDayEl) showIngresoPopover(newDayEl, dateStr);
                });
            } else if (canCreateEvent) {
                // Modo registrar eventos (solo en rango activo)
                if (activeStart && thisDate >= activeStart && thisDate <= activeEnd) {
                    dayEl.addEventListener('click', () => {
                        selectedDate = thisDate;
                        renderCalendar();
                        showEventPopover(dateStr);
                    });
                } else {
                    dayEl.classList.add('cal-day-disabled');
                }
            }

            grid.appendChild(dayEl);
            dayIndex++;
        }

        // Animaciones
        const days = grid.querySelectorAll('.cal-day:not(.cal-day-empty)');
        days.forEach((el, idx) => {
            el.style.animationDelay = `${idx * 20}ms`;
            el.classList.add('cal-day-animate');
        });

        calGrid.replaceWith(grid);
        calGrid = grid;
    }

    // ── Navigation ──
    calPrev.addEventListener('click', () => {
        viewMonth--;
        if (viewMonth < 0) { viewMonth = 11; viewYear--; }
        renderCalendar('prev');
    });
    calNext.addEventListener('click', () => {
        viewMonth++;
        if (viewMonth > 11) { viewMonth = 0; viewYear++; }
        renderCalendar('next');
    });
    filterMonth.addEventListener('change', () => {
        viewMonth = parseInt(filterMonth.value, 10);
        renderCalendar();
    });
    filterYear.addEventListener('change', () => {
        viewYear = parseInt(filterYear.value, 10);
        renderCalendar();
    });
    document.getElementById('btn-clear-filters').addEventListener('click', () => {
        viewMonth = today.getMonth();
        viewYear = today.getFullYear();
        selectedDate = null;
        renderCalendar();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') calPrev.click();
        else if (e.key === 'ArrowRight') calNext.click();
    });

    // ═══════════════════════════════════════
    // CONDICIÓN BADGE
    // ═══════════════════════════════════════
    function updateCondicionBadge() {
        if (!paciente || !paciente.condicion) return;
        const cond = paciente.condicion.trim();
        const condUpper = cond.toUpperCase();
        let badgeClass = '';
        let badgeText = cond;
        if (condUpper === 'HOSPITALIZADO') { badgeClass = 'cond-hospitalizado'; badgeText = 'Hospitalizado'; }
        else if (condUpper === 'ALTA') { badgeClass = 'cond-alta'; badgeText = 'Alta'; }
        else if (condUpper === 'FALLECIDO') { badgeClass = 'cond-fallecido'; badgeText = 'Fallecido'; }

        // Aplicar a ambos badges (timeline y folders)
        ['condicion-badge', 'condicion-badge-folders'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = badgeText;
                el.className = `condicion-badge ${badgeClass}`;
            }
        });
    }

    // ═══════════════════════════════════════
    // FICHA DEL PACIENTE
    // ═══════════════════════════════════════
    async function renderFichaPaciente() {
        if (!paciente) return;
        document.getElementById('ficha-hc').textContent = paciente.historia_clinica || '—';
        document.getElementById('ficha-dni').textContent = paciente.dni || '—';
        document.getElementById('ficha-apellidos').textContent = paciente.apellidos || '—';
        document.getElementById('ficha-nombres').textContent = paciente.nombres || '—';
        document.getElementById('ficha-seguro').textContent = paciente.tipo_seguro || '—';
        document.getElementById('ficha-servicio').textContent = paciente.servicio || '—';
        document.getElementById('ficha-condicion').textContent = paciente.condicion || '—';

        // Fecha de creación
        if (paciente.creado_en) {
            const d = new Date(paciente.creado_en);
            const fecha = d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: '2-digit', year: 'numeric' });
            const hora = d.toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false });
            document.getElementById('ficha-creado-en').textContent = `${fecha}, ${hora}`;
        }

        // Creado por (nombre del perfil)
        if (paciente.creado_por) {
            const { data: perfil } = await client
                .from('perfiles')
                .select('nombre_completo')
                .eq('id_usuario', paciente.creado_por)
                .single();
            document.getElementById('ficha-creado-por').textContent =
                perfil?.nombre_completo || '—';
        }
    }

    // ═══════════════════════════════════════
    // SINCRONIZAR ALTURAS: Calendario → Eventos
    // ═══════════════════════════════════════
    const calSection = document.querySelector('.calendar-section');
    function syncEventsHeight() {
        // En móvil (≤1024px) no sincronizar, cada tarjeta fluye natural
        if (window.innerWidth <= 1024) {
            eventsCard.style.maxHeight = 'none';
            return;
        }
        const h = calSection.offsetHeight;
        if (h > 0) {
            eventsCard.style.maxHeight = h + 'px';
        }
    }

    // Observar cambios de tamaño del calendario
    const resizeObs = new ResizeObserver(() => syncEventsHeight());
    resizeObs.observe(calSection);
    window.addEventListener('resize', syncEventsHeight);

    // ═══════════════════════════════════════
    // INICIALIZACIÓN Y RECARGA
    // ═══════════════════════════════════════
    async function reload() {
        await loadPatient();
        await loadHospitalizaciones();
        if (activeHosp) {
            activeEvents = allEventsMap[activeHosp.id] || [];
        } else {
            activeEvents = [];
        }
        renderCalendar();
        await updateEventsView();
        // Sincronizar después de render completo
        requestAnimationFrame(syncEventsHeight);
    }

    populateFilters();
    await reload();
});
