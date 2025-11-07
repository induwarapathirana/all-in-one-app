import { canvasToBlob, downloadURI, formatFileSize, trackEvent } from '../utils.js';

let initialized = false;

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const MODEL_LABELS = {
  general: 'Real-ESRGAN (general)',
  anime: 'Real-ESRGAN (anime)'
};

let fileInput;
let browseBtn;
let dropZone;
let infoEl;
let statusEl;
let progressTrack;
let progressBar;
let scaleSel;
let modelSel;
let btnUpscale;
let btnDownload;
let originalPreview;
let resultPreview;

let originalFile = null;
let originalBase64 = '';
let originalMime = '';
let originalImageMeta = { width: 0, height: 0 };
let resultBlob = null;
let working = false;
let progressTimer = null;

function setStatus(message, state = 'idle') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function setProgress(value) {
  if (!progressTrack || !progressBar) return;
  if (value === null || typeof value === 'undefined') {
    progressTrack.classList.add('hidden');
    progressBar.style.width = '0%';
    return;
  }
  const pct = Math.max(0, Math.min(1, value));
  progressTrack.classList.remove('hidden');
  progressBar.style.width = `${Math.round(pct * 100)}%`;
}

function clearProgressTimer() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function setWorking(isWorking) {
  working = isWorking;
  if (btnUpscale) btnUpscale.disabled = isWorking || !originalFile;
  if (btnDownload) btnDownload.disabled = isWorking || !resultBlob;
  if (dropZone) dropZone.classList.toggle('disabled', isWorking);
  if (scaleSel) scaleSel.disabled = isWorking;
  if (modelSel) modelSel.disabled = isWorking;
}

function showPreview(imgEl, src) {
  if (!imgEl) return;
  if (src) {
    imgEl.src = src;
    imgEl.classList.remove('hidden');
  } else {
    imgEl.src = '';
    imgEl.classList.add('hidden');
  }
}

function updateInfo(extra) {
  if (!infoEl) return;
  if (!originalFile || !originalImageMeta.width) {
    infoEl.textContent = 'Upload a JPG or PNG to analyze size and prepare the model.';
    return;
  }
  const base = `<strong>${originalFile.name}</strong> • ${formatFileSize(originalFile.size)} • ${originalImageMeta.width} × ${originalImageMeta.height}px`;
  if (extra) {
    infoEl.innerHTML = `${base}<br><span class="text-xs text-muted">${extra}</span>`;
  } else {
    infoEl.innerHTML = base;
  }
}

function resetResult() {
  resultBlob = null;
  if (btnDownload) btnDownload.disabled = true;
  showPreview(resultPreview, '');
  updateInfo();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}

async function handleFileList(fileList) {
  if (!fileList || !fileList.length) return;
  const files = Array.from(fileList);
  const file = files.find((f) => /^image\/(png|jpe?g)$/i.test(f.type));
  if (!file) {
    setStatus('Please choose a PNG or JPG image.', 'error');
    return;
  }
  if (file.size > MAX_FILE_SIZE) {
    setStatus('Image is too large. Please select a file under 15 MB.', 'error');
    return;
  }
  try {
    setWorking(true);
    setStatus('Loading preview…', 'busy');
    const dataUrl = await readFileAsDataUrl(file);
    const [prefix, base64] = typeof dataUrl === 'string' ? dataUrl.split(',') : ['', ''];
    const mimeMatch = prefix.match(/data:(.*);base64/);
    originalMime = file.type || (mimeMatch ? mimeMatch[1] : 'image/png');
    originalBase64 = base64 || '';
    const img = await loadImage(dataUrl);
    originalFile = file;
    originalImageMeta = { width: img.width, height: img.height };
    showPreview(originalPreview, dataUrl);
    resetResult();
    setStatus('Ready to upscale with Real-ESRGAN.', 'idle');
    updateInfo();
    if (btnUpscale) btnUpscale.disabled = false;
    trackEvent('upscale_upload', {
      event_category: 'upscale',
      event_label: file.type || 'image',
      value: file.size
    });
  } catch (err) {
    console.error(err);
    setStatus('Unable to load that image. Please try a different file.', 'error');
    originalFile = null;
    originalBase64 = '';
    originalMime = '';
    originalImageMeta = { width: 0, height: 0 };
    showPreview(originalPreview, '');
    resetResult();
    trackEvent('upscale_upload_error', {
      event_category: 'upscale',
      event_label: (err?.message || 'load_failed').slice(0, 120)
    });
  } finally {
    setWorking(false);
  }
}

