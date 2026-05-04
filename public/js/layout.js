document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    
    if (window.location.pathname.includes('index.html') || body.classList.contains('no-layout')) return;

    const currentPage = window.location.pathname.split('/').pop() || 'menu.html';
    const rolNombre = sessionStorage.getItem('userRole') || '...';
    
    const isAdminMode = rolNombre === 'Desarrollador'; 
    const isHighAccess = rolNombre === 'Desarrollador' || rolNombre === 'Administrador';

    const bp = window.location.pathname.includes('/modulos/') ? '../../' : '';

    const adminBtnHTML = isAdminMode ? `<a href="${bp}modulos/usuarios/gestion-admin.html" class="${currentPage === 'gestion-admin.html' ? 'selected' : ''}">Administrador</a>` : '';
    
    const userBtnHTML = isHighAccess 
        ? `<a href="${bp}modulos/usuarios/gestion-user.html" class="${currentPage === 'gestion-user.html' ? 'selected' : ''}">Usuarios</a>`
        : `<a href="#" class="blocked-link" onclick="event.preventDefault(); alert('Su nivel de acceso (Usuario) no le permite ingresar a este submódulo administrativo.');">Usuarios</a>`;

    const sidebarHTML = `
        <div class="sidebar-header">
            <div class="sidebar-header-top">
                <img src="${bp}img/logotipo_transparent.png" alt="Logo MINSA" class="sidebar-logo">
                <div class="sidebar-header-text">
                    <h2>Hospital San José</h2>
                    <p>Unidad de Seguros (SIS)</p>
                </div>
            </div>
        </div>
        <hr class="sidebar-divider">
        <nav class="sidebar-nav">
            <div class="nav-item ${currentPage === 'menu.html' ? 'active' : ''}">
                <a href="${bp}menu.html" class="nav-link">
                    <i class="fa-solid fa-house"></i>
                    <span>Inicio</span>
                </a>
            </div>
            
            <div class="nav-item has-sub ${['gestion-admin.html', 'gestion-user.html'].includes(currentPage) ? 'active' : ''}">
                <div class="nav-link">
                    <i class="fa-solid fa-users"></i>
                    <span>Gestión de Usuarios</span>
                </div>
                <div class="sub-menu">
                    ${adminBtnHTML}
                    ${userBtnHTML}
                </div>
            </div>



            <div class="nav-item ${currentPage === 'registro-pacientes.html' ? 'active' : ''}">
                <a href="${bp}modulos/pacientes/registro-pacientes.html" class="nav-link">
                    <i class="fa-solid fa-user-plus"></i>
                    <span>Registro Pacientes Hospitalizados</span>
                </a>
            </div>

            <div class="nav-item ${currentPage.includes('seguimiento') || currentPage.includes('detalle-paciente') ? 'active' : ''}">
                <a href="${bp}modulos/seguimiento/seguimiento-pacientes.html" class="nav-link">
                    <i class="fa-solid fa-bed-pulse"></i>
                    <span>Seguimiento de Pacientes</span>
                </a>
            </div>

            <div class="nav-item has-sub ${currentPage.includes('consulta-rapida') ? 'active' : ''}">
                <div class="nav-link">
                    <i class="fa-solid fa-robot"></i>
                    <span>Consultas</span>
                </div>
                <div class="sub-menu">
                    <a href="${bp}modulos/consultas/consulta-rapida.html" class="${currentPage.includes('consulta-rapida') ? 'selected' : ''}">Consulta Rápida</a>
                </div>
            </div>

            <div class="nav-item ${currentPage === 'reportes.html' ? 'active' : ''}">
                <a href="${bp}modulos/reportes/reportes.html" class="nav-link">
                    <i class="fa-solid fa-chart-bar"></i>
                    <span>Reportes</span>
                </a>
            </div>
        </nav>
        <div class="sidebar-footer">
            <button class="logout-btn" id="sidebar-logout-btn">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
                <span class="logout-text">Cerrar Sesión</span>
            </button>
        </div>
    `;

    const aside = document.createElement('aside');
    aside.className = 'sidebar collapsible-sidebar';
    aside.innerHTML = sidebarHTML;

    const userName = sessionStorage.getItem('userName') || '';

    // Cabecera Global Uniforme para TODAS las vistas
    let headerHTML = `
        <div class="header-left">
            <button type="button" id="sidebar-toggle-btn" class="sidebar-toggle-btn" aria-label="Abrir menú" aria-expanded="false" title="Menú">
                <i class="fa-solid fa-bars"></i>
            </button>
            <h1 class="welcome-text">
                ${(() => {
                    if (currentPage === 'menu.html') {
                        return '<span class="welcome-dark">BIENVENIDO A LA </span><span class="welcome-celeste">PANTALLA PRINCIPAL</span>';
                    } else if (currentPage === 'gestion-admin.html') {
                        return '<span class="welcome-dark">GESTIÓN DE </span><span class="welcome-celeste">ADMINISTRADORES</span>';
                    } else if (currentPage === 'gestion-user.html') {
                        return '<span class="welcome-dark">GESTIÓN DE </span><span class="welcome-celeste">USUARIOS</span>';
                    } else if (currentPage === 'registro-pacientes.html') {
                        return '<span class="welcome-dark">REGISTRO DE </span><span class="welcome-celeste">NUEVOS PACIENTES</span>';
                    } else if (currentPage === 'seguimiento-pacientes.html' || currentPage === 'verificacion-paciente.html' || currentPage === 'detalle-paciente.html') {
                        return '<span class="welcome-dark">BÚSQUEDA / VERIFICACIÓN / </span><span class="welcome-celeste">ACTUALIZACIÓN</span>';
                    } else if (currentPage === 'consulta-rapida.html') {
                        return '<span class="welcome-dark">CONSULTA A WEB </span><span class="welcome-celeste">DONDE ME ATIENDO</span>';
                    } else if (currentPage === 'reportes.html') {
                        return '<span class="welcome-dark">EXCEL / </span><span class="welcome-celeste">PDF</span>';
                    }
                    return '<span class="welcome-dark">BIENVENIDO</span>';
                })()}
            </h1>
        </div>
        <div class="header-right">
            <div class="profile-dropdown">
                <button class="profile-btn" id="profile-btn" style="display: flex; align-items: center; gap: 12px; background: transparent; border: none; cursor: pointer; padding: 5px 10px; border-radius: 8px;">
                    <i class="fa-solid fa-circle-user profile-icon" style="font-size: 2rem; color: #64748b;"></i>
                    <div class="user-info-text" style="display: flex; flex-direction: column; align-items: flex-start; text-align: left;">
                        <span class="user-email" id="global-user-name" style="font-size: 13px; font-weight: 600; color: #1e293b; text-transform: uppercase;">${userName}</span>
                        <span class="user-role-soft" id="global-user-role" style="font-size: 12px; color: #64748b;">${rolNombre !== '...' ? rolNombre : 'Cargando...'}</span>
                    </div>
                </button>
                <div class="dropdown-menu" id="dropdown-menu" style="right: 10px; top: calc(100% + 10px);">
                    <a href="#"><i class="fa-solid fa-user-pen"></i> Editar Perfil</a>
                    <a href="#" id="global-logout-btn" class="logout"><i class="fa-solid fa-arrow-right-from-bracket"></i> Cerrar Sesión</a>
                </div>
            </div>
        </div>
    `;

    const header = document.createElement('header');
    header.className = 'top-header';
    header.innerHTML = headerHTML;

    body.insertBefore(aside, body.firstChild);

    // Overlay para modo móvil (drawer)
    const overlay = document.createElement('div');
    overlay.id = 'sidebar-overlay';
    overlay.setAttribute('hidden', 'true');
    body.appendChild(overlay);
    
    const wrapper = document.querySelector('.main-wrapper');
    if (wrapper) {
        wrapper.insertBefore(header, wrapper.firstChild);
    }

    // Drawer móvil/tablet: abrir/cerrar sidebar basado solo en ancho (<= 1024px)
    const isTouchLayout = () => {
        if (!window.matchMedia) return false;
        return window.matchMedia('(max-width: 1024px)').matches;
    };

    const expandCurrentSection = () => {
        // Mantener desplegada la sección actual al abrir el drawer
        // (basado en clases ya renderizadas: .active en nav-item y .selected en links)
        const groups = aside.querySelectorAll('.nav-item.has-sub');
        groups.forEach(g => {
            const hasSelected = !!g.querySelector('.sub-menu a.selected');
            if (hasSelected) g.classList.add('active');
        });
    };

    const setSidebarOpen = (open) => {
        body.classList.toggle('sidebar-open', open);
        const btn = document.getElementById('sidebar-toggle-btn');
        if (btn) {
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
            btn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
        }
        if (overlay) {
            if (open) overlay.removeAttribute('hidden');
            else overlay.setAttribute('hidden', 'true');
        }
        if (open) expandCurrentSection();
    };

    const toggleSidebar = () => {
        setSidebarOpen(!body.classList.contains('sidebar-open'));
    };

    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleSidebar();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => setSidebarOpen(false));
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setSidebarOpen(false);
    });

    // Toggles de submenú (mobile/tablet): click en el título despliega/contrae sin navegar
    aside.querySelectorAll('.nav-item.has-sub > .nav-link').forEach((toggleEl) => {
        toggleEl.setAttribute('role', 'button');
        toggleEl.setAttribute('tabindex', '0');
        toggleEl.setAttribute('aria-expanded', toggleEl.parentElement.classList.contains('active') ? 'true' : 'false');

        const handleToggle = (e) => {
            if (!isTouchLayout()) return; // en desktop conserva comportamiento original (hover + active)
            e.preventDefault();
            e.stopPropagation();
            const targetGroup = toggleEl.parentElement;

            // En móvil/tablet: el sombreado debe representar el "grupo" activo
            // (si abres Gestión/Consultas/etc, "Inicio" no debe quedar activo)
            const wasOpen = targetGroup.classList.contains('active');

            aside.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

            // Cerrar otros grupos para evitar scroll excesivo (estilo menú original)
            aside.querySelectorAll('.nav-item.has-sub').forEach(g => g.classList.remove('active'));

            if (!wasOpen) {
                targetGroup.classList.add('active');
            }

            toggleEl.setAttribute('aria-expanded', toggleEl.parentElement.classList.contains('active') ? 'true' : 'false');
        };

        toggleEl.addEventListener('click', handleToggle);
        toggleEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') handleToggle(e);
        });
    });

    // Cerrar al navegar desde el sidebar (móvil/tablet)
    aside.addEventListener('click', (e) => {
        if (!isTouchLayout()) return;
        const a = e.target.closest('a');
        if (a && a.getAttribute('href') && a.getAttribute('href') !== '#') {
            setSidebarOpen(false);
        }
    });

    // Al cambiar tamaño, cerrar el drawer para evitar estados inconsistentes
    window.addEventListener('resize', () => {
        if (!isTouchLayout()) setSidebarOpen(false);
    });
    
    const profileBtn = document.getElementById('profile-btn');
    const dropdownMenu = document.getElementById('dropdown-menu');
    
    if (profileBtn && dropdownMenu) {
        profileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('show');
        });

        document.addEventListener('click', () => {
            if (dropdownMenu.classList.contains('show')) {
                dropdownMenu.classList.remove('show');
            }
        });
    }

    const setupLogout = (btnId) => {
        const btn = document.getElementById(btnId);
        if (btn) {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const client = typeof supabaseClient !== 'undefined' ? supabaseClient : (typeof supabase !== 'undefined' ? supabase : null);
                if (client) {
                    await client.auth.signOut();
                    sessionStorage.removeItem('userRole');
                    sessionStorage.removeItem('userEmail');
                    sessionStorage.removeItem('userName');
                    window.location.href = `${bp}index.html`;
                }
            });
        }
    };

    setupLogout('global-logout-btn');
    setupLogout('sidebar-logout-btn');

    const loadGlobalRole = async () => {
        const roleSpan = document.getElementById('global-user-role');
        const nameSpan = document.getElementById('global-user-name');
        const client = typeof supabaseClient !== 'undefined' ? supabaseClient : null;
        if (!client) return;

        try {
            if (sessionStorage.getItem('userRole') && sessionStorage.getItem('userName')) return; 

            const { data: { session } } = await client.auth.getSession();
            if (!session) return;
            const user = session.user;

            const { data: profile } = await client.from('perfiles')
                .select('nombre_completo, roles(nombre)')
                .eq('id_usuario', user.id)
                .single();

            if (profile) {
                const fetchedRole = profile.roles ? profile.roles.nombre : 'Usuario';
                const fetchedName = (profile.nombre_completo && profile.nombre_completo.trim() !== '') ? profile.nombre_completo.toUpperCase() : user.email.toUpperCase();
                
                sessionStorage.setItem('userRole', fetchedRole);
                sessionStorage.setItem('userName', fetchedName);
                
                if (roleSpan) roleSpan.textContent = fetchedRole;
                if (nameSpan) nameSpan.textContent = fetchedName;
            }
        } catch (e) {
            console.error(e);
        }
    };

    if (rolNombre === '...' || !userName) {
        loadGlobalRole();
    }
    
    // Mostrar layout una vez inyectado (Anti-FOUC)
    document.body.classList.add('layout-loaded');
});

