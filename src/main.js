import { initFaceLandmarker, getLandmarks } from './faceLandmarks.js';
import { triangulate } from './triangulate.js';
import { renderMorph, renderHorseMorph } from './morph.js';
import JSZip from 'jszip';

const SIZE = 512;

const morphSection = document.querySelector('.morph-section');
const canvas = document.getElementById('morphCanvas');
const ctx = canvas.getContext('2d');
const morphSlider = document.getElementById('morphSlider');
const morphPercent = document.getElementById('morphPercent');
const horseModeCheckbox = document.getElementById('horseMode');
const horseModeWrap = document.getElementById('horseModeWrap');
const targetCard = document.querySelector('.upload-card[data-side="B"]');
const weekCanvases = document.querySelectorAll('.week-canvas');

/** @type {{ img: HTMLImageElement, points: { x: number, y: number }[] } | null} */
let dataA = null;
/** @type {{ img: HTMLImageElement, points: { x: number, y: number }[] } | null} */
let dataB = null;
/** @type {[number, number, number][] | null} */
let triangles = null;
/** @type {[number, number, number][] | null} */
let trianglesSource = null;
/** @type {HTMLImageElement | null} */
let horseImg = null;
let landmarker = null;
let horseMode = false;

function setStatus(_msg) {}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

async function loadHorseImage() {
  if (horseImg) return horseImg;
  const img = await loadImageFromUrl('/horse.png');
  const dim = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = document.createElement('canvas');
  sx.width = SIZE;
  sx.height = SIZE;
  const sxctx = sx.getContext('2d');
  const x = (img.naturalWidth - dim) / 2;
  const y = (img.naturalHeight - dim) / 2;
  sxctx.drawImage(img, x, y, dim, dim, 0, 0, SIZE, SIZE);
  const scaled = new Image();
  await new Promise((res, rej) => {
    scaled.onload = res;
    scaled.onerror = rej;
    scaled.src = sx.toDataURL();
  });
  horseImg = scaled;
  return horseImg;
}

function faceCentroid(points) {
  if (!points?.length) return null;
  let cx = 0, cy = 0;
  for (const p of points) { cx += p.x; cy += p.y; }
  return { cx: cx / points.length, cy: cy / points.length };
}

/**
 * Face-centered square crop, then zoom to fill 512×512. Use for source (A) at upload.
 */
function faceCenterCropZoomToFill(canvas, ctx, img, points, size, cropFactor = 0.9) {
  const c = faceCentroid(points);
  if (!c) return;
  const side = Math.max(1, Math.round(size * cropFactor));
  let sx = Math.round(c.cx - side * 0.5);
  let sy = Math.round(c.cy - side * 0.5);
  sx = Math.max(0, Math.min(size - side, sx));
  sy = Math.max(0, Math.min(size - side, sy));
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
}

