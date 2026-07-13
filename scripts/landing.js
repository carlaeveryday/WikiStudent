/**
 * WikiStudent — Navbar Dropdown System
 * Maneja apertura/cierre de menús con hover en desktop y click en móvil.
 */

const NAV_CONFIG = [
  { btnIndex: 0, dropdownClass: 'dropdown-her-ia' },      // Herramientas IA
  { btnIndex: 1, dropdownClass: 'dropdown-mas-her' },     // Más herramientas
  { btnIndex: 2, dropdownClass: 'dropdown-tu-futuro' },   // Tu futuro
];

// ─── Esperar DOM ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // 1. Obtener todos los botones del nav (solo los de la ul, no el Pro)
  const navBtns = document.querySelectorAll('.nav-ul .nav-btn');

  // 2. Mover los dropdowns al <nav> para que queden bien posicionados
  const nav = document.querySelector('nav');
  NAV_CONFIG.forEach(cfg => {
    const dropdown = document.querySelector(`.${cfg.dropdownClass}`);
    if (dropdown) {
      nav.appendChild(dropdown);
    }
  });

  // 3. Añadir la flecha a cada botón con nav config
  navBtns.forEach((btn, i) => {
    if (i < NAV_CONFIG.length) {
      btn.innerHTML = btn.innerHTML.trim(); // limpiar espacios

      // Envolver texto en un span para separarlo del icono
      btn.innerHTML = `<span class="nav-btn-text">${btn.innerHTML}</span>
        <span class="nav-arrow material-symbols-rounded">expand_more</span>`;
    }
  });

  // 4. Asignar dataset a cada botón con su dropdown target
  navBtns.forEach((btn, i) => {
    if (NAV_CONFIG[i]) {
      btn.dataset.target = NAV_CONFIG[i].dropdownClass;
    }
  });

  // ─── Detección de dispositivo ──────────────────────────────────────────
  const isTouchDevice = () => window.matchMedia('(hover: none)').matches;

  // ─── Funciones de apertura / cierre ───────────────────────────────────

  function openDropdown(btn) {
    const targetClass = btn.dataset.target;
    if (!targetClass) return;

    const dropdown = document.querySelector(`.${targetClass}`);
    if (!dropdown) return;

    // Posicionar el dropdown justo debajo del botón
    positionDropdown(btn, dropdown);

    // Cerrar cualquier otro dropdown abierto antes de abrir el nuevo
    closeAll(btn);

    btn.classList.add('nav-btn--active');
    dropdown.classList.add('dropdown--open');
  }

  function closeDropdown(btn) {
    const targetClass = btn.dataset.target;
    if (!targetClass) return;

    const dropdown = document.querySelector(`.${targetClass}`);
    if (!dropdown) return;

    btn.classList.remove('nav-btn--active');
    dropdown.classList.remove('dropdown--open');
  }

  function closeAll(exceptBtn = null) {
    navBtns.forEach(b => {
      if (b !== exceptBtn) closeDropdown(b);
    });
  }

  // ─── Posicionamiento dinámico ──────────────────────────────────────────
  function positionDropdown(btn, dropdown) {
    const btnRect = btn.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();

    // Posición relativa al nav (que es position:relative)
    let left = btnRect.left - navRect.left;

    // Si se sale por la derecha, ajustar
    const dropW = dropdown.offsetWidth || 400;
    const maxLeft = navRect.width - dropW - 16;
    if (left > maxLeft) left = maxLeft;
    if (left < 8) left = 8;

    dropdown.style.left = `${left}px`;
  }

  // ─── Eventos ───────────────────────────────────────────────────────────

  navBtns.forEach(btn => {
    if (!btn.dataset.target) return;

    if (!isTouchDevice()) {
      // ── DESKTOP: hover ──────────────────────────────────────────────
      let leaveTimer;

      btn.addEventListener('mouseenter', () => {
        clearTimeout(leaveTimer);
        openDropdown(btn);
      });

      btn.addEventListener('mouseleave', () => {
        const targetClass = btn.dataset.target;
        const dropdown = document.querySelector(`.${targetClass}`);
        leaveTimer = setTimeout(() => {
          // Cerrar solo si el mouse no está sobre el dropdown
          if (!dropdown.matches(':hover')) closeDropdown(btn);
        }, 120);
      });

      const targetClass = btn.dataset.target;
      const dropdown = document.querySelector(`.${targetClass}`);
      if (dropdown) {
        dropdown.addEventListener('mouseenter', () => clearTimeout(leaveTimer));
        dropdown.addEventListener('mouseleave', () => closeDropdown(btn));
      }

    } else {
      // ── MÓVIL: click ────────────────────────────────────────────────
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = btn.classList.contains('nav-btn--active');
        closeAll();
        if (!isOpen) openDropdown(btn);
      });
    }
  });

  // Cerrar al hacer click fuera
  document.addEventListener('click', () => closeAll());

  // ─── Sombra sticky en .contenedor-botones ─────────────────────────────
  const filtros = document.querySelector('.contenedor-botones');

  if (filtros) {
    // Usamos un sentinel: un div invisible justo encima del contenedor.
    // Cuando el sentinel sale del viewport, el filtro está en modo sticky.
    const sentinel = document.createElement('div');
    sentinel.style.cssText = 'height:1px;width:100%;pointer-events:none;';
    filtros.parentElement.insertBefore(sentinel, filtros);

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Si el sentinel ya no es visible → el filtro está pegado arriba
        filtros.classList.toggle('contenedor-botones--stuck', !entry.isIntersecting);
      },
      { threshold: 0, rootMargin: '0px' }
    );

    observer.observe(sentinel);
  }

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAll();
  });

  // Reposicionar al redimensionar ventana
  window.addEventListener('resize', () => {
    navBtns.forEach(btn => {
      if (btn.classList.contains('nav-btn--active')) {
        const dropdown = document.querySelector(`.${btn.dataset.target}`);
        if (dropdown) positionDropdown(btn, dropdown);
      }
    });
  });
});