async function runUpscale() {
  if (!originalFile || !originalBase64 || working) return;
  const modelKey = modelSel ? modelSel.value : 'general';
  const modelLabel = MODEL_LABELS[modelKey] || MODEL_LABELS.general;
  const targetScale = parseInt(scaleSel ? scaleSel.value : '4', 10) || 4;
  try {
    setWorking(true);
    setProgress(0);
    setStatus('Submitting image to cloud upscaler…', 'busy');
    let progressValue = 0.12;
    clearProgressTimer();
    progressTimer = setInterval(() => {
      progressValue = Math.min(progressValue + 0.08, 0.85);
      setProgress(progressValue);
    }, 600);

    trackEvent('upscale_start', {
      event_category: 'upscale',
      event_label: modelKey,
      value: targetScale
    });

    const resp = await fetch('/api/upscale', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: originalBase64,
        mime: originalMime,
        model: modelKey
      })
    });

    const text = await resp.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw new Error(text || 'Unexpected response from upscaler');
    }

    if (!resp.ok) {
      const message = payload?.error || payload?.message || 'Upscaling failed';
      throw new Error(message);
    }

    if (!payload || !payload.image) {
      throw new Error('Upscaler returned no image data.');
    }

    clearProgressTimer();
    setProgress(0.9);
    setStatus('Finalizing upscaled preview…', 'busy');

    const upscaledImg = await loadImage(payload.image);
    let finalDataUrl = payload.image;
    let finalBlob;
    let finalWidth = upscaledImg.width;
    let finalHeight = upscaledImg.height;

    const expectedScale = originalImageMeta.width ? finalWidth / originalImageMeta.width : targetScale;
    if (targetScale && Math.abs(expectedScale - targetScale) > 0.25) {
      // Adjust to requested scale if model output differs
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(originalImageMeta.width * targetScale);
      canvas.height = Math.round(originalImageMeta.height * targetScale);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(upscaledImg, 0, 0, canvas.width, canvas.height);
      finalDataUrl = canvas.toDataURL('image/png');
      finalBlob = await canvasToBlob(canvas, 'image/png');
      finalWidth = canvas.width;
      finalHeight = canvas.height;
    } else if (targetScale !== 4 && targetScale < expectedScale) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(originalImageMeta.width * targetScale);
      canvas.height = Math.round(originalImageMeta.height * targetScale);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(upscaledImg, 0, 0, canvas.width, canvas.height);
      finalDataUrl = canvas.toDataURL('image/png');
      finalBlob = await canvasToBlob(canvas, 'image/png');
      finalWidth = canvas.width;
      finalHeight = canvas.height;
    } else {
      const fetched = await fetch(finalDataUrl);
      finalBlob = await fetched.blob();
    }

    resultBlob = finalBlob;
    showPreview(resultPreview, finalDataUrl);
    if (btnDownload) {
      btnDownload.disabled = false;
      btnDownload.dataset.filename = buildDownloadName();
    }

    updateInfo(`Upscaled to ${finalWidth} × ${finalHeight}px • ${formatFileSize(resultBlob.size)} via ${modelLabel}`);
    setProgress(1);
    setTimeout(() => setProgress(null), 400);
    setStatus('Upscale complete. You can download the enhanced image.', 'success');
    trackEvent('upscale_complete', {
      event_category: 'upscale',
      event_label: modelKey,
      value: finalWidth * finalHeight
    });
  } catch (err) {
    console.error(err);
    clearProgressTimer();
    setProgress(null);
    let message = err.message || 'Upscaling failed. Please try again.';
    if (/HUGGINGFACE_TOKEN/i.test(message)) {
      message = 'Add a HUGGINGFACE_TOKEN environment variable with a valid Hugging Face access token (https://huggingface.co/settings/tokens) and redeploy to enable cloud upscaling.';
    }
    setStatus(message, 'error');
    trackEvent('upscale_error', {
      event_category: 'upscale',
      event_label: (err?.message || 'unknown').slice(0, 120)
    });
  } finally {
    clearProgressTimer();
    setWorking(false);
  }
}