async function loadSide(side, file) {
  const card = document.querySelector(`.upload-card[data-side="${side}"]`);
  if (!file) return;
  setStatus('Loading image…');
  const img = await loadImage(file);
  URL.revokeObjectURL(img.src);

  const dim = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = document.createElement('canvas');
  sx.width = SIZE;
  sx.height = SIZE;
  const sxctx = sx.getContext('2d');
  const x = (img.naturalWidth - dim) / 2;
  const y = (img.naturalHeight - dim) / 2;
  sxctx.drawImage(img, x, y, dim, dim, 0, 0, SIZE, SIZE);

  let scaledImg = new Image();
  await new Promise((res, rej) => {
    scaledImg.onload = res;
    scaledImg.onerror = rej;
    scaledImg.src = sx.toDataURL();
  });

  if (!landmarker) {
    setStatus('Loading face model…');
    landmarker = await initFaceLandmarker();
  }
  setStatus('Detecting face…');
  let points = getLandmarks(landmarker, scaledImg);
  if (!points) {
    setStatus('Face not detected.');
    return null;
  }

  if (side === 'A') {
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = SIZE;
    cropCanvas.height = SIZE;
    const cropCtx = cropCanvas.getContext('2d');
    cropCtx.clearRect(0, 0, SIZE, SIZE);
    faceCenterCropZoomToFill(cropCanvas, cropCtx, scaledImg, points, SIZE, 0.9);
    scaledImg = new Image();
    await new Promise((res, rej) => {
      scaledImg.onload = res;
      scaledImg.onerror = rej;
      scaledImg.src = cropCanvas.toDataURL();
    });
    points = getLandmarks(landmarker, scaledImg);
    if (!points) {
      setStatus('Face not detected.');
      return null;
    }
  }

  const { points: ptsWithCorners, triangles: tri } = triangulate(points, SIZE, SIZE);
  card.classList.remove('default-image');
  card.removeAttribute('data-default-image');
  card.classList.add('has-image');
  const isDefault = file.name === 'start-example.jpg' || file.name === 'end-example.jpg';
  if (isDefault) {
    card.classList.add('default-image');
    card.setAttribute('data-default-image', 'true');
  }
  const preview = card.querySelector('.preview');
  preview.src = scaledImg.src;
  preview.alt = side === 'A' ? 'Source preview' : 'Target preview';

  if (side === 'A') {
    dataA = { img: scaledImg, points: ptsWithCorners };
    trianglesSource = tri;
  } else {
    dataB = { img: scaledImg, points: ptsWithCorners };
  }

  if (dataA && dataB) {
    const mid = dataA.points.map((p, i) => ({
      x: 0.5 * p.x + 0.5 * (dataB.points[i] ?? p).x,
      y: 0.5 * p.y + 0.5 * (dataB.points[i] ?? p).y,
    }));
    const numLandmarks = mid.length - 4;
    const { triangles: triMid } = triangulate(mid.slice(0, numLandmarks), SIZE, SIZE);
    triangles = triMid;
  }

  updateMorphSection();
  if (horseMode && dataA && dataB && horseImg) setStatus('');
  else if (dataA && dataB) setStatus('Drag the slider to morph.');
  else setStatus(side === 'A' ? 'Add target image.' : 'Add source image.');

  return { img: scaledImg, points: ptsWithCorners };
}

function updateMorphSection() {
  const showHorse = horseMode && dataA && dataB && horseImg && trianglesSource;
  const showNormal = !horseMode && dataA && dataB && triangles;

  if (horseModeWrap) horseModeWrap.hidden = false;
  morphSection.hidden = !showHorse && !showNormal;

  if (showHorse || showNormal) {
    canvas.width = SIZE;
    canvas.height = SIZE;
    redraw();
  }
}

function redraw() {
  const t = Number(morphSlider.value) / 100;
  morphPercent.textContent = `${Math.round(t * 100)}%`;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (horseMode && dataA && dataB && horseImg && trianglesSource) {
    renderHorseMorph(ctx, dataA.img, horseImg, dataB.img, dataA.points, dataB.points, trianglesSource, t);
  } else if (dataA && dataB && triangles) {
    renderMorph(ctx, dataA.img, dataB.img, dataA.points, dataB.points, triangles, t);
  }
  ctx.restore();
  // Update week boxes at fixed t values (20%, 40%, 60%, 80%): render at 512 then scale down
  const canDrawWeeks = (horseMode && dataA && dataB && horseImg && trianglesSource) || (dataA && dataB && triangles);
  if (canDrawWeeks && weekCanvases.length) {
    weekCanvases.forEach((weekEl) => {
      const weekT = Number(horseMode && weekEl.dataset.tHorse != null ? weekEl.dataset.tHorse : weekEl.dataset.t);
      if (Number.isNaN(weekT)) return;
      const off = document.createElement('canvas');
      off.width = SIZE;
      off.height = SIZE;
      const offCtx = off.getContext('2d');
      offCtx.clearRect(0, 0, SIZE, SIZE);
      if (horseMode && horseImg && trianglesSource) {
        renderHorseMorph(offCtx, dataA.img, horseImg, dataB.img, dataA.points, dataB.points, trianglesSource, weekT);
      } else {
        renderMorph(offCtx, dataA.img, dataB.img, dataA.points, dataB.points, triangles, weekT);
      }
      const w = weekEl.width;
      const h = weekEl.height;
      // Copy via pixel buffer so no context path/stroke can affect the week canvas
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      const tmpCtx = tmp.getContext('2d');
      tmpCtx.imageSmoothingEnabled = true;
      tmpCtx.imageSmoothingQuality = 'high';
      tmpCtx.drawImage(off, 0, 0, SIZE, SIZE, 0, 0, w, h);
      const weekCtx = weekEl.getContext('2d');
      weekCtx.putImageData(tmpCtx.getImageData(0, 0, w, h), 0, 0);
    });
  }
}

