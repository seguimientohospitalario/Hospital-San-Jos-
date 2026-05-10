document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('login-form');
    const roleSelect = document.getElementById('role');
    const usernameInput = document.getElementById('username');
    const password = document.getElementById('password');
    const toggle = document.getElementById('toggle-password');
    const errorMsg = document.getElementById('error-msg');
    const btn = document.getElementById('login-btn');
    const spinner = btn.querySelector('.spinner');
    const btnText = btn.querySelector('.btn-text');
    const remember = document.getElementById('remember');
    const icon = toggle.querySelector('i');

    sessionStorage.removeItem('userRole');

    toggle.addEventListener('click', () => {
        const isHidden = password.type === 'password';
        password.type = isHidden ? 'text' : 'password';
        icon.classList.toggle('fa-eye');
        icon.classList.toggle('fa-eye-slash');
    });

    const setLoading = (state) => {
        btn.disabled = state;
        spinner.classList.toggle('hidden', !state);
        btnText.style.visibility = state ? 'hidden' : 'visible';
    };

    // Restaurar credenciales guardadas (usuario + rol, sin contraseÃ±a)
    const savedUsername = localStorage.getItem('rememberUsername');
    const savedRole = localStorage.getItem('rememberRole');
    if (savedUsername) {
        usernameInput.value = savedUsername;
        remember.checked = true;
    }
    if (savedRole) {
        roleSelect.value = savedRole;
    }

    // Mostrar mensaje de Ã©xito si viene de recuperaciÃ³n de contraseÃ±a
    const params = new URLSearchParams(window.location.search);
    if (params.get('reset') === 'ok') {
        errorMsg.style.color = '#059669';
        errorMsg.textContent = 'âœ… ContraseÃ±a actualizada exitosamente. Inicia sesiÃ³n con tus nuevas credenciales.';
        // Limpiar la URL
        window.history.replaceState({}, '', window.location.pathname);
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorMsg.textContent = '';
        errorMsg.style.color = '';
        const roleVal = roleSelect.value;
        const usernameVal = usernameInput.value.trim();
        const passVal = password.value.trim();

        if (!roleVal || !usernameVal || !passVal) {
            errorMsg.textContent = 'Completa todos los campos y selecciona tu rol.';
            return;
        }

        // ValidaciÃ³n de seguridad (lÃ­mites de longitud) para prevenir payloads masivos
        if (usernameVal.length > 50) {
            errorMsg.textContent = 'El nombre de usuario es demasiado largo.';
            return;
        }
        if (passVal.length > 100) {
            errorMsg.textContent = 'La contraseÃ±a es demasiado larga.';
            return;
        }

        // SanitizaciÃ³n del username (solo caracteres seguros para evitar inyecciones lÃ³gicas)
        const usernameRegex = /^[a-zA-Z0-9_.-]+$/;
        if (!usernameRegex.test(usernameVal)) {
            errorMsg.textContent = 'El nombre de usuario contiene caracteres no permitidos.';
            return;
        }

        setLoading(true);

        try {
            // 1. Obtener email y rol asociado al nombre de usuario usando RPC para evadir restricciones de lectura anÃ³nimas
            const { data: userInfo, error: rpcError } = await supabaseClient.rpc('get_login_info', {
                username_in: usernameVal
            });

            if (rpcError || !userInfo || userInfo.length === 0) {
                errorMsg.textContent = 'Usuario no encontrado.';
                setLoading(false);
                return;
            }

            const { auth_email, rol_nombre } = userInfo[0];

            // 2. Validar que el rol coincida con el seleccionado
            if (roleVal.toUpperCase() !== rol_nombre.toUpperCase()) {
                errorMsg.textContent = 'Advertencia: El rol seleccionado no corresponde a este usuario.';
                setLoading(false);
                return;
            }

            // 3. Iniciar sesiÃ³n en Supabase con el email subyacente
            const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
                email: auth_email,
                password: passVal
            });

            if (authError) {
                if (authError.message.includes('Invalid login')) {
                    errorMsg.textContent = 'ContraseÃ±a incorrecta.';
                } else if (authError.message.includes('Email not confirmed')) {
                    errorMsg.textContent = 'Debes confirmar tu correo.';
                } else {
                    errorMsg.textContent = 'Error al iniciar sesiÃ³n.';
                }
                setLoading(false);
                return;
            }

            // Inicio de sesiÃ³n exitoso. Obtener perfil completo (ya estamos autenticados, RLS lo permite)
            const { data: profile } = await supabaseClient
                .from('perfiles')
                .select('nombre_completo, nombre_usuario, roles(nombre)')
                .eq('id_usuario', authData.user.id)
                .single();

            if (profile) {
                sessionStorage.setItem('userRole', profile.roles ? profile.roles.nombre : 'Usuario');
                sessionStorage.setItem('userName', profile.nombre_completo || profile.nombre_usuario || authData.user.email);
            } else {
                sessionStorage.setItem('userRole', 'Usuario');
                sessionStorage.setItem('userName', usernameVal);
            }

            // Guardar credenciales (usuario + rol, sin contraseÃ±a)
            if (remember.checked) {
                localStorage.setItem('rememberUsername', usernameVal);
                localStorage.setItem('rememberRole', roleVal);
            } else {
                localStorage.removeItem('rememberUsername');
                localStorage.removeItem('rememberRole');
            }

            window.location.href = 'menu.html';

        } catch (err) {

            errorMsg.textContent = 'Error inesperado.';
            setLoading(false);
        }
    });
});