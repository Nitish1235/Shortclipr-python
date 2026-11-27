/* ShortClipr deterministic 2D motion-graphics toolkit, visualography engine, and transition helpers. */
(() => {
'use strict';
if (window.ShortcliprStyles) return;

const palettes = {
    'paper-cutout': {
        bg: '#f2ead8', bg2: '#e4d6bb', ink: '#2c2722', paper: '#fff8e9',
        primary: '#547f77', shadow: 'rgba(45,35,25,.24)', accent: '#d86b45', secondary: '#547f77', highlight: '#fffdf7',
    },
    risograph: {
        bg: '#f4ecd9', bg2: '#e7dcc2', ink: '#25223b', paper: '#fff9e9',
        primary: '#287f83', shadow: 'rgba(30,25,40,.20)', accent: '#ef5b45', secondary: '#287f83', highlight: '#fffdf5',
    },
    comic: {
        bg: '#fff3d6', bg2: '#f5dfad', ink: '#171717', paper: '#fffdf5',
        primary: '#2474bd', shadow: 'rgba(0,0,0,.24)', accent: '#e84437', secondary: '#2474bd', highlight: '#ffffff',
    },
    '70s-poster': {
        bg: '#f0dfbd', bg2: '#dec598', ink: '#3d3028', paper: '#fff0d2',
        primary: '#4d6f64', shadow: 'rgba(55,35,20,.24)', accent: '#c85a36', secondary: '#4d6f64', highlight: '#fff7e4',
    },
    engraving: {
        bg: '#f1eadb', bg2: '#e2d7c2', ink: '#2a2722', paper: '#faf5e9',
        primary: '#5c6854', shadow: 'rgba(30,25,20,.18)', accent: '#8b4937', secondary: '#5c6854', highlight: '#fffdf8',
    },
    blueprint: {
        bg: '#0e2845', bg2: '#163c66', ink: '#f1f4e8', paper: '#1a4572',
        primary: '#78c9d0', shadow: 'rgba(4,12,24,.36)', accent: '#f2c86a', secondary: '#78c9d0', highlight: '#ffffff',
    },
    line: {
        bg: '#f8f7f1', bg2: '#ece9de', ink: '#202628', paper: '#ffffff',
        primary: '#557d79', shadow: 'rgba(0,0,0,.14)', accent: '#d56b4b', secondary: '#557d79', highlight: '#ffffff',
    },
    'pixel-art': {
        bg: '#162030', bg2: '#22334a', ink: '#f2f0d5', paper: '#283c54',
        primary: '#69c5a6', shadow: 'rgba(0,0,0,.38)', accent: '#f2b84b', secondary: '#69c5a6', highlight: '#ffffff',
    },
    'cinematic-editorial': {
        bg: '#1b232b', bg2: '#2b3844', ink: '#f4efe4', paper: '#f5efe2',
        primary: '#59948c', shadow: 'rgba(10,15,20,.34)', accent: '#e06343', secondary: '#59948c', highlight: '#fff6e5',
    },
    'isometric-technical': {
        bg: '#e6ecf0', bg2: '#d2dde4', ink: '#223342', paper: '#f9fbfa',
        primary: '#44848c', shadow: 'rgba(20,38,50,.22)', accent: '#e17b42', secondary: '#44848c', highlight: '#ffffff',
    },
    'layered-paper': {
        bg: '#efe5d3', bg2: '#dfd0b6', ink: '#3b322a', paper: '#fff8e9',
        primary: '#6b8c81', shadow: 'rgba(54,38,24,.26)', accent: '#d36f50', secondary: '#6b8c81', highlight: '#fffdf7',
    },
};

let customPalette = null;
let customMood = null;

function setCustomPalette(p, mood = null) {
    if (p && typeof p === 'object') {
        customPalette = {};
        for (const key of ['bg', 'bg2', 'ink', 'paper', 'primary', 'accent', 'secondary', 'shadow', 'highlight']) {
            if (typeof p[key] === 'string' && p[key].trim()) {
                customPalette[key] = p[key].trim();
            }
        }
    }
    if (typeof mood === 'string' && mood) {
        customMood = mood;
    }
    return customPalette;
}

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (v) => { v = clamp(v); return v * v * (3 - 2 * v); };
const pixelSnap = (v, size = 1) => Math.round(v / Math.max(1, size)) * Math.max(1, size);
const isCtx = (g) => Boolean(g && typeof g.save === 'function');

function palette(id) {
    if (id && typeof id === 'object') return { ...palettes['cinematic-editorial'], ...id };
    if (customPalette) return { ...(palettes[id] || palettes['cinematic-editorial']), ...customPalette };
    return palettes[id] || palettes['cinematic-editorial'];
}

/* Cached deterministic subtle film/paper grain tile so 30fps renders stay fast. */
let grainCanvas = null;
function getGrainTile() {
    if (grainCanvas) return grainCanvas;
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 160;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(160, 160);
    const rand = typeof Motion !== 'undefined' && Motion.rng ? Motion.rng('shortclipr-grain-v1') : () => 0.5;
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.floor(rand() * 255);
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 20;
    }
    ctx.putImageData(img, 0, 0);
    grainCanvas = c;
    return c;
}

/* Rich multi-stop studio backdrop with mood-aware ambient lighting. */
function backdrop(g, id, env, t = 0, mood = null) {
    const p = palette(id);
    if (!isCtx(g) || !env) return p;
    const activeMood = mood || customMood || '';
    g.save();
    const grad = g.createLinearGradient(0, -env.H * 0.25, 0, env.H * 1.25);
    grad.addColorStop(0, p.bg);
    grad.addColorStop(1, p.bg2 || p.bg);
    g.fillStyle = grad;
    g.fillRect(-env.W * 0.5, -env.H * 0.5, env.W * 2, env.H * 2);

    // Subtle moving atmospheric light pool
    const lx = env.W * (0.5 + Math.sin(t * 0.25) * 0.08);
    const ly = env.H * (0.32 + Math.cos(t * 0.2) * 0.05);
    const r = Math.max(env.W, env.H) * 0.68;
    const glowGrad = g.createRadialGradient(lx, ly, 0, lx, ly, r);
    const isDark = id === 'blueprint' || id === 'pixel-art' || id === 'cinematic-editorial'
        || activeMood === 'dramatic_rim_glow' || activeMood === 'neon_bloom' || activeMood === 'moody_volumetric';
    if (activeMood === 'neon_bloom') {
        glowGrad.addColorStop(0, 'rgba(120,210,255,0.14)');
    } else if (activeMood === 'warm_sunlit_shadows') {
        glowGrad.addColorStop(0, 'rgba(255,220,150,0.26)');
    } else {
        glowGrad.addColorStop(0, isDark ? 'rgba(255,245,220,0.10)' : 'rgba(255,255,255,0.28)');
    }
    glowGrad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glowGrad;
    g.fillRect(-env.W * 0.5, -env.H * 0.5, env.W * 2, env.H * 2);

    if (id === 'blueprint' || activeMood === 'technical_clean') {
        g.strokeStyle = isDark ? 'rgba(210,235,245,.09)' : 'rgba(30,55,75,.06)';
        g.lineWidth = 1;
        for (let x = 0; x <= env.W; x += 40) {
            g.beginPath(); g.moveTo(x, 0); g.lineTo(x, env.H); g.stroke();
        }
        for (let y = 0; y <= env.H; y += 40) {
            g.beginPath(); g.moveTo(0, y); g.lineTo(env.W, y); g.stroke();
        }
    }
    g.restore();
    return p;
}

/* Backward-compatible paperBackground alias backed by rich backdrop(). */
function paperBackground(g, id, env) {
    return backdrop(g, id, env, 0);
}

function paperShadow(g, x, y, blur = 12, color = 'rgba(30,20,10,.18)') {
    if (!isCtx(g)) return;
    g.shadowColor = color;
    g.shadowBlur = Number.isFinite(blur) ? Math.max(0, blur) : 12;
    g.shadowOffsetX = Number.isFinite(x) ? x * 0.0 : 0;
    g.shadowOffsetY = (Number.isFinite(blur) ? Math.max(0, blur) : 12) * 0.45;
}

function halftone(g, x, y, w, h, spacing = 12, color = 'rgba(20,20,20,.18)') {
    if (!isCtx(g) || !(w > 0) || !(h > 0)) return;
    const step = Math.max(4, spacing);
    g.save();
    g.fillStyle = color;
    for (let yy = y; yy < y + h; yy += step) {
        for (let xx = x; xx < x + w; xx += step) {
            g.beginPath();
            g.arc(xx, yy, Math.max(0.7, step * 0.075), 0, Math.PI * 2);
            g.fill();
        }
    }
    g.restore();
}

function camera(g, env, o = {}) {
    if (!isCtx(g) || !env) return;
    const W = Math.max(1, Number(env.W) || 900);
    const H = Math.max(1, Number(env.H) || 1600);
    const rotation = Number(o.rotation) || 0;
    const absRot = Math.abs(rotation);
    const aspectMax = Math.max(W / H, H / W);
    const minRotZoom = absRot > 0.001 ? (Math.cos(absRot) + Math.sin(absRot) * aspectMax) * 1.03 : 1;
    const rawCx = Number.isFinite(o.cx) ? o.cx : W / 2;
    const rawCy = Number.isFinite(o.cy) ? o.cy : H / 2;
    // Allow smooth camera pans up to ±18% of canvas size even if zoom=1 was passed,
    // automatically scaling zoom slightly so 0..W backgrounds/floors never expose edges.
    const panX = clamp(rawCx - W / 2, -W * 0.18, W * 0.18);
    const panY = clamp(rawCy - H / 2, -H * 0.18, H * 0.18);
    const minPanZoom = 1 / Math.max(0.55, 1 - 2 * Math.max(Math.abs(panX) / W, Math.abs(panY) / H));
    const zoom = clamp(Math.max(1, Number(o.zoom) || 1, minRotZoom, minPanZoom), 1, 4);
    const maxPanX = Math.max(0, (W / 2) * (1 - minRotZoom / zoom));
    const maxPanY = Math.max(0, (H / 2) * (1 - minRotZoom / zoom));
    const cx = clamp(W / 2 + panX, W / 2 - maxPanX, W / 2 + maxPanX);
    const cy = clamp(H / 2 + panY, H / 2 - maxPanY, H / 2 + maxPanY);
    g.translate(W / 2, H / 2);
    g.rotate(rotation);
    g.scale(zoom, zoom);
    g.translate(-cx, -cy);
}

/* Smooth camera rig with optional deterministic impact shake. */
function cameraRig(g, env, o = {}) {
    camera(g, env, o);
    if (o.shake && o.shake > 0 && typeof Motion !== 'undefined' && Motion.shake) {
        Motion.shake(g, o.shake, Number(o.t) || 0);
    }
}

/* True multi-plane parallax camera with depth-scaled movement & optional depth-of-field blur. */
function parallaxLayers(g, env, camState = {}, layers = []) {
    if (!isCtx(g) || !env || !Array.isArray(layers)) return;
    const W = Math.max(1, Number(env.W) || 900);
    const H = Math.max(1, Number(env.H) || 1600);
    const cx = Number.isFinite(camState.cx) ? camState.cx : W / 2;
    const cy = Number.isFinite(camState.cy) ? camState.cy : H / 2;
    const zoom = clamp(Math.max(1, Number(camState.zoom) || 1), 1, 3.5);
    const rot = Number(camState.rotation) || 0;
    const dx = cx - W / 2;
    const dy = cy - H / 2;
    const aspectMax = Math.max(W / H, H / W);

    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (!layer || typeof layer.draw !== 'function') continue;
        const depth = Number.isFinite(layer.depth) ? layer.depth : 1.0;
        const layerRot = rot * depth;
        const absRot = Math.abs(layerRot);
        const minRotZoom = absRot > 0.001 ? (Math.cos(absRot) + Math.sin(absRot) * aspectMax) * 1.03 : 1;
        const layerPanX = clamp(dx * depth, -W * 0.18, W * 0.18);
        const layerPanY = clamp(dy * depth, -H * 0.18, H * 0.18);
        const minPanZoom = 1 / Math.max(0.55, 1 - 2 * Math.max(Math.abs(layerPanX) / W, Math.abs(layerPanY) / H));
        const layerZoom = Math.max(1, 1 + (zoom - 1) * depth, minRotZoom, minPanZoom);
        const maxPanX = Math.max(0, (W / 2) * (1 - minRotZoom / layerZoom));
        const maxPanY = Math.max(0, (H / 2) * (1 - minRotZoom / layerZoom));
        const lx = clamp(W / 2 + layerPanX, W / 2 - maxPanX, W / 2 + maxPanX);
        const ly = clamp(H / 2 + layerPanY, H / 2 - maxPanY, H / 2 + maxPanY);
        g.save();
        if (layer.blur && layer.blur > 0) {
            g.filter = `blur(${Number(layer.blur)}px)`;
        }
        if (Number.isFinite(layer.alpha)) {
            g.globalAlpha *= clamp(layer.alpha, 0, 1);
        }
        g.translate(W / 2, H / 2);
        g.rotate(layerRot);
        g.scale(layerZoom, layerZoom);
        g.translate(-lx, -ly);
        layer.draw(g);
        g.restore();
    }
}

