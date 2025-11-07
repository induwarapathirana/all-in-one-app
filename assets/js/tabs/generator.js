import {
  loadScript,
  debounce,
  autoGrowTextArea,
  dataUrlFromCanvasOrImg,
  svgFromElement,
  downloadURI,
  roundRect,
  trackEvent
} from '../utils.js';

let initialized = false;
let qrDiv;
let qrStyler = null;
let qrBackend = null;
let scheduleMakeQR;
let lastLogoFile = null;
let lastLogoDataUrl = null;
let logoRenderToken = 0;

let qrTypeSelect;
let qrTypeGroups;
let wifiPassRow;
let wifiSecurity;
let fgModeSelect;
let gradientOpts;
let gradientAngle;
let gradientAngleVal;
let logoScaleInput;
let logoScaleLabel;
let logoMarginInput;
let logoMarginLabel;
let moduleShapeSelect;
let cornerShapeSelect;
let cornerDotShapeSelect;

async function ensureQrLib() {
  if (window.QRCodeStyling) {
    qrBackend = 'styling';
    return 'styling';
  }

  const qrStylingCDNs = [
    'https://cdn.jsdelivr.net/npm/qr-code-styling@1.6.0/lib/qr-code-styling.js',
    'https://unpkg.com/qr-code-styling@1.6.0/lib/qr-code-styling.js'
  ];
  for (const url of qrStylingCDNs) {
    try {
      await loadScript(url);
      if (window.QRCodeStyling) {
        qrBackend = 'styling';
        return 'styling';
      }
    } catch (err) {
      console.warn('QR styling CDN failed', url);
    }
  }

  if (window.QRCode) {
    qrBackend = 'qrcodejs';
    return 'qrcodejs';
  }

  const qrcodejsCDNs = [
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs/qrcode.min.js',
    'https://unpkg.com/qrcodejs@1.0.0/qrcode.min.js'
  ];
  for (const url of qrcodejsCDNs) {
    try {
      await loadScript(url);
      if (window.QRCode) {
        qrBackend = 'qrcodejs';
        return 'qrcodejs';
      }
    } catch (err) {
      console.warn('QR classic CDN failed', url);
    }
  }

  const qrcodeBundleCDNs = [
    'https://cdn.jsdelivr.net/npm/qrcode@1.5.4/build/qrcode.min.js',
    'https://unpkg.com/qrcode@1.5.4/build/qrcode.min.js'
  ];
  for (const url of qrcodeBundleCDNs) {
    try {
      await loadScript(url);
      if (window.qrcode) {
        qrBackend = 'qrcode-module';
        return 'qrcode-module';
      }
    } catch (err) {
      console.warn('QR module CDN failed', url);
    }
  }

  throw new Error('No QR library could be loaded');
}

function updateGradientVisibility() {
  if (!fgModeSelect || !gradientOpts) return;
  const show = fgModeSelect.value === 'gradient';
  gradientOpts.classList.toggle('hidden', !show);
}

function updateGradientAngleLabel() {
  if (!gradientAngle || !gradientAngleVal) return;
  gradientAngleVal.textContent = Math.round(Number(gradientAngle.value) || 0) + '°';
}

function updateLogoScaleLabel() {
  if (!logoScaleInput || !logoScaleLabel) return;
  logoScaleLabel.textContent = Math.round((parseFloat(logoScaleInput.value) || 0.22) * 100) + '%';
}

function updateLogoMarginLabel() {
  if (!logoMarginInput || !logoMarginLabel) return;
  logoMarginLabel.textContent = Math.round(parseFloat(logoMarginInput.value) || 0) + 'px';
}

function updateWifiPasswordVisibility() {
  if (!wifiPassRow || !wifiSecurity) return;
  wifiPassRow.classList.toggle('hidden', wifiSecurity.value === 'nopass');
}

