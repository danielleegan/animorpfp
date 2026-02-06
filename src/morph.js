/**
 * Morph: WebGL path (no clip lines/gaps) with Canvas 2D fallback. Horse mode uses 2D.
 */

const VERTEX_SHADER_SRC = `
  attribute vec2 aPosition;
  attribute vec2 aTexCoordA;
  attribute vec2 aTexCoordB;
  uniform float uWidth;
  uniform float uHeight;
  varying vec2 vTexCoordA;
  varying vec2 vTexCoordB;
  void main() {
    float x = 2.0 * aPosition.x / uWidth - 1.0;
    /* WebGL viewport has y up; we want our y=0 (top) at top of canvas for drawImage */
    float y = 1.0 - 2.0 * aPosition.y / uHeight;
    gl_Position = vec4(x, y, 0.0, 1.0);
    vTexCoordA = aTexCoordA;
    vTexCoordB = aTexCoordB;
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  uniform sampler2D uTexA;
  uniform sampler2D uTexB;
  uniform float uT;
  uniform float uGlobalAlpha;
  varying vec2 vTexCoordA;
  varying vec2 vTexCoordB;
  void main() {
    vec4 ca = texture2D(uTexA, vTexCoordA);
    vec4 cb = texture2D(uTexB, vTexCoordB);
    gl_FragColor = mix(ca, cb, uT);
    gl_FragColor *= uGlobalAlpha;
  }
`;

let morphGLState = null;

function createMorphGL(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) return null;

  const vs = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vs, VERTEX_SHADER_SRC);
  gl.compileShader(vs);
  if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.warn('Morph WebGL vertex shader failed', gl.getShaderInfoLog(vs));
    return null;
  }
  const fs = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fs, FRAGMENT_SHADER_SRC);
  gl.compileShader(fs);
  if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
    console.warn('Morph WebGL fragment shader failed', gl.getShaderInfoLog(fs));
    return null;
  }
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Morph WebGL program link failed', gl.getProgramInfoLog(program));
    return null;
  }

  const texA = gl.createTexture();
  const texB = gl.createTexture();
  [texA, texB].forEach((tex) => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  });

  return { gl, canvas, program, texA, texB, w, h };
}

function renderMorphGL(state, imgA, imgB, pointsA, pointsB, triangles, t) {
  const { gl, canvas, program, texA, texB, w, h } = state;
  const n = pointsA.length;
  const mid = [];
  for (let i = 0; i < n; i++) {
    mid.push({
      x: (1 - t) * pointsA[i].x + t * pointsB[i].x,
      y: (1 - t) * pointsA[i].y + t * pointsB[i].y,
    });
  }

  /* WebGL texImage2D puts image row 0 at texture v=0, so top of image (y=0) -> v=0 */
  const toUV = (p) => [p.x / w, p.y / h];

  const data = [];
  for (const [i, j, k] of triangles) {
    const dest = [mid[i], mid[j], mid[k]];
    const srcA = [pointsA[i], pointsA[j], pointsA[k]];
    const srcB = [pointsB[i], pointsB[j], pointsB[k]];
    for (let v = 0; v < 3; v++) {
      const uvA = toUV(srcA[v]);
      const uvB = toUV(srcB[v]);
      data.push(dest[v].x, dest[v].y, uvA[0], uvA[1], uvB[0], uvB[1]);
    }
  }
  const floatData = new Float32Array(data);
  const stride = 6 * 4;

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, floatData, gl.DYNAMIC_DRAW);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgA);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texB);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgB);

  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  gl.uniform1f(gl.getUniformLocation(program, 'uT'), t);
  gl.uniform1f(gl.getUniformLocation(program, 'uGlobalAlpha'), 1.0);
  gl.uniform1f(gl.getUniformLocation(program, 'uWidth'), w);
  gl.uniform1f(gl.getUniformLocation(program, 'uHeight'), h);
  gl.uniform1i(gl.getUniformLocation(program, 'uTexA'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'uTexB'), 1);

  const posLoc = gl.getAttribLocation(program, 'aPosition');
  const tcALoc = gl.getAttribLocation(program, 'aTexCoordA');
  const tcBLoc = gl.getAttribLocation(program, 'aTexCoordB');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(tcALoc);
  gl.vertexAttribPointer(tcALoc, 2, gl.FLOAT, false, stride, 2 * 4);
  gl.enableVertexAttribArray(tcBLoc);
  gl.vertexAttribPointer(tcBLoc, 2, gl.FLOAT, false, stride, 4 * 4);

  gl.drawArrays(gl.TRIANGLES, 0, data.length / 6);
  gl.deleteBuffer(buf);
  return canvas;
}

