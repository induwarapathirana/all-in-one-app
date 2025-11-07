const root = document.documentElement;
const themeToggleEl = document.getElementById('themeToggle');
const themeLabelEl = themeToggleEl ? themeToggleEl.querySelector('.theme-label') : null;

function setTheme(theme, persist = true) {
  root.dataset.theme = theme;
  if (persist) {
    try {
      localStorage.setItem('aoi-theme', theme);
    } catch (err) {
      /* ignore */
    }
  }
  if (themeToggleEl && themeLabelEl) {
    themeToggleEl.setAttribute('aria-label', theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
    themeLabelEl.textContent = theme === 'dark' ? 'Dark mode' : 'Light mode';
  }
}

if (themeToggleEl && themeLabelEl) {
  const storedTheme = (() => {
    try {
      return localStorage.getItem('aoi-theme');
    } catch (err) {
      return null;
    }
  })();
  const prefersDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: root.dataset.theme === 'dark' };
  setTheme(root.dataset.theme || storedTheme || (prefersDark.matches ? 'dark' : 'light'), false);

  themeToggleEl.addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  });

  const systemHandler = (event) => {
    const manual = (() => {
      try {
        return localStorage.getItem('aoi-theme');
      } catch (err) {
        return null;
      }
    })();
    if (!manual) {
      setTheme(event.matches ? 'dark' : 'light', false);
    }
  };

  if (typeof prefersDark.addEventListener === 'function') {
    prefersDark.addEventListener('change', systemHandler);
  } else if (typeof prefersDark.addListener === 'function') {
    prefersDark.addListener(systemHandler);
  }
}

const panels = {
  gen: document.getElementById('panel-gen'),
  scan: document.getElementById('panel-scan'),
  bg: document.getElementById('panel-bg'),
  comp: document.getElementById('panel-comp')
};

const tabLoaders = {
  gen: () => import('./tabs/generator.js'),
  scan: () => import('./tabs/scanner.js'),
  bg: () => import('./tabs/background.js'),
  comp: () => import('./tabs/compressor.js')
};

const loadedTabs = new Set();

async function loadTab(key) {
  if (loadedTabs.has(key)) return;
  const loader = tabLoaders[key];
  if (!loader) return;
  const mod = await loader();
  if (typeof mod.init === 'function') {
    await mod.init();
  }
  loadedTabs.add(key);
}

function showTab(key) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    const active = btn.dataset.tab === key;
    btn.classList.toggle('tab-active', active);
  });
  Object.entries(panels).forEach(([panelKey, el]) => {
    if (!el) return;
    el.classList.toggle('hidden', panelKey !== key);
  });
  loadTab(key);
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
  btn.addEventListener('mouseenter', () => {
    const key = btn.dataset.tab;
    if (!loadedTabs.has(key)) {
      loadTab(key);
    }
  });
});

showTab('gen');
