import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// ---------- helpers ----------
const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// smooth piecewise curve through [x, v] rows (x descending or ascending)
function curve(rows) {
  const r = rows.slice().sort((a, b) => a[0] - b[0]);
  return (x) => {
    if (x <= r[0][0]) return r[0][1];
    if (x >= r[r.length - 1][0]) return r[r.length - 1][1];
    let i = 0;
    while (x > r[i + 1][0]) i++;
    // Catmull-Rom between r[i] and r[i+1]
    const p0 = r[Math.max(0, i - 1)], p1 = r[i], p2 = r[i + 1], p3 = r[Math.min(r.length - 1, i + 2)];
    const t = (x - p1[0]) / (p2[0] - p1[0]);
    const m1 = ((p2[1] - p0[1]) / (p2[0] - p0[0])) * (p2[0] - p1[0]);
    const m2 = ((p3[1] - p1[1]) / (p3[0] - p1[0])) * (p2[0] - p1[0]);
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1[1] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[1] + (t3 - t2) * m2;
  };
}

// ---------- the car's shape (metres; x forward, y left, z up) ----------
const XF = 2.2, XR = -2.2;
const AXLE_F = 1.25, AXLE_R = -1.22, WHEEL_R = 0.34;
const W = curve([[2.2, 0.50], [2.12, 0.74], [1.95, 0.86], [1.6, 0.895], [1.25, 0.905], [0.8, 0.885], [0.2, 0.872], [-0.5, 0.885], [-1.0, 0.915], [-1.3, 0.925], [-1.7, 0.91], [-2.0, 0.85], [-2.15, 0.74], [-2.2, 0.58]]);
const CTR = curve([[2.2, 0.50], [2.05, 0.585], [1.7, 0.645], [1.2, 0.69], [0.85, 0.735], [0.4, 0.80], [-1.3, 0.90], [-1.5, 0.915], [-1.85, 0.91], [-2.1, 0.86], [-2.2, 0.76]]);
const FEN = curve([[2.2, 0.52], [2.05, 0.635], [1.7, 0.725], [1.25, 0.765], [0.85, 0.74], [0.4, 0.725], [-0.2, 0.75], [-0.7, 0.83], [-1.15, 0.895], [-1.5, 0.905], [-1.9, 0.88], [-2.1, 0.84], [-2.2, 0.76]]);
const BOT = curve([[2.2, 0.27], [2.0, 0.19], [1.7, 0.16], [-1.7, 0.16], [-2.0, 0.22], [-2.2, 0.32]]);
const ARCH_R = 0.39;
function archZ(x) {
  let z = -1;
  for (const xa of [AXLE_F, AXLE_R]) if (Math.abs(x - xa) < ARCH_R) z = Math.max(z, WHEEL_R + Math.sqrt(ARCH_R * ARCH_R - (x - xa) ** 2));
  return z;
}