/* Studio-grade damped harmonic spring (0 -> 1 with crisp settle). */
function spring(t, start = 0, stiffness = 180, damping = 14) {
    const dt = t - start;
    if (dt <= 0) return 0;
    const omega = Math.sqrt(Math.max(1, stiffness));
    const zeta = clamp(damping / (2 * omega), 0.15, 1.5);
    if (zeta < 1) {
        const wd = omega * Math.sqrt(1 - zeta * zeta);
        const val = 1 - Math.exp(-zeta * omega * dt) * (Math.cos(wd * dt) + (zeta * omega / wd) * Math.sin(wd * dt));
        return Math.abs(1 - val) < 0.001 && dt > 0.8 ? 1 : val;
    }
    return 1 - Math.exp(-omega * dt) * (1 + omega * dt);
}

/* Staggered 0..1 progress for item `index` (prevents simultaneous t=0 pop-ins). */
function stagger(t, index = 0, step = 0.09, start = 0, duration = 0.45, easeFn = null) {
    const itemStart = start + Math.max(0, Number(index) || 0) * Math.max(0, Number(step) || 0.09);
    const dur = Math.max(0.05, Number(duration) || 0.45);
    const u = clamp((t - itemStart) / dur, 0, 1);
    if (typeof easeFn === 'function') return easeFn(u);
    // Default cubic-out with mild overshoot
    const c1 = 1.35, c3 = c1 + 1;
    return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
}

/* Disney anticipation curve: winds back slightly (-pull) before springing to 1.0. */
function anticipation(t, start = 0, duration = 0.55, pull = 0.14) {
    const dur = Math.max(0.08, Number(duration) || 0.55);
    const u = clamp((t - start) / dur, 0, 1);
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    if (u < 0.28) {
        const p = u / 0.28;
        return -pull * Math.sin(p * Math.PI);
    }
    const p = (u - 0.28) / 0.72;
    const c1 = 1.45, c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
}

/* Posterize time to a target frame rate (e.g. 12fps for tactile stop-motion/comic feel). */
function posterize(t, fps = 12) {
    const rate = Math.max(1, Number(fps) || 12);
    return Math.floor((Number(t) || 0) * rate) / rate;
}

/* Volume-preserving squash & stretch transform around contact point (x, y). */
function squash(g, x, y, amount = 0) {
    if (!isCtx(g)) return;
    const a = clamp(Number(amount) || 0, -0.55, 0.75);
    const sx = 1 + a;
    const sy = 1 / Math.max(0.35, sx);
    g.translate(x, y);
    g.scale(sx, sy);
    g.translate(-x, -y);
}

/* Analytical 2-Bone Inverse Kinematics solver (Law of Cosines) for limbs/joints.
   Returns joint { jx, jy, x1, y1 }, end { ex, ey, x2, y2 }, and angles { a1, a2 }. */
function solveIK(x0, y0, tx, ty, L1 = 60, L2 = 60, bendDir = 1) {
    const len1 = Math.max(1, Number(L1) || 60);
    const len2 = Math.max(1, Number(L2) || 60);
    const dx = tx - x0;
    const dy = ty - y0;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const maxReach = (len1 + len2) * 0.9999;
    const minReach = Math.abs(len1 - len2) + 0.0001;
    const clampedDist = clamp(dist, minReach, maxReach);
    const ex = x0 + (dx / dist) * clampedDist;
    const ey = y0 + (dy / dist) * clampedDist;

    const baseAngle = Math.atan2(ey - y0, ex - x0);
    const cosAngle1 = clamp(
        (clampedDist * clampedDist + len1 * len1 - len2 * len2) / (2 * clampedDist * len1),
        -1, 1
    );
    const angle1 = Math.acos(cosAngle1);
    const dir = bendDir >= 0 ? 1 : -1;
    const a1 = baseAngle + angle1 * dir;
    const jx = x0 + Math.cos(a1) * len1;
    const jy = y0 + Math.sin(a1) * len1;
    const a2 = Math.atan2(ey - jy, ex - jx);
    return { jx, jy, x1: jx, y1: jy, ex, ey, x2: ex, y2: ey, a1, a2 };
}

/* Stylized, non-stickman articulated 2D character rig (side/3-4 profile with 2-bone IK limbs).
   Origin (x, y) is the ground contact point between the feet. At scale=1, height is ~260 logical px.
   Returns world-space anchor points { head, rightHand, leftHand, shoulder, hip, ground, facing, scale }
   so custom character helpers can attach hats/gear/held props directly to the hands or head. */
