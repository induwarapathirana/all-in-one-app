import { loadScript, trackEvent } from '../utils.js';

let initialized = false;
let html5QrCode;
let qrReaderEl;
let scanResultEl;
let cameraSelect;
let availableCameras = [];
let isScannerRunning = false;
let loadingCameras = false;

async function ensureLib() {
  if (window.Html5Qrcode) return;
  await loadScript('https://unpkg.com/html5-qrcode');
  if (!window.Html5Qrcode) {
    throw new Error('QR scanner library failed to load');
  }
}

async function populateCameras(force = false) {
  if (!cameraSelect || loadingCameras) return;
  loadingCameras = true;
  try {
    await ensureLib();
    if (force || !availableCameras.length) {
      availableCameras = await window.Html5Qrcode.getCameras();
    }
    const prevValue = cameraSelect.value;
    cameraSelect.innerHTML = '';
    if (!availableCameras.length) {
      const opt = document.createElement('option');
      opt.textContent = 'No cameras found';
      cameraSelect.appendChild(opt);
      cameraSelect.disabled = true;
      return;
    }
    availableCameras.forEach((cam, idx) => {
      const opt = document.createElement('option');
      opt.value = cam.id;
      opt.textContent = cam.label || `Camera ${idx + 1}`;
      cameraSelect.appendChild(opt);
    });
    cameraSelect.disabled = false;
    if (prevValue && availableCameras.some((cam) => cam.id === prevValue)) {
      cameraSelect.value = prevValue;
    } else if (availableCameras[0]) {
      cameraSelect.value = availableCameras[0].id;
    }
    trackEvent('scanner_cameras_loaded', {
      event_category: 'scanner',
      event_label: String(availableCameras.length)
    });
  } catch (err) {
    cameraSelect.innerHTML = '';
    const opt = document.createElement('option');
    opt.textContent = 'Camera access blocked';
    cameraSelect.appendChild(opt);
    cameraSelect.disabled = true;
    console.error('Camera list error', err);
  } finally {
    loadingCameras = false;
  }
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function onScanSuccess(decodedText) {
  if (!scanResultEl) return;
  scanResultEl.classList.remove('items-center', 'justify-center', 'text-center', 'text-muted');
  scanResultEl.classList.add('flex', 'flex-col', 'items-start', 'justify-start', 'gap-2', 'text-left');
  scanResultEl.innerHTML = `
    <div class="text-xs text-muted uppercase tracking-wide">Result</div>
    <div class="font-mono break-all">${escapeHtml(decodedText)}</div>
    <div class="mt-2"><a class="underline" target="_blank" rel="noopener noreferrer" href="${decodedText}">Open</a></div>
  `;
  trackEvent('scanner_result', {
    event_category: 'scanner',
    event_label: decodedText.slice(0, 120),
    value: decodedText.length
  });
}

function onScanFailure() {
  // ignore continuous failures
}

async function startScanner() {
  try {
    await ensureLib();
    if (!html5QrCode) {
      html5QrCode = new window.Html5Qrcode('qr-reader');
    }
    if (!availableCameras.length || !cameraSelect?.value) {
      await populateCameras(true);
    }
    const camId = cameraSelect?.value || availableCameras?.[0]?.id;
    if (!camId) {
      throw new Error('No camera found');
    }
    if (isScannerRunning) {
      await html5QrCode.stop();
      isScannerRunning = false;
    }
    await html5QrCode.start(camId, { fps: 10, qrbox: 250 }, onScanSuccess, onScanFailure);
    isScannerRunning = true;
    trackEvent('scanner_start', { event_category: 'scanner', event_label: camId });
  } catch (err) {
    alert('Camera error: ' + err.message);
    trackEvent('scanner_error', {
      event_category: 'scanner',
      event_label: (err?.message || 'unknown').slice(0, 120)
    });
  }
}

async function stopScanner() {
  if (!html5QrCode || !isScannerRunning) return;
  await html5QrCode.stop();
  isScannerRunning = false;
  trackEvent('scanner_stop', { event_category: 'scanner' });
}

async function scanFile(file) {
  if (!file) return;
  await ensureLib();
  if (!html5QrCode) {
    html5QrCode = new window.Html5Qrcode('qr-reader');
  }
  const res = await html5QrCode.scanFile(file, true);
  onScanSuccess(res);
  trackEvent('scanner_file_scan', {
    event_category: 'scanner',
    event_label: file.type || file.name || 'image'
  });
}

export async function init() {
  if (initialized) return;
  initialized = true;

  qrReaderEl = document.getElementById('qr-reader');
  scanResultEl = document.getElementById('scanResult');
  cameraSelect = document.getElementById('cameraSelect');

  populateCameras();

  cameraSelect?.addEventListener('focus', () => populateCameras(true));
  cameraSelect?.addEventListener('change', async () => {
    trackEvent('scanner_camera_change', { event_category: 'scanner', event_label: cameraSelect.value });
    if (isScannerRunning) {
      await stopScanner();
      startScanner();
    }
  });

  document.getElementById('btnScanStart')?.addEventListener('click', startScanner);
  document.getElementById('btnScanStop')?.addEventListener('click', stopScanner);

  document.getElementById('scanFile')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (file) {
      scanFile(file);
    }
  });
}