// one half-section (y >= 0), from the top centre round to the bottom centre
function halfSection(x) {
  const w = W(x), c = CTR(x), f = FEN(x), zb = BOT(x);
  const pts = [];
  const a = 0.075 * w, b = 0.11;
  const yS = w - a;
  for (let j = 0; j <= 14; j++) {
    const y = yS * (j / 14);
    pts.push([y, c + (f - c) * smooth(clamp((y / yS - 0.2) / 0.7, 0, 1))]);
  }
  for (let j = 1; j <= 8; j++) {
    const p = (j / 8) * (Math.PI / 2);
    pts.push([yS + a * Math.sin(p), f - b + b * Math.cos(p)]);
  }
  const zTop = f - b, zLow = zb + 0.07;
  for (let j = 1; j <= 10; j++) {
    const t = j / 10;
    const z = zTop + (zLow - zTop) * t;
    pts.push([w - 0.018 * Math.sin(Math.PI * t) * -1 - 0.035 * t * t, z]);
  }
  for (let j = 1; j <= 5; j++) {
    const p = (j / 5) * (Math.PI / 2);
    const wl = w - 0.035;
    pts.push([wl - 0.07 + 0.07 * Math.cos(p), zLow - 0.07 * Math.sin(p)]);
  }
  pts.push([w * 0.5, zb], [0, zb]);
  // wheel arches: nothing of the side below the arch line
  const za = archZ(x);
  if (za > 0) for (const p of pts) if (p[1] < za && p[0] > 0.45) p[1] = za;
  return pts;
}
// loft rings into a BufferGeometry (closed rings, open ends get fan caps)
function loft(rings, { caps = true } = {}) {
  const n = rings[0].length;
  const pos = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  const idx = [];
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + ((j + 1) % n), d = (i + 1) * n + j;
    idx.push(a, b, c, a, c, d);
  }
  if (caps) for (const [ri, flip] of [[0, true], [rings.length - 1, false]]) {
    const ring = rings[ri];
    const cx = ring.reduce((s, p) => s + p[0], 0) / n, cy = ring.reduce((s, p) => s + p[1], 0) / n, cz = ring.reduce((s, p) => s + p[2], 0) / n;
    const ci = pos.length / 3;
    pos.push(cx, cy, cz);
    for (let j = 0; j < n; j++) {
      const a = ri * n + j, b = ri * n + ((j + 1) % n);
      flip ? idx.push(ci, b, a) : idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- window outlines (shared by the glass cut-outs) ----------
const WS_XY = [];
for (let i = 0; i <= 16; i++) { const y = -0.5 + i / 16; WS_XY.push([0.77 - 0.07 * (y / 0.5) ** 2, y * 0.94]); }
for (let i = 0; i <= 16; i++) { const y = 0.5 - i / 16; WS_XY.push([0.07 - 0.06 * (y / 0.5) ** 2, y * 0.9]); }
const RG_XY = [];
for (let i = 0; i <= 12; i++) { const y = -0.36 + 0.72 * (i / 12); RG_XY.push([-0.70 - 0.04 * (y / 0.36) ** 2, y]); }
for (let i = 0; i <= 12; i++) { const y = 0.27 - 0.54 * (i / 12); RG_XY.push([-1.30 + 0.03 * (y / 0.27) ** 2, y]); }
const DLO_XZ = [[0.50, 0.80], [0.30, 0.93], [0.10, 1.10], [-0.18, 1.15], [-0.48, 1.13], [-0.74, 1.06], [-0.95, 0.955], [-1.07, 0.89], [-0.92, 0.868], [-0.5, 0.85], [0.0, 0.83], [0.45, 0.81]];

// ---------- greenhouse ----------
const GX0 = 0.84, GX1 = -1.42;
const ROOF = curve([[0.84, 0.74], [0.6, 0.90], [0.3, 1.09], [0.05, 1.215], [-0.25, 1.262], [-0.55, 1.235], [-0.85, 1.15], [-1.12, 1.04], [-1.42, 0.915]]);
const GW = curve([[0.84, 0.62], [0.5, 0.69], [0.0, 0.72], [-0.6, 0.725], [-1.1, 0.70], [-1.42, 0.62]]);
const gBase = (x) => FEN(x) - 0.035;
const GN = 3.6;
const TH = 0.3;
const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;
function gPoint(x, th) {
  const zb = gBase(x), r = Math.max(ROOF(x), zb + 0.01);
  const hf = Math.abs(spow(Math.sin(th), 2 / GN));
  const gw = GW(x) * (1 - TH * hf);
  return [x, gw * spow(Math.cos(th), 2 / GN), zb + (r - zb) * hf, hf];
}
function greenhouse() {
  const rings = [];
  const NX = 420, NT = 220;
  for (let i = 0; i <= NX; i++) {
    const x = GX0 + (GX1 - GX0) * (i / NX);
    const ring = [];
    for (let j = 0; j <= NT; j++) ring.push(gPoint(x, (j / NT) * Math.PI));
    // close under the base
    ring.push([x, -GW(x) * 0.6, gBase(x) - 0.06, 0], [x, GW(x) * 0.6, gBase(x) - 0.06, 0]);
    rings.push(ring);
  }
  const n = rings[0].length;
  const pos = [], idx = [], glassIdx = [];
  for (const ring of rings) for (const p of ring) pos.push(p[0], p[1], p[2]);
  const pip = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const isGlass = (x, y, z) => {
    const zb = gBase(x), r = Math.max(ROOF(x), zb + 0.01);
    const hf = (z - zb) / Math.max(1e-3, r - zb);
    if (hf > 0.12 && pip([x, y], WS_XY)) return true;
    if (hf > 0.3 && pip([x, y], RG_XY)) return true;
    if (Math.abs(y) > 0.42 && pip([x, z], DLO_XZ)) return true;
    return false;
  };
  const isGlassOld = (x, y, z) => {
    const zb = gBase(x), r = Math.max(ROOF(x), zb + 0.01);
    const hf = (z - zb) / Math.max(1e-3, r - zb);
    const side = Math.abs(y) / (GW(x) * (1 - TH * hf));
    // windscreen: the front slope, inside the A-pillars
    const pillar = 0.9 - 0.05 * hf;
    if (x > 0.02 && x < GX0 - 0.03 && side < pillar && hf > 0.08) return true;
    // rear glass over the engine bay
    if (x < -0.66 && x > GX1 + 0.08 && side < 0.66 && hf > 0.35) return true;
    return false;
  };
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + ((j + 1) % n), c = (i + 1) * n + ((j + 1) % n), d = (i + 1) * n + j;
    const P = (k) => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]];
    const m = [a, b, c, d].map(P).reduce((s, p) => [s[0] + p[0] / 4, s[1] + p[1] / 4, s[2] + p[2] / 4], [0, 0, 0]);
    (isGlass(...m) ? glassIdx : idx).push(a, c, b, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([...idx, ...glassIdx]);
  g.addGroup(0, idx.length, 0);
  g.addGroup(idx.length, glassIdx.length, 1);
  g.computeVertexNormals();
  return g;
}

// ---------- scene ----------
// the car lives inside the hero "stage" box; all sizes come from that box, not the window
const stage = document.getElementById("stage");
const SW = () => stage.clientWidth, SH = () => stage.clientHeight;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(SW(), SH());
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.className = "car-canvas";
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
// studio: dark grey room with long softbox strips, so black paint shows crisp clean highlights
{
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: 0x2a2b2d, side: THREE.BackSide })));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ color: 0x9a9a96 }));
  floor.position.z = -6; env.add(floor);
  const box = (w, h, p, r, c = 0xffffff) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(...p); m.rotation.set(...r); env.add(m); };
  box(26, 1.6, [0, -2.2, 9], [0, 0, 0]);
  box(26, 1.1, [0, 2.6, 9], [0, 0, 0], 0xd8d8d8);
  box(26, 3.5, [0, -12, 3], [Math.PI / 2, 0, 0], 0xe8e8e8);
  box(3, 6, [14, 0, 2], [0, Math.PI / 2, 0], 0xbfbfbf);
  // strips on the far side, mirrored into the bonnet, roof and deck for the high camera
  box(30, 9, [0, 9.5, 9.0], [-0.78, 0, 0], 0x3c3d3e);
  box(30, 5.5, [0, 9.4, 9.1], [-0.78, 0, 0], 0x515251);
  box(30, 2.6, [0, 9.3, 9.2], [-0.78, 0, 0], 0x686866);
  box(30, 0.6, [0, 11.5, 6.5], [-0.98, 0, 0], 0xb4b4b2);
  box(30, 4.5, [0, 13, 2.5], [-1.4, 0, 0], 0x6e6e6c);
  scene.environment = pmrem.fromScene(env, 0.04).texture;
}

const paint = new THREE.MeshPhysicalMaterial({ color: 0x0b0c0e, roughness: 0.28, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.0 });
const glass = new THREE.MeshPhysicalMaterial({ color: 0x3a3f46, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.1 });
const trim = new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.55 });
const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.85 });
const alloy = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.22, metalness: 1, envMapIntensity: 1.2 });
const steel = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: 0.38, metalness: 0.9 });
const seam = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.9 });
const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xf2f6ff, emissiveIntensity: 0.6, roughness: 0.2 });
const tailMat = new THREE.MeshStandardMaterial({ color: 0x5a0d10, emissive: 0x3a0406, emissiveIntensity: 0.5, roughness: 0.15 });