function drawCharacterRig(g, x, y, opts = {}) {
    const scale = Number.isFinite(opts.scale) ? opts.scale : 1;
    const facing = opts.facing === -1 ? -1 : 1;
    const toWorld = (lx, ly) => ({ x: (Number(x) || 0) + facing * scale * lx, y: (Number(y) || 0) + scale * ly });
    if (!isCtx(g)) {
        return {
            head: toWorld(0, -196), rightHand: toWorld(48, -120), leftHand: toWorld(-32, -120),
            shoulder: toWorld(0, -174), hip: toWorld(0, -98), ground: { x: Number(x) || 0, y: Number(y) || 0 },
            facing, scale,
        };
    }
    const pose = String(opts.pose || 'idle');
    const expression = String(opts.expression || 'determined');
    const t = Number(opts.t) || 0;
    const speed = Number(opts.speed) || 5.2;
    const skin = opts.skin || '#f2c6a0';
    const coat = opts.coat || '#d86b45';
    const pants = opts.pants || '#2e3a46';
    const hair = opts.hair || '#231f20';
    const accent = opts.accent || '#f2b84b';
    const boot = opts.boot || '#1c1f24';

    const phase = t * speed;
    const isSeated = pose === 'sit';
    const isMoving = !isSeated && (pose === 'walk' || pose === 'run' || pose === 'wade');
    const stride = pose === 'run' ? 46 : pose === 'walk' ? 32 : pose === 'wade' ? 24 : 0;
    const lift = pose === 'run' ? 28 : pose === 'walk' ? 18 : pose === 'wade' ? 22 : 0;
    const crouchDrop = pose === 'crouch' ? 24 : 0;
    const bob = isMoving ? Math.abs(Math.sin(phase)) * (pose === 'run' ? 11 : 6) : Math.sin(t * 2.4) * (isSeated ? 1.4 : 2.5);
    const defaultLean = (
        pose === 'push' ? 0.34
        : pose === 'pull' ? -0.26
        : pose === 'run' ? 0.22
        : pose === 'wade' ? 0.16
        : pose === 'crouch' ? 0.24
        : pose === 'sit' ? 0.14
        : pose === 'walk' ? 0.08
        : Math.sin(t * 1.8) * 0.025
    );
    const lean = Number.isFinite(opts.lean) ? opts.lean : defaultLean;
    const sway = Math.sin(t * 3.1) * 3.5;

    // Grounded foot targets in local space (y = 0 is floor)
    const lPhase = Math.sin(phase);
    const rPhase = Math.sin(phase + Math.PI);
    const lfX = isSeated ? 40 : isMoving ? lPhase * stride : (pose === 'push' ? -24 : pose === 'pull' ? 22 : -13);
    const lfY = isSeated ? -4 : isMoving ? -Math.max(0, Math.cos(phase)) * lift : 0;
    const rfX = isSeated ? 54 : isMoving ? rPhase * stride : (pose === 'push' ? 20 : pose === 'pull' ? -20 : 14);
    const rfY = isSeated ? -4 : isMoving ? -Math.max(0, Math.cos(phase + Math.PI)) * lift : 0;

    const hipX = isSeated ? -10 : 0;
    const hipY = (isSeated ? -62 : -98) - bob + crouchDrop;
    const shoulderX = hipX + Math.sin(lean) * 76;
    const shoulderY = hipY - Math.cos(lean) * 76;

    // Hand targets by pose
    let lhX, lhY, rhX, rhY;
    if (isSeated) {
        lhX = shoulderX + 54; lhY = shoulderY + 42 + Math.sin(t * 5) * 2;
        rhX = shoulderX + 64; rhY = shoulderY + 46 + Math.cos(t * 5) * 2;
    } else if (pose === 'push') {
        lhX = shoulderX + 68; lhY = shoulderY + 6 + Math.sin(t * 4) * 3;
        rhX = shoulderX + 76; rhY = shoulderY + 14 + Math.cos(t * 4) * 3;
    } else if (pose === 'pull') {
        lhX = shoulderX + 58; lhY = shoulderY + 18 + Math.sin(t * 4.5) * 3;
        rhX = shoulderX + 46; rhY = shoulderY + 24;
    } else if (pose === 'point' || pose === 'reach') {
        lhX = shoulderX - 18; lhY = shoulderY + 52;
        rhX = shoulderX + 78; rhY = shoulderY - 14 + Math.sin(t * 3) * 3;
    } else if (pose === 'hold') {
        lhX = shoulderX - 14; lhY = shoulderY + 48;
        rhX = shoulderX + 56; rhY = shoulderY - 8 + Math.sin(t * 2.6) * 2.5;
    } else if (pose === 'celebrate') {
        lhX = shoulderX - 42; lhY = shoulderY - 62 + Math.sin(t * 6) * 6;
        rhX = shoulderX + 48; rhY = shoulderY - 66 + Math.cos(t * 6) * 6;
    } else {
        const swing = isMoving ? lPhase * (pose === 'run' ? 42 : 26) : Math.sin(t * 2.1) * 5;
        lhX = shoulderX - swing; lhY = shoulderY + 56 - Math.abs(swing) * 0.18;
        rhX = shoulderX + swing; rhY = shoulderY + 56 - Math.abs(swing) * 0.18;
    }

    const lLeg = solveIK(hipX - 6, hipY, lfX, lfY - 6, 52, 52, 1);
    const rLeg = solveIK(hipX + 6, hipY, rfX, rfY - 6, 52, 52, 1);
    const lArm = solveIK(shoulderX - 4, shoulderY + 8, lhX, lhY, 38, 36, -1);
    const rArm = solveIK(shoulderX + 6, shoulderY + 8, rhX, rhY, 38, 36, -1);

    const drawLimb = (ctx, ax, ay, jx, jy, ex, ey, w1, w2, color, tipColor, tipR, isLeg = false) => {
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.lineWidth = w1;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(jx, jy); ctx.stroke();
        ctx.lineWidth = w2;
        ctx.beginPath(); ctx.moveTo(jx, jy); ctx.lineTo(ex, ey); ctx.stroke();
        if (tipColor) {
            ctx.fillStyle = tipColor;
            ctx.beginPath();
            if (isLeg) {
                ctx.ellipse(ex + 4, ey + 2, tipR * 1.25, tipR * 0.78, 0, 0, Math.PI * 2);
            } else {
                ctx.arc(ex, ey, tipR, 0, Math.PI * 2);
            }
            ctx.fill();
        }
        ctx.restore();
    };

    g.save();
    g.translate(x, y);
    g.scale(facing * scale, scale);

    // Ground contact shadow
    g.fillStyle = 'rgba(15,20,28,0.26)';
    g.beginPath(); g.ellipse(0, 4, 46, 11, 0, 0, Math.PI * 2); g.fill();

    // Back arm & back leg (slightly darkened for depth separation)
    g.save(); g.globalAlpha = 0.86;
    drawLimb(g, shoulderX - 4, shoulderY + 8, lArm.jx, lArm.jy, lArm.ex, lArm.ey, 15, 12, coat, skin, 8, false);
    drawLimb(g, hipX - 6, hipY, lLeg.jx, lLeg.jy, lLeg.ex, lLeg.ey, 19, 15, pants, boot, 9, true);
    g.restore();

    // Front leg
    drawLimb(g, hipX + 6, hipY, rLeg.jx, rLeg.jy, rLeg.ex, rLeg.ey, 20, 16, pants, boot, 10, true);

    // Tapered stylized torso / coat with 3-value directional gradient & secondary hem sway
    g.save();
    g.translate(hipX, hipY);
    g.rotate(lean);
    const torsoGrad = g.createLinearGradient(-26, -86, 28, 12);
    torsoGrad.addColorStop(0, coat);
    torsoGrad.addColorStop(0.65, coat);
    torsoGrad.addColorStop(1, '#1d222b');
    shadedShape(g, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(-23 + sway * 0.35, 8);
        ctx.quadraticCurveTo(-29, -40, -21, -80);
        ctx.quadraticCurveTo(0, -90, 22, -78);
        ctx.quadraticCurveTo(29, -36, 25 + sway * 0.45, 8);
        ctx.closePath();
    }, { fill: torsoGrad, shadowBlur: 12, shadowY: 5, highlight: 'rgba(255,255,255,0.30)', highlightWidth: 3 });
    // Belt + collar scarf/lapel accent with secondary motion
    g.fillStyle = accent;
    g.beginPath();
    if (g.roundRect) g.roundRect(-24, -9, 48, 9, 4);
    else g.rect(-24, -9, 48, 9);
    g.fill();
    g.beginPath();
    g.moveTo(-16, -77);
    g.quadraticCurveTo(2, -68, 18, -76);
    g.lineTo(14, -66);
    g.quadraticCurveTo(0, -61, -18 - sway * 0.6, -68);
    g.closePath();
    g.fill();
    g.restore();

    // Head (3/4 profile, expressive brow + eye specular + mouth + layered hair silhouette)
    const headX = shoulderX + Math.sin(lean) * 28;
    const headY = shoulderY - Math.cos(lean) * 28 - 6;
    g.save();
    g.translate(headX, headY);
    g.rotate(lean * 0.45);
    shadedShape(g, (ctx) => {
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2);
    }, { fill: skin, shadowBlur: 10, shadowY: 4, highlight: 'rgba(255,255,255,0.34)' });
    // Stylized hair cap with volume tuft
    g.fillStyle = hair;
    g.beginPath();
    g.arc(-3, -5, 25.5, Math.PI * 0.68, Math.PI * 2.10);
    g.quadraticCurveTo(16, -18, 6, -9);
    g.quadraticCurveTo(-4, -14, -15, -3);
    g.closePath();
    g.fill();
    // Expressive eye (with periodic deterministic blink + white specular dot)
    const blinkCycle = (t % 3.4);
    const blinking = blinkCycle > 3.24 && blinkCycle < 3.36;
    g.fillStyle = '#1b1d21';
    if (blinking) {
        g.fillRect(8, -2, 8, 2.5);
    } else {
        g.beginPath(); g.ellipse(12, -2, 3.4, 4.6, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath(); g.arc(13.2, -3.5, 1.3, 0, Math.PI * 2); g.fill();
    }
    // Expressive eyebrow & mouth
    g.strokeStyle = hair;
    g.lineWidth = 2.4;
    g.lineCap = 'round';
    g.beginPath();
    if (expression === 'surprised') {
        g.moveTo(7, -10); g.quadraticCurveTo(12, -13, 17, -9);
    } else if (expression === 'happy' || pose === 'celebrate') {
        g.moveTo(7, -9); g.quadraticCurveTo(12, -11, 17, -8);
    } else {
        g.moveTo(7, -9); g.lineTo(17, -7);
    }
    g.stroke();

    g.strokeStyle = '#5c3828';
    g.lineWidth = 2.0;
    g.beginPath();
    if (expression === 'surprised') {
        g.arc(13, 10, 3.2, 0, Math.PI * 2);
    } else if (expression === 'happy' || pose === 'celebrate') {
        g.arc(11, 8, 5, 0.1 * Math.PI, 0.85 * Math.PI);
    } else {
        g.moveTo(8, 10); g.quadraticCurveTo(12, 9, 16, 10.5);
    }
    g.stroke();
    g.restore();

    // Front arm
    drawLimb(g, shoulderX + 6, shoulderY + 8, rArm.jx, rArm.jy, rArm.ex, rArm.ey, 16, 13, coat, skin, 8.5, false);

    g.restore();

    return {
        head: toWorld(headX, headY),
        rightHand: toWorld(rArm.ex, rArm.ey),
        leftHand: toWorld(lArm.ex, lArm.ey),
        shoulder: toWorld(shoulderX, shoulderY),
        hip: toWorld(hipX, hipY),
        ground: { x: Number(x) || 0, y: Number(y) || 0 },
        facing,
        scale,
    };
}

/* Smoothly trace/reveal any polyline path from 0 -> 1 (SVG stroke-dashoffset equivalent). */
function strokeReveal(g, points, progress = 1, opts = {}) {
    if (!Array.isArray(points) || points.length < 2) return;
    flowPath(g, points, Number(opts.t) || 0, {
        progress,
        color: opts.color || opts.stroke || '#e06343',
        width: opts.width || opts.lineWidth || 5,
        dashed: opts.dashed || false,
        speed: opts.speed || 60,
        glow: opts.glow || 0,
        arrow: Boolean(opts.arrow),
        arrowSize: opts.arrowSize,
    });
}

