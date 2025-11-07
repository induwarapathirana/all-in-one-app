import { loadScript, hexToRgb, trackEvent } from '../utils.js';

let initialized = false;
let inCanvas;
let outCanvas;
let inCtx;
let outCtx;

let bgModeSel;
let chromaOptions;
let chromaColor;
let chromaTol;
let personOptions;
let personConfidence;
let personConfidenceVal;
let personFeather;
let personFeatherVal;
let samNote;
let statusLine;
let removeBtn;

let sourceImg;
let basePersonMask = null;
let baseMaskW = 0;
let baseMaskH = 0;
let selfieInstance;
let segInFlight = false;

const segTmpCanvas = document.createElement('canvas');
const segTmpCtx = segTmpCanvas.getContext('2d');
const personMaskCanvas = document.createElement('canvas');
const personMaskCtx = personMaskCanvas.getContext('2d');

function setStatus(message = '', state = '') {
  if (!statusLine) return;
  if (!message) {
    statusLine.textContent = '';
    statusLine.classList.add('hidden');
    delete statusLine.dataset.state;
    return;
  }
  statusLine.textContent = message;
  statusLine.classList.remove('hidden');
  if (state) {
    statusLine.dataset.state = state;
  } else {
    delete statusLine.dataset.state;
  }
}

function syncPersonControls() {
  if (personConfidenceVal && personConfidence) {
    personConfidenceVal.textContent = `${personConfidence.value}%`;
  }
  if (personFeatherVal && personFeather) {
    personFeatherVal.textContent = personFeather.value;
  }
}

function drawInput(img) {
  const maxW = 900;
  const maxH = 600;
  let { width, height } = img;
  const ratio = Math.min(maxW / width, maxH / height, 1);
  width = Math.round(width * ratio);
  height = Math.round(height * ratio);
  inCanvas.width = outCanvas.width = width;
  inCanvas.height = outCanvas.height = height;
  inCtx.clearRect(0, 0, width, height);
  outCtx.clearRect(0, 0, width, height);
  inCtx.drawImage(img, 0, 0, width, height);
  setStatus('Image loaded. Choose a mode and click Remove Background.');
}

function smoothAlpha(alpha, width, height, iterations = 1) {
  if (!iterations) return alpha;
  const tmp = new Float32Array(alpha.length);
  for (let iter = 0; iter < iterations; iter++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            sum += alpha[ny * width + nx];
            count++;
          }
        }
        tmp[y * width + x] = count ? sum / count : alpha[y * width + x];
      }
    }
    alpha.set(tmp);
  }
  return alpha;
}

function chromaKey() {
  const w = inCanvas.width;
  const h = inCanvas.height;
  if (!w || !h) return;
  const src = inCtx.getImageData(0, 0, w, h);
  const dst = outCtx.createImageData(w, h);
  const [rT, gT, bT] = hexToRgb(chromaColor.value);
  const tol = parseInt(chromaTol.value, 10);
  const softness = Math.max(12, tol * 1.35);
  const alphaMask = new Float32Array(w * h);
  for (let i = 0, j = 0; i < src.data.length; i += 4, j++) {
    const r = src.data[i];
    const g = src.data[i + 1];
    const b = src.data[i + 2];
    const a = src.data[i + 3];
    const dist = Math.sqrt((r - rT) ** 2 + (g - gT) ** 2 + (b - bT) ** 2);
    let alpha = (dist - tol) / softness;
    alpha = Math.max(0, Math.min(1, alpha));
    alphaMask[j] = alpha * (a / 255);
    dst.data[i] = r;
    dst.data[i + 1] = g;
    dst.data[i + 2] = b;
  }
  const smoothPasses = Math.max(0, Math.round(tol / 25));
  if (smoothPasses > 0) {
    smoothAlpha(alphaMask, w, h, smoothPasses);
  }
  for (let i = 0, j = 0; i < dst.data.length; i += 4, j++) {
    dst.data[i + 3] = Math.round(alphaMask[j] * 255);
  }
  outCtx.putImageData(dst, 0, 0);
}

async function ensureSelfie() {
  if (selfieInstance) return selfieInstance;
  await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');
  if (!window.SelfieSegmentation) {
    throw new Error('Selfie segmentation failed to load');
  }
  selfieInstance = new window.SelfieSegmentation({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
  });
  selfieInstance.setOptions({ modelSelection: 1 });
  return selfieInstance;
}