const car = new THREE.Group();
scene.add(car);

// body
{
  const rings = [];
  const N = 220;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = XF + (XR - XF) * (0.5 - 0.5 * Math.cos(Math.PI * t));
    const h = halfSection(x);
    const ring = [...h.map(([y, z]) => [x, y, z]), ...h.slice(1, -1).reverse().map(([y, z]) => [x, -y, z])];
    rings.push(ring);
  }
  const body = new THREE.Mesh(loft(rings), paint);
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = "body";
  car.add(body);
}
// greenhouse
{
  const gh = new THREE.Mesh(greenhouse(), [paint, glass]);
  gh.renderOrder = 2;
  gh.castShadow = true;
  gh.name = "greenhouse";
  car.add(gh);
}

// analytic surface lookups, so decals and seams sit exactly on the skin
function bodyTopZ(x, y) {
  const h = halfSection(x);
  const ay = Math.abs(y);
  for (let i = 0; i < 22; i++) {
    const [y0, z0] = h[i], [y1, z1] = h[i + 1];
    if (ay >= y0 && ay <= y1) return z0 + (z1 - z0) * ((ay - y0) / Math.max(1e-6, y1 - y0));
  }
  return null;
}
function bodySideY(x, z) {
  const h = halfSection(x);
  for (let i = 14; i < h.length - 1; i++) {
    const [y0, z0] = h[i], [y1, z1] = h[i + 1];
    if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) return y0 + (y1 - y0) * ((z - z0) / ((z1 - z0) || 1e-6));
  }
  return null;
}
function ghSideY(x, z) {
  if (x > GX0 || x < GX1) return null;
  const zb = gBase(x), r = Math.max(ROOF(x), zb + 0.01);
  const hf = (z - zb) / (r - zb);
  if (hf < 0 || hf > 1) return null;
  const sn = hf ** (GN / 2);
  const cs = Math.sqrt(Math.max(0, 1 - sn * sn));
  return GW(x) * (1 - TH * hf) * cs ** (2 / GN);
}
function ghTopZ(x, y) {
  if (x > GX0 || x < GX1) return null;
  const zb = gBase(x), r = Math.max(ROOF(x), zb + 0.01);
  const ay = Math.abs(y);
  // y(θ) falls from the base edge to 0 at the top; bisect for θ in [0, π/2]
  const yAt = (th) => { const hf = Math.sin(th) ** (2 / GN); return [GW(x) * (1 - TH * hf) * Math.cos(th) ** (2 / GN), zb + (r - zb) * hf]; };
  if (ay > yAt(0)[0]) return null;
  let lo = 0, hi = Math.PI / 2;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (yAt(m)[0] > ay) lo = m; else hi = m; }
  return yAt((lo + hi) / 2)[1];
}
function surf(x, y, z, dir) {
  if (Math.abs(dir[2]) > 0.5) { const c = [bodyTopZ(x, y), ghTopZ(x, y)].filter((v) => v != null); return c.length ? [x, y, Math.max(...c)] : null; }
  if (Math.abs(dir[1]) > 0.5) {
    const s = -Math.sign(dir[1]);
    const cands = [bodySideY(x, z), ghSideY(x, z)].filter((v) => v != null);
    if (!cands.length) return null;
    return [x, s * Math.max(...cands), z];
  }
  return null;
}
function onSurface(x, y, z, dir) {
  const p = surf(x, y, z, dir);
  if (!p) return null;
  const e = 0.004;
  let a, b;
  if (Math.abs(dir[2]) > 0.5) { a = surf(x + e, y, z, dir); b = surf(x, y + e, z, dir); }
  else { a = surf(x + e, y, z, dir); b = surf(x, y, z + e, dir); }
  if (!a || !b) return { p: new THREE.Vector3(...p), n: new THREE.Vector3(...dir).negate() };
  const P0 = new THREE.Vector3(...p), A1 = new THREE.Vector3(...a).sub(P0), B1 = new THREE.Vector3(...b).sub(P0);
  const n = A1.cross(B1).normalize();
  if (n.dot(new THREE.Vector3(...dir)) > 0) n.negate();
  return { p: P0, n };
}
// a thin shape laid on the surface: the outline is triangulated flat, subdivided, then every vertex projected
function decal(outline, dir, mat, lift = 0.0025) {
  const ax = Math.abs(dir[0]) > 0.5 ? [1, 2] : Math.abs(dir[1]) > 0.5 ? [0, 2] : [0, 1];
  const shape = new THREE.Shape(outline.map((q) => new THREE.Vector2(q[ax[0]], q[ax[1]])));
  let flat = new THREE.ShapeGeometry(shape).toNonIndexed();
  let tris = [];
  const p = flat.attributes.position.array;
  for (let i = 0; i < p.length; i += 9) tris.push([[p[i], p[i + 1]], [p[i + 3], p[i + 4]], [p[i + 6], p[i + 7]]]);
  const mid = (u, v) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2];
  for (let it = 0; it < 3; it++) tris = tris.flatMap(([A, B, C]) => { const ab = mid(A, B), bc = mid(B, C), ca = mid(C, A); return [[A, ab, ca], [ab, B, bc], [ca, bc, C], [ab, bc, ca]]; });
  const fixed = outline[0][3 - ax[0] - ax[1]];
  const pos = [];
  for (const t of tris) {
    const hs = t.map(([u, v]) => { const q = [0, 0, 0]; q[ax[0]] = u; q[ax[1]] = v; q[3 - ax[0] - ax[1]] = fixed; return onSurface(q[0], q[1], q[2], dir); });
    if (hs.some((h) => !h)) continue;
    for (const h of hs) pos.push(h.p.x + h.n.x * lift, h.p.y + h.n.y * lift, h.p.z + h.n.z * lift);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat.clone());
  m.material.side = THREE.DoubleSide;
  m.material.polygonOffset = true;
  m.material.polygonOffsetFactor = -2;
  car.add(m);
  return m;
}
// a seam line laid on the surface
function line(points, dir, mat = seam, r = 0.0032) {
  const hits = points.map((q) => onSurface(q[0], q[1], q[2], dir)).filter(Boolean).map((h) => h.p.clone().addScaledVector(h.n, 0.0008));
  if (hits.length < 2) return;
  const path = new THREE.CatmullRomCurve3(hits);
  car.add(new THREE.Mesh(new THREE.TubeGeometry(path, hits.length * 4, r, 6, false), mat));
}
const sample = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a.map((v, k) => v + (b[k] - v) * (i / n)));
const poly = (pts, n = 6) => pts.flatMap((p, i) => (i < pts.length - 1 ? sample(p, pts[i + 1], n).slice(0, -1) : [p]));