/* Tactile hand-crafted path with deterministic Motion.noise1 micro-jitter. */
function organicPath(g, points, seed = 'organic', opts = {}) {
    if (!isCtx(g) || !Array.isArray(points) || points.length < 2) return;
    const roughness = Number.isFinite(opts.roughness) ? opts.roughness : 2.5;
    const closed = Boolean(opts.closed);
    const noiseFn = typeof Motion !== 'undefined' && Motion.noise1
        ? Motion.noise1
        : (_s, x) => Math.sin(x * 3.7);

    const buildPath = (ctx) => {
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            const next = points[(i + 1) % points.length];
            const px = points[i][0] + noiseFn(String(seed) + '_x', i * 1.7) * roughness;
            const py = points[i][1] + noiseFn(String(seed) + '_y', i * 1.7) * roughness;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
            if (i < points.length - 1 || closed) {
                const mx = (points[i][0] + next[0]) * 0.5 + noiseFn(String(seed) + '_mx', i * 2.3) * roughness * 0.7;
                const my = (points[i][1] + next[1]) * 0.5 + noiseFn(String(seed) + '_my', i * 2.3) * roughness * 0.7;
                ctx.lineTo(mx, my);
            }
        }
        if (closed) ctx.closePath();
    };

    if (opts.fill || opts.shadow) {
        shadedShape(g, buildPath, {
            fill: opts.fill,
            stroke: opts.stroke,
            lineWidth: opts.lineWidth || opts.width || 2.5,
            shadow: opts.shadow !== false,
            shadowColor: opts.shadowColor,
            shadowBlur: opts.shadowBlur,
            shadowY: opts.shadowY,
            highlight: opts.highlight,
        });
    } else {
        g.save();
        buildPath(g);
        g.strokeStyle = opts.stroke || opts.color || '#2c2722';
        g.lineWidth = Number(opts.lineWidth || opts.width) || 2.5;
        g.lineCap = 'round';
        g.lineJoin = 'round';
        g.stroke();
        g.restore();
    }
}

/* Decaying impact shake magnitude for high-energy collisions or reveals. */
function impactShake(t, at = 0, strength = 14, decay = 9) {
    const dt = (Number(t) || 0) - (Number(at) || 0);
    if (dt < 0 || dt > 0.9) return 0;
    return (Number(strength) || 14) * Math.exp(-dt * Math.max(1, Number(decay) || 9));
}

/* Radial or linear anime/action speed lines (use ONLY on high-energy action/rush beats). */
function speedLines(g, env, t = 0, opts = {}) {
    if (!isCtx(g) || !env) return;
    const mode = opts.mode || 'radial'; // radial | linear
    const count = clamp(Math.round(Number(opts.count) || 36), 8, 90);
    const alpha = clamp(Number.isFinite(opts.alpha) ? opts.alpha : 0.35, 0, 1);
    if (alpha <= 0.005) return;
    const color = opts.color || '#ffffff';
    const rand = typeof Motion !== 'undefined' && Motion.rng ? Motion.rng(opts.seed || 'speed-lines') : () => 0.5;
    const stepT = Math.floor((Number(t) || 0) * 18); // crisp 18fps comic/anime streak rhythm

    g.save();
    g.globalCompositeOperation = 'screen';
    g.strokeStyle = color;
    g.lineCap = 'round';
    if (mode === 'linear') {
        const angle = Number(opts.angle) || 0;
        g.translate(env.W / 2, env.H / 2);
        g.rotate(angle);
        const span = Math.hypot(env.W, env.H);
        for (let i = 0; i < count; i++) {
            const y = (rand() - 0.5) * span;
            const len = 140 + rand() * 340;
            const x = (((rand() * span + (Number(t) || 0) * (1200 + rand() * 900)) % span) - span / 2);
            g.globalAlpha = alpha * (0.35 + rand() * 0.65);
            g.lineWidth = 1.5 + rand() * 3.5;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + len, y);
            g.stroke();
        }
    } else {
        const cx = Number.isFinite(opts.cx) ? opts.cx : env.W / 2;
        const cy = Number.isFinite(opts.cy) ? opts.cy : env.H / 2;
        const outerR = Math.hypot(env.W, env.H) * 0.72;
        const innerR = Number.isFinite(opts.innerR) ? opts.innerR : Math.min(env.W, env.H) * 0.28;
        for (let i = 0; i < count; i++) {
            const baseA = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.08 + stepT * 0.03;
            const r0 = innerR * (0.85 + rand() * 0.45);
            const r1 = outerR;
            g.globalAlpha = alpha * (0.3 + rand() * 0.7);
            g.lineWidth = 1.5 + rand() * 4;
            g.beginPath();
            g.moveTo(cx + Math.cos(baseA) * r0, cy + Math.sin(baseA) * r0);
            g.lineTo(cx + Math.cos(baseA) * r1, cy + Math.sin(baseA) * r1);
            g.stroke();
        }
    }
    g.restore();
}

/* Expanding volumetric dust/smoke burst + debris on heavy contact, landing, or launch. */
function dustBurst(g, x, y, t = 0, start = 0, opts = {}) {
    if (!isCtx(g)) return;
    const dt = (Number(t) || 0) - (Number(start) || 0);
    const dur = Math.max(0.15, Number(opts.duration) || 0.75);
    if (dt < 0 || dt > dur) return;
    const u = clamp(dt / dur, 0, 1);
    const out = 1 - Math.pow(1 - u, 3);
    const fade = 1 - u * u;
    const count = clamp(Math.round(Number(opts.count) || 12), 4, 32);
    const spread = Number(opts.spread) || 120;
    const color = opts.color || 'rgba(230,215,190,0.65)';
    const rand = typeof Motion !== 'undefined' && Motion.rng ? Motion.rng(opts.seed || `dust-${Math.round(x)}-${Math.round(y)}`) : () => 0.5;

    g.save();
    g.fillStyle = color;
    for (let i = 0; i < count; i++) {
        const ang = (opts.upward ? -Math.PI * (0.1 + rand() * 0.8) : rand() * Math.PI * 2);
        const dist = (0.35 + rand() * 0.85) * spread * out;
        const px = x + Math.cos(ang) * dist;
        const py = y + Math.sin(ang) * dist * (opts.upward ? 0.75 : 0.6) - u * 18;
        const r = (10 + rand() * 24) * (0.55 + out * 0.9);
        g.globalAlpha = clamp(fade * (0.45 + rand() * 0.55) * (opts.alpha ?? 1), 0, 1);
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fill();
    }
    g.restore();
}

/* Concussive 2-4 frame impact flash + expanding shockwave ring for climactic hits/breakthroughs. */
function impactFlash(g, env, t = 0, at = 0, opts = {}) {
    if (!isCtx(g) || !env) return;
    const dt = (Number(t) || 0) - (Number(at) || 0);
    const dur = Math.max(0.06, Number(opts.duration) || 0.28);
    if (dt < 0 || dt > dur) return;
    const u = clamp(dt / dur, 0, 1);
    const cx = Number.isFinite(opts.cx) ? opts.cx : env.W / 2;
    const cy = Number.isFinite(opts.cy) ? opts.cy : env.H / 2;
    const maxR = Number(opts.maxR) || Math.min(env.W, env.H) * 0.48;

    g.save();
    g.globalCompositeOperation = 'screen';
    // Brief bright flash in first 35% of impact
    if (u < 0.35) {
        g.globalAlpha = (1 - u / 0.35) * clamp(opts.flashAlpha ?? 0.42, 0, 0.85);
        g.fillStyle = opts.color || '#fff8e1';
        g.fillRect(0, 0, env.W, env.H);
    }
    // Crisp expanding shockwave ring
    const ringR = maxR * (1 - Math.pow(1 - u, 3));
    g.globalAlpha = (1 - u) * 0.85;
    g.strokeStyle = opts.ringColor || opts.color || '#ffe082';
    g.lineWidth = Math.max(2, (1 - u) * 18);
    g.beginPath();
    g.arc(cx, cy, ringR, 0, Math.PI * 2);
    g.stroke();
    g.restore();
}

/* Optical rack focus shifting depth-of-field blur between background (focusT=0) and foreground (focusT=1). */
function rackFocus(g, env, camState = {}, focusT = 0.5, bgDraw = null, fgDraw = null, maxBlur = 6) {
    const f = clamp(Number(focusT) || 0, 0, 1);
    const blurAmt = Math.max(1, Number(maxBlur) || 6);
    const layers = [];
    if (typeof bgDraw === 'function') {
        layers.push({ depth: 0.45, blur: f * blurAmt, draw: bgDraw });
    }
    if (typeof fgDraw === 'function') {
        layers.push({ depth: 1.15, blur: (1 - f) * blurAmt, draw: fgDraw });
    }
    parallaxLayers(g, env, camState, layers);
}

/* Volumetric additive ('screen') light beam / cone / flashlight shaft. */
function lightBeam(g, x0, y0, x1, y1, r0 = 16, r1 = 140, color = '#ffe8a3', alpha = 0.26) {
    if (!isCtx(g) || alpha <= 0 || !Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) return;
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const perp = angle + Math.PI / 2;
    const p0a = [x0 + Math.cos(perp) * r0, y0 + Math.sin(perp) * r0];
    const p0b = [x0 - Math.cos(perp) * r0, y0 - Math.sin(perp) * r0];
    const p1a = [x1 + Math.cos(perp) * r1, y1 + Math.sin(perp) * r1];
    const p1b = [x1 - Math.cos(perp) * r1, y1 - Math.sin(perp) * r1];

    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha *= clamp(alpha, 0, 1);
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(p0a[0], p0a[1]);
    g.lineTo(p1a[0], p1a[1]);
    g.lineTo(p1b[0], p1b[1]);
    g.lineTo(p0b[0], p0b[1]);
    g.closePath();
    g.fill();
    g.restore();
}

/* Selective additive bloom pass that preserves the active Canvas transform & clip. */
function bloomLayer(g, env, name, blurPx = 12, alpha = 0.55, drawFn = null) {
    if (!isCtx(g) || typeof drawFn !== 'function') return;
    // Draw crisp base pass
    g.save();
    drawFn(g);
    g.restore();
    // Draw blurred additive bloom pass directly in the active coordinate transform
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha *= clamp(alpha, 0, 1);
    g.filter = `blur(${Math.max(2, Number(blurPx) || 12)}px)`;
    drawFn(g);
    g.restore();
}