function buildDownloadName() {
  if (!originalFile) return 'upscaled.png';
  const name = originalFile.name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return `${base}_upscaled.png`;
}

function handleDrop(event) {
  event.preventDefault();
  dropZone.classList.remove('dragover');
  if (working) return;
  const files = event.dataTransfer?.files;
  handleFileList(files);
}

function handleDrag(event) {
  event.preventDefault();
  if (working) return;
  if (event.type === 'dragover' || event.type === 'dragenter') {
    dropZone.classList.add('dragover');
  } else {
    dropZone.classList.remove('dragover');
  }
}

function handleKey(event) {
  if ((event.key === 'Enter' || event.key === ' ') && !working) {
    event.preventDefault();
    fileInput?.click();
  }
}

function initEvents() {
  if (!dropZone) return;
  dropZone.addEventListener('click', () => {
    if (!working) fileInput?.click();
  });
  dropZone.addEventListener('keypress', handleKey);
  dropZone.addEventListener('dragover', handleDrag);
  dropZone.addEventListener('dragenter', handleDrag);
  dropZone.addEventListener('dragleave', handleDrag);
  dropZone.addEventListener('drop', handleDrop);
}

export async function init() {
  if (initialized) return;
  fileInput = document.getElementById('upFile');
  browseBtn = document.getElementById('upBrowse');
  dropZone = document.getElementById('upDrop');
  infoEl = document.getElementById('upInfo');
  statusEl = document.getElementById('upStatus');
  progressTrack = document.getElementById('upProgress');
  progressBar = progressTrack ? progressTrack.querySelector('.progress-bar') : null;
  scaleSel = document.getElementById('upScale');
  modelSel = document.getElementById('upModel');
  btnUpscale = document.getElementById('btnUpscale');
  btnDownload = document.getElementById('btnUpscaleDownload');
  originalPreview = document.getElementById('upOriginalPreview');
  resultPreview = document.getElementById('upResultPreview');

  if (!dropZone || !fileInput || !btnUpscale) {
    return;
  }

  initEvents();

  if (fileInput) {
    fileInput.addEventListener('change', (event) => handleFileList(event.target.files));
  }

  if (browseBtn) {
    browseBtn.addEventListener('click', () => {
      if (!working) fileInput?.click();
    });
  }

  if (btnUpscale) {
    btnUpscale.addEventListener('click', runUpscale);
  }

  if (btnDownload) {
    btnDownload.addEventListener('click', () => {
      if (!resultBlob) return;
      const url = URL.createObjectURL(resultBlob);
      downloadURI(url, btnDownload.dataset.filename || 'upscaled.png');
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      trackEvent('upscale_download', {
        event_category: 'upscale',
        event_label: btnDownload.dataset.filename || 'upscaled.png'
      });
    });
  }

  scaleSel?.addEventListener('change', () => {
    trackEvent('upscale_scale_change', {
      event_category: 'upscale',
      event_label: scaleSel.value
    });
  });

  modelSel?.addEventListener('change', () => {
    trackEvent('upscale_model_change', {
      event_category: 'upscale',
      event_label: modelSel.value
    });
  });

  setStatus('Requires deploying with a HUGGINGFACE_TOKEN for the cloud inference endpoint. See the deployment guide for setup instructions.', 'idle');
  updateInfo();
  initialized = true;
}

export default { init };