function details() {
  for (const s of [-1, 1]) {
    const side = [0, s, 0];
    const inward = [0, -s, 0];
    // headlights: slim angular slits on the nose corners
    decal(poly([[2.105, s * 0.50, 2], [2.03, s * 0.74, 2], [1.955, s * 0.80, 2], [1.985, s * 0.72, 2], [2.07, s * 0.49, 2]], 4), [0, 0, -1], trim);
    decal(poly([[2.093, s * 0.52, 2], [2.03, s * 0.705, 2], [2.02, s * 0.70, 2], [2.083, s * 0.515, 2]], 4), [0, 0, -1], lampMat, 0.004);
    // bonnet shut lines
    line(poly([[2.0, s * 0.30, 2], [1.55, s * 0.47, 2], [1.0, s * 0.52, 2], [0.86, s * 0.50, 2]], 8), [0, 0, -1]);
    // door outline and handle on each side
    line(poly([[0.66, s * 2, 0.74], [0.68, s * 2, 0.45], [0.6, s * 2, 0.26], [-0.55, s * 2, 0.27], [-0.62, s * 2, 0.55], [-0.6, s * 2, 0.80]], 10), inward);
    decal(poly([[-0.30, s * 2, 0.705], [-0.14, s * 2, 0.705], [-0.14, s * 2, 0.688], [-0.30, s * 2, 0.688]], 3), inward, trim, 0.003);
    // a low sill blade instead of a side intake
    decal(poly([[0.55, s * 2, 0.255], [-0.95, s * 2, 0.27], [-0.95, s * 2, 0.24], [0.55, s * 2, 0.225]], 10), inward, trim, 0.003);
    // engine lid shut line
    line(poly([[-1.45, s * 0.40, 2], [-1.95, s * 0.42, 2], [-2.05, s * 0.2, 2], [-2.05, 0, 2]], 8), [0, 0, -1]);
    // wing mirror on a short stalk
    const mirror = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 20), paint);
    mirror.scale.set(1.15, 0.55, 0.5);
    mirror.position.set(0.44, s * 0.84, 0.90);
    mirror.castShadow = true;
    car.add(mirror);
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.12, 12), trim);
    stalk.rotation.x = Math.PI / 2;
    stalk.position.set(0.46, s * 0.76, 0.875);
    car.add(stalk);
  }
  // side windows: a smooth daylight opening laid on the greenhouse side
  for (const s of [-1, 1]) {
    const dlo = [[0.50, 0.80], [0.30, 0.93], [0.10, 1.10], [-0.18, 1.15], [-0.48, 1.13], [-0.74, 1.06], [-0.95, 0.955], [-1.07, 0.89], [-0.92, 0.868], [-0.5, 0.85], [0.0, 0.83], [0.45, 0.81]];
    const ring = [];
    for (let i = 0; i < dlo.length; i++) {
      const p = dlo[i], q = dlo[(i + 1) % dlo.length];
      for (let k = 0; k < 6; k++) ring.push([p[0] + (q[0] - p[0]) * (k / 6), s * 2, p[1] + (q[1] - p[1]) * (k / 6)]);
    }
    // B-pillar-less: a slim chrome-free black trim under the glass
    line(sample([0.48, s * 2, 0.80], [-0.98, s * 2, 0.86], 24), [0, -s, 0], trim, 0.004);
  }
  // windscreen: curved top and bottom edges, pillars converging
  {
    const ws = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16, y = -0.5 + t; ws.push([0.77 - 0.07 * (y / 0.5) ** 2, y * 0.94, 2]); }
    for (let i = 0; i <= 16; i++) { const t = i / 16, y = 0.5 - t; ws.push([0.07 - 0.06 * (y / 0.5) ** 2, y * 0.9, 2]); }
    const rg = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12, y = -0.36 + 0.72 * t; rg.push([-0.70 - 0.04 * (y / 0.36) ** 2, y, 2]); }
    for (let i = 0; i <= 12; i++) { const t = i / 12, y = 0.27 - 0.54 * t; rg.push([-1.30 + 0.03 * (y / 0.27) ** 2, y, 2]); }
  }
  // slim black frames around every glass opening
  const frame = (pts, dir) => line([...pts, pts[0]].map(([a, b]) => (dir[2] ? [a, b, 2] : [a, Math.sign(dir[1]) * -2, b])), dir, trim, 0.011);
  frame(WS_XY, [0, 0, -1]);
  frame(RG_XY, [0, 0, -1]);
  const dense = (P) => P.flatMap((p, i) => { const q = P[(i + 1) % P.length]; return Array.from({ length: 5 }, (_, k) => [p[0] + (q[0] - p[0]) * k / 5, p[1] + (q[1] - p[1]) * k / 5]); });
  for (const s of [-1, 1]) frame(dense(DLO_XZ), [0, -s, 0]);

  // tail light bar across the back edge
  decal(poly([[-2.135, -0.74, 2], [-2.135, 0.74, 2], [-2.175, 0.70, 2], [-2.175, -0.70, 2]], 12), [0, 0, -1], tailMat, 0.003);
}

