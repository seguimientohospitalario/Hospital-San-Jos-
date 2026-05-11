document.addEventListener('DOMContentLoaded', async () => {
    const client = typeof supabaseClient !== 'undefined' ? supabaseClient : supabase;
    const { data: { session } } = await client.auth.getSession();

    if (!session) {
        window.location.href = '../../index.html';
        return;
    }

    // ── Calendar State (Peru timezone) ──
    const now = new Date();
    const peruDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Lima' }));
    const today = peruDate;
    let viewMonth = today.getMonth();
    let viewYear = today.getFullYear();
    let selectedDate = null;

    const monthNames = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    // ── DOM refs ──
    const calTitle = document.getElementById('cal-title');
    let calGrid = document.getElementById('cal-days-grid');
    const calPrev = document.getElementById('cal-prev');
    const calNext = document.getElementById('cal-next');
    const filterMonth = document.getElementById('filter-month');
    const filterYear = document.getElementById('filter-year');

    // ── Load patient data from URL ──
    const params = new URLSearchParams(window.location.search);
    const pacienteId = params.get('id');

    if (!pacienteId) {
        document.getElementById('p-nombre-completo').textContent = 'Paciente no especificado';
        return;
    }

    (async function loadPatient() {
        try {
            const { data, error } = await client
                .from('pacientes')
                .select('*')
                .eq('id', pacienteId)
                .single();

            if (error || !data) {
                document.getElementById('p-nombre-completo').textContent = 'Error al cargar datos';
                return;
            }

            document.getElementById('p-dni').textContent = data.dni || '—';
            document.getElementById('p-nombre-completo').textContent =
                `${data.apellidos || ''}, ${data.nombres || ''}`.trim() || '—';
            document.getElementById('p-seguro').textContent = data.tipo_seguro || '—';
            document.getElementById('p-servicio').textContent = data.servicio || '—';
        } catch {
            document.getElementById('p-nombre-completo').textContent = 'Error de conexión';
        }
    })();

    // ── Populate filters ──
    function populateFilters() {
        monthNames.forEach((name, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = name;
            filterMonth.appendChild(opt);
        });
        const yearNow = today.getFullYear();
        for (let y = yearNow - 5; y <= yearNow + 5; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            filterYear.appendChild(opt);
        }
    }

    function syncFilters() {
        filterMonth.value = viewMonth;
        filterYear.value = viewYear;
    }

    // ── Calendar render ──
    function renderCalendar(direction) {
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

        let dayIndex = 0;
        for (let i = 0; i < totalCells; i++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'cal-day';

            let dayNumber;
            let isCurrentMonth = true;

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
                continue;
            }

            dayEl.textContent = dayNumber;
            dayEl.dataset.date = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;

            if (selectedDate && dayNumber === selectedDate.getDate() &&
                viewMonth === selectedDate.getMonth() &&
                viewYear === selectedDate.getFullYear()) {
                dayEl.classList.add('cal-day-selected');
            }

            dayEl.addEventListener('click', () => onDayClick(dayNumber));
            grid.appendChild(dayEl);
            dayIndex++;
        }

        const days = grid.querySelectorAll('.cal-day:not(.cal-day-empty)');
        days.forEach((el, idx) => {
            el.style.animationDelay = `${idx * 20}ms`;
            el.classList.add('cal-day-animate');
        });

        calGrid.replaceWith(grid);
        calGrid = grid;
    }

    function onDayClick(dayNumber) {
        selectedDate = new Date(viewYear, viewMonth, dayNumber);
        renderCalendar();
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

    // ── Init ──
    populateFilters();
    renderCalendar();
});