/* Draw any Canvas 2D path with cast shadow, rich fill/gradient, and optional rim highlight. */
function shadedShape(g, drawPath, opts = {}) {
    if (!isCtx(g) || typeof drawPath !== 'function') return;
    g.save();
    if (opts.shadow !== false) {
        g.shadowColor = opts.shadowColor || 'rgba(15,20,28,0.24)';
        g.shadowBlur = Number.isFinite(opts.shadowBlur) ? opts.shadowBlur : 16;
        g.shadowOffsetX = Number.isFinite(opts.shadowX) ? opts.shadowX : 0;
        g.shadowOffsetY = Number.isFinite(opts.shadowY) ? opts.shadowY : 8;
    }
    drawPath(g);
    if (opts.fill) {
        g.fillStyle = opts.fill;
        g.fill();
    }
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetX = 0;
    g.shadowOffsetY = 0;

    if (opts.highlight) {
        g.save();
        g.clip();
        g.strokeStyle = opts.highlight;
        g.lineWidth = Number.isFinite(opts.highlightWidth) ? opts.highlightWidth : 4;
        g.translate(0, 1.5);
        drawPath(g);
        g.stroke();
        g.restore();
    }
    if (opts.stroke) {
        drawPath(g);
        g.strokeStyle = opts.stroke;
        g.lineWidth = Number.isFinite(opts.lineWidth) ? opts.lineWidth : 2.5;
        g.lineJoin = 'round';
        g.lineCap = 'round';
        g.stroke();
    }
    g.restore();
}

/* Volumetric radial glow / focal light (uses additive 'screen' blend by default). */
function glow(g, x, y, r, color = '#ffdd99', alpha = 0.35) {
    if (!isCtx(g) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0 || alpha <= 0) return;
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha *= clamp(alpha, 0, 1);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
}

/* Sleek rounded motion-graphics card / container. */
function roundedCard(g, x, y, w, h, r = 18, opts = {}) {
    if (!isCtx(g) || !(w > 0) || !(h > 0)) return;
    const radius = Math.max(0, Math.min(Number(r) || 0, w / 2, h / 2));
    shadedShape(g, (ctx) => {
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, w, h, radius);
        } else {
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        }
    }, {
        fill: opts.fill || 'rgba(255,255,255,0.92)',
        stroke: opts.stroke || 'rgba(0,0,0,0.12)',
        lineWidth: opts.lineWidth || 2,
        shadowColor: opts.shadowColor || 'rgba(0,0,0,0.22)',
        shadowBlur: Number.isFinite(opts.shadowBlur) ? opts.shadowBlur : 20,
        shadowY: Number.isFinite(opts.shadowY) ? opts.shadowY : 10,
        highlight: opts.highlight,
    });
}

/* Crisp pill label/callout badge (auto-sized to text, clamped inside safe viewport margin). */
function badge(g, x, y, text, opts = {}) {
    const str = String(text ?? '');
    if (!isCtx(g) || !str) return;
    const fontSize = Number(opts.fontSize) || 26;
    const padX = Number(opts.padX) || 22;
    const padY = Number(opts.padY) || 12;
    g.save();
    g.font = `700 ${fontSize}px ${opts.font || '"Noto Sans", "Liberation Sans", sans-serif'}`;
    const metrics = g.measureText(str);
    const w = metrics.width + padX * 2;
    const h = fontSize + padY * 2;
    let rx = opts.align === 'left' ? x : opts.align === 'right' ? x - w : x - w / 2;
    let ry = y - h / 2;
    // Clamp inside logical canvas bounds with a 28px safe margin so labels never clip off-screen.
    const tr = typeof g.getTransform === 'function' ? g.getTransform() : null;
    const scaleX = tr ? Math.hypot(tr.a, tr.b) : 1;
    const scaleY = tr ? Math.hypot(tr.c, tr.d) : 1;
    const maxW = opts.env?.W || (g.canvas && scaleX > 0.01 ? g.canvas.width / scaleX : 0);
    const maxH = opts.env?.H || (g.canvas && scaleY > 0.01 ? g.canvas.height / scaleY : 0);
    const margin = 28;
    if (maxW > w + margin * 2) rx = clamp(rx, margin, maxW - w - margin);
    if (maxH > h + margin * 2) ry = clamp(ry, margin, maxH - h - margin);
    roundedCard(g, rx, ry, w, h, h / 2, {
        fill: opts.bg || '#1b232b',
        stroke: opts.border || 'rgba(255,255,255,0.16)',
        lineWidth: 2,
        shadowBlur: 14,
        shadowY: 6,
    });
    g.fillStyle = opts.color || '#f8f6ef';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(str, rx + w / 2, ry + h / 2 + 1);
    g.restore();
}

/* Animated connector/flow line with optional marching dash and arrowhead. */
function flowPath(g, points, t = 0, opts = {}) {
    if (!isCtx(g) || !Array.isArray(points) || points.length < 2) return;
    const progress = clamp(Number.isFinite(opts.progress) ? opts.progress : 1, 0, 1);
    if (progress <= 0) return;
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = opts.color || '#e06343';
    g.lineWidth = Number(opts.width) || 5;
    if (opts.dashed) {
        g.setLineDash(Array.isArray(opts.dashed) ? opts.dashed : [14, 10]);
        g.lineDashOffset = -(Number(t) || 0) * (Number(opts.speed) || 60);
    }
    if (opts.glow) {
        g.shadowColor = opts.color || '#e06343';
        g.shadowBlur = Number(opts.glow) || 12;
    }

    const segs = [];
    let totalLen = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i][0] - points[i - 1][0];
        const dy = points[i][1] - points[i - 1][1];
        const len = Math.hypot(dx, dy);
        segs.push(len);
        totalLen += len;
    }
    const targetLen = totalLen * progress;
    let drawn = 0;
    let tip = points[0];
    let prev = points[0];
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        const len = segs[i - 1];
        if (drawn + len <= targetLen) {
            g.lineTo(points[i][0], points[i][1]);
            prev = points[i - 1];
            tip = points[i];
            drawn += len;
        } else {
            const frac = len > 0 ? (targetLen - drawn) / len : 0;
            prev = points[i - 1];
            tip = [
                points[i - 1][0] + (points[i][0] - points[i - 1][0]) * frac,
                points[i - 1][1] + (points[i][1] - points[i - 1][1]) * frac,
            ];
            g.lineTo(tip[0], tip[1]);
            break;
        }
    }
    g.stroke();

    if (opts.arrow && progress > 0.05) {
        const angle = Math.atan2(tip[1] - prev[1], tip[0] - prev[0]);
        const head = Number(opts.arrowSize) || (Number(opts.width) || 5) * 3.2;
        g.setLineDash([]);
        g.fillStyle = opts.color || '#e06343';
        g.beginPath();
        g.moveTo(tip[0], tip[1]);
        g.lineTo(tip[0] - head * Math.cos(angle - 0.48), tip[1] - head * Math.sin(angle - 0.48));
        g.lineTo(tip[0] - head * Math.cos(angle + 0.48), tip[1] - head * Math.sin(angle + 0.48));
        g.closePath();
        g.fill();
    }
    g.restore();
}

/* Deterministic seeded particle field (sparks, dust, bubbles, data packets). */
function particles(g, seed, count, t, bounds, opts = {}) {
    if (!isCtx(g)) return;
    const n = clamp(Math.round(Number(count) || 24), 1, 160);
    const rand = typeof Motion !== 'undefined' && Motion.rng ? Motion.rng(seed) : () => 0.5;
    const x0 = bounds?.x ?? 0;
    const y0 = bounds?.y ?? 0;
    const w = bounds?.w ?? 900;
    const h = bounds?.h ?? 900;
    const speed = Number(opts.speed) || 32;
    const mode = opts.mode || 'drift'; // drift | rise | sparkle | stream
    const color = opts.color || 'rgba(255,245,220,0.45)';
    const minR = Number(opts.minR) || 2;
    const maxR = Number(opts.maxR) || 6;

    g.save();
    g.fillStyle = color;
    for (let i = 0; i < n; i++) {
        const bx = rand() * w;
        const by = rand() * h;
        const r = minR + rand() * (maxR - minR);
        const phase = rand() * Math.PI * 2;
        const spd = (0.5 + rand() * 0.9) * speed;
        let px = x0 + bx;
        let py = y0 + by;
        let alpha = 0.35 + rand() * 0.55;

        if (mode === 'rise') {
            py = y0 + (((by - t * spd) % h) + h) % h;
            px = x0 + bx + Math.sin(t * 1.4 + phase) * 14;
        } else if (mode === 'stream') {
            px = x0 + (((bx + t * spd * 2.2) % w) + w) % w;
            py = y0 + by + Math.sin(t * 2 + phase) * 6;
        } else if (mode === 'sparkle') {
            alpha *= 0.5 + 0.5 * Math.sin(t * 4.5 + phase);
        } else {
            px = x0 + (((bx + Math.cos(phase) * t * spd * 0.5) % w) + w) % w;
            py = y0 + (((by + Math.sin(phase) * t * spd * 0.5) % h) + h) % h;
        }

        g.globalAlpha = clamp(alpha * (opts.alpha ?? 1), 0, 1);
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fill();
    }
    g.restore();
}

/* Subtle film-level finishing pass (skipped for crisp graphic/infographic/pixel styles). */
function postProcess(ctx, t, env, styleId) {
    if (!ctx || !env || !env.px) return;
    if (customMood === 'bright_editorial' || customMood === 'technical_clean' || styleId === 'line' || styleId === 'comic') return;
    const [W, H] = env.px;
    ctx.save();
    const cx = W / 2;
    const cy = H / 2;
    const inner = Math.min(W, H) * 0.42;
    const outer = Math.hypot(W, H) * 0.58;
    const vig = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, styleId === 'pixel-art' ? 'rgba(0,0,0,0.12)' : 'rgba(10,12,18,0.18)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    if (styleId !== 'pixel-art') {
        const tile = getGrainTile();
        const pattern = ctx.createPattern(tile, 'repeat');
        if (pattern) {
            ctx.globalAlpha = 0.20;
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, W, H);
        }
    }
    ctx.restore();
}