// ---------- interior: two seats, dash, wheel, console, flashing warning screen ----------
function interior() {
  const leather = new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.7 });
  const stitch = new THREE.MeshStandardMaterial({ color: 0x2c2e33, roughness: 0.6 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.6 });
  const add = (geo, mat, p, r = [0, 0, 0]) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); m.rotation.set(...r); car.add(m); return m; };
  // cabin floor / tub, a shade lighter than the paint so the cabin reads through the glass
  add(new RoundedBoxGeometry(1.25, 1.1, 0.06, 3, 0.03), new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.9 }), [-0.28, 0, 0.83]);
  for (const s of [-1, 1]) {
    const y = s * 0.31;
    add(new RoundedBoxGeometry(0.46, 0.4, 0.09, 4, 0.04), leather, [-0.30, y, 0.89]);
    add(new RoundedBoxGeometry(0.11, 0.38, 0.34, 4, 0.05), leather, [-0.53, y, 1.0], [0, -0.32, 0]);
    add(new RoundedBoxGeometry(0.09, 0.4, 0.06, 2, 0.02), stitch, [-0.47, y, 0.93]);
    add(new RoundedBoxGeometry(0.08, 0.2, 0.1, 4, 0.035), leather, [-0.60, y, 1.15], [0, -0.32, 0]);
    for (const k of [-1, 1]) add(new RoundedBoxGeometry(0.4, 0.06, 0.07, 3, 0.025), stitch, [-0.32, y + k * 0.18, 0.94]);
  }
  // dash across the cabin under the windscreen base
  add(new RoundedBoxGeometry(0.30, 1.16, 0.12, 4, 0.05), dashMat, [0.36, 0, 0.88]);
  // centre console with the gear selector
  add(new RoundedBoxGeometry(0.70, 0.14, 0.10, 3, 0.04), dashMat, [-0.05, 0, 0.88]);
  add(new THREE.CylinderGeometry(0.022, 0.03, 0.07, 16), steel, [0.06, 0, 0.965], [Math.PI / 2, 0, 0]);
  // steering wheel (left-hand drive)
  const sw = add(new THREE.TorusGeometry(0.12, 0.016, 12, 48), leather, [0.16, 0.31, 1.0], [0, Math.PI / 2 - 0.45, 0]);
  add(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 20), dashMat, [0.165, 0.31, 1.0], [0, 0, Math.PI / 2 - 0.45]).rotation.set(0, 0, Math.PI / 2);
  // gauge pod in front of the wheel, faint red tell-tales
  add(new RoundedBoxGeometry(0.06, 0.3, 0.07, 3, 0.025), dashMat, [0.28, 0.31, 0.965]);
  // centre warning screen: canvas texture, tilted up toward the cabin
  const cv = document.createElement("canvas");
  cv.width = 512; cv.height = 256;
  const g = cv.getContext("2d");
  const draw = (on) => {
    g.fillStyle = on ? "#3a0003" : "#120102";
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = on ? "#ff2a2a" : "#5a0a0c"; g.lineWidth = 6; g.strokeRect(8, 8, 496, 240);
    g.fillStyle = on ? "#ff3b30" : "#5a0a0c";
    g.beginPath(); g.moveTo(256, 34); g.lineTo(338, 176); g.lineTo(174, 176); g.closePath(); g.fill();
    g.fillStyle = on ? "#3a0003" : "#120102";
    g.fillRect(248, 74, 16, 62); g.fillRect(248, 148, 16, 16);
    g.fillStyle = on ? "#ffd6d3" : "#5a0a0c";
    g.font = "bold 34px system-ui, sans-serif"; g.textAlign = "center";
    g.fillText("ENGINE FAULT", 256, 222);
  };
  draw(true);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const scrMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  // housing then screen face, facing back toward the seats and up
  const N = new THREE.Vector3(-0.62, 0, 0.78).normalize();
  const C = new THREE.Vector3(0.22, 0, 0.99);
  for (const [geo, mat, off] of [[new RoundedBoxGeometry(0.48, 0.26, 0.03, 2, 0.01), dashMat, -0.012], [new THREE.PlaneGeometry(0.45, 0.225), scrMat, 0.0045]]) {
    const m = new THREE.Mesh(geo, mat);
    m.up.set(0, 0, 1);
    m.position.copy(C).addScaledVector(N, off);
    m.lookAt(m.position.clone().add(N));
    car.add(m);
  }
  // red glow that spills over the seats and the glass
  const glow = new THREE.PointLight(0xff1a10, 0, 0.95, 1.4);
  glow.position.set(0.05, 0, 1.08);
  car.add(glow);
  let last = -1;
  return (t) => {
    const on = (t % 0.9) < 0.5;
    if (on !== last) { draw(on); tex.needsUpdate = true; last = on; }
    glow.intensity = on ? 7 : 0.3;
  };
}

