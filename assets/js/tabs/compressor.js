import { blobToImage, canvasToBlob, drawToFit, formatFileSize } from '../utils.js';

let initialized = false;
let compFile;
let compFormatSel;
let compQuality;
let compMaxW;
let compMaxH;
let compOrigImg;
let compOutImg;
let compOrigMeta;
let compOutMeta;
let btnCompLocal;
let btnCompTiny;
let btnCompDownload;
let tinyProxy;

let lastCompressedBlob;

function updateOriginalPreview(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  compOrigImg.src = url;
  compOrigMeta.textContent = `${file.type || 'image'} • ${formatFileSize(file.size)}`;
}

async function compressLocal() {
  const file = compFile.files?.[0];
  if (!file) {
    alert('Upload an image first.');
    return;
  }
  const img = await blobToImage(file);
  const maxW = parseInt(compMaxW.value, 10) || 1920;
  const maxH = parseInt(compMaxH.value, 10) || 1920;
  const { canvas } = drawToFit(img, maxW, maxH);
  let mime = compFormatSel.value === 'auto' ? file.type || 'image/jpeg' : compFormatSel.value;
  if (!/image\/(png|jpeg|webp)/.test(mime)) {
    mime = 'image/jpeg';
  }
  const quality = parseFloat(compQuality.value) || 0.8;
  const blob = await canvasToBlob(canvas, mime, quality);
  lastCompressedBlob = blob;
  const url = URL.createObjectURL(blob);
  compOutImg.src = url;
  const saved = file.size ? (100 - (blob.size / file.size) * 100).toFixed(1) : '0';
  compOutMeta.textContent = `${mime} • ${formatFileSize(blob.size)} • ${saved}% saved`;
}

async function compressTinyPng() {
  const file = compFile.files?.[0];
  if (!file) {
    alert('Upload an image first.');
    return;
  }
  const proxy = tinyProxy.value.trim();
  if (!proxy) {
    alert('Enter your TinyPNG proxy URL first.');
    return;
  }
  try {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const resp = await fetch(proxy, { method: 'POST', body: fd });
    if (!resp.ok) {
      throw new Error(`Proxy error: ${resp.status}`);
    }
    const blob = await resp.blob();
    lastCompressedBlob = blob;
    const url = URL.createObjectURL(blob);
    compOutImg.src = url;
    const saved = file.size ? (100 - (blob.size / file.size) * 100).toFixed(1) : '0';
    compOutMeta.textContent = `${blob.type || 'image/png'} • ${formatFileSize(blob.size)} • ${saved}% saved (TinyPNG)`;
  } catch (err) {
    alert('TinyPNG proxy request failed: ' + err.message);
  }
}

function downloadCompressed() {
  if (!lastCompressedBlob) {
    alert('No compressed image yet.');
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(lastCompressedBlob);
  a.download = 'compressed';
  a.click();
}

export async function init() {
  if (initialized) return;
  initialized = true;

  compFile = document.getElementById('compFile');
  compFormatSel = document.getElementById('compFormat');
  compQuality = document.getElementById('compQuality');
  compMaxW = document.getElementById('compMaxW');
  compMaxH = document.getElementById('compMaxH');
  compOrigImg = document.getElementById('compOrigImg');
  compOutImg = document.getElementById('compOutImg');
  compOrigMeta = document.getElementById('compOrigMeta');
  compOutMeta = document.getElementById('compOutMeta');
  btnCompLocal = document.getElementById('btnCompLocal');
  btnCompTiny = document.getElementById('btnCompTiny');
  btnCompDownload = document.getElementById('btnCompDownload');
  tinyProxy = document.getElementById('tinyProxy');

  compFile?.addEventListener('change', () => {
    const file = compFile.files?.[0];
    if (file) {
      updateOriginalPreview(file);
    }
  });

  btnCompLocal?.addEventListener('click', () => {
    compressLocal();
  });
  btnCompTiny?.addEventListener('click', () => {
    compressTinyPng();
  });
  btnCompDownload?.addEventListener('click', () => {
    downloadCompressed();
  });
}