morphSlider.addEventListener('input', redraw);

const DOWNLOAD_SIZE = 300; // 1/2 of previous (2x display size 150)

document.getElementById('btnDownloadWeeks')?.addEventListener('click', async () => {
  const canDrawWeeks = (horseMode && dataA && dataB && horseImg && trianglesSource) || (dataA && dataB && triangles);
  if (!canDrawWeeks || !weekCanvases.length) return;
  const off = document.createElement('canvas');
  off.width = SIZE;
  off.height = SIZE;
  const offCtx = off.getContext('2d');
  const out = document.createElement('canvas');
  out.width = DOWNLOAD_SIZE;
  out.height = DOWNLOAD_SIZE;
  const outCtx = out.getContext('2d');
  const blobs = [];
  for (let i = 0; i < weekCanvases.length; i++) {
    const weekEl = weekCanvases[i];
    const weekT = Number(horseMode && weekEl.dataset.tHorse != null ? weekEl.dataset.tHorse : weekEl.dataset.t);
    if (Number.isNaN(weekT)) continue;
    offCtx.save();
    offCtx.setTransform(1, 0, 0, 1, 0, 0);
    offCtx.globalAlpha = 1;
    offCtx.clearRect(0, 0, SIZE, SIZE);
    if (horseMode && horseImg && trianglesSource) {
      renderHorseMorph(offCtx, dataA.img, horseImg, dataB.img, dataA.points, dataB.points, trianglesSource, weekT);
    } else {
      renderMorph(offCtx, dataA.img, dataB.img, dataA.points, dataB.points, triangles, weekT);
    }
    offCtx.restore();
    outCtx.save();
    outCtx.setTransform(1, 0, 0, 1, 0, 0);
    outCtx.globalAlpha = 1;
    outCtx.clearRect(0, 0, DOWNLOAD_SIZE, DOWNLOAD_SIZE);
    outCtx.drawImage(off, 0, 0, SIZE, SIZE, 0, 0, DOWNLOAD_SIZE, DOWNLOAD_SIZE);
    outCtx.restore();
    const blob = await new Promise((resolve) => out.toBlob((b) => resolve(b), 'image/png'));
    if (blob) blobs[i] = blob;
  }
  const zip = new JSZip();
  blobs.forEach((blob, i) => {
    if (blob) zip.file(`week${i + 1}.png`, blob);
  });
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'animorPFP.zip';
  a.click();
  URL.revokeObjectURL(url);
});

horseModeCheckbox.addEventListener('change', async () => {
  horseMode = horseModeCheckbox.checked;
  if (horseMode) {
    if (!dataA) {
      setStatus('Add a source image first for horse mode.');
      horseModeCheckbox.checked = false;
      horseMode = false;
      return;
    }
    setStatus('Loading horse…');
    try {
      await loadHorseImage();
      setStatus(dataB ? '' : 'Add target image.');
    } catch (e) {
      setStatus('Could not load horse.png.');
      horseModeCheckbox.checked = false;
      horseMode = false;
    }
  }
  updateMorphSection();
});

document.querySelectorAll('.upload-card input[type="file"]').forEach((input) => {
  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    const side = input.closest('.upload-card')?.dataset?.side;
    if (!file || !side) return;
    await loadSide(side, file);
  });
});

async function loadSideFromUrl(side, url, filename) {
  const res = await fetch(url);
  const blob = await res.blob();
  const file = new File([blob], filename, { type: blob.type });
  await loadSide(side, file);
}

setStatus('Loading default photos…');
(async () => {
  try {
    await loadSideFromUrl('A', 'start-example.jpg', 'start-example.jpg');
    await loadSideFromUrl('B', 'end-example.jpg', 'end-example.jpg');
    setStatus('Drag the slider to morph.');
  } catch (e) {
    console.error('Default images failed to load:', e);
    setStatus('Add source and target profile photos.');
  }
})();