// ---------- smoke rising from the bonnet shut lines ----------
function smoke() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  // soft puff built from a few offset blobs so it never reads as a perfect circle
  for (const [x, y, r, a] of [[64, 64, 60, 0.55], [48, 58, 38, 0.35], [80, 70, 34, 0.35], [62, 44, 30, 0.3], [70, 84, 28, 0.25]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(255,255,255,${a})`);
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  const N = 160, LIFE = 3.6;
  const parts = [];
  const group = new THREE.Group();
  scene.add(group);
  const spawn = (p, age) => {
    // vents along the bonnet shut lines and the gap at the base of the windscreen
    // two vents along the bonnet shut lines, slightly off-centre, so the plume reads as wisps
    const side = Math.random() < 0.5 ? -1 : 1;
    const x = 1.25 + Math.random() * 0.55;
    const y = side * (0.28 + Math.random() * 0.16);
    const top = bodyTopZ(x, y) ?? 0.7;
    p.base.set(x, y, top + 0.02);
    p.vel.set(-0.10 - Math.random() * 0.12, (Math.random() - 0.5) * 0.08 + 0.05, 0.42 + Math.random() * 0.25);
    p.spin = (Math.random() - 0.5) * 0.6;
    p.age = age;
    p.life = LIFE * (0.75 + Math.random() * 0.5);
    p.shade = 0.20 + Math.random() * 0.24;
  };
  for (let i = 0; i < N; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0x6c6c6a, transparent: true, depthWrite: false, opacity: 0 });
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 5;
    group.add(sp);
    const p = { sp, base: new THREE.Vector3(), vel: new THREE.Vector3() };
    spawn(p, Math.random() * LIFE);
    parts.push(p);
  }
  return (dt) => {
    for (const p of parts) {
      p.age += dt;
      if (p.age > p.life) spawn(p, 0);
      const u = p.age / p.life;
      // smoke slows and spreads as it climbs
      const travel = p.age * (1 - 0.35 * u);
      const pos = p.base.clone().addScaledVector(p.vel, travel);
      p.sp.position.copy(car.localToWorld(pos));
      const size = 0.14 + 1.5 * Math.pow(u, 0.8);
      p.sp.scale.set(size, size, 1);
      p.sp.material.rotation += p.spin * dt;
      p.sp.material.opacity = p.shade * smooth(clamp(u / 0.12, 0, 1)) * (1 - smooth(clamp((u - 0.45) / 0.55, 0, 1)));
      const grey = 0.30 + 0.35 * u;
      p.sp.material.color.setRGB(grey, grey, grey * 0.99);
    }
  };
}

// ---------- wheels ----------
function wheel(x, y, width, isRear, flat = 0) {
  const g = new THREE.Group();
  const s = Math.sign(y);
  // tyre: lathe around the y axis
  const prof = [];
  const hw = width / 2;
  const rr = WHEEL_R, rim = 0.255;
  const pts = [[rim, -hw * 0.92], [rr - 0.035, -hw], [rr - 0.008, -hw * 0.8], [rr, -hw * 0.55], [rr, hw * 0.55], [rr - 0.008, hw * 0.8], [rr - 0.035, hw], [rim, hw * 0.92]];
  for (const [r, z] of pts) prof.push(new THREE.Vector2(r, z));
  const tg = new THREE.LatheGeometry(prof, 144);
  if (flat) {
    const P = tg.attributes.position;
    const floorZ = -(rr - flat);
    for (let i = 0; i < P.count; i++) {
      let px = P.getX(i), py = P.getY(i), pz = P.getZ(i);
      const r = Math.hypot(px, pz);
      // the lathe spins about its own Y; the wheel group keeps that as the axle, so "down" is -Z
      const down = -pz / Math.max(r, 1e-6);
      const sag = smooth(clamp((down - 0.35) / 0.65, 0, 1));
      // sidewall bulges out near the ground, the outer rubber rolls over
      py *= 1 + 0.30 * sag * (r / rr);
      px *= 1 + 0.10 * sag;
      if (pz < floorZ) { const over = floorZ - pz; pz = floorZ - over * 0.08; py *= 1 + 1.6 * over; }
      P.setXYZ(i, px, py, pz);
    }
    tg.computeVertexNormals();
  }
  const tyre = new THREE.Mesh(tg, rubber);
  tyre.castShadow = true;
  g.add(tyre);
  // rim barrel and dark wheel well
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(rim, rim, width * 0.9, 64, 1, true), steel);
  g.add(barrel);
  const back = new THREE.Mesh(new THREE.CircleGeometry(rim, 64), trim);
  back.rotation.x = s > 0 ? -Math.PI / 2 : Math.PI / 2;
  back.position.y = -s * hw * 0.6;
  g.add(back);
  // brake disc and caliper
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.028, 48), steel);
  disc.position.y = s * 0.0;
  g.add(disc);
  const cal = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.07), new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.4, metalness: 0.4 }));
  cal.position.set(-0.13 * (isRear ? -1 : 1), s * 0.02, 0.11);
  cal.rotation.y = 0.6 * (isRear ? -1 : 1);
  g.add(cal);
  // outer face: lip, ten slim spokes in five pairs, centre cap
  const face = s * hw * 0.78;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rim - 0.006, 0.011, 12, 72), alloy);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = face;
  g.add(lip);
  for (let i = 0; i < 5; i++) for (const off of [-0.13, 0.13]) {
    const a = (i / 5) * Math.PI * 2 + off + 0.2;
    const sp = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.026, 0.026), alloy);
    sp.position.set(Math.cos(a) * 0.145, face - s * 0.012, Math.sin(a) * 0.145);
    sp.rotation.y = -a;
    sp.rotation.z = 0;
    g.add(sp);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 32), alloy);
  hub.position.y = face - s * 0.005;
  g.add(hub);
  const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.05, 6), steel);
  nut.position.y = face + s * 0.012;
  g.add(nut);
  g.position.set(x, y, WHEEL_R);
  car.add(g);
  // the wheel well behind it
  const well = new THREE.Mesh(new THREE.CylinderGeometry(ARCH_R - 0.005, ARCH_R - 0.005, 0.14, 48, 1, false), trim);
  well.position.set(x, y - s * 0.13, WHEEL_R);
  car.add(well);
}
wheel(AXLE_F, -0.785, 0.245, false);
wheel(AXLE_F, 0.785, 0.245, false);
wheel(AXLE_R, -0.795, 0.27, true, 0.12);
wheel(AXLE_R, 0.795, 0.27, true);

car.updateMatrixWorld(true);
details();
const tickCabin = interior();
car.rotation.set(0.05, -0.04, 0);
const tickSmoke = smoke();
let tPrev = 0;
const tick = (t) => { const dt = Math.min(0.05, t - tPrev || 0.016); tPrev = t; tickCabin(t); tickSmoke(dt); };

// ---------- ground, contact shadow, light ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.receiveShadow = true;
scene.add(ground);
{
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  gr.addColorStop(0, "rgba(0,0,0,0.55)");
  gr.addColorStop(0.55, "rgba(0,0,0,0.28)");
  gr.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = gr;
  x.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.4), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  blob.position.z = 0.002;
  scene.add(blob);
}
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(6, -4, 5);
scene.add(key);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(1.5, -2.5, 9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
sun.shadow.radius = 6;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b9b6, 0.35));

// ---------- camera: high, from the car's right side, nose to the right ----------
const camera = new THREE.PerspectiveCamera(16, SW() / SH(), 0.1, 100);
camera.up.set(0, 0, 1);
const EL = (44 * Math.PI) / 180, D = 17;
const target = new THREE.Vector3(0, 0, 0.45);
camera.position.set(0, -Math.cos(EL) * D, Math.sin(EL) * D).add(target);
camera.lookAt(target);

const phone = matchMedia("(max-width: 760px)");
function fit() {
  const w = SW(), h = SH();
  if (!w || !h) return;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  camera.aspect = w / h;
  if (phone.matches) {
    // phones: frame by width, push the car down so the round product icons and their popups fit above it
    const need = 5.0 / camera.aspect;
    camera.fov = Math.max(16, (2 * Math.atan(Math.max(need, 2.2) / 2 / D) * 180) / Math.PI);
    camera.setViewOffset(w, h, 0, -h * 0.13, w, h);
  } else {
    // PC: the car is the star — about half the screen wide, sitting a little right of centre and low,
    // leaving the top-left for the headline and the corners for the small product cards
    const viewH = Math.max(9.2 / camera.aspect, 3.7);
    camera.fov = (2 * Math.atan(viewH / 2 / D) * 180) / Math.PI;
    camera.setViewOffset(w, h, -w * 0.06, -h * (h < 640 ? 0.11 : 0.075), w, h);
  }
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
new ResizeObserver(fit).observe(stage);
fit();
// draw only while the hero is on screen, so scrolling the rest of the page stays light
let visible = true;
new IntersectionObserver((e) => { visible = e[0].isIntersecting; }, { rootMargin: "80px" }).observe(stage);
const camBase = camera.position.clone(), look = { x: 0, y: 0, tx: 0, ty: 0 };
addEventListener("pointermove", (e) => { if (phone.matches || e.pointerType === "touch") return; look.tx = e.clientX / innerWidth - 0.5; look.ty = e.clientY / innerHeight - 0.5; });
const frame = () => {
  look.x += (look.tx - look.x) * 0.05; look.y += (look.ty - look.y) * 0.05;
  camera.position.set(camBase.x + look.x * 1.1, camBase.y, camBase.z - look.y * 0.8); camera.lookAt(target);
  tick(performance.now() / 1000);
  renderer.render(scene, camera);
  drawWires();
};
renderer.setAnimationLoop(() => { if (visible) frame(); });
// ---------- product cards wired to each fault ----------
// SETTINGS: đổi thành true khi đã có brand máy bơm lốp (khung và dây sẽ hiện lại)
const SHOW_TYRE_PRODUCT = false;
document.getElementById("pc-tyre").hidden = !SHOW_TYRE_PRODUCT;
const FAULTS = {
  engine: new THREE.Vector3(1.55, -0.34, 0.72),   // bonnet vent the smoke comes from
  screen: new THREE.Vector3(0.22, 0.27, 0.97),    // far edge of the warning screen: the wire comes from above and never crosses it
  tyre: new THREE.Vector3(AXLE_R, -0.93, 0.2),    // flat rear tyre, outer sidewall
};
FAULTS.engine.z = bodyTopZ(FAULTS.engine.x, FAULTS.engine.y) ?? 0.7;
const svg = document.getElementById("wires");
const NS = "http://www.w3.org/2000/svg";
const el = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute("class", cls); parent.appendChild(e); return e; };
const wires = {};
for (const k of Object.keys(FAULTS)) {
  const g = el("g", "k-" + k, svg);
  const w = { g, card: document.getElementById("pc-" + k) };
  w.halo = el("path", "halo", g);
  w.path = el("path", "w", g);
  w.flow = el("path", "flow", g);
  w.end = el("circle", "end", g); w.end.setAttribute("r", 3);
  w.ring = el("circle", "ring", g); w.ring.setAttribute("r", 4.5);
  w.dot = el("circle", "dot", g); w.dot.setAttribute("r", 3);
  w.hit = el("path", "hit", g);
  w.hit.addEventListener("click", () => activate(k));
  w.card.addEventListener("click", (e) => { if (!e.target.closest("a")) activate(k); });
  w.card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(k); } });
  wires[k] = w;
  if (w.card.hidden) g.style.display = "none";
}
const tmp = new THREE.Vector3();
const roofPts = [new THREE.Vector3(0.84, 0, 0.78), new THREE.Vector3(-0.3, 0, 1.26), new THREE.Vector3(1.9, 0, 0.7)];
function placeIcons() {
  if (!phone.matches) { for (const w of Object.values(wires)) if (w.card.id !== "pc-tyre") w.card.style.top = ""; return; }
  let top = Infinity;
  for (const p of roofPts) { tmp.copy(p); car.localToWorld(tmp); tmp.project(camera); top = Math.min(top, (-tmp.y * 0.5 + 0.5) * SH()); }
  const y = Math.max(118, top - 58 - 34) + "px";
  for (const id of ["pc-screen", "pc-engine"]) { const c = document.getElementById(id); if (c.style.top !== y) c.style.top = y; }
}
function drawWires() {
  placeIcons();
  const S = stage.getBoundingClientRect();
  for (const [k, w] of Object.entries(wires)) {
    tmp.copy(FAULTS[k]); car.localToWorld(tmp); tmp.project(camera);
    const fx = (tmp.x * 0.5 + 0.5) * SW(), fy = (-tmp.y * 0.5 + 0.5) * SH();
    if (w.card.hidden) continue;
    const R = w.card.getBoundingClientRect();
    const r = { left: R.left - S.left, right: R.right - S.left, top: R.top - S.top, bottom: R.bottom - S.top, width: R.width, height: R.height };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = fx - cx, dy = fy - cy;
    let ax, ay, c1x, c1y;
    if (Math.abs(dx) / r.width > Math.abs(dy) / r.height) { ax = dx > 0 ? r.right : r.left; ay = cy; c1x = ax + Math.sign(dx) * Math.abs(fx - ax) * 0.6; c1y = ay; }
    else { ay = dy > 0 ? r.bottom : r.top; ax = cx; c1x = ax; c1y = ay + Math.sign(dy) * Math.abs(fy - ay) * 0.5; }
    // drop into the fault vertically: from above when the card sits higher, from below when lower
    const above = ay < fy;
    const lift = Math.max(70, Math.abs(fy - ay) * 0.9);
    const c2x = fx, c2y = above ? Math.min(fy - lift, ay) : Math.max(fy + lift, ay);
    const d = `M${ax.toFixed(1)},${ay.toFixed(1)} C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${fx.toFixed(1)},${fy.toFixed(1)}`;
    if (w.d !== d) {
      w.d = d;
      for (const p of [w.halo, w.path, w.flow, w.hit]) p.setAttribute("d", d);
      w.end.setAttribute("cx", ax); w.end.setAttribute("cy", ay);
      for (const c of [w.ring, w.dot]) { c.setAttribute("cx", fx); c.setAttribute("cy", fy); }
    }
  }
}

// ---------- sounds, made on the fly with Web Audio (no files) ----------
let AC;
const ac = () => (AC ||= new (window.AudioContext || window.webkitAudioContext)());
function noise(a, dur) { const b = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; return s; }
const SOUNDS = {
  // engine coughing: uneven low thumps with a rough exhaust rasp
  engine() {
    const a = ac(), t0 = a.currentTime + 0.02, DUR = 3.2;
    const comp = a.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(a.destination);
    const out = a.createGain(); out.gain.value = 0.7; out.connect(comp);
    // rough idle underneath, wavering and dying away at the end
    const idle = a.createOscillator(); idle.type = "sawtooth";
    idle.frequency.setValueAtTime(46, t0);
    for (let t = 0.2; t < DUR; t += 0.2) idle.frequency.linearRampToValueAtTime(40 + Math.random() * 14, t0 + t);
    idle.frequency.linearRampToValueAtTime(28, t0 + DUR);
    const ilp = a.createBiquadFilter(); ilp.type = "lowpass"; ilp.frequency.value = 260;
    const ig = a.createGain(); ig.gain.setValueAtTime(0.0001, t0); ig.gain.exponentialRampToValueAtTime(0.45, t0 + 0.08);
    ig.gain.setValueAtTime(0.45, t0 + DUR - 0.6); ig.gain.exponentialRampToValueAtTime(0.0001, t0 + DUR);
    idle.connect(ilp).connect(ig).connect(out); idle.start(t0); idle.stop(t0 + DUR + 0.05);
    // misfires: bunched coughs, gaps, a big backfire near the end
    const hits = [0, 0.14, 0.25, 0.5, 0.58, 0.66, 0.98, 1.1, 1.38, 1.46, 1.55, 1.9, 2.02, 2.3, 2.42, 2.5, 2.85];
    hits.forEach((h, i) => {
      const t = t0 + h, big = i === hits.length - 1, amp = big ? 1.4 : (i % 4 === 3 ? 0.6 : 1);
      const o = a.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(75 + Math.random() * 25, t); o.frequency.exponentialRampToValueAtTime(34, t + (big ? 0.3 : 0.16));
      const lp = a.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = big ? 700 : 480;
      const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.38 : 0.2));
      o.connect(lp).connect(g).connect(out); o.start(t); o.stop(t + 0.42);
      const n = noise(a, big ? 0.3 : 0.14), bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = big ? 600 : 950; bp.Q.value = 0.7;
      const ng = a.createGain(); ng.gain.setValueAtTime(0.55 * amp, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + (big ? 0.28 : 0.13));
      n.connect(bp).connect(ng).connect(out); n.start(t);
    });
  },
  // dashboard warning: three sharp beeps
  screen() {
    const a = ac(), t0 = a.currentTime + 0.02;
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.22;
      const o = a.createOscillator(); o.type = "square"; o.frequency.value = 1320;
      const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.008); g.gain.setValueAtTime(0.16, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g).connect(a.destination); o.start(t); o.stop(t + 0.16);
    }
  },
  // air escaping the tyre: bright hiss that fades as pressure drops
  tyre() {
    const a = ac(), t = a.currentTime + 0.02, dur = 1.6;
    const n = noise(a, dur), hp = a.createBiquadFilter(); hp.type = "highpass"; hp.frequency.setValueAtTime(5200, t); hp.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(hp).connect(g).connect(a.destination); n.start(t);
  },
};

let current = null;
function activate(k) {
  if (phone.matches && current === k) { closeAll(); return; }
  try { SOUNDS[k](); } catch (e) {}
  if (current && current !== k) { wires[current].g.classList.remove("on"); wires[current].card.classList.remove("on"); }
  current = k;
  const w = wires[k];
  w.g.classList.add("on"); w.card.classList.add("on");
  if (window.gsap) {
    gsap.fromTo(w.card, { scale: 1 }, { scale: 1.035, duration: 0.14, yoyo: true, repeat: 1, ease: "power2.out" });
    const len = w.path.getTotalLength();
    gsap.fromTo(w.path, { strokeDasharray: len, strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.45, ease: "power2.out", onComplete: () => { for (const k of ["stroke-dasharray", "stroke-dashoffset"]) { w.path.removeAttribute(k); w.path.style.removeProperty(k); } } });
  }
}
function closeAll() { if (!current) return; wires[current].g.classList.remove("on"); wires[current].card.classList.remove("on"); current = null; }
document.addEventListener("click", (e) => { if (phone.matches && !e.target.closest(".pc") && !e.target.closest("#wires .hit")) closeAll(); });
window.__activate = activate;
// first frame drawn: let the page fade the car in
frame();
stage.classList.add("ready");
if (window.gsap) {
  gsap.fromTo(car.position, { x: -1.6 }, { x: 0, duration: 1.4, ease: "power3.out" });
  const cards = stage.querySelectorAll(".pc:not([hidden])");
  gsap.fromTo(cards, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.12, delay: 0.9, ease: "power2.out", clearProps: "transform",
    onComplete: () => { if (!phone.matches) gsap.to(cards, { y: -5, duration: 2.6, ease: "sine.inOut", yoyo: true, repeat: -1 }); } });
}
window.__ready = true;
