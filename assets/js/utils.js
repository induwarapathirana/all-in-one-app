const loadedScripts = new Map();

export async function loadScript(src) {
  if (loadedScripts.has(src)) {
    return loadedScripts.get(src);
  }
  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing && existing.dataset.loaded === 'true') {
      resolve(true);
      return;
    }
    const script = existing || document.createElement('script');
    script.src = src;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve(true);
    };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    if (!existing) {
      document.head.appendChild(script);
    }
  });
  loadedScripts.set(src, promise);
  return promise;
}

export function debounce(fn, wait = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function autoGrowTextArea(el, max = 320) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, max) + 'px';
}

export function dataUrlFromCanvasOrImg(el, mime = 'image/png') {
  if (!el) return '';
  if (el.tagName === 'CANVAS') {
    return el.toDataURL(mime);
  }
  const canvas = document.createElement('canvas');
  canvas.width = el.width;
  canvas.height = el.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(el, 0, 0);
  return canvas.toDataURL(mime);
}

export function svgFromElement(el, size, bg) {
  const data = dataUrlFromCanvasOrImg(el, 'image/png');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="100%" height="100%" fill="${bg}"/><image href="${data}" x="0" y="0" width="${size}" height="${size}"/></svg>`;
}

export function downloadURI(uri, name) {
  const a = document.createElement('a');
  a.href = uri;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  requestAnimationFrame(() => {
    document.body.removeChild(a);
  });
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  const bigint = parseInt(value, 16);
  if (value.length === 3) {
    return [((bigint >> 8) & 0xf) * 17, ((bigint >> 4) & 0xf) * 17, (bigint & 0xf) * 17];
  }
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

export function drawToFit(img, maxW, maxH) {
  const ratio = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, w, h };
}

export function canvasToBlob(canvas, mime, quality = 0.8) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas export failed'));
      }
    }, mime, quality);
  });
}

export function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 KB';
  const units = ['B', 'KB', 'MB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** idx;
  return `${value.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}
