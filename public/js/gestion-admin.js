/**
 * Gestión de Administradores — Hospital San José
 * CRUD de usuarios con rol = Administrador (id_rol=2).
 * Acceso: Solo Desarrollador.
 */
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) { window.location.href = '../../index.html'; return; }

    const rolNombre = sessionStorage.getItem('userRole') || '';
    if (rolNombre !== 'Desarrollador') {
        alert('Solo el rol Desarrollador puede acceder a este módulo.');
        window.location.href = '../../menu.html';
        return;
    }

    const tbody = document.getElementById('tbody-admins');
    const loadingEl = document.getElementById('loading-admins');
    const emptyEl = document.getElementById('empty-admins');
    const tableContainer = document.getElementById('admins-table-container');
    const statTotal = document.getElementById('stat-total');
    const statActivos = document.getElementById('stat-activos');
    const btnNuevo = document.getElementById('btn-nuevo-admin');
    const modalOverlay = document.getElementById('modal-admin');
    const modalTitle = document.getElementById('modal-title');
    const modalError = document.getElementById('modal-error');
    const form = document.getElementById('form-admin');
    const inputNombre = document.getElementById('input-nombre');
    const inputUsername = document.getElementById('input-username');
    const inputEmail = document.getElementById('input-email');
    const inputPassword = document.getElementById('input-password');
    const groupEmail = document.getElementById('group-email');
    const groupPassword = document.getElementById('group-password');
    const btnSubmitText = document.getElementById('btn-submit-text');
    const btnSubmitSpinner = document.getElementById('btn-submit-spinner');
    const btnSubmit = document.getElementById('btn-modal-submit');
    const togglePass = document.getElementById('toggle-pass');
    const inputRol = document.getElementById('input-rol');

    let allAdmins = [];
    let currentPage = 1;
    let rowsPerPage = 5;
    let editingUserId = null;

    const showToast = (msg, type = 'success') => {
        if(window.showSystemTooltip) {
            window.showSystemTooltip(msg, type === 'error');
        }
    };

    togglePass.addEventListener('click', () => {
        const isHidden = inputPassword.type === 'password';
        inputPassword.type = isHidden ? 'text' : 'password';
        togglePass.querySelector('i').className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });

    const openModal = (mode = 'create', user = null) => {
        form.reset();
        modalError.classList.remove('show');
        editingUserId = null;

        if (mode === 'create') {
            inputRol.value = "2";
            updateModalLabels("2");
            groupEmail.style.display = 'block';
            groupPassword.style.display = 'block';
            inputEmail.required = true;
            inputPassword.required = true;
            inputUsername.value = '';
        } else {
            inputRol.value = user.id_rol;
            updateModalLabels(user.id_rol);
            groupEmail.style.display = 'none';
            groupPassword.style.display = 'none';
            inputEmail.required = false;
            inputPassword.required = false;
            editingUserId = user.id_usuario;
            inputNombre.value = user.nombre_completo || '';
            inputUsername.value = user.nombre_usuario || '';
        }
        modalOverlay.classList.add('show');
    };

    const updateModalLabels = (rolId) => {
        const isAdmin = rolId == "2";
        modalTitle.innerHTML = isAdmin 
            ? '<i class="fa-solid fa-user-shield"></i> Nuevo Administrador' 
            : '<i class="fa-solid fa-user-plus"></i> Nuevo Usuario';
        btnSubmitText.textContent = isAdmin ? 'Crear Administrador' : 'Crear Usuario';
    };

    inputRol.addEventListener('change', () => {
        if (!editingUserId) updateModalLabels(inputRol.value);
    });

    const closeModal = () => { modalOverlay.classList.remove('show'); editingUserId = null; };

    btnNuevo.addEventListener('click', () => openModal('create'));
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

    const fetchAdmins = async () => {
        loadingEl.style.display = 'block';
        tableContainer.style.display = 'none';
        emptyEl.style.display = 'none';

        try {
            const { data, error } = await supabaseClient
                .from('perfiles')
                .select('id_usuario, nombre_completo, nombre_usuario, email, id_rol, fecha_creacion, activo, roles(nombre)')
                .eq('id_rol', 2)
                .order('fecha_creacion', { ascending: false });

            if (error) throw error;
            allAdmins = data || [];

            statTotal.textContent = allAdmins.length;
            statActivos.textContent = allAdmins.filter(u => u.activo).length;

            loadingEl.style.display = 'none';

            if (allAdmins.length === 0) {
                emptyEl.style.display = 'block';
                return;
            }

            tableContainer.style.display = 'block';
            recalcAndRender();
        } catch (err) {
            console.error('Error fetching admins:', err);
            loadingEl.style.display = 'none';
            showToast('Error al cargar administradores', 'error');
        }
    };

    const renderTable = () => {
        const start = (currentPage - 1) * rowsPerPage;
        const pageData = allAdmins.slice(start, start + rowsPerPage);
        tbody.innerHTML = '';

        pageData.forEach((user, idx) => {
            const tr = document.createElement('tr');
            const roleName = user.roles?.nombre || 'Administrador';
            const roleBadgeClass = roleName === 'Desarrollador' ? 'badge-role-dev' : 'badge-role-admin';
            const statusBadge = user.activo ? '<span class="badge-activo">ACTIVO</span>' : '<span class="badge-inactivo">INACTIVO</span>';
            const isDev = user.id_rol === 1;

            let fechaStr = '-';
            if (user.fecha_creacion) {
                const d = new Date(user.fecha_creacion);
                fechaStr = d.toLocaleDateString('es-PE', { 
                    day: '2-digit', 
                    month: '2-digit', 
                    year: 'numeric',
                    timeZone: 'America/Lima'
                });
            }

            let actionsHTML = '';
            if (!isDev) {
                const toggleBtn = user.activo
                    ? `<button class="btn-table-action toggle" title="Desactivar" data-action="deactivate" data-id="${user.id_usuario}"><i class="fa-solid fa-user-slash"></i></button>`
                    : `<button class="btn-table-action activate" title="Activar" data-action="activate" data-id="${user.id_usuario}"><i class="fa-solid fa-user-check"></i></button>`;
                actionsHTML = `
                    <button class="btn-table-action edit" title="Editar" data-action="edit" data-id="${user.id_usuario}"><i class="fa-solid fa-pen-to-square"></i></button>
                    ${toggleBtn}
                `;
            } else {
                actionsHTML = '<span style="color:#cbd5e1; font-size:12px;">—</span>';
            }

            tr.innerHTML = `
                <td style="font-weight:700; color:#1e293b;">${start + idx + 1}</td>
                <td>${user.nombre_completo || 'Sin nombre'}</td>
                <td style="color:#64748b; font-size:13px;">${user.email || '—'}</td>
                <td><span class="${roleBadgeClass}">${roleName.toUpperCase()}</span></td>
                <td>${statusBadge}</td>
                <td style="color:#64748b; font-size:13px;">${fechaStr}</td>
                <td style="text-align:center;">${actionsHTML}</td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-table-action').forEach(btn => {
            btn.addEventListener('click', () => handleAction(btn.dataset.action, btn.dataset.id));
        });

        const totalPages = Math.ceil(allAdmins.length / rowsPerPage) || 1;
        DynamicTable.renderPagination({
            containerId: 'pagination-admins',
            currentPage, totalPages,
            onPageChange: (page) => { currentPage = page; renderTable(); }
        });
    };

    const recalcAndRender = () => {
        rowsPerPage = DynamicTable.calcRowsPerPage({
            tableContainerId: 'admins-table-container',
            excludeSelectors: ['.top-header', '.page-header', '.dev-notice', '.page-actions', '.pagination-controls']
        });
        const totalPages = Math.ceil(allAdmins.length / rowsPerPage) || 1;
        if (currentPage > totalPages) currentPage = totalPages;
        renderTable();
    };

    DynamicTable.onResize(recalcAndRender);

    const handleAction = async (action, userId) => {
        if (action === 'edit') {
            const user = allAdmins.find(u => u.id_usuario === userId);
            if (user) openModal('edit', user);
        } else if (action === 'deactivate' || action === 'activate') {
            const newStatus = action === 'activate';
            const label = newStatus ? 'activar' : 'desactivar';
            if (!confirm(`¿Está seguro de ${label} este administrador?`)) return;

            try {
                const { error } = await supabaseClient
                    .from('perfiles')
                    .update({ activo: newStatus })
                    .eq('id_usuario', userId);
                if (error) throw error;
                showToast(`Administrador ${newStatus ? 'activado' : 'desactivado'} correctamente`);
                await fetchAdmins();
            } catch (err) {
                showToast('Error al actualizar estado', 'error');
            }
        }
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        modalError.classList.remove('show');
        const nombre = inputNombre.value.trim();
        const username = inputUsername.value.trim();
        if (!nombre) { showModalError('El nombre es obligatorio.'); return; }
        if (!username) { showModalError('El nombre de usuario es obligatorio.'); return; }

        btnSubmit.disabled = true;
        btnSubmitSpinner.style.display = 'inline-block';
        btnSubmitText.style.visibility = 'hidden';

        try {
            const { data: existingUser } = await supabaseClient
                .from('perfiles')
                .select('id_usuario')
                .eq('nombre_usuario', username)
                .maybeSingle();

            if (existingUser && (!editingUserId || existingUser.id_usuario !== editingUserId)) {
                showModalError('Este nombre de usuario ya está en uso. Elige otro.');
                resetSubmitBtn();
                return;
            }

            if (editingUserId) {
                const { error } = await supabaseClient
                    .from('perfiles')
                    .update({ nombre_completo: nombre, id_rol: parseInt(inputRol.value), nombre_usuario: username })
                    .eq('id_usuario', editingUserId);
                if (error) throw error;
                showToast('Administrador actualizado correctamente');
            } else {
                const email = inputEmail.value.trim();
                const password = inputPassword.value;
                if (!email || !password) { showModalError('Email y contraseña son obligatorios.'); resetSubmitBtn(); return; }
                if (password.length < 6) { showModalError('La contraseña debe tener al menos 6 caracteres.'); resetSubmitBtn(); return; }

                const { data: { session: s } } = await supabaseClient.auth.getSession();
                const response = await fetch(`${supabaseUrl}/functions/v1/create-user`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${s.access_token}`,
                    },
                    body: JSON.stringify({ 
                        email, 
                        password, 
                        nombre_completo: nombre, 
                        id_rol: parseInt(inputRol.value) 
                    })
                });

                const result = await response.json();
                if (!response.ok) {
                    const errMsg = result.error || 'Error al crear administrador';
                    if (errMsg.includes('already been registered')) {
                        showModalError('Este correo electrónico ya está registrado.');
                    } else {
                        showModalError(errMsg);
                    }
                    resetSubmitBtn();
                    return;
                }

                const { data: newUser } = await supabaseClient
                    .from('perfiles')
                    .select('id_usuario')
                    .eq('email', email)
                    .single();

                if (newUser) {
                    await supabaseClient
                        .from('perfiles')
                        .update({ nombre_usuario: username })
                        .eq('id_usuario', newUser.id_usuario);
                }
                showToast('Administrador creado exitosamente');
            }
            closeModal();
            await fetchAdmins();
        } catch (err) {
            console.error('Submit error:', err);
            showModalError('Error inesperado. Intente nuevamente.');
        }
        resetBtn();
    });

    const showModalError = (msg) => { modalError.textContent = msg; modalError.classList.add('show'); };
    const resetBtn = () => { btnSubmit.disabled = false; btnSubmitSpinner.style.display = 'none'; btnSubmitText.style.visibility = 'visible'; };

    await fetchAdmins();
});