/* Studio transitions including 'zoom' (zoom-through match cut) and 'whip' (fast whip-pan). */
function transition(g, env, nextCanvas, progress, type = 'wipe') {
    if (!isCtx(g) || !env || !nextCanvas) return;
    const p = clamp(ease(progress), 0, 1);
    g.save();
    if (type === 'zoom') {
        // Incoming shot scales from 0.68 -> 1.0 with smooth cross-dissolve
        const s = 0.68 + 0.32 * p;
        g.globalAlpha = p;
        g.translate(env.W / 2, env.H / 2);
        g.scale(s, s);
        g.translate(-env.W / 2, -env.H / 2);
        Motion.drawLayer(g, env, nextCanvas);
        g.restore();
        return;
    }
    if (type === 'whip') {
        // High-velocity whip-pan slide from right with motion streaks
        const offsetX = (1 - p) * env.W;
        g.translate(offsetX, 0);
        Motion.drawLayer(g, env, nextCanvas);
        // Subtle whip speed lines along the leading edge
        const streakAlpha = Math.sin(clamp(progress) * Math.PI) * 0.35;
        if (streakAlpha > 0.02) {
            g.fillStyle = `rgba(255,255,255,${streakAlpha.toFixed(3)})`;
            for (let y = 40; y < env.H; y += 90) {
                g.fillRect(-60, y, 120, 4);
            }
        }
        g.restore();
        return;
    }
    g.beginPath();
    if (type === 'iris') {
        g.arc(env.W / 2, env.H / 2, Math.hypot(env.W, env.H) * p, 0, Math.PI * 2);
    } else if (type === 'paper') {
        const edge = env.W * p;
        g.moveTo(0, 0);
        g.lineTo(edge, 0);
        for (let y = 0; y <= env.H; y += 24) g.lineTo(edge + Math.sin(y * 0.035) * 10, y);
        g.lineTo(0, env.H);
        g.closePath();
    } else if (type === 'fade') {
        g.globalAlpha = p;
        g.rect(0, 0, env.W, env.H);
    } else {
        g.rect(0, 0, env.W * p, env.H);
    }
    g.clip();
    Motion.drawLayer(g, env, nextCanvas);
    g.restore();
}

/* Dedicated deterministic primitives for art systems. */
function editorialShape(g, points, opts = {}) {
    if (!isCtx(g) || !Array.isArray(points) || points.length < 3) return;
    const depth = Number(opts.depth) || 0;
    const shadow = opts.shadow || 'rgba(20,25,28,.22)';
    g.save();
    if (depth > 0) {
        g.fillStyle = shadow;
        g.beginPath();
        g.moveTo(points[0][0] + depth, points[0][1] + depth);
        for (let i = 1; i < points.length; i++) g.lineTo(points[i][0] + depth, points[i][1] + depth);
        g.closePath();
        g.fill();
    }
    g.beginPath();
    g.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
    g.closePath();
    g.fillStyle = opts.fill || '#d45b3f';
    g.fill();
    if (opts.stroke) {
        g.strokeStyle = opts.stroke;
        g.lineWidth = Number(opts.lineWidth) || 3;
        g.stroke();
    }
    g.restore();
}

