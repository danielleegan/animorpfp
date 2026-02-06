import Delaunator from 'delaunator';

/**
 * Triangulate points (face landmarks) plus image corners so the mesh covers the full image.
 * @param {{ x: number, y: number }[]} points - e.g. face landmarks in pixel coords
 * @param {number} w - image width
 * @param {number} h - image height
 * @returns {{ points: { x: number, y: number }[], triangles: [number, number, number][] }}
 */
export function triangulate(points, w, h) {
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  const pad = 1;
  pts.push(
    { x: -pad, y: -pad },
    { x: w + pad, y: -pad },
    { x: w + pad, y: h + pad },
    { x: -pad, y: h + pad }
  );
  const flat = [];
  for (const p of pts) flat.push(p.x, p.y);
  const d = new Delaunator(flat);
  const triangles = [];
  const tri = d.triangles;
  for (let i = 0; i < tri.length; i += 3) {
    triangles.push([tri[i], tri[i + 1], tri[i + 2]]);
  }
  return { points: pts, triangles };
}