/**
 * recuperar-password.js
 * Flujo de recuperación de contraseña en 3 pasos:
 *   1. Enviar código OTP al correo
 *   2. Verificar código OTP
 *   3. Establecer nueva contraseña
 */

document.addEventListener('DOMContentLoaded', () => {
    // ==================== ELEMENTOS DEL DOM ====================
    const steps = {
        1: document.getElementById('step-1'),
        2: document.getElementById('step-2'),
        3: document.getElementById('step-3'),
        success: document.getElementById('step-success')
    };

    const dots = {
        1: document.getElementById('dot-1'),
        2: document.getElementById('dot-2'),
        3: document.getElementById('dot-3')
    };

    const cardIcon = document.getElementById('card-icon');
    const stepsIndicator = document.querySelector('.steps-indicator');
    const backLink = document.getElementById('back-link');

    // Step 1
    const emailInput = document.getElementById('recovery-email');
    const btnSendCode = document.getElementById('btn-send-code');
    const msgStep1 = document.getElementById('msg-step1');

    // Step 2
    const otpInputs = document.querySelectorAll('.otp-input');
    const btnVerifyCode = document.getElementById('btn-verify-code');
    const displayEmail = document.getElementById('display-email');
    const resendTimer = document.getElementById('resend-timer');
    const countdown = document.getElementById('countdown');
    const btnResend = document.getElementById('btn-resend');
    const msgStep2 = document.getElementById('msg-step2');

    // Step 3
    const newPassword = document.getElementById('new-password');
    const confirmPassword = document.getElementById('confirm-password');
    const toggleNew = document.getElementById('toggle-new');
    const toggleConfirm = document.getElementById('toggle-confirm');
    const btnUpdatePassword = document.getElementById('btn-update-password');
    const reqLength = document.getElementById('req-length');
    const reqMatch = document.getElementById('req-match');
    const msgStep3 = document.getElementById('msg-step3');

    let recoveryEmail = '';
    let countdownInterval = null;

    // ==================== UTILIDADES ====================
    const setLoading = (btn, state) => {
        btn.disabled = state;
        const spinner = btn.querySelector('.spinner');
        const text = btn.querySelector('.btn-text');
        spinner.classList.toggle('hidden', !state);
        text.style.visibility = state ? 'hidden' : 'visible';
    };

    const showMsg = (el, text, type = 'error') => {
        el.textContent = text;
        el.className = `recovery-msg ${type}`;
    };

    const clearMsg = (el) => {
        el.textContent = '';
        el.className = 'recovery-msg';
    };

    const goToStep = (stepNum) => {
        // Limpiar mensajes de todos los pasos para evitar errores residuales
        [msgStep1, msgStep2, msgStep3].forEach(m => {
            if (m) {
                m.textContent = '';
                m.className = 'recovery-msg';
            }
        });

        // Ocultar todos los pasos
        Object.values(steps).forEach(s => s.classList.remove('active'));

        if (stepNum === 'success') {
            steps.success.classList.add('active');
            stepsIndicator.style.display = 'none';
            backLink.style.display = 'none';

            // Cambiar ícono
            cardIcon.className = 'fa-solid fa-circle-check';
            document.querySelector('.recovery-icon-circle').style.background =
                'linear-gradient(135deg, #10b981, #059669)';

            return;
        }

        steps[stepNum].classList.add('active');

        // Resetear inputs si entramos al paso 2
        if (stepNum === 2) {
            otpInputs.forEach(input => {
                input.value = '';
                input.classList.remove('filled');
            });
            btnVerifyCode.disabled = true;
        }

        // Actualizar indicador de pasos
        Object.entries(dots).forEach(([num, dot]) => {
            dot.classList.remove('active', 'completed');
            const n = parseInt(num);
            if (n < stepNum) dot.classList.add('completed');
            else if (n === stepNum) dot.classList.add('active');
        });

        // Actualizar ícono según paso
        const icons = { 1: 'fa-key', 2: 'fa-shield-halved', 3: 'fa-lock' };
        cardIcon.className = `fa-solid ${icons[stepNum]}`;
    };

    // ==================== PASO 1: ENVIAR CÓDIGO ====================
    btnSendCode.addEventListener('click', async () => {
        clearMsg(msgStep1);
        const email = emailInput.value.trim();

        if (!email) {
            showMsg(msgStep1, 'Por favor, ingresa tu correo electrónico.');
            return;
        }

        // Validar formato de email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showMsg(msgStep1, 'El formato del correo no es válido.');
            return;
        }

        setLoading(btnSendCode, true);

        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
                redirectTo: undefined // No usar redirect, usamos OTP directo
            });

            if (error) {
                if (error.message.includes('rate limit') || error.message.includes('Rate limit')) {
                    showMsg(msgStep1, 'Demasiados intentos. Espera unos minutos antes de intentar de nuevo.');
                } else if (error.message.includes('not authorized') || error.message.includes('not found')) {
                    showMsg(msgStep1, 'No se encontró una cuenta asociada a este correo.');
                } else {
                    showMsg(msgStep1, 'Error al enviar el código. Intenta de nuevo.');
                    console.error('Reset password error:', error.message);
                }
                setLoading(btnSendCode, false);
                return;
            }

            // Éxito: avanzar al paso 2
            recoveryEmail = email;
            displayEmail.textContent = email;
            goToStep(2);
            startCountdown();
            otpInputs[0].focus();

        } catch (err) {
            console.error('Error inesperado:', err);
            showMsg(msgStep1, 'Error inesperado. Intenta de nuevo.');
        } finally {
            setLoading(btnSendCode, false);
        }
    });

    // Enter key para paso 1
    emailInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            btnSendCode.click();
        }
    });

    // ==================== PASO 2: VERIFICAR OTP ====================

    // Comportamiento de los inputs OTP
    otpInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;

            // Solo números
            if (!/^\d$/.test(value)) {
                e.target.value = '';
                return;
            }

            e.target.classList.add('filled');

            // Auto-avanzar al siguiente
            if (index < otpInputs.length - 1) {
                otpInputs[index + 1].focus();
            }

            checkOtpComplete();
        });

        input.addEventListener('keydown', (e) => {
            // Retroceder con Backspace
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                otpInputs[index - 1].focus();
                otpInputs[index - 1].value = '';
                otpInputs[index - 1].classList.remove('filled');
            }
        });

        // Soporte para pegar código completo
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8);
            pasted.split('').forEach((char, i) => {
                if (otpInputs[i]) {
                    otpInputs[i].value = char;
                    otpInputs[i].classList.add('filled');
                }
            });
            if (pasted.length > 0 && otpInputs[Math.min(pasted.length, 7)]) {
                otpInputs[Math.min(pasted.length, 7)].focus();
            }
            checkOtpComplete();
        });
    });

    const checkOtpComplete = () => {
        const code = Array.from(otpInputs).map(i => i.value).join('');
        btnVerifyCode.disabled = code.length !== 8;
    };

    btnVerifyCode.addEventListener('click', async () => {
        clearMsg(msgStep2);
        const code = Array.from(otpInputs).map(i => i.value).join('');

        if (code.length !== 8) return;

        setLoading(btnVerifyCode, true);

        try {
            const { data, error } = await supabaseClient.auth.verifyOtp({
                email: recoveryEmail,
                token: code,
                type: 'recovery'
            });

            if (error) {
                if (error.message.includes('expired') || error.message.includes('Token has expired')) {
                    showMsg(msgStep2, 'El código ha expirado. Solicita uno nuevo.');
                } else if (error.message.includes('invalid') || error.message.includes('Invalid')) {
                    showMsg(msgStep2, 'Código incorrecto. Verifica e intenta de nuevo.');
                } else {
                    showMsg(msgStep2, 'Error al verificar el código.');
                    console.error('OTP verify error:', error.message);
                }

                // Limpiar inputs OTP
                otpInputs.forEach(i => {
                    i.value = '';
                    i.classList.remove('filled');
                });
                otpInputs[0].focus();
                setLoading(btnVerifyCode, false);
                return;
            }

            // Éxito: la sesión de recuperación está activa
            if (countdownInterval) clearInterval(countdownInterval);
            goToStep(3);
            newPassword.focus();

        } catch (err) {
            console.error('Error inesperado:', err);
            showMsg(msgStep2, 'Error inesperado. Intenta de nuevo.');
            setLoading(btnVerifyCode, false);
        }
    });

    // Temporizador de reenvío
    const startCountdown = () => {
        let seconds = 60;
        countdown.textContent = seconds;
        resendTimer.style.display = 'inline';
        btnResend.style.display = 'none';

        if (countdownInterval) clearInterval(countdownInterval);

        countdownInterval = setInterval(() => {
            seconds--;
            countdown.textContent = seconds;
            if (seconds <= 0) {
                clearInterval(countdownInterval);
                resendTimer.style.display = 'none';
                btnResend.style.display = 'inline';
            }
        }, 1000);
    };

    btnResend.addEventListener('click', async () => {
        btnResend.disabled = true;
        clearMsg(msgStep2);

        try {
            const { error } = await supabaseClient.auth.resetPasswordForEmail(recoveryEmail);

            if (error) {
                if (error.message.includes('rate limit') || error.message.includes('Rate limit')) {
                    showMsg(msgStep2, 'Demasiados intentos. Espera unos minutos.');
                } else {
                    showMsg(msgStep2, 'Error al reenviar. Intenta de nuevo.');
                }
                btnResend.disabled = false;
                return;
            }

            showMsg(msgStep2, 'Código reenviado exitosamente.', 'success');
            startCountdown();

            // Limpiar inputs
            otpInputs.forEach(i => {
                i.value = '';
                i.classList.remove('filled');
            });
            otpInputs[0].focus();
            btnVerifyCode.disabled = true;

        } catch (err) {
            showMsg(msgStep2, 'Error inesperado.');
            btnResend.disabled = false;
        }
    });

    // ==================== PASO 3: NUEVA CONTRASEÑA ====================

    // Toggle de visibilidad
    const setupToggle = (toggleBtn, input) => {
        toggleBtn.addEventListener('click', () => {
            const isHidden = input.type === 'password';
            input.type = isHidden ? 'text' : 'password';
            const icon = toggleBtn.querySelector('i');
            icon.classList.toggle('fa-eye');
            icon.classList.toggle('fa-eye-slash');
        });
    };

    setupToggle(toggleNew, newPassword);
    setupToggle(toggleConfirm, confirmPassword);

    // Validación en tiempo real
    const validatePasswords = () => {
        const pass = newPassword.value;
        const confirm = confirmPassword.value;

        // Longitud mínima
        const lengthOk = pass.length >= 6;
        reqLength.classList.toggle('valid', lengthOk);
        reqLength.querySelector('i').className = lengthOk ? 'fa-solid fa-check' : 'fa-solid fa-circle';

        // Coincidencia
        const matchOk = pass.length > 0 && confirm.length > 0 && pass === confirm;
        reqMatch.classList.toggle('valid', matchOk);
        reqMatch.querySelector('i').className = matchOk ? 'fa-solid fa-check' : 'fa-solid fa-circle';

        btnUpdatePassword.disabled = !(lengthOk && matchOk);
    };

    newPassword.addEventListener('input', validatePasswords);
    confirmPassword.addEventListener('input', validatePasswords);

    btnUpdatePassword.addEventListener('click', async () => {
        clearMsg(msgStep3);
        const pass = newPassword.value;
        const confirm = confirmPassword.value;

        if (pass.length < 6) {
            showMsg(msgStep3, 'La contraseña debe tener al menos 6 caracteres.');
            return;
        }

        if (pass !== confirm) {
            showMsg(msgStep3, 'Las contraseñas no coinciden.');
            return;
        }

        setLoading(btnUpdatePassword, true);

        try {
            const { error } = await supabaseClient.auth.updateUser({
                password: pass
            });

            if (error) {
                if (error.message.includes('same')) {
                    showMsg(msgStep3, 'La nueva contraseña no puede ser igual a la anterior.');
                } else {
                    showMsg(msgStep3, 'Error al actualizar la contraseña. Intenta de nuevo.');
                    console.error('Update password error:', error.message);
                }
                setLoading(btnUpdatePassword, false);
                return;
            }

            // Cerrar sesión de recuperación
            await supabaseClient.auth.signOut();

            // Mostrar éxito
            goToStep('success');

            // Redirigir al login después de 3 segundos
            setTimeout(() => {
                window.location.href = 'index.html?reset=ok';
            }, 3000);

        } catch (err) {
            console.error('Error inesperado:', err);
            showMsg(msgStep3, 'Error inesperado. Intenta de nuevo.');
            setLoading(btnUpdatePassword, false);
        }
    });

    // Enter key para paso 3
    confirmPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !btnUpdatePassword.disabled) {
            e.preventDefault();
            btnUpdatePassword.click();
        }
    });
});