function autoGrowActiveTextAreas() {
  const type = qrTypeSelect?.value || 'url';
  qrTypeGroups.forEach((group) => {
    const isActive = group.dataset.type === type;
    group.classList.toggle('hidden', !isActive);
    if (isActive) {
      group.querySelectorAll('textarea').forEach((el) => autoGrowTextArea(el));
    }
  });
  updateWifiPasswordVisibility();
}

async function getLogoDataUrl() {
  const logoInput = document.getElementById('qrLogo');
  const file = logoInput?.files?.[0];
  if (!file) {
    lastLogoFile = null;
    lastLogoDataUrl = null;
    return null;
  }
  if (file === lastLogoFile && lastLogoDataUrl) {
    return lastLogoDataUrl;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  lastLogoFile = file;
  lastLogoDataUrl = dataUrl;
  return dataUrl;
}

function buildQrData() {
  const type = qrTypeSelect?.value || 'url';
  const fallback = 'https://example.com';
  if (type === 'wifi') {
    const ssid = (document.getElementById('qrWifiSsid')?.value || '').trim();
    const pass = (document.getElementById('qrWifiPassword')?.value || '').trim();
    const security = document.getElementById('qrWifiSecurity')?.value || 'WPA';
    const hidden = document.getElementById('qrWifiHidden')?.checked ? 'H:true;' : '';
    const escapeWifi = (str) => str.replace(/([\\;,:"])/g, '\\$1');
    if (!ssid) return fallback;
    let payload = `WIFI:T:${security};S:${escapeWifi(ssid)};`;
    if (security !== 'nopass' && pass) {
      payload += `P:${escapeWifi(pass)};`;
    }
    payload += hidden;
    return `${payload};`;
  }
  if (type === 'email') {
    const to = (document.getElementById('qrEmailTo')?.value || '').trim();
    const subject = encodeURIComponent(document.getElementById('qrEmailSubject')?.value || '');
    const body = encodeURIComponent(document.getElementById('qrEmailBody')?.value || '');
    return `mailto:${to}?subject=${subject}&body=${body}`;
  }
  if (type === 'sms') {
    const number = (document.getElementById('qrSmsNumber')?.value || '').trim();
    const message = encodeURIComponent(document.getElementById('qrSmsMessage')?.value || '');
    return `sms:${number}?&body=${message}`;
  }
  if (type === 'phone') {
    const number = (document.getElementById('qrPhoneNumber')?.value || '').trim();
    return `tel:${number}`;
  }
  const text = (document.getElementById('qrText')?.value || '').trim();
  return text || fallback;
}

function getQrColors() {
  const fgMode = fgModeSelect?.value || 'solid';
  const fgColor = document.getElementById('qrFg')?.value || '#000000';
  const bgColor = document.getElementById('qrBg')?.value || '#ffffff';
  if (fgMode === 'gradient') {
    const alt = document.getElementById('qrFgAlt')?.value || fgColor;
    const angleDeg = parseFloat(gradientAngle?.value) || 0;
    return {
      gradient: {
        type: 'linear',
        colorStops: [
          { offset: 0, color: fgColor },
          { offset: 1, color: alt }
        ],
        rotation: angleDeg * (Math.PI / 180)
      },
      background: bgColor
    };
  }
  return {
    color: fgColor,
    background: bgColor
  };
}

function getErrorCorrection() {
  return document.getElementById('qrEC')?.value || 'M';
}

async function renderQrStyler(size, margin, data) {
  if (!window.QRCodeStyling) return false;
  if (!qrStyler) {
    qrStyler = new window.QRCodeStyling({
      width: size,
      height: size,
      margin,
      data,
      type: 'canvas'
    });
  }
  const moduleShape = moduleShapeSelect?.value || 'square';
  const cornerShape = cornerShapeSelect?.value || 'square';
  const cornerInnerShape = cornerDotShapeSelect?.value || 'square';
  const cornerColor = document.getElementById('qrCornerColor')?.value || '#000000';
  const cornerInnerColor = document.getElementById('qrCornerDotColor')?.value || '#000000';
  const colorSpec = getQrColors();
  const dotsOptions = { type: moduleShape };
  if (colorSpec.gradient) {
    dotsOptions.gradient = colorSpec.gradient;
  } else {
    dotsOptions.color = colorSpec.color;
  }

  qrStyler.update({
    width: size,
    height: size,
    margin,
    data,
    dotsOptions,
    cornersSquareOptions: { type: cornerShape, color: cornerColor },
    cornersDotOptions: { type: cornerInnerShape, color: cornerInnerColor },
    backgroundOptions: { color: colorSpec.background },
    imageOptions: {
      imageSize: parseFloat(document.getElementById('qrLogoScale')?.value) || 0.22,
      crossOrigin: 'anonymous',
      margin: parseFloat(document.getElementById('qrLogoMargin')?.value) || 0,
      hideBackgroundDots: document.getElementById('qrLogoHideDots')?.checked || false
    },
    qrOptions: {
      errorCorrectionLevel: getErrorCorrection()
    }
  });

  const logoDataUrl = await getLogoDataUrl();
  if (logoDataUrl) {
    qrStyler.update({ image: logoDataUrl });
  } else {
    qrStyler.update({ image: undefined });
  }

  qrDiv.innerHTML = '';
  qrStyler.append(qrDiv);
  return true;
}

async function renderQrFallback(size, margin, data) {
  const fgInput = document.getElementById('qrFg');
  const bgInput = document.getElementById('qrBg');
  const backgroundColor = bgInput?.value || '#ffffff';
  const fgColor = fgInput?.value || '#000000';
  qrDiv.innerHTML = '';

  if (qrBackend === 'qrcodejs') {
    const qrInstance = new window.QRCode(qrDiv, {
      text: data,
      width: size,
      height: size,
      margin,
      colorDark: fgColor,
      colorLight: backgroundColor,
      correctLevel: window.QRCode.CorrectLevel[getErrorCorrection()] || window.QRCode.CorrectLevel.M
    });
    return qrInstance;
  }

  if (qrBackend === 'qrcode-module') {
    const canvas = document.createElement('canvas');
    qrDiv.appendChild(canvas);
    await window.qrcode.toCanvas(canvas, data, {
      width: size,
      margin,
      color: {
        dark: fgColor,
        light: backgroundColor
      },
      errorCorrectionLevel: getErrorCorrection()
    });
    const logoDataUrl = await getLogoDataUrl();
    if (logoDataUrl) {
      drawLogo(canvas, logoDataUrl);
    }
    return canvas;
  }

  return null;
}

async function makeQR() {
  try {
    const backend = await ensureQrLib();
    const data = buildQrData();
    const size = parseInt(document.getElementById('qrSize').value, 10) || 320;
    const margin = parseInt(document.getElementById('qrMargin').value, 10) || 2;
    const typeLabel = qrTypeSelect?.value || 'url';
    if (backend === 'styling') {
      const success = await renderQrStyler(size, margin, data);
      if (success) {
        trackEvent('qr_render', { event_category: 'qr', event_label: typeLabel, backend: 'styling' });
        return;
      }
    }
    await renderQrFallback(size, margin, data);
    trackEvent('qr_render', { event_category: 'qr', event_label: typeLabel, backend: qrBackend || backend });
  } catch (err) {
    console.error(err);
    qrDiv.innerHTML = `<div class="text-sm text-red-500">${err.message}</div>`;
    trackEvent('qr_error', {
      event_category: 'qr',
      event_label: (err?.message || 'unknown').slice(0, 120)
    });
  }
}

async function drawLogo(canvas, dataUrl) {
  if (!canvas) return;
  const scaleEl = document.getElementById('qrLogoScale');
  const marginEl = document.getElementById('qrLogoMargin');
  const hideDotsEl = document.getElementById('qrLogoHideDots');
  const scale = parseFloat(scaleEl?.value) || 0.22;
  const padding = parseFloat(marginEl?.value) || 0;
  const hideDots = hideDotsEl?.checked;
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const logo = new Image();
  const token = ++logoRenderToken;
  logo.onload = () => {
    if (token !== logoRenderToken) return;
    const target = size * scale;
    const x = (size - target) / 2;
    const y = x;
    ctx.save();
    if (hideDots) {
      const radius = target / 6;
      ctx.fillStyle = '#fff';
      roundRect(ctx, x - padding, y - padding, target + padding * 2, target + padding * 2, radius);
      ctx.fill();
    }
    ctx.drawImage(logo, x, y, target, target);
    ctx.restore();
  };
  logo.onerror = () => console.warn('Logo render failed');
  logo.src = dataUrl;
}

function hookDownloadButtons() {
  document.getElementById('btnDownloadPNG')?.addEventListener('click', async () => {
    if (!qrBackend) {
      await makeQR();
    }
    if (qrBackend === 'styling') {
      if (!qrStyler) await makeQR();
      if (!qrStyler) {
        alert('Generate a QR first.');
        return;
      }
      qrStyler.download({ name: 'qr', extension: 'png' });
      trackEvent('qr_download', { event_category: 'qr', event_label: 'png' });
      return;
    }
    const el = qrDiv.querySelector('canvas') || qrDiv.querySelector('img');
    if (!el) {
      alert('Generate a QR first.');
      return;
    }
    downloadURI(dataUrlFromCanvasOrImg(el, 'image/png'), 'qr.png');
    trackEvent('qr_download', { event_category: 'qr', event_label: 'png' });
  });

  document.getElementById('btnDownloadSVG')?.addEventListener('click', async () => {
    if (!qrBackend) {
      await makeQR();
    }
    if (qrBackend === 'styling') {
      if (!qrStyler) await makeQR();
      if (!qrStyler) {
        alert('Generate a QR first.');
        return;
      }
      qrStyler.download({ name: 'qr', extension: 'svg' });
      trackEvent('qr_download', { event_category: 'qr', event_label: 'svg' });
      return;
    }
    let el = qrDiv.querySelector('canvas') || qrDiv.querySelector('img');
    if (!el) {
      await makeQR();
      el = qrDiv.querySelector('canvas') || qrDiv.querySelector('img');
    }
    if (!el) {
      alert('Generate a QR first.');
      return;
    }
    const size = parseInt(document.getElementById('qrSize').value, 10) || 320;
    const bg = document.getElementById('qrBg').value || '#ffffff';
    const svg = svgFromElement(el, size, bg);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    downloadURI(URL.createObjectURL(blob), 'qr.svg');
    trackEvent('qr_download', { event_category: 'qr', event_label: 'svg' });
  });
}

function hookInputs() {
  const inputs = document.querySelectorAll('[data-qr-input]');
  inputs.forEach((el) => {
    const trigger = () => scheduleMakeQR();
    const events = new Set(['change']);
    if (
      el.tagName === 'TEXTAREA' ||
      el.type === 'text' ||
      el.type === 'tel' ||
      el.type === 'email' ||
      el.type === 'url' ||
      el.type === 'range' ||
      el.type === 'color' ||
      el.type === 'number'
    ) {
      events.add('input');
    }
    if (el.type === 'file') {
      events.add('change');
    }
    events.forEach((evt) => el.addEventListener(evt, trigger));
  });

  [qrTypeSelect, fgModeSelect, wifiSecurity, gradientAngle, logoScaleInput, logoMarginInput].forEach((el) => {
    if (!el) return;
    const handler = () => scheduleMakeQR();
    el.addEventListener('change', handler);
    if (el === gradientAngle || el === logoScaleInput || el === logoMarginInput) {
      el.addEventListener('input', handler);
    }
  });

  fgModeSelect?.addEventListener('change', () => {
    updateGradientVisibility();
    trackEvent('qr_foreground_mode', { event_category: 'qr', event_label: fgModeSelect.value });
  });
  gradientAngle?.addEventListener('input', updateGradientAngleLabel);
  logoScaleInput?.addEventListener('input', updateLogoScaleLabel);
  logoMarginInput?.addEventListener('input', updateLogoMarginLabel);
  qrTypeSelect?.addEventListener('change', () => {
    autoGrowActiveTextAreas();
    trackEvent('qr_type_change', { event_category: 'qr', event_label: qrTypeSelect.value });
  });
  wifiSecurity?.addEventListener('change', () => {
    updateWifiPasswordVisibility();
    trackEvent('qr_wifi_security', { event_category: 'qr', event_label: wifiSecurity.value });
  });

  const urlBtn = document.getElementById('btnUseCurrentUrl');
  const qrTextArea = document.getElementById('qrText');
  if (urlBtn && qrTextArea) {
    urlBtn.addEventListener('click', () => {
      if (qrTypeSelect) {
        qrTypeSelect.value = 'url';
        autoGrowActiveTextAreas();
      }
      qrTextArea.value = window.location.href;
      qrTextArea.dispatchEvent(new Event('input', { bubbles: true }));
      qrTextArea.focus();
      const end = qrTextArea.value.length;
      qrTextArea.setSelectionRange(end, end);
      trackEvent('qr_use_current_url', { event_category: 'qr' });
    });
  }

  const logoInput = document.getElementById('qrLogo');
  if (logoInput) {
    logoInput.addEventListener('change', () => {
      lastLogoFile = null;
      lastLogoDataUrl = null;
      scheduleMakeQR();
      const file = logoInput.files?.[0];
      trackEvent('qr_logo_selected', {
        event_category: 'qr',
        event_label: file ? file.type || file.name : 'cleared'
      });
    });
  }

  document.getElementById('btnGen')?.addEventListener('click', () => {
    trackEvent('qr_manual_generate', { event_category: 'qr', event_label: qrTypeSelect?.value || 'url' });
    makeQR();
  });

  const areas = [
    [document.getElementById('qrText'), 320],
    [document.getElementById('qrEmailBody'), 260],
    [document.getElementById('qrSmsMessage'), 260]
  ];
  areas.forEach(([el, max]) => {
    if (!el) return;
    const grow = () => autoGrowTextArea(el, max);
    el.addEventListener('input', grow);
    el.addEventListener('change', grow);
    grow();
  });
}

export async function init() {
  if (initialized) return;
  initialized = true;

  qrDiv = document.getElementById('qrPreview');
  qrTypeSelect = document.getElementById('qrType');
  qrTypeGroups = document.querySelectorAll('.qr-type-group');
  wifiPassRow = document.querySelector('[data-wifi-pass]');
  wifiSecurity = document.getElementById('qrWifiSecurity');
  fgModeSelect = document.getElementById('qrFgMode');
  gradientOpts = document.getElementById('qrGradientOpts');
  gradientAngle = document.getElementById('qrGradientAngle');
  gradientAngleVal = document.getElementById('qrGradientAngleVal');
  logoScaleInput = document.getElementById('qrLogoScale');
  logoScaleLabel = document.getElementById('qrLogoScaleLabel');
  logoMarginInput = document.getElementById('qrLogoMargin');
  logoMarginLabel = document.getElementById('qrLogoMarginLabel');
  moduleShapeSelect = document.getElementById('qrDotStyle');
  cornerShapeSelect = document.getElementById('qrCornerSquareStyle');
  cornerDotShapeSelect = document.getElementById('qrCornerDotStyle');

  scheduleMakeQR = debounce(() => makeQR(), 160);

  updateGradientVisibility();
  updateGradientAngleLabel();
  updateLogoScaleLabel();
  updateLogoMarginLabel();
  autoGrowActiveTextAreas();

  hookInputs();
  hookDownloadButtons();

  (window.requestIdleCallback || ((fn) => setTimeout(fn, 200)))(() => {
    makeQR();
  }, { timeout: 400 });
}
