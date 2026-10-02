import {
  WebGLRenderer, Scene, PerspectiveCamera, Vector3, Vector2, Color, Group, Mesh, SphereGeometry,
  MeshStandardMaterial, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, PointLight, HemisphereLight,
  ShaderMaterial, AdditiveBlending, DoubleSide, RingGeometry, BoxGeometry, Sprite, SpriteMaterial,
  Points, BufferGeometry, Float32BufferAttribute, LineSegments, LineLoop, Line, LineBasicMaterial,
  CatmullRomCurve3, Raycaster, MathUtils,
} from "three";

/* ============================================================
   Universe: a side-scrolling flight through a small solar system.
   - Between planets the camera flies (scroll-driven) with star streaks.
   - At a planet the camera is parked: nothing moves while you read.
   ============================================================ */

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- colour tokens come from CSS so there is one source of truth ---------- */
const parseHex = (s, fallback) => {
  const m = /#?([0-9a-f]{6})/i.exec(s || "");
  const n = parseInt(m ? m[1] : fallback, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const css = (name, fb) => parseHex(getComputedStyle(document.documentElement).getPropertyValue(name), fb);
const toThree = (c) => new Color(`rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`);

/* ---------- procedural noise (tileable in x so sphere seams vanish) ---------- */
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y, per, s) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % per) + per) % per, x1 = (x0 + 1) % per;
  const a = hash(x0, yi, s), b = hash(x1, yi, s), c = hash(x0, yi + 1, s), d = hash(x1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, per, s, oct = 5) {
  let amp = 0.5, f = 1, t = 0, norm = 0;
  for (let i = 0; i < oct; i++) { t += amp * vnoise(x * f, y * f, per * f, s + i * 17); norm += amp; f *= 2; amp *= 0.5; }
  return t / norm;
}