function applyPersonMask() {
  if (!basePersonMask || !baseMaskW || !baseMaskH) {
    if (!segInFlight && sourceImg && bgModeSel.value === 'auto-person') {
      personCutout(true);
    }
    return;
  }
  const w = baseMaskW;
  const h = baseMaskH;
  const threshold = (parseInt(personConfidence?.value || '55', 10) || 55) / 100;
  const featherPasses = parseInt(personFeather?.value || '0', 10) || 0;
  const working = basePersonMask.slice();
  const denom = Math.max(0.0001, 1 - threshold);
  for (let i = 0; i < working.length; i++) {
    let val = (working[i] - threshold) / denom;
    working[i] = Math.min(1, Math.max(0, val));
  }
  if (featherPasses > 0) {
    smoothAlpha(working, w, h, featherPasses * 2);
  }

  personMaskCanvas.width = w;
  personMaskCanvas.height = h;
  const maskData = personMaskCtx.createImageData(w, h);
  for (let i = 0, j = 0; i < maskData.data.length; i += 4, j++) {
    const alpha = Math.round(working[j] * 255);
    maskData.data[i] = 255;
    maskData.data[i + 1] = 255;
    maskData.data[i + 2] = 255;
    maskData.data[i + 3] = alpha;
  }
  personMaskCtx.putImageData(maskData, 0, 0);

  outCtx.clearRect(0, 0, w, h);
  outCtx.drawImage(inCanvas, 0, 0, w, h);
  outCtx.globalCompositeOperation = 'destination-in';
  outCtx.drawImage(personMaskCanvas, 0, 0, w, h);
  outCtx.globalCompositeOperation = 'source-over';
}

async function personCutout(forceRefresh = true) {
  if (!sourceImg) return;
  const w = inCanvas.width;
  const h = inCanvas.height;
  if (!w || !h) return;
  if (!forceRefresh && basePersonMask && baseMaskW === w && baseMaskH === h) {
    applyPersonMask();
    return;
  }
  if (segInFlight) return;
  await ensureSelfie();
  segInFlight = true;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      segInFlight = false;
      resolve();
    };
    selfieInstance.onResults((res) => {
      try {
        segTmpCanvas.width = w;
        segTmpCanvas.height = h;
        segTmpCtx.clearRect(0, 0, w, h);
        segTmpCtx.drawImage(res.segmentationMask, 0, 0, w, h);
        const data = segTmpCtx.getImageData(0, 0, w, h).data;
        basePersonMask = new Float32Array(w * h);
        for (let i = 0, j = 0; i < data.length; i += 4, j++) {
          basePersonMask[j] = data[i] / 255;
        }
        baseMaskW = w;
        baseMaskH = h;
        applyPersonMask();
      } finally {
        finish();
      }
    });
    const img = new Image();
    img.onload = () => {
      selfieInstance.send({ image: img }).catch((err) => {
        console.error('SelfieSegmentation send failed', err);
        finish();
      });
    };
    img.onerror = (err) => {
      console.error('Segmentation image load failed', err);
      finish();
    };
    img.src = inCanvas.toDataURL('image/png');
  });
}

async function removeBackground() {
  if (!sourceImg) {
    alert('Upload an image first.');
    return;
  }
  const mode = bgModeSel?.value || 'auto-person';
  trackEvent('bg_process', { event_category: 'background', event_label: mode });
  removeBtn?.setAttribute('disabled', 'true');
  try {
    if (mode === 'chroma') {
      setStatus('Applying chroma-key mask…', 'busy');
      chromaKey();
      setStatus('Chroma-key cutout ready.', 'success');
    } else if (mode === 'sam') {
      await samCutout();
    } else {
      setStatus('Running on-device person segmentation…', 'busy');
      await personCutout(true);
      setStatus('AI cutout ready.', 'success');
    }
    trackEvent('bg_success', { event_category: 'background', event_label: mode });
  } catch (error) {
    console.error('Background removal failed', error);
    setStatus(error?.message || 'Background removal failed.', 'error');
    trackEvent('bg_error', { event_category: 'background', event_label: mode });
  } finally {
    removeBtn?.removeAttribute('disabled');
  }
}