function editorialLight(g, x, y, r, color = 'rgba(255,236,190,.24)') {
    if (!isCtx(g) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r <= 0) return;
    g.save();
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(255,236,190,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
}

function isoProject(x, y, z = 0, scale = 1, origin = { x: 0, y: 0 }) {
    const s = Number.isFinite(Number(scale)) ? Number(scale) : 1;
    const u = ((Number(x) || 0) - (Number(y) || 0)) * 0.8660254037844386 * s;
    const v = ((Number(x) || 0) + (Number(y) || 0)) * 0.5 * s - (Number(z) || 0) * s;
    return { x: Number(origin?.x || 0) + u, y: Number(origin?.y || 0) + v };
}

function isoBox(g, x, y, z, w, d, h, scale = 1, colors = {}) {
    if (!isCtx(g)) return null;
    const cObj = colors && typeof colors === 'object' ? colors : {};
    const a = isoProject(x, y, z, scale), b = isoProject(x + w, y, z, scale), c = isoProject(x + w, y + d, z, scale), e = isoProject(x, y + d, z, scale);
    const at = isoProject(x, y, z + h, scale), bt = isoProject(x + w, y, z + h, scale), ct = isoProject(x + w, y + d, z + h, scale), et = isoProject(x, y + d, z + h, scale);
    g.save();
    g.lineJoin = 'round';
    g.lineWidth = Math.max(1, (Number(scale) || 1) * 0.035);
    g.strokeStyle = cObj.edge || '#263746';
    g.fillStyle = cObj.left || '#66818a';
    g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(c.x, c.y); g.lineTo(ct.x, ct.y); g.lineTo(et.x, et.y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = cObj.right || '#3f6877';
    g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(b.x, b.y); g.lineTo(bt.x, bt.y); g.lineTo(ct.x, ct.y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = cObj.top || '#a9c1c1';
    g.beginPath(); g.moveTo(at.x, at.y); g.lineTo(bt.x, bt.y); g.lineTo(ct.x, ct.y); g.lineTo(et.x, et.y); g.closePath(); g.fill(); g.stroke();
    g.restore();
    return { top: [at, bt, ct, et], left: [e, c, ct, et], right: [c, b, bt, ct] };
}

function isoLine(g, a, b, color = '#263746', width = 2) {
    if (!isCtx(g) || !a || !b) return;
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.restore();
}

function paperLayer(g, draw, opts = {}) {
    if (!isCtx(g) || typeof draw !== 'function') return;
    g.save();
    g.shadowColor = opts.shadowColor || 'rgba(58,42,28,.24)';
    g.shadowBlur = Number.isFinite(opts.blur) ? opts.blur : 10;
    g.shadowOffsetX = Number.isFinite(opts.offsetX) ? opts.offsetX : 0;
    g.shadowOffsetY = Number.isFinite(opts.offsetY) ? opts.offsetY : 7;
    g.fillStyle = opts.fill || '#fff8e9';
    g.strokeStyle = opts.edge || 'rgba(80,60,42,.18)';
    g.lineWidth = Number(opts.lineWidth) || 1.5;
    draw(g);
    g.fill();
    if (opts.edge !== false) g.stroke();
    g.restore();
}

function paperPolygon(g, points, opts = {}) {
    if (!Array.isArray(points) || points.length < 3) return;
    paperLayer(g, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.closePath();
    }, opts);
}

function paperEllipse(g, x, y, rx, ry, opts = {}) {
    if (!isCtx(g) || !(Number(rx) > 0) || !(Number(ry) > 0)) return;
    paperLayer(g, (ctx) => {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    }, opts);
}

function paperParallax(g, offset, drawLayers) {
    if (!isCtx(g) || !Array.isArray(drawLayers)) return;
    for (let i = 0; i < drawLayers.length; i++) {
        const layer = drawLayers[i];
        if (!layer || typeof layer.draw !== 'function') continue;
        g.save();
        g.translate(offset * (layer.depth || 0), 0);
        layer.draw(g);
        g.restore();
    }
}

function mechanismPose(spec, progress) {
    if (!spec || typeof spec !== 'object') throw new TypeError('mechanism spec is required');
    const p = clamp(Number(progress) || 0), lerp = (a, b, t) => a + (b - a) * t;
    const point = (v) => ({ x: Number(v?.x) || 0, y: Number(v?.y) || 0 });
    if (spec.type === 'pivot') {
        const anchor = point(spec.anchor), angle = lerp(Number(spec.start_angle_deg) || 0, Number(spec.end_angle_deg) || 0, p) * Math.PI / 180;
        return { type: 'pivot', part: spec.part, anchor, angle_rad: angle };
    }
    if (spec.type === 'translation' || spec.type === 'slider') {
        const start = point(spec.start), end = point(spec.end);
        return { type: spec.type, part: spec.part, position: { x: lerp(start.x, end.x, p), y: lerp(start.y, end.y, p) } };
    }
    if (spec.type === 'gear') {
        const driverStart = Number(spec.driver_start_angle_deg || 0), driverEnd = Number(spec.driver_end_angle_deg) || 0;
        const driverAngle = lerp(driverStart, driverEnd, p);
        const drivenR = Number(spec.driven_radius) || 1;
        const ratio = (Number(spec.driver_radius) || 1) / drivenR;
        const sign = spec.mesh === 'internal' ? 1 : -1;
        const drivenAngle = Number(spec.driven_start_angle_deg || 0) + (driverAngle - driverStart) * ratio * sign;
        return { type: 'gear', part: spec.part, driver_part: spec.driver_part, anchor: point(spec.anchor), driver_anchor: point(spec.driver_anchor), driver_angle_rad: driverAngle * Math.PI / 180, angle_rad: drivenAngle * Math.PI / 180, ratio };
    }
    if (spec.type === 'pulley') {
        const start = Number(spec.start_angle_deg || 0), angle = lerp(start, Number(spec.end_angle_deg) || 0, p);
        const delta = (angle - start) * Math.PI / 180 * Number(spec.direction || 1), travel = (Number(spec.radius) || 0) * delta, axis = point(spec.axis), origin = point(spec.start_position);
        return { type: 'pulley', part: spec.part, pulley_part: spec.pulley_part, anchor: point(spec.anchor), pulley_angle_rad: angle * Math.PI / 180, position: { x: origin.x + axis.x * travel, y: origin.y + axis.y * travel }, length_travelled: travel };
    }
    if (spec.type === 'cable') {
        const starts = Array.isArray(spec.points_start) ? spec.points_start : [];
        const ends = Array.isArray(spec.points_end) ? spec.points_end : starts;
        const count = Math.min(starts.length, ends.length);
        const points = [];
        for (let i = 0; i < count; i++) {
            const a = point(starts[i]), b = point(ends[i]);
            points.push({ x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p) });
        }
        return { type: 'cable', part: spec.part, points };
    }
    if (spec.type === 'actuator') {
        const base = point(spec.base_anchor), rod = point(spec.rod_anchor), dx = rod.x - base.x, dy = rod.y - base.y;
        const initial = Math.hypot(dx, dy) || 1, length = lerp(Number(spec.min_length), Number(spec.max_length), p), ratio = length/initial;
        return { type: 'actuator', part: spec.part, base, tip: { x: base.x + dx * ratio, y: base.y + dy * ratio }, length, angle_rad: Math.atan2(dy, dx) };
    }
    throw new TypeError('Unsupported kinematics type: ' + spec.type);
}

/* Circular magnifying inset callout with optional pointer line (great for anatomy/mechanisms). */
function zoomLens(g, cx, cy, r, drawInsideFn, opts = {}) {
    if (!isCtx(g) || !Number.isFinite(cx) || !Number.isFinite(cy) || !(Number(r) > 2)) return;
    const rad = Number(r);
    const borderColor = opts.borderColor || '#111111';
    const borderWidth = Number.isFinite(opts.borderWidth) ? opts.borderWidth : 4;
    const bg = opts.bg || '#f9a8a8';
    g.save();
    if (Number.isFinite(opts.targetX) && Number.isFinite(opts.targetY)) {
        const ang = Math.atan2(opts.targetY - cy, opts.targetX - cx);
        const sx = cx + Math.cos(ang) * rad;
        const sy = cy + Math.sin(ang) * rad;
        g.strokeStyle = opts.lineColor || borderColor;
        g.lineWidth = Number.isFinite(opts.lineWidth) ? opts.lineWidth : 3;
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(opts.targetX, opts.targetY);
        g.stroke();
        g.fillStyle = opts.dotColor || '#f2c94c';
        g.beginPath();
        g.arc(opts.targetX, opts.targetY, 6, 0, Math.PI * 2);
        g.fill();
        g.stroke();
    }
    if (opts.shadow !== false) {
        g.shadowColor = 'rgba(0,0,0,0.18)';
        g.shadowBlur = 16;
        g.shadowOffsetY = 6;
    }
    g.fillStyle = bg;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;

    if (typeof drawInsideFn === 'function') {
        g.save();
        g.beginPath();
        g.arc(cx, cy, rad - borderWidth * 0.4, 0, Math.PI * 2);
        g.clip();
        drawInsideFn(g, cx, cy, rad);
        g.restore();
    }
    g.strokeStyle = borderColor;
    g.lineWidth = borderWidth;
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.stroke();
    g.restore();
}

/* Crisp side-by-side comparison card with semantic header pill and optional progress meter. */
function compareCard(g, x, y, w, h, title, opts = {}) {
    if (!isCtx(g) || !(w > 10) || !(h > 10)) return;
    const r = Number.isFinite(opts.radius) ? opts.radius : 22;
    const accent = opts.accent || '#ef6c6c';
    const border = opts.border || '#111111';
    const bg = opts.bg || '#ffffff';
    g.save();
    roundedCard(g, x, y, w, h, r, {
        fill: bg,
        stroke: border,
        lineWidth: Number.isFinite(opts.lineWidth) ? opts.lineWidth : 4,
        shadowBlur: opts.shadow === false ? 0 : 14,
        shadowY: opts.shadow === false ? 0 : 6,
    });
    if (title) {
        badge(g, x + w - 24, y + 34, String(title), {
            bg: accent,
            color: opts.titleColor || '#111111',
            border,
            fontSize: Number(opts.fontSize) || 22,
            padX: 16,
            padY: 8,
            align: 'right',
        });
    }
    if (Number.isFinite(opts.meter)) {
        const mw = w - 40;
        const mh = 22;
        const mx = x + 20;
        const my = y + h - 42;
        const pct = clamp(opts.meter, 0, 1);
        g.fillStyle = '#f1f5f9';
        g.strokeStyle = border;
        g.lineWidth = 3;
        g.beginPath();
        if (g.roundRect) g.roundRect(mx, my, mw, mh, mh / 2);
        else g.rect(mx, my, mw, mh);
        g.fill();
        if (pct > 0.01) {
            g.fillStyle = accent;
            g.beginPath();
            if (g.roundRect) g.roundRect(mx, my, Math.max(mh, mw * pct), mh, mh / 2);
            else g.rect(mx, my, Math.max(mh, mw * pct), mh);
            g.fill();
        }
        g.stroke();
    }
    g.restore();
}

/* Subtle coordinate / lab-notebook graph grid for infographic & math explainers. */
function graphGrid(g, env, opts = {}) {
    if (!isCtx(g) || !env) return;
    const step = Math.max(16, Number(opts.step) || 48);
    const color = opts.color || 'rgba(15, 45, 40, 0.07)';
    g.save();
    g.strokeStyle = color;
    g.lineWidth = Number(opts.lineWidth) || 1.5;
    for (let x = -env.W * 0.25; x <= env.W * 1.25; x += step) {
        g.beginPath(); g.moveTo(x, -env.H * 0.25); g.lineTo(x, env.H * 1.25); g.stroke();
    }
    for (let y = -env.H * 0.25; y <= env.H * 1.25; y += step) {
        g.beginPath(); g.moveTo(-env.W * 0.25, y); g.lineTo(env.W * 1.25, y); g.stroke();
    }
    if (opts.axes) {
        g.strokeStyle = opts.axisColor || 'rgba(255,255,255,0.28)';
        g.lineWidth = 2.5;
        g.beginPath();
        g.moveTo(0, env.H / 2); g.lineTo(env.W, env.H / 2);
        g.moveTo(env.W / 2, 0); g.lineTo(env.W / 2, env.H);
        g.stroke();
    }
    g.restore();
}

/* Vox-style expanding highlight block behind bold kinetic typography. */
function kineticHighlight(g, x, y, text, progress = 1, opts = {}) {
    const str = String(text ?? '');
    if (!isCtx(g) || !str) return;
    const p = clamp(Number.isFinite(progress) ? progress : 1, 0, 1);
    const fontSize = Number(opts.fontSize) || 44;
    const padX = Number(opts.padX) || 20;
    const padY = Number(opts.padY) || 12;
    g.save();
    g.font = `800 ${fontSize}px ${opts.font || '"Noto Sans", "Liberation Sans", sans-serif'}`;
    const w = g.measureText(str).width + padX * 2;
    const h = fontSize + padY * 2;
    const bx = opts.align === 'left' ? x : opts.align === 'right' ? x - w : x - w / 2;
    const by = y - h / 2;
    const rw = w * (1 - Math.pow(1 - p, 3));
    if (rw > 2) {
        g.fillStyle = opts.bg || '#ff3366';
        g.fillRect(bx, by, rw, h);
    }
    if (p > 0.25) {
        g.globalAlpha *= clamp((p - 0.25) / 0.45, 0, 1);
        g.fillStyle = opts.color || '#ffffff';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillText(str, bx + w / 2, by + h / 2 + 1);
    }
    g.restore();
}

/* Animated bar or trend-line chart for Vox / LEMMiNO / data explainers. */
function animatedChart(g, x, y, w, h, data, progress = 1, opts = {}) {
    if (!isCtx(g) || !Array.isArray(data) || !data.length || !(w > 20) || !(h > 20)) return;
    const p = clamp(Number.isFinite(progress) ? progress : 1, 0, 1);
    const type = opts.type === 'line' ? 'line' : 'bar';
    const ink = opts.ink || '#1e293b';
    const accent = opts.accent || '#38bdf8';
    const border = opts.border || ink;
    const maxVal = Number(opts.maxVal) || Math.max(1, ...data.map((d) => Math.abs(Number(d?.value ?? d) || 0)));
    const padL = 46, padB = 38, padT = 22, padR = 18;
    const cw = Math.max(10, w - padL - padR);
    const ch = Math.max(10, h - padT - padB);
    const ox = x + padL;
    const oy = y + padT + ch;

    g.save();
    // Subtle horizontal grid + axes
    g.strokeStyle = opts.gridColor || 'rgba(100,116,139,0.22)';
    g.lineWidth = 1.5;
    for (let i = 1; i <= 4; i++) {
        const gy = oy - (ch * i) / 4;
        g.beginPath(); g.moveTo(ox, gy); g.lineTo(ox + cw, gy); g.stroke();
    }
    g.strokeStyle = border;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(ox, y + padT); g.lineTo(ox, oy); g.lineTo(ox + cw, oy);
    g.stroke();

    const n = data.length;
    const pts = [];
    for (let i = 0; i < n; i++) {
        const item = data[i];
        const val = Number(typeof item === 'object' ? item?.value : item) || 0;
        const label = typeof item === 'object' ? String(item?.label ?? '') : '';
        const itemColor = (typeof item === 'object' && item?.color) ? item.color : accent;
        const itemP = clamp((p * n - i * 0.55) / Math.max(0.45, n * 0.45), 0, 1);
        const eased = 1 - Math.pow(1 - itemP, 3);
        const bh = clamp(val / maxVal, 0, 1) * ch * eased;
        const slotW = cw / n;
        const bx = ox + i * slotW + slotW * 0.18;
        const bw = Math.max(6, slotW * 0.64);
        const cx = ox + (n === 1 ? cw / 2 : (i / (n - 1)) * cw);
        const cy = oy - bh;
        pts.push({ cx, cy, label, color: itemColor, itemP, bh });

        if (type === 'bar' && bh > 1) {
            g.fillStyle = itemColor;
            g.beginPath();
            if (g.roundRect) g.roundRect(bx, oy - bh, bw, bh, [8, 8, 0, 0]);
            else g.rect(bx, oy - bh, bw, bh);
            g.fill();
            if (opts.outline !== false) {
                g.strokeStyle = border;
                g.lineWidth = 2.5;
                g.stroke();
            }
        }
        if (label) {
            g.fillStyle = ink;
            g.font = `700 ${Number(opts.fontSize) || 18}px "Noto Sans", "Liberation Sans", sans-serif`;
            g.textAlign = 'center';
            g.textBaseline = 'top';
            g.fillText(label, type === 'bar' ? bx + bw / 2 : cx, oy + 10);
        }
    }

    if (type === 'line' && pts.length >= 2) {
        const linePts = pts.map((pt) => [pt.cx, pt.cy]);
        flowPath(g, linePts, 0, { color: accent, width: Number(opts.lineWidth) || 5, progress: p, glow: opts.glow || 0 });
        for (let i = 0; i < pts.length; i++) {
            if (pts[i].itemP <= 0.05) continue;
            g.fillStyle = pts[i].color;
            g.strokeStyle = border;
            g.lineWidth = 3;
            g.beginPath();
            g.arc(pts[i].cx, pts[i].cy, 7 * Math.min(1, pts[i].itemP * 1.5), 0, Math.PI * 2);
            g.fill();
            g.stroke();
        }
    }
    g.restore();
}

/* Animated chronological timeline with progressive line & milestone nodes. */
function timelineTrack(g, x, y, len, milestones, progress = 1, opts = {}) {
    if (!isCtx(g) || !Array.isArray(milestones) || !milestones.length || !(len > 20)) return;
    const p = clamp(Number.isFinite(progress) ? progress : 1, 0, 1);
    const vertical = opts.vertical === true;
    const accent = opts.accent || '#ff6b35';
    const ink = opts.ink || '#f8fafc';
    const trackColor = opts.trackColor || 'rgba(148,163,184,0.35)';
    const n = milestones.length;

    g.save();
    g.lineCap = 'round';
    g.strokeStyle = trackColor;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(vertical ? x : x + len, vertical ? y + len : y);
    g.stroke();

    const activeLen = len * p;
    g.strokeStyle = accent;
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(vertical ? x : x + activeLen, vertical ? y + activeLen : y);
    g.stroke();

    for (let i = 0; i < n; i++) {
        const frac = n === 1 ? 0.5 : i / (n - 1);
        if (p + 0.02 < frac) continue;
        const m = milestones[i];
        const mx = vertical ? x : x + len * frac;
        const my = vertical ? y + len * frac : y;
        const pop = clamp((p - frac) / 0.16, 0, 1);
        const r = (Number(opts.nodeR) || 10) * (1 - Math.pow(1 - pop, 3));
        g.fillStyle = accent;
        g.strokeStyle = opts.border || '#111111';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(mx, my, Math.max(2, r), 0, Math.PI * 2);
        g.fill();
        g.stroke();

        const title = typeof m === 'object' ? String(m?.label ?? '') : String(m ?? '');
        const sub = typeof m === 'object' ? String(m?.sub ?? '') : '';
        if (title) {
            g.fillStyle = ink;
            g.font = `700 ${Number(opts.fontSize) || 20}px "Noto Sans", "Liberation Sans", sans-serif`;
            g.textAlign = vertical ? 'left' : 'center';
            g.textBaseline = vertical ? 'middle' : (i % 2 === 0 ? 'bottom' : 'top');
            const ty = vertical ? my : (i % 2 === 0 ? my - 18 : my + 18);
            const tx = vertical ? mx + 20 : mx;
            g.fillText(title, tx, ty);
            if (sub) {
                const prevAlpha = g.globalAlpha;
                g.globalAlpha *= 0.78;
                g.font = `500 ${Math.max(14, (Number(opts.fontSize) || 20) - 4)}px "Noto Sans", "Liberation Sans", sans-serif`;
                g.fillText(sub, tx, vertical ? ty + 22 : (i % 2 === 0 ? ty - 22 : ty + 22));
                g.globalAlpha = prevAlpha;
            }
        }
    }
    g.restore();
}

/* Manim/LEMMiNO-style callout bracket/pointer highlighting a specific target region. */
function calloutBracket(g, x, y, w, h, label, progress = 1, opts = {}) {
    if (!isCtx(g) || !(w > 4) || !(h > 4)) return;
    const p = clamp(Number.isFinite(progress) ? progress : 1, 0, 1);
    if (p <= 0.02) return;
    const color = opts.color || '#facc15';
    const r = Math.min(12, w / 4, h / 4);
    g.save();
    g.globalAlpha *= p;
    g.strokeStyle = color;
    g.lineWidth = Number(opts.lineWidth) || 4;
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, w, h, r);
    else g.rect(x, y, w, h);
    g.stroke();
    if (label) {
        badge(g, x + w / 2, y - 24, String(label), {
            bg: color,
            color: opts.textColor || '#111111',
            border: opts.border || '#111111',
            fontSize: Number(opts.fontSize) || 20,
            padX: 14,
            padY: 6,
        });
    }
    g.restore();
}

