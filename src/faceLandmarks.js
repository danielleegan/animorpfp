/**
 * Face landmarks via MediaPipe Face Landmarker only. We use landmark coordinates
 * only; we do not import or use DrawingUtils, drawConnectors, drawLandmarks, or
 * any MediaPipe visualization/drawing APIs (to avoid wireframe overlay on canvas).
 */
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

let faceLandmarker = null;

/**
 * Initialize Face Landmarker (call once, then reuse).
 * @returns {Promise<FaceLandmarker>}
 */
export async function initFaceLandmarker() {
  if (faceLandmarker) return faceLandmarker;
  const vision = await FilesetResolver.forVisionTasks(WASM_URL);
  faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL },
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  });
  return faceLandmarker;
}

/**
 * Get 2D pixel landmarks for the first face. Uses only landmark data from
 * landmarker.detect(); no drawing or visualization.
 * Pass an HTMLImageElement only (not a canvas) so MediaPipe never draws on a canvas.
 * @param {FaceLandmarker} landmarker
 * @param {HTMLImageElement} image - must be an image element, not a canvas
 * @returns {{ x: number, y: number }[] | null} pixel coordinates or null if no face
 */
export function getLandmarks(landmarker, image) {
  if (image instanceof HTMLCanvasElement) {
    throw new Error(
      'getLandmarks requires HTMLImageElement so MediaPipe does not draw on a canvas. Convert canvas to image first (e.g. new Image(); img.src = canvas.toDataURL(); await load).'
    );
  }
  const w = image.width ?? image.naturalWidth;
  const h = image.height ?? image.naturalHeight;
  const result = landmarker.detect(image);
  if (!result?.faceLandmarks?.length) return null;
  const norms = result.faceLandmarks[0];
  return norms.map((p) => ({
    x: p.x * w,
    y: p.y * h,
  }));
}