/** Draw single warped image (same shader with texA=texB=img, t=0) with alpha. */
function drawWarpedImageGL(state, img, pointsSrc, pointsDest, triangles, alpha) {
  const { gl, program, texA, texB, w, h } = state;
  const toUV = (p) => [p.x / w, p.y / h];
  const data = [];
  for (const [i, j, k] of triangles) {
    const dest = [pointsDest[i], pointsDest[j], pointsDest[k]];
    const src = [pointsSrc[i], pointsSrc[j], pointsSrc[k]];
    for (let v = 0; v < 3; v++) {
      const uv = toUV(src[v]);
      data.push(dest[v].x, dest[v].y, uv[0], uv[1], uv[0], uv[1]);
    }
  }
  const floatData = new Float32Array(data);
  const stride = 6 * 4;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, floatData, gl.DYNAMIC_DRAW);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texB);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.useProgram(program);
  gl.uniform1f(gl.getUniformLocation(program, 'uT'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'uGlobalAlpha'), alpha);
  gl.uniform1f(gl.getUniformLocation(program, 'uWidth'), w);
  gl.uniform1f(gl.getUniformLocation(program, 'uHeight'), h);
  gl.uniform1i(gl.getUniformLocation(program, 'uTexA'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'uTexB'), 1);
  const posLoc = gl.getAttribLocation(program, 'aPosition');
  const tcALoc = gl.getAttribLocation(program, 'aTexCoordA');
  const tcBLoc = gl.getAttribLocation(program, 'aTexCoordB');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(tcALoc);
  gl.vertexAttribPointer(tcALoc, 2, gl.FLOAT, false, stride, 2 * 4);
  gl.enableVertexAttribArray(tcBLoc);
  gl.vertexAttribPointer(tcBLoc, 2, gl.FLOAT, false, stride, 4 * 4);
  gl.drawArrays(gl.TRIANGLES, 0, data.length / 6);
  gl.deleteBuffer(buf);
}

/** Fullscreen quad: both tex coords 0..1 so same image both channels, t=0. */
function drawFullscreenQuadGL(state, img, alpha) {
  const { gl, program, texA, texB, w, h } = state;
  const data = [
    0, 0, 0, 0, 0, 0,
    w, 0, 1, 0, 1, 0,
    0, h, 0, 1, 0, 1,
    0, h, 0, 1, 0, 1,
    w, 0, 1, 0, 1, 0,
    w, h, 1, 1, 1, 1,
  ];
  const floatData = new Float32Array(data);
  const stride = 6 * 4;
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, floatData, gl.STATIC_DRAW);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texA);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, texB);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.useProgram(program);
  gl.uniform1f(gl.getUniformLocation(program, 'uT'), 0);
  gl.uniform1f(gl.getUniformLocation(program, 'uGlobalAlpha'), alpha);
  gl.uniform1f(gl.getUniformLocation(program, 'uWidth'), w);
  gl.uniform1f(gl.getUniformLocation(program, 'uHeight'), h);
  gl.uniform1i(gl.getUniformLocation(program, 'uTexA'), 0);
  gl.uniform1i(gl.getUniformLocation(program, 'uTexB'), 1);
  const posLoc = gl.getAttribLocation(program, 'aPosition');
  const tcALoc = gl.getAttribLocation(program, 'aTexCoordA');
  const tcBLoc = gl.getAttribLocation(program, 'aTexCoordB');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(tcALoc);
  gl.vertexAttribPointer(tcALoc, 2, gl.FLOAT, false, stride, 2 * 4);
  gl.enableVertexAttribArray(tcBLoc);
  gl.vertexAttribPointer(tcBLoc, 2, gl.FLOAT, false, stride, 4 * 4);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.deleteBuffer(buf);
}