/* TED-Ed / Manim style smooth polygon morph between ptsA and ptsB (u in 0..1). */
function morphPoly(g, ptsA, ptsB, u = 0, opts = {}) {
    if (!isCtx(g) || !Array.isArray(ptsA) || !Array.isArray(ptsB) || ptsA.length < 3 || ptsB.length < 3) return;
    const t = clamp(Number.isFinite(u) ? u : 0, 0, 1);
    const count = Math.max(ptsA.length, ptsB.length);
    const sampleAt = (pts, idx) => {
        const f = (idx / count) * pts.length;
        const i0 = Math.floor(f) % pts.length;
        const i1 = (i0 + 1) % pts.length;
        const frac = f - Math.floor(f);
        const x0 = Number(pts[i0]?.[0]) || 0;
        const y0 = Number(pts[i0]?.[1]) || 0;
        const x1 = Number(pts[i1]?.[0]) || 0;
        const y1 = Number(pts[i1]?.[1]) || 0;
        return [x0 + (x1 - x0) * frac, y0 + (y1 - y0) * frac];
    };
    const morphed = [];
    for (let i = 0; i < count; i++) {
        const a = sampleAt(ptsA, i);
        const b = sampleAt(ptsB, i);
        morphed.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    shadedShape(g, (ctx) => {
        ctx.beginPath();
        ctx.moveTo(morphed[0][0], morphed[0][1]);
        for (let i = 1; i < morphed.length; i++) ctx.lineTo(morphed[i][0], morphed[i][1]);
        ctx.closePath();
    }, opts);
}

/* Kinetic word-highlighted Shorts captions rendered in the lower-third safe zone.
   Accepts UnrealSpeech word timestamps: [{ word|text, start|start_time, end|end_time }, ...]. */
function renderCaptions(ctx, t, env, rawWords) {
    if (!isCtx(ctx) || !env || !Array.isArray(rawWords) || !rawWords.length) return;
    // Normalize word items once and cache on the array object.
    if (!rawWords._chunks) {
        const words = [];
        for (let i = 0; i < rawWords.length; i++) {
            const w = rawWords[i];
            if (!w || typeof w !== 'object') continue;
            const text = String(w.word ?? w.text ?? '').trim();
            const start = Number(w.start ?? w.start_time ?? w.startTime);
            const end = Number(w.end ?? w.end_time ?? w.endTime);
            if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
            words.push({ text, start, end: Math.max(start + 0.05, end) });
        }
        // Group into punchy 2-3 word chunks (never exceeding 18 chars per chunk).
        const chunks = [];
        let cur = [];
        let curLen = 0;
        for (let i = 0; i < words.length; i++) {
            const w = words[i];
            const prev = cur.length ? cur[cur.length - 1] : null;
            const gap = prev ? w.start - prev.end : 0;
            const endsSentence = prev && /[.!?]$/.test(prev.text);
            if (cur.length >= 3 || (cur.length >= 2 && curLen + w.text.length > 17) || gap > 0.45 || endsSentence) {
                chunks.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
                cur = [];
                curLen = 0;
            }
            cur.push(w);
            curLen += w.text.length + 1;
        }
        if (cur.length) chunks.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
        rawWords._chunks = chunks;
    }

    const chunks = rawWords._chunks;
    if (!chunks.length) return;
    let active = null;
    for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        const nextStart = i + 1 < chunks.length ? chunks[i + 1].start : ch.end + 0.35;
        const visEnd = Math.min(ch.end + 0.25, nextStart);
        if (t >= ch.start && t <= visEnd) {
            active = ch;
            break;
        }
    }
    if (!active) return;

    const [W, H] = env.px || [env.W, env.H];
    const fontSize = Math.round(clamp(W * 0.054, 30, 68));
    const y = Math.round(H * 0.78);

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = `900 ${fontSize}px "Noto Sans", "Liberation Sans", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;

    const spaceW = ctx.measureText(' ').width * 0.85;
    const items = active.words.map((w) => {
        const label = w.text.toUpperCase();
        const isCurrent = t >= w.start && t <= w.end + 0.04;
        const pop = isCurrent ? 1 + 0.08 * Math.sin(clamp((t - w.start) / 0.14, 0, 1) * Math.PI) : 1;
        const width = ctx.measureText(label).width;
        return { label, isCurrent, pop, width };
    });
    const totalW = items.reduce((s, it) => s + it.width, 0) + spaceW * Math.max(0, items.length - 1);
    const fit = totalW > W * 0.86 ? (W * 0.86) / totalW : 1;
    let cursorX = (W - totalW * fit) / 2;

    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const cx = cursorX + (it.width * fit) / 2;
        ctx.save();
        ctx.translate(cx, y);
        ctx.scale(it.pop * fit, it.pop * fit);
        ctx.translate(-it.width / 2, 0);
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = Math.round(fontSize * 0.18);
        ctx.shadowOffsetY = Math.round(fontSize * 0.08);
        ctx.strokeStyle = '#111111';
        ctx.lineWidth = Math.max(6, Math.round(fontSize * 0.22));
        ctx.strokeText(it.label, 0, 0);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = it.isCurrent ? '#facc15' : '#ffffff';
        ctx.fillText(it.label, 0, 0);
        ctx.restore();
        cursorX += (it.width + spaceW) * fit;
    }
    ctx.restore();
}

window.ShortcliprStyles = Object.freeze({
    mechanismPose,
    palette,
    setCustomPalette,
    paletteIds: Object.freeze(Object.keys(palettes)),
    backdrop,
    paperBackground,
    paperShadow,
    halftone,
    camera,
    cameraRig,
    parallaxLayers,
    spring,
    stagger,
    anticipation,
    posterize,
    squash,
    solveIK,
    drawCharacterRig,
    strokeReveal,
    organicPath,
    lightBeam,
    bloomLayer,
    impactShake,
    speedLines,
    dustBurst,
    impactFlash,
    rackFocus,
    shadedShape,
    glow,
    roundedCard,
    badge,
    zoomLens,
    compareCard,
    graphGrid,
    kineticHighlight,
    animatedChart,
    timelineTrack,
    calloutBracket,
    morphPoly,
    renderCaptions,
    flowPath,
    particles,
    postProcess,
    transition,
    pixelSnap,
    ease,
    editorialShape,
    editorialLight,
    isoProject,
    isoBox,
    isoLine,
    paperLayer,
    paperPolygon,
    paperEllipse,
    paperParallax,
});
})();