document.querySelectorAll('.boton-filtro').forEach(label => {
    label.addEventListener('click', () => {
        const forAttr = label.getAttribute('for');
        // Mapeo de id de radio a id de sección
        const map = {
            'btn-ia': 'ia-section',
            'btn-productividad': 'productividad-section',
            'btn-orientacion': 'orientacion-section',
            'btn-comunidad': 'orientacion-section', // fallback
        };
        const sectionId = map[forAttr];
        if (sectionId) {
            const target = document.getElementById(sectionId);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ─── Iconos flotantes en la columna del about me ──────────────────────────
const abCol = document.getElementById('profile');

if (abCol) {
    const abIcons = [
        'menu_book', 'calculate', 'laptop_mac', 'edit',
        'schedule', 'psychology', 'code', 'lightbulb',
        'star', 'functions', 'developer_mode', 'science'
    ];

    function spawnAbFloater() {
        const el = document.createElement('span');
        el.className = 'material-symbols-rounded ab-floater';
        el.setAttribute('aria-hidden', 'true');
        el.textContent = abIcons[Math.floor(Math.random() * abIcons.length)];

        const size = 14 + Math.random() * 14;
        const left = 10 + Math.random() * 80;
        const duration = 6 + Math.random() * 8;
        const delay = Math.random() * 2;

        el.style.cssText = `font-size:${size}px; left:${left}%; bottom:-20px; animation-duration:${duration}s; animation-delay:${delay}s;`;
        abCol.appendChild(el);
        setTimeout(() => el.remove(), (duration + delay) * 1000);
    }

    setInterval(spawnAbFloater, 700);
}

// ─── Auth Modal ──────────────────────────────────────────────────────────────

function openAuth(tab) {
    switchTab(tab || 'login');
    document.getElementById('auth-overlay').classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeAuth() {
    document.getElementById('auth-overlay').classList.remove('open');
    document.body.style.overflow = '';
}

function switchTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('tab-login').classList.toggle('active', isLogin);
    document.getElementById('tab-register').classList.toggle('active', !isLogin);
    document.getElementById('form-login').classList.toggle('active', isLogin);
    document.getElementById('form-register').classList.toggle('active', !isLogin);
    document.getElementById('auth-error').classList.remove('visible');
    document.getElementById('auth-info').classList.remove('visible');
}

document.getElementById('auth-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeAuth();
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeAuth();
});