function renderHorseMorphGL(state, imgSource, horseImg, imgTarget, pointsSource, pointsTarget, triangles, t) {
  const { gl, canvas, w, h } = state;
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  if (t <= 0.5) {
    const u = t / 0.5;
    const distortAmount = u;
    const distorted = distortSourceForHorse(pointsSource, distortAmount, w, h, triangles);
    drawFullscreenQuadGL(state, horseImg, 1);
    drawWarpedImageGL(state, imgSource, pointsSource, distorted, triangles, 1 - u);
  } else {
    const v = (t - 0.5) / 0.5;
    const distortAmount = 1 - v;
    const distortedTarget = distortSourceForHorse(pointsTarget, distortAmount, w, h, triangles);
    drawWarpedImageGL(state, imgTarget, pointsTarget, distortedTarget, triangles, 1);
    drawFullscreenQuadGL(state, horseImg, 1 - v);
  }

  gl.disable(gl.BLEND);
  return canvas;
}

/**
 * Affine that maps source triangle to dest (for drawImage: we draw in
 * source space, so we need source -> dest).
 */
function getAffineSrcToDest(src, dest) {
  const [s0, s1, s2] = src;
  const [d0, d1, d2] = dest;
  const u0 = s0.x, v0 = s0.y, u1 = s1.x, v1 = s1.y, u2 = s2.x, v2 = s2.y;
  const x0 = d0.x, y0 = d0.y, x1 = d1.x, y1 = d1.y, x2 = d2.x, y2 = d2.y;
  const D = u0 * (v1 - v2) - v0 * (u1 - u2) + (u1 * v2 - u2 * v1);
  if (Math.abs(D) < 1e-10) return [1, 0, 0, 1, 0, 0];
  const a = (x0 * (v1 - v2) - x1 * (v0 - v2) + x2 * (v0 - v1)) / D;
  const b = (y0 * (v1 - v2) - y1 * (v0 - v2) + y2 * (v0 - v1)) / D;
  const c = (x0 * (u2 - u1) - x1 * (u2 - u0) + x2 * (u1 - u0)) / D;
  const d = (y0 * (u2 - u1) - y1 * (u2 - u0) + y2 * (u1 - u0)) / D;
  const e = (x0 * (u1 * v2 - u2 * v1) - x1 * (u0 * v2 - u2 * v0) + x2 * (u0 * v1 - u1 * v0)) / D;
  const f = (y0 * (u1 * v2 - u2 * v1) - y1 * (u0 * v2 - u2 * v0) + y2 * (u0 * v1 - u1 * v0)) / D;
  return [a, b, c, d, e, f];
}

/**
 * Expand triangle vertices away from centroid so clip regions overlap (hides seams).
 */
function expandClipTri(destTri, scale = 1.003) {
  const cx = (destTri[0].x + destTri[1].x + destTri[2].x) / 3;
  const cy = (destTri[0].y + destTri[1].y + destTri[2].y) / 3;
  return destTri.map((p) => ({
    x: cx + (p.x - cx) * scale,
    y: cy + (p.y - cy) * scale,
  }));
}

/**
 * Draw warped image onto the given context. Uses clip() + setTransform + drawImage.
 * Triangles that touch a corner get a larger clip expansion to close star-shaped gaps at corners.
 */
