document.addEventListener('DOMContentLoaded', async () => {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : supabase;
    const { data: { session } } = await client.auth.getSession();
    if (!session) { window.location.href = '../../index.html'; return; }
    
    const urlParams = new URLSearchParams(window.location.search);
    const dniParam = urlParams.get('dni');
    const fromParam = urlParams.get('from');

    if (!dniParam) { window.location.href = 'seguimiento-pacientes.html'; return; }

    if (fromParam === 'verif') {
        const btnVolver = document.querySelector('a[href="seguimiento-pacientes.html"]');
        if (btnVolver) {
            btnVolver.href = 'verificacion-paciente.html';
            btnVolver.innerHTML = '<i class="fa-solid fa-arrow-left"></i> Volver';
        }
    }

    let pacienteData = null;
    let eventosData = [];

    const loadData = async () => {
        try {
            // Cargar Paciente Completo
            const { data: paciente, error: errPac } = await client
                .from('pacientes')
                .select('*')
                .eq('dni', dniParam)
                .single();
            if (errPac) throw errPac;
            
            // Cargar Registrador
            if (paciente.creado_por) {
                const { data: perfil } = await client
                    .from('perfiles')
                    .select('nombre_completo')
                    .eq('id_usuario', paciente.creado_por)
                    .single();
                paciente.autor = perfil || null;
            }

            pacienteData = paciente;

            // Cargar Historial
            const { data: eventos, error: errEv } = await client
                .from('historial_eventos')
                .select('*')
                .eq('paciente_id', paciente.id)
                .order('fecha_evento', { ascending: true });
            if (errEv) throw errEv;
            eventosData = eventos || [];

            renderData();

        } catch (e) {
            console.error('Error cargando detalles', e);
            document.getElementById('loading-panel').innerHTML = '<div style="color:#ef4444;"><h3>Error al cargar paciente.</h3><a href="seguimiento-pacientes.html">Volver</a></div>';
        }
    };

    const renderData = () => {
        document.getElementById('loading-panel').style.display = 'none';
        document.getElementById('content-panel').style.display = 'block';

        // 1. BANNER REPLICADO DE IMAGEN
        document.getElementById('dp-nombre').textContent = `PACIENTE: ${pacienteData.apellidos}, ${pacienteData.nombres}`;
        document.getElementById('dp-docs').textContent = `DNI: ${pacienteData.dni} | HC: ${pacienteData.historia_clinica} | Seguro: ${pacienteData.tipo_seguro} | Servicio: ${pacienteData.servicio || 'N/A'}`;
        
        const condBadge = document.getElementById('banner-condicion');
        condBadge.textContent = pacienteData.condicion;
        const condVal = (pacienteData.condicion || '').toLowerCase();
        const condCls = condVal === 'hospitalizado' ? 'cond-hospitalizado' : (condVal === 'fallecido' ? 'cond-fallecido' : 'cond-alta');
        condBadge.className = 'condicion-badge ' + condCls;

        // 2. FICHA
        document.getElementById('ficha-dni').textContent = pacienteData.dni;
        document.getElementById('ficha-hc').textContent = pacienteData.historia_clinica;
        document.getElementById('ficha-nac').textContent = pacienteData.fecha_nacimiento;
        document.getElementById('ficha-ape').textContent = pacienteData.apellidos;
        document.getElementById('ficha-nom').textContent = pacienteData.nombres;
        document.getElementById('ficha-seg').textContent = pacienteData.tipo_seguro + (pacienteData.seguro_otros ? ` (${pacienteData.seguro_otros})` : '');
        document.getElementById('ficha-cod').textContent = pacienteData.codigo_verificacion || '-';
        document.getElementById('ficha-creado').textContent = new Date(pacienteData.creado_en).toLocaleString('es-PE', { 
            timeZone: 'America/Lima',
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        document.getElementById('ficha-registrador').textContent = (pacienteData.autor && pacienteData.autor.nombre_completo) ? pacienteData.autor.nombre_completo.toUpperCase() : 'Desconocido';

        // 3. AGRUPACION POR CICLOS Y KPIS
        let totalDiasAbiertos = 0;
        let ciclosCount = 0;
        let servicioActual = pacienteData.servicio || '-';
        
        // Agrupar eventos por ciclo_id
        const ciclos = {};
        eventosData.forEach(ev => {
            if(!ciclos[ev.ciclo_id]) {
                ciclos[ev.ciclo_id] = [];
            }
            ciclos[ev.ciclo_id].push(ev);
        });

        const ciclosIds = Object.keys(ciclos).sort((a,b) => b - a); // Descendente visualmente
        ciclosCount = ciclosIds.length;

        // Limpiar
        const container = document.getElementById('ciclos-container');
        container.innerHTML = '';

        ciclosIds.forEach(id => {
            const evs = ciclos[id];
            
            // Buscar inicio y fin de este ciclo
            const evIngreso = evs.find(x => x.tipo_evento === 'Hospitalizado');
            const evAlta = evs.find(x => x.tipo_evento === 'Alta' || x.tipo_evento === 'Fallecido');
            
            const nowPeru = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
            let inicio = evIngreso ? new Date(evIngreso.fecha_evento) : new Date(evs[0].fecha_evento);
            let fin = evAlta ? new Date(evAlta.fecha_evento) : nowPeru; 
            
            let diasCiclo = Math.max(0, Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24)));
            let estadoTexto = evAlta ? evAlta.tipo_evento : 'Activo (En curso)';
            let estadoColor = evAlta && evAlta.tipo_evento === 'Alta' ? '#15803d' : (evAlta ? '#ef4444' : '#2563eb');
            let botonTexto = evAlta ? 'Visualizar' : 'Actualizar';
            let botonIcon = evAlta ? 'fa-eye' : 'fa-timeline';

            totalDiasAbiertos += diasCiclo;

            const card = document.createElement('div');
            card.className = 'ciclo-card';
            card.innerHTML = `
                <div class="ciclo-info">
                    <h5>Registro #${id}</h5>
                    <p><i class="fa-solid fa-calendar-plus"></i> Ingreso: ${inicio.toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}</p>
                    <p><i class="fa-solid fa-clock"></i> Duración: ${diasCiclo} días | Estado: <span class="condicion-badge ${evAlta && evAlta.tipo_evento === 'Fallecido' ? 'cond-fallecido' : (evAlta ? 'cond-alta' : 'cond-hospitalizado')}">${estadoTexto}</span></p>
                </div>
                <div>
                    <a href="seguimiento-pacientes.html?dni=${pacienteData.dni}" class="btn-module primary" style="text-decoration:none; display:inline-block; padding: 8px 15px;">
                        <i class="fa-solid ${botonIcon}"></i> ${botonIcon === 'fa-eye' ? 'Ver Timeline' : 'Actualizar'}
                    </a>
                </div>
            `;
            container.appendChild(card);
        });

        if(ciclosCount === 0) {
            container.innerHTML = '<p style="color: #64748b; font-size:14px;">No existen expedientes clínicos generados.</p>';
        }

        // Actualizar banner dias (ciclo activo o ultimo)
        const bannerDias = document.getElementById('banner-dias');
        if (ciclosIds.length > 0) {
            const lastId = ciclosIds[0];
            const evs = ciclos[lastId];
            const evIngreso = evs.find(x => x.tipo_evento === 'Hospitalizado');
            const evAlta = evs.find(x => x.tipo_evento === 'Alta' || x.tipo_evento === 'Fallecido');
            const nowPeru = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
            let inicio = evIngreso ? new Date(evIngreso.fecha_evento) : new Date(evs[0].fecha_evento);
            let fin = evAlta ? new Date(evAlta.fecha_evento) : nowPeru;
            let dias = Math.max(0, Math.ceil((fin - inicio) / (1000 * 60 * 60 * 24)));
            bannerDias.textContent = `${dias} ${dias === 1 ? 'día' : 'días'}`;
        } else {
            bannerDias.style.display = 'none';
        }

        // KPIS
        document.getElementById('kpi-dias-total').textContent = totalDiasAbiertos;
        document.getElementById('kpi-reingresos').textContent = ciclosCount;
        document.getElementById('kpi-servicios').textContent = servicioActual;

        // BOTON NUEVO REGISTRO (REINGRESO)
        const btnNuevo = document.getElementById('btn-nuevo-ingreso');
        if (pacienteData.condicion === 'Alta' && ciclosCount > 0) {
            btnNuevo.style.display = 'inline-block';
        } else {
            btnNuevo.style.display = 'none';
        }
    };

    // FLUJO NUEVO INGRESO
    const modal = document.getElementById('modal-nuevo-ingreso');
    document.getElementById('btn-nuevo-ingreso').addEventListener('click', () => {
        document.getElementById('modal-servicio').value = '';
        document.getElementById('modal-detalle').value = '';
        modal.style.display = 'flex';
    });
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        modal.style.display = 'none';
    });

    document.getElementById('btn-confirm-ingreso').addEventListener('click', async () => {
        const serv = document.getElementById('modal-servicio').value;
        const det = document.getElementById('modal-detalle').value;
        if(!serv) { alert('Seleccione un servicio'); return; }

        const rBtn = document.getElementById('btn-confirm-ingreso');
        rBtn.textContent = 'Enviando...'; rBtn.disabled = true;

        try {
            // Nuevo ID de ciclo = max + 1
            const maxCiclo = eventosData.reduce((max, ev) => ev.ciclo_id > max ? ev.ciclo_id : max, 0);
            
            const payload = {
                paciente_id: pacienteData.id,
                tipo_evento: 'Hospitalizado',
                detalle: det || `Reingreso al servicio de ${serv}`,
                registrado_por: session.user.id,
                ciclo_id: maxCiclo + 1
            };
            
            const { error: e1 } = await client.from('historial_eventos').insert([payload]);
            if(e1) throw e1;

            // Hay que actualizar el servicio del paciente (ya que condicion se actualiza sola via trigger)
            const { error: e2 } = await client.from('pacientes').update({ servicio: serv }).eq('id', pacienteData.id);
            if(e2) throw e2;

            // redigirir a la linea de tiempo del nuevo ciclo
            window.location.href = `seguimiento-pacientes.html?dni=${pacienteData.dni}`;
            
        } catch(e) {
            console.error(e);
            alert('Error al procesar reingreso: ' + window.JSON.stringify(e));
            rBtn.textContent = 'Reingresar'; rBtn.disabled = false;
        }
    });

    loadData();
});