function makeTexture(w, h, seed, per, colorFn) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const cx = c.getContext("2d"); const img = cx.createImageData(w, h); const d = img.data;
  const b = document.createElement("canvas"); b.width = w; b.height = h;
  const bx = b.getContext("2d"); const bimg = bx.createImageData(w, h); const bd = bimg.data;
  for (let j = 0; j < h; j++) {
    const lat = j / (h - 1);
    for (let i = 0; i < w; i++) {
      const u = (i / w) * per, v = (j / h) * per * 0.5;
      const n = fbm(u, v, per, seed);
      const col = colorFn(n, lat, u, v);
      const k = (j * w + i) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
      const g = Math.round(clamp(n, 0, 1) * 255);
      bd[k] = bd[k + 1] = bd[k + 2] = g; bd[k + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0); bx.putImageData(bimg, 0, 0);
  const map = new CanvasTexture(c); map.colorSpace = SRGBColorSpace; map.anisotropy = 4;
  const bump = new CanvasTexture(b);
  return { map, bump, canvas: c, ctx: cx };
}

function glowTexture(inner = "255,255,255", outer = "255,255,255") {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(${inner},1)`); g.addColorStop(0.25, `rgba(${outer},0.55)`);
  g.addColorStop(0.6, `rgba(${outer},0.12)`); g.addColorStop(1, `rgba(${outer},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; return t;
}

function atmosphere(R, color, pow = 3.2, strength = 0.9) {
  return new Mesh(
    new SphereGeometry(R, 48, 32),
    new ShaderMaterial({
      uniforms: { uColor: { value: color }, uPow: { value: pow }, uK: { value: strength } },
      vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }",
      fragmentShader: "uniform vec3 uColor; uniform float uPow; uniform float uK; varying vec3 vN; varying vec3 vV; void main(){ float r=1.-max(dot(normalize(vN),normalize(vV)),0.); gl_FragColor=vec4(uColor, pow(r,uPow)*uK); }",
      transparent: true, blending: AdditiveBlending, depthWrite: false,
    })
  );
}

function orbitLine(rx, rz, tiltX, tiltZ, color, opacity = 0.5) {
  const pts = [];
  for (let i = 0; i < 160; i++) { const a = (i / 160) * Math.PI * 2; pts.push(Math.cos(a) * rx, 0, Math.sin(a) * rz); }
  const g = new BufferGeometry(); g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  const l = new LineLoop(g, new LineBasicMaterial({ color, transparent: true, opacity }));
  l.rotation.x = tiltX; l.rotation.z = tiltZ; return l;
}

function proxy(R) { // invisible sphere used for click / hover picking
  return new Mesh(new SphereGeometry(R, 12, 8), new MeshBasicMaterial({ visible: false }));
}

/* ---------- the stops ---------- */
const SIDES = [0, 1, -1, 1, -1, 1, -1, 1, -1]; // +1 = planet on the right of the screen

export function create(opts) {
  const { canvas, ids, reduce } = opts;
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: window.innerWidth > 700, alpha: true, powerPreference: "high-performance" });
  } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  renderer.setClearColor(0x000000, 0);

  const P = {
    bone: css("--bone", "f2f0ea"), accent: css("--accent", "c8ff2e"),
    sunHi: css("--sun-hi", "ffd88a"), sunLo: css("--sun-lo", "e0731f"),
    iceHi: css("--ice-hi", "cdeeea"), iceLo: css("--ice-lo", "2c6b72"),
    rustHi: css("--rust-hi", "ecb08c"), rustLo: css("--rust-lo", "7a3b25"),
    mossHi: css("--moss-hi", "d6e7ae"), mossLo: css("--moss-lo", "3d5c2c"),
    hazeHi: css("--haze-hi", "ece6d6"), hazeLo: css("--haze-lo", "7d7666"),
    ink3: css("--ink-3", "9a9aa3"),
  };

  const scene = new Scene();
  const camera = new PerspectiveCamera(50, 1, 0.5, 3000);
  const root = new Group(); scene.add(root);

  /* ----- lights: the Orka "sun" lights every planet, so shading faces it ----- */
  const SUN_POS = new Vector3(95, 6, -30);
  const sunLight = new PointLight(0xffffff, 2.6, 0, 0); sunLight.position.copy(SUN_POS); scene.add(sunLight);
  scene.add(new HemisphereLight(0x9fb4c0, 0x101418, 0.7));

  const pickables = []; // index -> mesh
  const defs = []; // index -> {pos:Vector3, rf}

  const texSize = window.innerWidth < 700 ? [384, 192] : [512, 256];
  const T = (seed, per, fn) => makeTexture(texSize[0], texSize[1], seed, per, fn);
  const MAT = (tex, bump = 1.4) => new MeshStandardMaterial({ map: tex.map, bumpMap: tex.bump, bumpScale: bump, roughness: 1, metalness: 0 });
  const SPH = (R, seg = 64) => new SphereGeometry(R, seg, Math.round(seg * 0.66));

  /* 0 — Launch: a huge planet below the camera so only its limb shows */
  const earthTex = T(7, 6, (n, lat) => {
    const polar = smooth(0.84, 0.97, Math.abs(lat - 0.5) * 2);
    let c;
    if (n < 0.5) c = mixc(P.iceLo.map((v) => v * 0.7), P.iceLo.map((v) => Math.min(255, v * 1.25)), smooth(0.1, 0.5, n));
    else { const t = smooth(0.5, 0.95, n); c = mixc(P.mossLo, mixc(P.mossHi, P.hazeHi, smooth(0.7, 1, t)), t); }
    return mixc(c, P.hazeHi, polar);
  });
  const launch = new Group();
  const launchPlanet = new Mesh(SPH(150, 96), MAT(earthTex, 2));
  launch.add(launchPlanet);
  launch.add(atmosphere(156, toThree(P.iceHi), 4.2, 0.8));
  launch.position.set(-30, -148, -60);
  root.add(launch);
  defs[0] = { pos: new Vector3(0, 0, 0), rf: 1 };

  /* 1 — Home base: earth-like */
  {
    const g = new Group(); const R = 9;
    g.add(new Mesh(SPH(R, 80), MAT(earthTex, 1.6)));
    const cloudTex = T(31, 5, (n) => [255, 255, 255]);
    const cloud = new Mesh(SPH(R * 1.02, 64), new MeshStandardMaterial({ alphaMap: cloudTex.bump, color: 0xffffff, transparent: true, opacity: 0.55, roughness: 1, depthWrite: false }));
    g.add(cloud);
    g.add(atmosphere(R * 1.09, toThree(P.iceHi), 3.4, 0.95));
    const hit = proxy(R * 1.05); g.add(hit); pickables[1] = hit;
    g.position.set(0, 0, 0); root.add(g); defs[1] = { pos: g.position.clone(), rf: R };
  }

  /* 2 — Orka Solar: the sun */
  {
    const g = new Group(); const R = 13;
    const tex = T(11, 6, (n) => mixc(P.sunLo, P.sunHi, smooth(0.25, 0.85, n)));
    g.add(new Mesh(SPH(R, 64), new MeshBasicMaterial({ map: tex.map })));
    const glow = new Sprite(new SpriteMaterial({ map: glowTexture("255,230,170", "255,150,60"), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    glow.scale.setScalar(R * 6.2); g.add(glow);
    const hit = proxy(R * 1.05); g.add(hit); pickables[2] = hit;
    g.position.copy(SUN_POS); root.add(g); defs[2] = { pos: g.position.clone(), rf: R * 1.35 };
  }

  /* 3 — Smart Market AI: ringed ice giant */
  {
    const g = new Group(); const R = 8;
    const tex = T(23, 4, (n, lat) => {
      const b = 0.5 + 0.5 * Math.sin(lat * Math.PI * 15 + n * 5.5);
      return mixc(P.iceLo, P.iceHi, clamp(b * 0.75 + n * 0.3, 0, 1));
    });
    const body = new Mesh(SPH(R, 72), MAT(tex, 0.25)); g.add(body);
    g.add(atmosphere(R * 1.07, toThree(P.iceHi), 3.6, 0.7));
    const inner = R * 1.45, outer = R * 2.35;
    const rg = new RingGeometry(inner, outer, 160, 1);
    const pos = rg.attributes.position, uv = rg.attributes.uv; const v3 = new Vector3();
    for (let i = 0; i < pos.count; i++) { v3.fromBufferAttribute(pos, i); uv.setXY(i, (v3.length() - inner) / (outer - inner), 0.5); }
    const rc = document.createElement("canvas"); rc.width = 512; rc.height = 4; const rx = rc.getContext("2d");
    const grad = rx.createLinearGradient(0, 0, 512, 0);
    for (let i = 0; i <= 40; i++) { const a = 0.15 + 0.7 * Math.abs(Math.sin(i * 2.3) * Math.cos(i * 0.9)); const k = i / 40; const edge = Math.min(1, k * 8, (1 - k) * 8); grad.addColorStop(k, `rgba(${P.hazeHi[0] | 0},${P.hazeHi[1] | 0},${P.hazeHi[2] | 0},${(a * edge).toFixed(2)})`); }
    rx.fillStyle = grad; rx.fillRect(0, 0, 512, 4);
    const rt = new CanvasTexture(rc); rt.colorSpace = SRGBColorSpace;
    const ring = new Mesh(rg, new MeshBasicMaterial({ map: rt, transparent: true, side: DoubleSide, depthWrite: false }));
    ring.rotation.x = Math.PI / 2 - 0.42; ring.rotation.y = 0.12; g.add(ring);
    const hit = proxy(outer); g.add(hit); pickables[3] = hit;
    g.position.set(240, -4, 10); g.rotation.z = -0.06; root.add(g); defs[3] = { pos: g.position.clone(), rf: outer * 0.9 };
  }

  /* 4 — The Reels Bot: cratered moon + small station */
  {
    const g = new Group(); const R = 6.5;
    const tex = T(41, 5, (n) => mixc(P.rustLo, P.rustHi, smooth(0.2, 0.9, n)));
    for (let i = 0; i < 46; i++) {
      const x = Math.random() * texSize[0], y = Math.random() * texSize[1], r = rand(3, 16);
      tex.ctx.beginPath(); tex.ctx.arc(x, y, r, 0, 6.2832); tex.ctx.fillStyle = "rgba(0,0,0,0.22)"; tex.ctx.fill();
      tex.ctx.lineWidth = 1.5; tex.ctx.strokeStyle = "rgba(255,255,255,0.10)"; tex.ctx.stroke();
    }
    tex.map.needsUpdate = true;
    g.add(new Mesh(SPH(R, 64), MAT(tex, 2.2)));
    g.add(atmosphere(R * 1.05, toThree(P.rustHi), 4.5, 0.35));
    const st = new Group();
    const bodyM = new MeshStandardMaterial({ color: toThree(P.bone), metalness: 0.5, roughness: 0.4 });
    const panM = new MeshStandardMaterial({ color: toThree(P.iceLo), metalness: 0.3, roughness: 0.5, emissive: toThree(P.iceLo), emissiveIntensity: 0.25 });
    st.add(new Mesh(new BoxGeometry(1.1, 0.7, 0.7), bodyM));
    const p1 = new Mesh(new BoxGeometry(2.6, 0.06, 1.0), panM); p1.position.x = -2.0; st.add(p1);
    const p2 = p1.clone(); p2.position.x = 2.0; st.add(p2);
    const mast = new Mesh(new BoxGeometry(0.06, 0.9, 0.06), bodyM); mast.position.y = 0.8; st.add(mast);
    st.position.set(R * 1.75, R * 0.55, R * 0.5); st.rotation.set(0.3, 0.5, -0.35); st.scale.setScalar(1.15); g.add(st);
    g.add(orbitLine(R * 1.9, R * 1.9, 0.5, -0.25, toThree(P.ink3), 0.35));
    const hit = proxy(R * 1.4); g.add(hit); pickables[4] = hit;
    g.position.set(295, 8, -22); root.add(g); defs[4] = { pos: g.position.clone(), rf: R * 2.2 };
  }

  /* 5 — Client worlds: a small cluster of moons on tilted orbits */
  {
    const g = new Group();
    const moon = (R, lo, hi, seed, x, y, z) => {
      const t = T(seed, 4, (n) => mixc(lo, hi, smooth(0.15, 0.9, n)));
      const m = new Mesh(SPH(R, 48), MAT(t, 0.9)); m.position.set(x, y, z); g.add(m); return m;
    };
    moon(3.2, P.hazeLo, P.hazeHi, 51, 0, 0, 0);
    moon(2.6, P.mossLo, P.mossHi, 52, 11, 4, -2);
    moon(2.0, P.iceLo, P.iceHi, 53, -9, -3, 3);
    moon(1.5, P.rustLo, P.rustHi, 54, 3, -8, 5);
    g.add(orbitLine(11.7, 11.7, 0.35, 0.2, toThree(P.ink3), 0.4));
    g.add(orbitLine(9.2, 9.2, 0.9, -0.3, toThree(P.ink3), 0.3));
    const hit = proxy(14); g.add(hit); pickables[5] = hit;
    g.position.set(385, -2, 6); root.add(g); defs[5] = { pos: g.position.clone(), rf: 14 };
  }

  /* 6 — Star chart: a constellation floating in space */
  {
    const g = new Group();
    const nodes = [[-12, -6, 2], [-6, 2, -4], [0, -2, 3], [6, 6, -2], [13, 3, 4], [4, -8, -5], [-9, 8, 5], [9, -4, 7]];
    const links = [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [1, 6], [4, 7], [2, 7]];
    const lp = []; links.forEach(([a, b]) => lp.push(...nodes[a], ...nodes[b]));
    const lg = new BufferGeometry(); lg.setAttribute("position", new Float32BufferAttribute(lp, 3));
    g.add(new LineSegments(lg, new LineBasicMaterial({ color: toThree(P.ink3), transparent: true, opacity: 0.7 })));
    const sTex = glowTexture("255,255,255", "242,240,234"); const kTex = glowTexture("255,255,255", "200,255,46");
    nodes.forEach((n, i) => {
      const s = new Sprite(new SpriteMaterial({ map: i === 2 ? kTex : sTex, blending: AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(...n); s.scale.setScalar(i === 2 ? 5.2 : 3.2); g.add(s);
    });
    const hit = proxy(15); g.add(hit); pickables[6] = hit;
    g.position.set(475, 4, -18); root.add(g); defs[6] = { pos: g.position.clone(), rf: 15 };
  }

  /* 7 — Flight log: a small sun and tilted orbits */
  {
    const g = new Group();
    g.add(new Mesh(SPH(2.2, 32), new MeshBasicMaterial({ color: toThree(P.sunHi) })));
    const gl = new Sprite(new SpriteMaterial({ map: glowTexture("255,230,170", "255,150,60"), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    gl.scale.setScalar(12); g.add(gl);
    [[6, 5, 0.5, 0.15], [10.5, 8.5, 0.35, -0.3], [15, 12, 0.7, 0.25]].forEach(([rx, rz, tx, tz]) => g.add(orbitLine(rx, rz, tx, tz, toThree(P.ink3), 0.55)));
    const dotM = new MeshBasicMaterial({ color: toThree(P.accent) });
    const d1 = new Mesh(SPH(0.9, 24), dotM); d1.position.set(13, 3.4, 6); g.add(d1);
    const d2 = new Mesh(SPH(0.7, 24), new MeshStandardMaterial({ color: toThree(P.iceHi), roughness: 1 })); d2.position.set(-7.5, -1.6, 3.5); g.add(d2);
    const hit = proxy(16); g.add(hit); pickables[7] = hit;
    g.position.set(565, -3, 8); root.add(g); defs[7] = { pos: g.position.clone(), rf: 16 };
  }

  /* 8 — Signal: a beacon with pings */
  const pings = [];
  {
    const g = new Group();
    g.add(new Mesh(SPH(2.2, 32), new MeshBasicMaterial({ color: toThree(P.accent) })));
    const gl = new Sprite(new SpriteMaterial({ map: glowTexture("220,255,120", "200,255,46"), blending: AdditiveBlending, depthWrite: false, transparent: true }));
    gl.scale.setScalar(14); g.add(gl);
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(new RingGeometry(0.97, 1, 96), new MeshBasicMaterial({ color: toThree(P.accent), transparent: true, opacity: 0, side: DoubleSide, depthWrite: false }));
      g.add(m); pings.push(m);
    }
    const hit = proxy(7); g.add(hit); pickables[8] = hit;
    g.position.set(650, 2, -10); root.add(g); defs[8] = { pos: g.position.clone(), rf: 8 };
  }

  /* ----- stars: points at rest, streaks only while the camera moves ----- */
  const starCols = {
    bone: new Color(toThree(P.bone)), accent: new Color(toThree(P.accent)), warm: new Color(toThree(P.sunHi)),
  };
  const uniforms = {
    uDir: { value: new Vector3(1, 0, 0) }, uStreak: { value: 0 }, uPx: { value: 1 },
    uBone: { value: starCols.bone }, uAccent: { value: starCols.accent }, uWarm: { value: starCols.warm },
  };
  const FAR = window.innerWidth < 700 ? 1400 : 2800, NEAR = window.innerWidth < 700 ? 420 : 900;
  const total = FAR + NEAR;
  const sp = new Float32Array(total * 3), ss = new Float32Array(total), st = new Float32Array(total);
  const route = new CatmullRomCurve3([[0, 0, 40], [95, 6, 0], [200, 0, 40], [295, 8, 20], [385, 0, 40], [475, 4, 20], [565, 0, 40], [650, 2, 20]].map((p) => new Vector3(...p)));
  for (let i = 0; i < total; i++) {
    if (i < FAR) { sp[i * 3] = rand(-220, 920); sp[i * 3 + 1] = rand(-190, 190); sp[i * 3 + 2] = rand(-340, 130); ss[i] = rand(0.5, 1.7); }
    else { const p = route.getPoint(Math.random()); sp[i * 3] = p.x + rand(-10, 10); sp[i * 3 + 1] = p.y + rand(-22, 22); sp[i * 3 + 2] = p.z + rand(-34, 12); ss[i] = rand(0.5, 1.25); }
    st[i] = Math.random();
  }
  const vcommon = `
    uniform vec3 uDir; uniform float uStreak; uniform float uPx;
    attribute float aSize; attribute float aTint; attribute float aEnd;
    varying float vTint; varying float vFade; varying float vEnd;`;
  const fcommon = `
    uniform vec3 uBone; uniform vec3 uAccent; uniform vec3 uWarm; uniform float uStreak;
    varying float vTint; varying float vFade; varying float vEnd;
    vec3 starColor(){ vec3 c = uBone; if (vTint < 0.035) c = uAccent; else if (vTint > 0.9) c = uWarm; return c; }`;
  const pg = new BufferGeometry();
  pg.setAttribute("position", new Float32BufferAttribute(sp, 3)); pg.setAttribute("aSize", new Float32BufferAttribute(ss, 1)); pg.setAttribute("aTint", new Float32BufferAttribute(st, 1));
  pg.setAttribute("aEnd", new Float32BufferAttribute(new Float32Array(total), 1));
  const dots = new Points(pg, new ShaderMaterial({
    uniforms,
    vertexShader: `${vcommon} void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; float dist=-mv.z; gl_PointSize = aSize*uPx*(1.0+55.0/max(dist,8.0)); vTint=aTint; vFade=clamp(1.15-dist/820.0,0.12,1.0); vEnd=0.0; }`,
    fragmentShader: `${fcommon} void main(){ float d=length(gl_PointCoord-0.5); if(d>0.5) discard; float a=smoothstep(0.5,0.05,d)*vFade; gl_FragColor=vec4(starColor(), a); }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  }));
  dots.frustumCulled = false; scene.add(dots);

  const lp2 = new Float32Array(total * 6), ls = new Float32Array(total * 2), lt = new Float32Array(total * 2), le = new Float32Array(total * 2);
  for (let i = 0; i < total; i++) {
    for (let k = 0; k < 2; k++) { lp2.set([sp[i * 3], sp[i * 3 + 1], sp[i * 3 + 2]], (i * 2 + k) * 3); ls[i * 2 + k] = ss[i]; lt[i * 2 + k] = st[i]; le[i * 2 + k] = k; }
  }
  const lg2 = new BufferGeometry();
  lg2.setAttribute("position", new Float32BufferAttribute(lp2, 3)); lg2.setAttribute("aSize", new Float32BufferAttribute(ls, 1));
  lg2.setAttribute("aTint", new Float32BufferAttribute(lt, 1)); lg2.setAttribute("aEnd", new Float32BufferAttribute(le, 1));
  const streaks = new LineSegments(lg2, new ShaderMaterial({
    uniforms,
    vertexShader: `${vcommon} void main(){ vec3 p = position + uDir*uStreak*aEnd*(0.5+aSize*0.6); vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv; float dist=-mv.z; vTint=aTint; vEnd=aEnd; vFade=clamp(1.15-dist/820.0,0.12,1.0); }`,
    fragmentShader: `${fcommon} void main(){ float a=(1.0-vEnd)*vFade*clamp(0.35+uStreak*0.08,0.0,0.95); gl_FragColor=vec4(starColor(), a); }`,
    transparent: true, depthWrite: false, blending: AdditiveBlending,
  }));
  streaks.frustumCulled = false; scene.add(streaks);

  /* ----- camera rig ----- */
  const BASE_FOV = 50;
  let camPts = [], tgtPts = [], camCurve, tgtCurve;
  let vw = 1, vh = 1, aspect = 1;

  function compose() {
    camPts = []; tgtPts = [];
    const tanH = Math.tan(MathUtils.degToRad(BASE_FOV / 2));
    // launch: camera skims above the huge planet's limb
    camPts.push(new Vector3(0, 3, 46)); tgtPts.push(aspect >= 0.95 ? new Vector3(-17, 7.5, 0) : new Vector3(-3, 15, 0));
    for (let i = 1; i < defs.length; i++) {
      const { pos, rf } = defs[i]; const side = SIDES[i];
      let d, tx = pos.x, ty = pos.y;
      if (aspect >= 0.95) {
        d = rf / (0.5 * tanH);
        tx = pos.x - side * 0.5 * tanH * d * aspect;
      } else {
        d = Math.max(rf / (0.56 * tanH * aspect), rf / (0.42 * tanH));
        ty = pos.y + 0.42 * tanH * d;
      }
      tgtPts.push(new Vector3(tx, ty, pos.z));
      camPts.push(new Vector3(tx, ty, pos.z + d));
    }
    camCurve = new CatmullRomCurve3(camPts, false, "centripetal");
    tgtCurve = new CatmullRomCurve3(tgtPts, false, "centripetal");
  }

  /* ----- scroll → stage mapping ----- */
  let flights = []; // [{start,end,el}]
  let enabled = true;
  function measure() {
    vw = window.innerWidth; vh = window.innerHeight; aspect = vw / vh;
    flights = ids.slice(1).map((id) => {
      const el = document.querySelector(`.flight[data-to="${id}"]`);
      if (!el) return { start: 0, end: 0, el: null };
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      return { start: top, end: Math.max(top + 1, top + r.height - vh), el };
    });
    compose();
  }
  function stageAt(y) {
    let s = 0, active = -1, p = 0;
    for (let k = 0; k < flights.length; k++) {
      const f = flights[k];
      if (y >= f.end) { s = k + 1; continue; }
      if (y > f.start) { p = (y - f.start) / (f.end - f.start); s = k + ease(p); active = k; }
      break;
    }
    return { s, active, p };
  }

  /* ----- render loop (only while something is changing) ----- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let sDisp = 0, sTarget = 0, streak = 0, raf = 0, last = 0, lastStage = "";
  const prev = new Vector3(), cur = new Vector3(), tgt = new Vector3(), dir = new Vector3(1, 0, 0);
  let pingStart = -1;
  const stageCbs = [];

  function applyCamera(s) {
    const u = clamp(s / (camPts.length - 1), 0, 1);
    camCurve.getPoint(u, cur); tgtCurve.getPoint(u, tgt);
    const frac = s - Math.floor(s); const leg = Math.floor(s);
    const bump = reduce ? 0 : Math.pow(Math.sin(Math.PI * frac), 1.4);
    camera.fov = BASE_FOV + 16 * bump; camera.updateProjectionMatrix();
    const sway = reduce ? 0 : 0.035 * (cur.z - tgt.z);
    camera.position.set(cur.x + mouse.x * sway, cur.y - mouse.y * sway * 0.6, cur.z);
    camera.lookAt(tgt.x, tgt.y, tgt.z);
    camera.rotateZ((leg % 2 ? -1 : 1) * 0.05 * bump);
  }

  function emitStage() {
    const near = Math.round(sDisp);
    const frac = sDisp - Math.floor(sDisp);
    const flying = frac > 0.03 && frac < 0.97;
    const to = Math.min(ids.length - 1, Math.floor(sDisp) + 1);
    const key = `${flying ? "f" : "s"}${flying ? to : near}`;
    if (key !== lastStage) { lastStage = key; stageCbs.forEach((cb) => cb({ index: near, flying, to })); }
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min(0.05, ((now - last) / 1000) || 0.016); last = now;
    const { s, active, p } = stageAt(window.scrollY);
    sTarget = s;
    const k = reduce ? 1 : 1 - Math.exp(-dt * 6.5);
    sDisp += (sTarget - sDisp) * k;
    if (Math.abs(sTarget - sDisp) < 0.0004) sDisp = sTarget;
    mouse.x += (mouse.tx - mouse.x) * 0.08; mouse.y += (mouse.ty - mouse.y) * 0.08;

    const sv = sDisp;
    launch.position.set(-30 - 30 * smooth(0, 1, sv), -148 - 70 * smooth(0, 1, sv) - 200 * smooth(1, 2, sv), -60);
    launch.visible = sv < 2.3;
    prev.copy(camera.position);
    applyCamera(sDisp);
    const delta = camera.position.clone().sub(prev); const spd = delta.length();
    if (spd > 0.0005) { dir.copy(delta).normalize(); }
    const stTarget = reduce ? 0 : clamp(spd * 3.0, 0, 70);
    streak += (stTarget - streak) * 0.35; if (streak < 0.03) streak = 0;
    uniforms.uStreak.value = streak; uniforms.uDir.value.copy(dir);

    // flight labels
    flights.forEach((f, i) => { if (f.el) f.el.style.setProperty("--fp", (i === active ? p : (sDisp > i + 0.5 ? 1 : 0)).toFixed(3)); });

    // beacon pings when parked at the last stop
    let pingActive = false;
    if (sDisp === 8) {
      if (pingStart < 0) pingStart = now;
      const t = (now - pingStart) / 1000;
      pings.forEach((m, i) => {
        const tt = t - i * 0.9; const local = tt > 0 ? (tt % 3.2) / 3.2 : -1;
        const run = tt > 0 && tt < 6.4;
        m.visible = run; if (run) { m.scale.setScalar(2.5 + local * 14); m.material.opacity = 0.8 * (1 - local); }
      });
      pingActive = t < 7;
    } else { pingStart = -1; pings.forEach((m) => (m.visible = false)); }

    renderer.render(scene, camera);
    emitStage();
    if (sDisp !== sTarget || streak > 0 || pingActive || Math.abs(mouse.tx - mouse.x) > 0.002 || Math.abs(mouse.ty - mouse.y) > 0.002) request();
  }
  function request() { if (enabled && !raf) raf = requestAnimationFrame(tick); }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 1.75);
    vw = window.innerWidth; vh = window.innerHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(vw, vh, false);
    uniforms.uPx.value = dpr;
    camera.aspect = vw / vh; camera.updateProjectionMatrix();
    measure();
    sDisp = stageAt(window.scrollY).s;
    request();
  }

  /* ----- picking (click a planet to say hello) ----- */
  const ray = new Raycaster(); const ndc = new Vector2();
  function pickAt(cx, cy) {
    if (!enabled) return null;
    const idx = Math.round(sDisp); if (sDisp !== idx || !pickables[idx]) return null;
    ndc.set((cx / vw) * 2 - 1, -(cy / vh) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(pickables[idx], false).length === 0) return null;
    const c = new Vector3(); pickables[idx].getWorldPosition(c);
    const r = (pickables[idx].geometry.parameters.radius) || 1;
    const edge = c.clone().add(new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(r));
    const a = c.clone().project(camera), b = edge.project(camera);
    const x = (a.x * 0.5 + 0.5) * vw, y = (-a.y * 0.5 + 0.5) * vh;
    return { index: idx, x, y, r: Math.abs((b.x - a.x) * 0.5 * vw) };
  }
  function centerOf(idx) {
    if (!pickables[idx]) return null;
    const c = new Vector3(); pickables[idx].getWorldPosition(c);
    const r = pickables[idx].geometry.parameters.radius || 1;
    const edge = c.clone().add(new Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(r));
    const a = c.clone().project(camera), b = edge.project(camera);
    return { index: idx, x: (a.x * 0.5 + 0.5) * vw, y: (-a.y * 0.5 + 0.5) * vh, r: Math.abs((b.x - a.x) * 0.5 * vw) };
  }

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", resize);
  if (!reduce) window.addEventListener("pointermove", (e) => { mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2; mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2; request(); }, { passive: true });
  if ("ResizeObserver" in window) new ResizeObserver(() => { measure(); request(); }).observe(document.body);
  document.addEventListener("visibilitychange", () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } else request(); });

  resize();
  sDisp = sTarget = stageAt(window.scrollY).s; applyCamera(sDisp); renderer.render(scene, camera);

  return {
    request, measure: () => { measure(); request(); },
    setEnabled(on) { enabled = on; if (on) { measure(); sDisp = stageAt(window.scrollY).s; request(); } else if (raf) { cancelAnimationFrame(raf); raf = 0; } },
    onStage(cb) { stageCbs.push(cb); },
    pickAt, centerOf,
  };
}