function drawWarp(ctx, img, srcPoints, destPoints, triangles, alpha) {
  const n = destPoints.length;
  const cornerStart = n - NUM_CORNERS; // last 4 indices are corners

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'transparent';
  ctx.lineWidth = 0;

  for (const [i, j, k] of triangles) {
    const srcTri = [srcPoints[i], srcPoints[j], srcPoints[k]];
    const destTri = [destPoints[i], destPoints[j], destPoints[k]];
    const [a, b, c, d, e, f] = getAffineSrcToDest(srcTri, destTri);
    // Use stronger expansion for corner triangles to close star-shaped gaps mid-morph
    const touchesCorner = i >= cornerStart || j >= cornerStart || k >= cornerStart;
    const clipScale = touchesCorner ? 1.03 : 1.01;
    const clipTri = expandClipTri(destTri, clipScale);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.beginPath();
    ctx.moveTo(clipTri[0].x, clipTri[0].y);
    ctx.lineTo(clipTri[1].x, clipTri[1].y);
    ctx.lineTo(clipTri[2].x, clipTri[2].y);
    ctx.closePath();
    ctx.clip();
    ctx.beginPath(); // clear path after clip so it can't be stroked
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

const NUM_CORNERS = 4;

const EYE_LEFT_X = 0.333;   // left eye at 33.3% from left
const EYE_RIGHT_X = 0.635;  // right eye at 63.5% from left
const EYE_Y = 0.413;        // eyes at 41.3% from top
const EYE_SPREAD = 0.28;    // push eyes farther apart (scale away from center)
const TOP_Y = 0.161;        // top of head Y
const TOP_LEFT_X = 0.36;    // top of head left
const TOP_RIGHT_X = 0.609;  // top of head right
const CHEEK_LEFT_X = 0.383;   // cheek midpoint left
const CHEEK_RIGHT_X = 0.584;  // cheek midpoint right
const CHIN_LEFT_X = 0.41;     // chin left
const CHIN_RIGHT_X = 0.569;   // chin right
const NOSE_Y = 0.737;       // nose at 73.7% from top
const MOUTH_Y = 0.829;      // mouth at 82.9% from top
const JAW_Y = 0.845;        // jaw at 84.5% from top
const HEAD_NARROW = 0.14;   // extra horizontal narrowing for overall head

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (b - a) !== 0 ? (x - a) / (b - a) : 0));
  return t * t * (3 - 2 * t);
}

/** Quintic Hermite for softer falloffs at band edges. */
function smootherstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (b - a) !== 0 ? (x - a) / (b - a) : 0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * Build adjacency sets for face points from triangles. corners are excluded.
 */
function buildNeighbors(n, triangles) {
  const neighbors = Array.from({ length: n }, () => new Set());
  for (const [i, j, k] of triangles) {
    if (i < n && j < n) { neighbors[i].add(j); neighbors[j].add(i); }
    if (j < n && k < n) { neighbors[j].add(k); neighbors[k].add(j); }
    if (k < n && i < n) { neighbors[k].add(i); neighbors[i].add(k); }
  }
  return neighbors;
}

/** Face centroid X from points (excl. corners). Used to center output on x-axis. */
function faceCenterX(points, n) {
  if (n <= 0) return 0;
  let cx = 0;
  for (let i = 0; i < n; i++) cx += points[i].x;
  return cx / n;
}

/**
 * Crop rect centered on face X, clamped to image. Fills canvas; no empty bands.
 * Returns { sx, sy, sw, sh } for drawImage(off, sx, sy, sw, sh, 0, 0, w, h).
 */
function faceCenterCropX(points, n, w, h, cropFactor = 0.94) {
  if (n <= 0) return { sx: 0, sy: 0, sw: w, sh: h };
  const fcx = faceCenterX(points, n);
  const sw = Math.max(1, Math.round(w * cropFactor));
  const sh = h;
  let sx = Math.round(fcx - sw * 0.5);
  sx = Math.max(0, Math.min(w - sw, sx));
  return { sx, sy: 0, sw, sh };
}

/**
 * Light Laplacian smoothing: each face point moves toward centroid of neighbors.
 * Corners unchanged. Reduces triangle shear from abrupt deformations.
 */
function laplacianSmooth(points, n, triangles, lambda = 0.2) {
  const neighbors = buildNeighbors(n, triangles);
  const out = points.map((p) => ({ x: p.x, y: p.y }));
  for (let i = 0; i < n; i++) {
    const adj = neighbors[i];
    if (adj.size === 0) continue;
    let sx = 0, sy = 0;
    for (const j of adj) { sx += points[j].x; sy += points[j].y; }
    const nx = sx / adj.size;
    const ny = sy / adj.size;
    out[i].x = (1 - lambda) * points[i].x + lambda * nx;
    out[i].y = (1 - lambda) * points[i].y + lambda * ny;
  }
  return out;
}