// OFFLINE HANDLING
const handleOffline = () => {
    let offlineDiv = document.getElementById('global-offline-banner');
    if (!offlineDiv) {
        offlineDiv = document.createElement('div');
        offlineDiv.id = 'global-offline-banner';
        document.body.appendChild(offlineDiv);
    }
    offlineDiv.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100vh; background: rgba(255,255,255,0.8); backdrop-filter: blur(5px); z-index: 99999; display: flex; align-items: center; justify-content: center;';
    offlineDiv.innerHTML = '<div style="background: #ef4444; color: white; padding: 20px 40px; border-radius: 8px; font-size: 18px; font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.2);"><i class="fa-solid fa-wifi" style="margin-right: 12px;"></i> Estás sin conexión a internet. Reconectando...</div>';
    document.body.style.overflow = 'hidden';
};

window.addEventListener('offline', handleOffline);

if (!navigator.onLine) {
    handleOffline();
}

window.addEventListener('online', () => {
    const offlineDiv = document.getElementById('global-offline-banner');
    if(offlineDiv) {
        offlineDiv.innerHTML = '<div style="background: #22c55e; color: white; padding: 20px 40px; border-radius: 8px; font-size: 18px; font-weight: 600; box-shadow: 0 10px 25px rgba(0,0,0,0.2);"><i class="fa-solid fa-check" style="margin-right: 12px;"></i> Conexión restaurada</div>';
        setTimeout(() => {
            offlineDiv.remove();
            document.body.style.overflow = 'auto';
        }, 3000);
    }
});