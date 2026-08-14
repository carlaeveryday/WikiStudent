/* =====================================================
   settings.js — Panel de Configuración WikiStudent
   ===================================================== */

(function () {
    'use strict';

    /* ── Elementos base ── */
    const overlay = document.getElementById('settings-overlay');
    const openBtn = document.getElementById('settings-symbol');
    const closeBtn = document.getElementById('cfg-close-btn');
    const tabs = document.querySelectorAll('.cfg-tab');
    const panels = document.querySelectorAll('.cfg-panel-tab');

    /* ── Abrir / Cerrar ── */
    function openSettings() {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
        rellenarDatos();
    }

    function closeSettings() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (openBtn) openBtn.addEventListener('click', openSettings);
    if (closeBtn) closeBtn.addEventListener('click', closeSettings);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSettings();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) closeSettings();
    });

    /* ── Cambio de pestaña ── */
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            tabs.forEach(t => t.classList.remove('cfg-tab--active'));
            panels.forEach(p => p.classList.remove('cfg-panel-tab--active'));
            tab.classList.add('cfg-tab--active');
            document.getElementById('cfg-tab-' + target)?.classList.add('cfg-panel-tab--active');
        });
    });

    /* ── Rellenar datos del usuario ── */
    function rellenarDatos() {
        const username = document.body.dataset.username || '';
        const usernameEl = document.getElementById('cfg-username');
        const displayEl = document.getElementById('cfg-display-name');
        const inputEl = document.getElementById('cfg-input-username');
        const avatarEl = document.getElementById('cfg-avatar-preview');

        if (usernameEl) usernameEl.textContent = username;
        if (displayEl) displayEl.textContent = username;
        if (inputEl && !inputEl.value) inputEl.value = username;
        if (avatarEl && username) {
            avatarEl.textContent = username.slice(0, 2).toUpperCase();
        }

        // Cargar foto de perfil si existe
        const savedPhoto = localStorage.getItem('ws_avatar_url');
        if (savedPhoto) aplicarFotoPerfil(savedPhoto);
    }

    /* ══════════════════════════════════════════════════════
       MODAL PERSONALIZADO — reemplaza alert/confirm/prompt
       ══════════════════════════════════════════════════════ */

    /**
     * Muestra un diálogo de confirmación estilizado.
     * @param {object} opts - { title, desc, confirmLabel, cancelLabel, danger, inputLabel, inputType, inputPlaceholder }
     * @returns {Promise<string|boolean>} - resolve con el valor del input o true/false
     */
    function wsModal(opts = {}) {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'ws-modal-overlay';

            const isDanger = opts.danger !== false;
            const hasInput = !!opts.inputLabel;

            overlay.innerHTML = `
                <div class="ws-modal ${isDanger ? 'ws-modal--danger' : ''}">
                    <div class="ws-modal__icon" style="background:${isDanger ? 'rgba(255,60,60,0.1)' : 'rgba(0,210,255,0.08)'};color:${isDanger ? '#ff4d4d' : 'var(--azul-neon)'}">
                        <span class="material-symbols-outlined">${opts.icon || (isDanger ? 'warning' : 'info')}</span>
                    </div>
                    <div class="ws-modal__title">${opts.title || '¿Confirmar acción?'}</div>
                    <div class="ws-modal__desc">${opts.desc || ''}</div>
                    ${hasInput ? `
                        <label class="ws-modal__input-label">${opts.inputLabel}</label>
                        <input class="ws-modal__input" type="${opts.inputType || 'text'}" placeholder="${opts.inputPlaceholder || ''}" autocomplete="new-password" spellcheck="false">
                    ` : ''}
                    <div class="ws-modal__actions">
                        <button class="cfg-btn cfg-btn--neon" id="ws-modal-cancel">${opts.cancelLabel || 'Cancelar'}</button>
                        <button class="cfg-btn ${isDanger ? 'cfg-btn--danger' : 'cfg-btn--naranja'}" id="ws-modal-confirm">${opts.confirmLabel || 'Confirmar'}</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            const input = overlay.querySelector('.ws-modal__input');
            if (input) setTimeout(() => input.focus(), 80);

            overlay.querySelector('#ws-modal-cancel').addEventListener('click', () => {
                overlay.remove();
                resolve(false);
            });

            overlay.querySelector('#ws-modal-confirm').addEventListener('click', () => {
                const val = input ? input.value : true;
                overlay.remove();
                resolve(val);
            });

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) { overlay.remove(); resolve(false); }
            });

            // Enter para confirmar
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        overlay.remove();
                        resolve(input.value);
                    }
                });
            }
        });
    }

    /* ══════════════════════════════════════════════════════
       MOSTRAR / OCULTAR CONTRASEÑA
       ══════════════════════════════════════════════════════ */

    document.querySelectorAll('.cfg-pass-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            const wrap = btn.closest('.cfg-pass-wrap');
            const input = wrap.querySelector('input');
            const icon = btn.querySelector('.material-symbols-outlined');
            if (input.type === 'password') {
                input.type = 'text';
                icon.textContent = 'visibility_off';
            } else {
                input.type = 'password';
                icon.textContent = 'visibility';
            }
        });
    });

    /* ══════════════════════════════════════════════════════
       FOTO DE PERFIL
       ══════════════════════════════════════════════════════ */

    function aplicarFotoPerfil(dataUrl) {
        // Avatar en el panel de configuración
        const imgEl = document.getElementById('cfg-avatar-img');
        if (imgEl) {
            imgEl.src = dataUrl;
            imgEl.classList.add('loaded');
        }
        // Avatar en el sidebar
        const sidebarAvatar = document.querySelector('.sidebar__avatar');
        if (sidebarAvatar) {
            sidebarAvatar.style.backgroundImage = `url(${dataUrl})`;
            sidebarAvatar.style.backgroundSize = 'cover';
            sidebarAvatar.style.backgroundPosition = 'center';
            sidebarAvatar.textContent = '';
        }
    }

    const avatarFileInput = document.getElementById('cfg-avatar-file-input');
    const editFotoBtn = document.getElementById('cfg-edit-foto-btn');

    editFotoBtn?.addEventListener('click', () => avatarFileInput?.click());

    avatarFileInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            mostrarToast('Solo se permiten imágenes', 'error'); return;
        }
        if (file.size > 5 * 1024 * 1024) {
            mostrarToast('La imagen no puede superar 5 MB', 'error'); return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            const dataUrl = ev.target.result;
            localStorage.setItem('ws_avatar_url', dataUrl);
            aplicarFotoPerfil(dataUrl);
            mostrarToast('Foto actualizada ✓', 'success');
        };
        reader.readAsDataURL(file);
    });

    /* ── Cargar foto al arrancar ── */
    const savedPhoto = localStorage.getItem('ws_avatar_url');
    if (savedPhoto) aplicarFotoPerfil(savedPhoto);

    /* ── Sliders: actualizar valor ── */
    function bindSlider(sliderId, valId) {
        const slider = document.getElementById(sliderId);
        const val = document.getElementById(valId);
        if (!slider || !val) return;
        slider.addEventListener('input', () => {
            val.textContent = slider.value + '%';
        });
    }

    bindSlider('slider-pomodoro-vol', 'val-pomodoro-vol');
    bindSlider('slider-notif-vol', 'val-notif-vol');

    /* ══════════════════════════════════════════════════════
       SONIDO — persistencia de preferencias + botones "Probar"
       (leídas por sonidos.js vía window.WSAudio.getPrefs())
       ══════════════════════════════════════════════════════ */

    const selPomodoroSound = document.getElementById('select-pomodoro-sound');
    const selNotifSound    = document.getElementById('select-notif-sound');
    const sliderPomodoroVol = document.getElementById('slider-pomodoro-vol');
    const sliderNotifVol    = document.getElementById('slider-notif-vol');
    const toggleAlarmRepeat = document.getElementById('toggle-alarm-repeat');

    // Cargar preferencias guardadas al abrir Ajustes
    (function cargarPrefsSonido() {
        const savedPomodoroSound = localStorage.getItem('ws_pomodoro_sound');
        const savedNotifSound    = localStorage.getItem('ws_notif_sound');
        const savedPomodoroVol   = localStorage.getItem('ws_pomodoro_vol');
        const savedNotifVol      = localStorage.getItem('ws_notif_vol');
        const savedAlarmRepeat   = localStorage.getItem('ws_alarm_repeat');

        if (savedPomodoroSound && selPomodoroSound) selPomodoroSound.value = savedPomodoroSound;
        if (savedNotifSound && selNotifSound) selNotifSound.value = savedNotifSound;
        if (savedPomodoroVol && sliderPomodoroVol) {
            sliderPomodoroVol.value = savedPomodoroVol;
            document.getElementById('val-pomodoro-vol').textContent = savedPomodoroVol + '%';
        }
        if (savedNotifVol && sliderNotifVol) {
            sliderNotifVol.value = savedNotifVol;
            document.getElementById('val-notif-vol').textContent = savedNotifVol + '%';
        }
        if (savedAlarmRepeat !== null && toggleAlarmRepeat) {
            toggleAlarmRepeat.checked = savedAlarmRepeat === 'true';
        }
    })();

    selPomodoroSound?.addEventListener('change', () => {
        localStorage.setItem('ws_pomodoro_sound', selPomodoroSound.value);
    });
    selNotifSound?.addEventListener('change', () => {
        localStorage.setItem('ws_notif_sound', selNotifSound.value);
    });
    sliderPomodoroVol?.addEventListener('change', () => {
        localStorage.setItem('ws_pomodoro_vol', sliderPomodoroVol.value);
    });
    sliderNotifVol?.addEventListener('change', () => {
        localStorage.setItem('ws_notif_vol', sliderNotifVol.value);
    });
    toggleAlarmRepeat?.addEventListener('change', () => {
        localStorage.setItem('ws_alarm_repeat', toggleAlarmRepeat.checked);
    });

    // Botones "Probar" — reproducen el sonido seleccionado con el volumen actual
    document.getElementById('btn-test-pomodoro-sound')?.addEventListener('click', () => {
        window.WSAudio?.playAlarma(selPomodoroSound?.value, Number(sliderPomodoroVol?.value ?? 70));
    });
    document.getElementById('btn-test-notif-sound')?.addEventListener('click', () => {
        const sonido = selNotifSound?.value;
        if (!sonido || sonido === 'none') { mostrarToast('Selecciona un sonido primero', 'error'); return; }
        window.WSAudio?.playNotif(sonido, Number(sliderNotifVol?.value ?? 40));
    });

    /* ══════════════════════════════════════════════════════
       NOTIFICACIONES — activar Y desactivar
       ══════════════════════════════════════════════════════ */

    const permBtn = document.getElementById('cfg-perm-btn');
    const permStatus = document.getElementById('cfg-perm-status');

    function updatePermUI(state) {
        if (!permStatus || !permBtn) return;
        if (state === 'granted') {
            permStatus.textContent = '✓ Notificaciones activadas';
            permStatus.style.color = '#5fca7d';
            permBtn.textContent = 'Desactivar';
            permBtn.className = 'cfg-btn cfg-btn--danger';
            permBtn.disabled = false;
            permBtn.style.opacity = '';
        } else if (state === 'denied') {
            permStatus.textContent = '✗ Permiso denegado — actívalo en ajustes del navegador';
            permStatus.style.color = '#ff4d4d';
            permBtn.textContent = 'Denegado';
            permBtn.disabled = true;
            permBtn.style.opacity = '0.5';
        } else {
            permStatus.textContent = 'Sin permiso concedido';
            permStatus.style.color = '';
            permBtn.textContent = 'Activar';
            permBtn.className = 'cfg-btn cfg-btn--neon';
            permBtn.disabled = false;
            permBtn.style.opacity = '';
        }
    }

    if ('Notification' in window) {
        updatePermUI(Notification.permission);
    }

    permBtn?.addEventListener('click', async () => {
        if (!('Notification' in window)) {
            permStatus.textContent = 'Tu navegador no soporta notificaciones'; return;
        }
        // Si ya están concedidas, "desactivar" (solo podemos informar — los permisos no se revocan por JS)
        if (Notification.permission === 'granted') {
            const ok = await wsModal({
                title: 'Desactivar notificaciones',
                desc: 'Para desactivarlas completamente debes hacerlo desde los ajustes del navegador (icono 🔒 junto a la URL). ¿Quieres ir a los ajustes?',
                confirmLabel: 'Ir a ajustes',
                cancelLabel: 'Cerrar',
                danger: false,
                icon: 'notifications_off'
            });
            if (ok) window.open('chrome://settings/content/notifications', '_blank');
            return;
        }
        const result = await Notification.requestPermission();
        updatePermUI(result);
    });

    /* ══════════════════════════════════════════════════════
       GUARDAR NOMBRE DE USUARIO (persiste en BD)
       ══════════════════════════════════════════════════════ */

    document.getElementById('cfg-save-username')?.addEventListener('click', async () => {
        const input = document.getElementById('cfg-input-username');
        const newName = input?.value.trim();
        if (!newName || newName.length < 3) {
            mostrarToast('El nombre debe tener al menos 3 caracteres', 'error'); return;
        }
        if (!/^[a-zA-Z0-9_.\\-]+$/.test(newName)) {
            mostrarToast('Solo letras, números, puntos, guiones y _', 'error'); return;
        }
        try {
            const res = await fetch('/api/user/username', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: newName })
            });
            if (res.ok) {
                mostrarToast('Nombre actualizado ✓', 'success');
                document.getElementById('cfg-username').textContent = newName;
                document.getElementById('cfg-display-name').textContent = newName;
                document.body.dataset.username = newName;
                // Actualizar sidebar
                const sidebarName = document.querySelector('.sidebar__user-name');
                if (sidebarName) sidebarName.textContent = newName;
                const sidebarAvatar = document.querySelector('.sidebar__avatar');
                if (sidebarAvatar && !sidebarAvatar.style.backgroundImage) {
                    sidebarAvatar.textContent = newName[0].toUpperCase();
                }
                const headerName = document.querySelector('.orange-word');
                if (headerName && headerName.textContent !== '¡Bienvenido/a, ' && headerName.textContent !== '!') {
                    headerName.textContent = newName;
                }
            } else {
                const data = await res.json().catch(() => ({}));
                mostrarToast(data.error || 'Error al guardar', 'error');
            }
        } catch {
            mostrarToast('Sin conexión', 'error');
        }
    });

    /* ══════════════════════════════════════════════════════
       GUARDAR EMAIL
       ══════════════════════════════════════════════════════ */

    document.getElementById('cfg-save-email')?.addEventListener('click', async () => {
        const input = document.getElementById('cfg-input-email');
        const email = input?.value.trim();
        if (!email) return;
        try {
            const res = await fetch('/api/user/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            mostrarToast(res.ok ? 'Email actualizado ✓' : 'Error al guardar', res.ok ? 'success' : 'error');
        } catch { mostrarToast('Sin conexión', 'error'); }
    });

    /* ── Guardar correo de recuperación ── */
    document.getElementById('cfg-save-recovery')?.addEventListener('click', async () => {
        const input = document.getElementById('cfg-input-recovery');
        const email = input?.value.trim();
        if (!email) return;
        try {
            const res = await fetch('/api/user/recovery-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recoveryEmail: email })
            });
            mostrarToast(res.ok ? 'Correo de recuperación vinculado ✓' : 'Error al guardar', res.ok ? 'success' : 'error');
        } catch { mostrarToast('Sin conexión', 'error'); }
    });

    /* ══════════════════════════════════════════════════════
       CAMBIAR CONTRASEÑA (persiste en BD)
       ══════════════════════════════════════════════════════ */

    document.getElementById('cfg-save-password')?.addEventListener('click', async () => {
        const current = document.getElementById('cfg-pass-current')?.value;
        const newPass = document.getElementById('cfg-pass-new')?.value;
        const confirm = document.getElementById('cfg-pass-confirm')?.value;

        if (!current || !newPass || !confirm) {
            mostrarToast('Rellena todos los campos', 'error'); return;
        }
        if (newPass !== confirm) {
            mostrarToast('Las contraseñas no coinciden', 'error'); return;
        }
        if (newPass.length < 8) {
            mostrarToast('La contraseña debe tener al menos 8 caracteres', 'error'); return;
        }

        try {
            const res = await fetch('/api/user/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword: current, newPassword: newPass })
            });
            if (res.ok) {
                mostrarToast('Contraseña cambiada ✓', 'success');
                ['cfg-pass-current', 'cfg-pass-new', 'cfg-pass-confirm'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
            } else {
                const data = await res.json().catch(() => ({}));
                mostrarToast(data.message || 'Error al cambiar contraseña', 'error');
            }
        } catch { mostrarToast('Sin conexión', 'error'); }
    });

    /* ── Cerrar sesión ── */
    document.getElementById('cfg-logout-btn')?.addEventListener('click', async () => {
        const ok = await wsModal({
            title: 'Cerrar sesión',
            desc: '¿Seguro que quieres salir de tu cuenta en este dispositivo?',
            confirmLabel: 'Cerrar sesión',
            cancelLabel: 'Cancelar',
            icon: 'logout',
            danger: false
        });
        if (ok) window.location.href = '/logout';
    });

    /* ══════════════════════════════════════════════════════
       EXPORTAR DATOS
       ══════════════════════════════════════════════════════ */

    document.getElementById('cfg-export-btn')?.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/user/export');
            if (!res.ok) { mostrarToast('Error al exportar', 'error'); return; }
            const data = await res.json();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'wikistudent-datos.json';
            a.click();
            URL.revokeObjectURL(url);
            mostrarToast('Datos exportados ✓', 'success');
        } catch { mostrarToast('Sin conexión', 'error'); }
    });

    /* ══════════════════════════════════════════════════════
       BORRAR DATOS
       ══════════════════════════════════════════════════════ */

    document.getElementById('cfg-delete-data-btn')?.addEventListener('click', async () => {
        const ok = await wsModal({
            title: 'Borrar todos mis datos',
            desc: 'Se eliminarán permanentemente: agenda, kanban, pomodoros y estadísticas. <strong style="color:#ff6b6b">Esta acción no se puede deshacer.</strong>',
            confirmLabel: 'Sí, borrar todo',
            cancelLabel: 'Cancelar',
            icon: 'delete_sweep',
            danger: true
        });
        if (!ok) return;

        try {
            const res = await fetch('/api/user/data', { method: 'DELETE' });
            if (res.ok) {
                mostrarToast('Datos eliminados', 'success');
                setTimeout(() => location.reload(), 1500);
            } else {
                mostrarToast('Error al borrar datos', 'error');
            }
        } catch { mostrarToast('Sin conexión', 'error'); }
    });

    /* ══════════════════════════════════════════════════════
       ELIMINAR CUENTA (requiere contraseña)
       ══════════════════════════════════════════════════════ */

    document.getElementById('cfg-delete-account-btn')?.addEventListener('click', async () => {
        // Paso 1: advertencia
        const confirm1 = await wsModal({
            title: 'Eliminar cuenta',
            desc: '¿Seguro que quieres eliminar tu cuenta? Se borrarán <strong style="color:#ff6b6b">todos tus datos de forma permanente</strong> y no podrás recuperarlos.',
            confirmLabel: 'Continuar',
            cancelLabel: 'Cancelar',
            icon: 'person_remove',
            danger: true
        });
        if (!confirm1) return;

        // Paso 2: pedir contraseña
        const password = await wsModal({
            title: 'Confirma tu contraseña',
            desc: 'Introduce tu contraseña actual para confirmar la eliminación de la cuenta.',
            confirmLabel: 'Eliminar cuenta',
            cancelLabel: 'Cancelar',
            icon: 'lock',
            danger: true,
            inputLabel: 'Contraseña actual',
            inputType: 'password',
            inputPlaceholder: '••••••••'
        });

        if (!password || password === false || password === '') {
            mostrarToast('Eliminación cancelada', 'error'); return;
        }

        try {
            const res = await fetch('/api/user/account', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            if (res.ok) {
                mostrarToast('Cuenta eliminada. Hasta pronto.', 'success');
                setTimeout(() => window.location.href = '/', 2000);
            } else {
                const data = await res.json().catch(() => ({}));
                mostrarToast(data.error || 'Error al eliminar cuenta', 'error');
            }
        } catch { mostrarToast('Sin conexión', 'error'); }
    });

    /* ── Modo claro / oscuro ── */
    document.getElementById('toggle-light-mode')?.addEventListener('change', (e) => {
        document.documentElement.classList.toggle('light-mode', e.target.checked);
        const dark = document.getElementById('toggle-dark-mode');
        if (dark) dark.checked = !e.target.checked;
    });

    document.getElementById('toggle-dark-mode')?.addEventListener('change', (e) => {
        document.documentElement.classList.toggle('light-mode', !e.target.checked);
        const light = document.getElementById('toggle-light-mode');
        if (light) light.checked = !e.target.checked;
    });

    /* ══════════════════════════════════════════════════════
       TOAST
       ══════════════════════════════════════════════════════ */

    function mostrarToast(msg, tipo = 'success') {
        let toast = document.getElementById('cfg-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cfg-toast';
            Object.assign(toast.style, {
                position: 'fixed',
                bottom: '24px',
                right: '24px',
                zIndex: '999999',
                padding: '12px 20px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: '700',
                fontFamily: 'Montserrat, sans-serif',
                letterSpacing: '0.5px',
                transition: 'opacity 0.3s, transform 0.3s',
                pointerEvents: 'none',
            });
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        Object.assign(toast.style, {
            background: tipo === 'success' ? 'rgba(95,202,125,0.15)' : 'rgba(255,77,77,0.15)',
            border: tipo === 'success' ? '1px solid rgba(95,202,125,0.4)' : '1px solid rgba(255,77,77,0.4)',
            color: tipo === 'success' ? '#5fca7d' : '#ff4d4d',
            opacity: '1',
            transform: 'translateY(0)',
        });
        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
        }, 2800);
    }

})();

/* Estos se añaden dentro del IIFE — pero como lo cerramos antes,
   los añadimos aquí fuera directamente en DOMContentLoaded */
document.addEventListener('DOMContentLoaded', () => {

    /* ── Color de acento ── */
    document.querySelectorAll('.cfg-color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.cfg-color-swatch').forEach(s => s.classList.remove('cfg-color-swatch--active'));
            swatch.classList.add('cfg-color-swatch--active');
            const color = swatch.dataset.color;
            document.documentElement.style.setProperty('--naranja-neon', color);
            localStorage.setItem('ws_accent_color', color);
        });
    });

    // Aplicar color guardado al cargar
    const savedAccent = localStorage.getItem('ws_accent_color');
    if (savedAccent) {
        document.documentElement.style.setProperty('--naranja-neon', savedAccent);
        document.querySelectorAll('.cfg-color-swatch').forEach(s => {
            s.classList.toggle('cfg-color-swatch--active', s.dataset.color === savedAccent);
        });
    }

    /* ── Tamaño de fuente ── */
    const fontSlider = document.getElementById('slider-font-size');
    const fontVal = document.getElementById('val-font-size');
    if (fontSlider) {
        const savedSize = localStorage.getItem('ws_font_size') || '100';
        fontSlider.value = savedSize;
        if (fontVal) fontVal.textContent = savedSize + '%';
        document.documentElement.style.fontSize = savedSize + '%';

        fontSlider.addEventListener('input', () => {
            const val = fontSlider.value;
            if (fontVal) fontVal.textContent = val + '%';
            document.documentElement.style.fontSize = val + '%';
            localStorage.setItem('ws_font_size', val);
        });
    }

    /* ── Botón alt de cambiar foto ── */
    const altBtn = document.getElementById('cfg-edit-foto-btn-alt');
    const fileInput = document.getElementById('cfg-avatar-file-input');
    if (altBtn && fileInput) altBtn.addEventListener('click', () => fileInput.click());
});