/**
 * Distort source face for "horse" effect. Single coherent deformation field:
 * smooth region weights (top / eye / lower) blend continuously; one global strength
 * with smooth modulation. Softer falloffs, then light Laplacian smoothing.
 * Corners unchanged.
 */
export function distortSourceForHorse(points, amount, w, h, triangles) {
  const n = points.length - NUM_CORNERS;
  if (n <= 0) return points.map((p) => ({ ...p }));

  let cx = 0, cy = 0, yMin = h, yMax = 0;
  for (let i = 0; i < n; i++) {
    const pt = points[i];
    cx += pt.x; cy += pt.y;
    if (pt.y < yMin) yMin = pt.y;
    if (pt.y > yMax) yMax = pt.y;
  }
  cx /= n; cy /= n;
  const faceH = Math.max(yMax - yMin, 1);
  const lowerRange = Math.max(yMax - cy, 1);

  const blendY = 0.52 * faceH;
  const blendYNarrow = 0.72 * faceH;
  const topEnd = yMin + 0.42 * faceH;
  const eyeTop = yMin + 0.12 * faceH;
  const eyeCenter = yMin + 0.34 * faceH;
  const eyeBottom = yMin + 0.56 * faceH;
  const eyeBottomSoft = yMin + 0.70 * faceH;
  const cheekBandTop = yMin + 0.52 * faceH;
  const cheekBandBottom = yMin + 0.78 * faceH;
  const cheekMid = (cheekBandTop + cheekBandBottom) * 0.5;

  const topTargetY = TOP_Y * h;
  const eyeTargetY = EYE_Y * h;
  const noseTarget = NOSE_Y * h;
  const jawTarget = JAW_Y * h;
  const strength = 1;

  const out = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (i >= n) {
      out.push({ x: p.x, y: p.y });
      continue;
    }

    const wTop = 1 - smootherstep(yMin, topEnd, p.y);
    const upEye = smootherstep(eyeTop, eyeCenter, p.y);
    const dnEye = 1 - smootherstep(eyeCenter, eyeBottomSoft, p.y);
    const wEye = upEye * dnEye;
    const wUpper = 1 - smootherstep(cy - blendY, cy + blendY, p.y);
    const wLower = smootherstep(cy - blendY, cy + blendY, p.y);
    const wUpperN = 1 - smootherstep(cy - blendYNarrow, cy + blendYNarrow, p.y);
    const wLowerN = smootherstep(cy - blendYNarrow, cy + blendYNarrow, p.y);

    const sumUpper = wTop + wEye;
    const topNorm = sumUpper > 1e-6 ? wTop / sumUpper : 0;
    const eyeNorm = sumUpper > 1e-6 ? wEye / sumUpper : 0;

    const r = Math.max(0, Math.min(1, (p.y - cy) / lowerRange));
    const noseNorm = 1 - r;
    const jawNorm = r;

    const yUpper = sumUpper > 1e-6 ? topNorm * topTargetY + eyeNorm * eyeTargetY : eyeTargetY;
    const yLower = noseNorm * noseTarget + jawNorm * jawTarget;
    const yTarget = wUpper * yUpper + wLower * yLower;

    const kTop = Math.max(0, 1 - (TOP_RIGHT_X - TOP_LEFT_X) / (EYE_RIGHT_X - EYE_LEFT_X));
    const kTangent = Math.max(0, 1 - (CHEEK_RIGHT_X - CHEEK_LEFT_X) / (EYE_RIGHT_X - EYE_LEFT_X));
    const kChin = Math.max(0, 1 - (CHIN_RIGHT_X - CHIN_LEFT_X) / (EYE_RIGHT_X - EYE_LEFT_X));
    const nUpper = sumUpper > 1e-6 ? topNorm * kTop : kTop;
    const nLower = (1 - r) * kTangent + r * kChin;
    let narrowRaw = wUpperN * nUpper + wLowerN * nLower;
    const wCheek = p.y <= cheekMid
      ? smootherstep(cheekBandTop, cheekMid, p.y)
      : (1 - smootherstep(cheekMid, cheekBandBottom, p.y));
    const narrowBlend = 0.5 * (nUpper + nLower);
    let narrow = Math.min(1, (1 - wCheek) * narrowRaw + wCheek * narrowBlend);

    const wMod = Math.min(1, wTop + wEye + wLower);
    const s = amount * strength * wMod;
    const spread = wEye * EYE_SPREAD;
    const base = 1 - s * narrow + s * spread;
    const factor = Math.max(0.28, base * (1 - amount * HEAD_NARROW));
    const xTarget = cx + factor * (p.x - cx);
    out.push({
      x: xTarget,
      y: p.y + s * (yTarget - p.y),
    });
  }

  return triangles ? laplacianSmooth(out, n, triangles, 0.28) : out;
}