function downloadCutout() {
  if (!outCanvas.width) {
    alert('No cutout to download.');
    return;
  }
  outCanvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cutout.png';
    a.click();
    trackEvent('bg_download', { event_category: 'background' });
  }, 'image/png');
}

function handleModeChange() {
  chromaOptions.classList.toggle('hidden', bgModeSel.value !== 'chroma');
  personOptions.classList.toggle('hidden', bgModeSel.value !== 'auto-person');
  samNote?.classList.toggle('hidden', bgModeSel.value !== 'sam');
  if (bgModeSel.value === 'auto-person') {
    syncPersonControls();
    if (sourceImg) {
      applyPersonMask();
    }
  }
  trackEvent('bg_mode_change', { event_category: 'background', event_label: bgModeSel.value });
}

async function samCutout() {
  if (!inCanvas || !outCanvas) {
    throw new Error('Canvas not ready.');
  }
  const w = inCanvas.width;
  const h = inCanvas.height;
  if (!w || !h) {
    throw new Error('Load an image before using SAM.');
  }
  const dataUrl = inCanvas.toDataURL('image/png');
  const [, base64 = ''] = dataUrl.split(',');
  if (!base64) {
    throw new Error('Unable to export source image for SAM processing.');
  }

  setStatus('Contacting Hugging Face SAM endpoint…', 'busy');

  try {
    const response = await fetch('/api/sam', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ image: base64, mime: 'image/png' })
    });

    if (!response.ok) {
      let message = `SAM request failed (${response.status})`;
      let details;
      try {
        const errorBody = await response.json();
        if (errorBody?.error) {
          message = errorBody.error;
        }
        if (errorBody?.details) {
          details = errorBody.details;
        }
      } catch (err) {
        // ignore body parsing errors
      }
      if (details) {
        console.error('SAM error details', details);
      }
      throw new Error(message);
    }

    const result = await response.json();
    if (!result?.image) {
      throw new Error('SAM response was missing an image.');
    }

    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          outCanvas.width = img.width;
          outCanvas.height = img.height;
          outCtx.clearRect(0, 0, img.width, img.height);
          outCtx.drawImage(img, 0, 0, img.width, img.height);
          resolve();
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = result.image;
    });

    setStatus('Cloud SAM cutout ready.', 'success');
    trackEvent('bg_sam_success', { event_category: 'background' });
  } catch (error) {
    trackEvent('bg_sam_error', { event_category: 'background' });
    throw error;
  }
}

export async function init() {
  if (initialized) return;
  initialized = true;

  inCanvas = document.getElementById('inCanvas');
  outCanvas = document.getElementById('outCanvas');
  if (!inCanvas || !outCanvas) return;
  inCtx = inCanvas.getContext('2d');
  outCtx = outCanvas.getContext('2d');

  bgModeSel = document.getElementById('bgMode');
  chromaOptions = document.getElementById('chromaOptions');
  chromaColor = document.getElementById('chromaColor');
  chromaTol = document.getElementById('chromaTol');
  personOptions = document.getElementById('personOptions');
  personConfidence = document.getElementById('personConfidence');
  personConfidenceVal = document.getElementById('personConfidenceVal');
  personFeather = document.getElementById('personFeather');
  personFeatherVal = document.getElementById('personFeatherVal');
  samNote = document.getElementById('samNote');
  statusLine = document.getElementById('bgStatus');
  removeBtn = document.getElementById('btnRemoveBg');

  document.getElementById('bgFile')?.addEventListener('change', (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        sourceImg = img;
        drawInput(img);
        basePersonMask = null;
        baseMaskW = baseMaskH = 0;
        trackEvent('bg_upload', {
          event_category: 'background',
          event_label: file.type || file.name || 'image'
        });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  personConfidence?.addEventListener('input', () => {
    syncPersonControls();
    applyPersonMask();
    trackEvent('bg_person_confidence', {
      event_category: 'background',
      event_label: personConfidence.value
    });
  });
  personFeather?.addEventListener('input', () => {
    syncPersonControls();
    applyPersonMask();
    trackEvent('bg_person_feather', {
      event_category: 'background',
      event_label: personFeather.value
    });
  });

  bgModeSel?.addEventListener('change', handleModeChange);
  syncPersonControls();
  handleModeChange();

  removeBtn?.addEventListener('click', removeBackground);
  document.getElementById('btnDownloadCutout')?.addEventListener('click', downloadCutout);
}