/**
 * Horse-mode morph: source → horse → target. Parameter t in [0, 1].
 * Uses WebGL when available; falls back to Canvas 2D.
 */
export function renderHorseMorph(ctx, imgSource, horseImg, imgTarget, pointsSource, pointsTarget, triangles, t) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  if (!morphGLState || morphGLState.w !== w || morphGLState.h !== h) {
    morphGLState = createMorphGL(w, h);
  }
  if (morphGLState) {
    const glCanvas = renderHorseMorphGL(morphGLState, imgSource, horseImg, imgTarget, pointsSource, pointsTarget, triangles, t);
    if (glCanvas) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(glCanvas, 0, 0);
      ctx.restore();
      return;
    }
  }

  /* Fallback: Canvas 2D */
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const offCtx = off.getContext('2d');
  offCtx.clearRect(0, 0, w, h);

  if (t <= 0.5) {
    const u = t / 0.5;
    const distortAmount = u;
    const distorted = distortSourceForHorse(pointsSource, distortAmount, w, h, triangles);
    offCtx.globalAlpha = 1;
    offCtx.drawImage(horseImg, 0, 0, w, h);
    offCtx.globalAlpha = 1 - u;
    drawWarp(offCtx, imgSource, pointsSource, distorted, triangles, 1);
  } else {
    const v = (t - 0.5) / 0.5;
    const distortAmount = 1 - v;
    const distortedTarget = distortSourceForHorse(pointsTarget, distortAmount, w, h, triangles);
    offCtx.globalAlpha = 1;
    drawWarp(offCtx, imgTarget, pointsTarget, distortedTarget, triangles, 1);
    offCtx.globalAlpha = 1 - v;
    offCtx.drawImage(horseImg, 0, 0, w, h);
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

/**
 * Render morph at parameter t (0 = full A, 1 = full B).
 * Uses WebGL when available (no clip lines/gaps); falls back to Canvas 2D.
 */
export function renderMorph(ctx, imgA, imgB, pointsA, pointsB, triangles, t) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // Use WebGL if available and size matches (or create new state)
  if (!morphGLState || morphGLState.w !== w || morphGLState.h !== h) {
    morphGLState = createMorphGL(w, h);
  }
  if (morphGLState) {
    const glCanvas = renderMorphGL(morphGLState, imgA, imgB, pointsA, pointsB, triangles, t);
    if (glCanvas) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.drawImage(glCanvas, 0, 0);
      ctx.restore();
      return;
    }
  }

  // Fallback: Canvas 2D with clip
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const offCtx = off.getContext('2d');
  offCtx.clearRect(0, 0, w, h);
  const n = pointsA.length;
  const mid = [];
  for (let i = 0; i < n; i++) {
    mid.push({
      x: (1 - t) * pointsA[i].x + t * pointsB[i].x,
      y: (1 - t) * pointsA[i].y + t * pointsB[i].y,
    });
  }
  drawWarp(offCtx, imgA, pointsA, mid, triangles, 1 - t);
  drawWarp(offCtx, imgB, pointsB, mid, triangles, t);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}
