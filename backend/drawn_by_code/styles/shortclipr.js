/* ShortClipr deterministic 2D motion-graphics toolkit, visualography engine, and transition helpers. */
(() => {
'use strict';

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
    const activeMood = mood || customMood || '';
    g.save();
    const grad = g.createLinearGradient(0, 0, 0, env.H);
    grad.addColorStop(0, p.bg);
    grad.addColorStop(1, p.bg2 || p.bg);
    g.fillStyle = grad;
    g.fillRect(0, 0, env.W, env.H);

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
    g.fillRect(0, 0, env.W, env.H);

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
    g.shadowColor = color;
    g.shadowBlur = blur;
    g.shadowOffsetX = Number.isFinite(x) ? x * 0.0 : 0;
    g.shadowOffsetY = blur * 0.45;
}

function halftone(g, x, y, w, h, spacing = 12, color = 'rgba(20,20,20,.18)') {
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
    const cx = Number.isFinite(o.cx) ? o.cx : env.W / 2;
    const cy = Number.isFinite(o.cy) ? o.cy : env.H / 2;
    const zoom = clamp(Number(o.zoom) || 1, 0.25, 4);
    const rotation = Number(o.rotation) || 0;
    g.translate(env.W / 2, env.H / 2);
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
    if (!Array.isArray(layers)) return;
    const cx = Number.isFinite(camState.cx) ? camState.cx : env.W / 2;
    const cy = Number.isFinite(camState.cy) ? camState.cy : env.H / 2;
    const zoom = clamp(Number(camState.zoom) || 1, 0.35, 3.5);
    const rot = Number(camState.rotation) || 0;
    const dx = cx - env.W / 2;
    const dy = cy - env.H / 2;

    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        if (!layer || typeof layer.draw !== 'function') continue;
        const depth = Number.isFinite(layer.depth) ? layer.depth : 1.0;
        const layerZoom = 1 + (zoom - 1) * depth;
        const lx = env.W / 2 + dx * depth;
        const ly = env.H / 2 + dy * depth;
        g.save();
        if (layer.blur && layer.blur > 0) {
            g.filter = `blur(${Number(layer.blur)}px)`;
        }
        if (Number.isFinite(layer.alpha)) {
            g.globalAlpha *= clamp(layer.alpha, 0, 1);
        }
        g.translate(env.W / 2, env.H / 2);
        g.rotate(rot * depth);
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
    if (!Array.isArray(points) || points.length < 2) return;
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

/* Volumetric additive ('screen') light beam / cone / flashlight shaft. */
function lightBeam(g, x0, y0, x1, y1, r0 = 16, r1 = 140, color = '#ffe8a3', alpha = 0.26) {
    if (alpha <= 0) return;
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
    if (typeof drawFn !== 'function') return;
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
    if (r <= 0 || alpha <= 0) return;
    g.save();
    g.globalCompositeOperation = 'screen';
    g.globalAlpha *= clamp(alpha, 0, 1);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.restore();
}

/* Sleek rounded motion-graphics card / container. */
function roundedCard(g, x, y, w, h, r = 18, opts = {}) {
    const radius = Math.min(r, w / 2, h / 2);
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

/* Crisp pill label/callout badge (auto-sized to text). */
function badge(g, x, y, text, opts = {}) {
    const str = String(text ?? '');
    if (!str) return;
    const fontSize = Number(opts.fontSize) || 26;
    const padX = Number(opts.padX) || 22;
    const padY = Number(opts.padY) || 12;
    g.save();
    g.font = `700 ${fontSize}px ${opts.font || '"Noto Sans", "Liberation Sans", sans-serif'}`;
    const metrics = g.measureText(str);
    const w = metrics.width + padX * 2;
    const h = fontSize + padY * 2;
    const rx = opts.align === 'left' ? x : opts.align === 'right' ? x - w : x - w / 2;
    const ry = y - h / 2;
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
    if (!Array.isArray(points) || points.length < 2) return;
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

/* Subtle film-level finishing pass (soft vignette + cached fine grain). */
function postProcess(ctx, t, env, styleId) {
    if (!ctx || !env || !env.px) return;
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
    if (!nextCanvas) return;
    const p = ease(progress);
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
    if (!Array.isArray(points) || points.length < 3) return;
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
    const u = (Number(x) - Number(y)) * 0.8660254037844386 * scale;
    const v = (Number(x) + Number(y)) * 0.5 * scale - Number(z) * scale;
    return { x: Number(origin.x || 0) + u, y: Number(origin.y || 0) + v };
}

function isoBox(g, x, y, z, w, d, h, scale = 1, colors = {}) {
    const a = isoProject(x, y, z, scale), b = isoProject(x + w, y, z, scale), c = isoProject(x + w, y + d, z, scale), e = isoProject(x, y + d, z, scale);
    const at = isoProject(x, y, z + h, scale), bt = isoProject(x + w, y, z + h, scale), ct = isoProject(x + w, y + d, z + h, scale), et = isoProject(x, y + d, z + h, scale);
    g.save();
    g.lineJoin = 'round';
    g.lineWidth = Math.max(1, scale * 0.035);
    g.strokeStyle = colors.edge || '#263746';
    g.fillStyle = colors.left || '#66818a';
    g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(c.x, c.y); g.lineTo(ct.x, ct.y); g.lineTo(et.x, et.y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = colors.right || '#3f6877';
    g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(b.x, b.y); g.lineTo(bt.x, bt.y); g.lineTo(ct.x, ct.y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = colors.top || '#a9c1c1';
    g.beginPath(); g.moveTo(at.x, at.y); g.lineTo(bt.x, bt.y); g.lineTo(ct.x, ct.y); g.lineTo(et.x, et.y); g.closePath(); g.fill(); g.stroke();
    g.restore();
    return { top: [at, bt, ct, et], left: [e, c, ct, et], right: [c, b, bt, ct] };
}

function isoLine(g, a, b, color = '#263746', width = 2) {
    g.save();
    g.strokeStyle = color;
    g.lineWidth = width;
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    g.restore();
}

function paperLayer(g, draw, opts = {}) {
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
    paperLayer(g, (ctx) => {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    }, opts);
}

function paperParallax(g, offset, drawLayers) {
    for (let i = 0; i < drawLayers.length; i++) {
        const layer = drawLayers[i];
        g.save();
        g.translate(offset * (layer.depth || 0), 0);
        layer.draw(g);
        g.restore();
    }
}

function mechanismPose(spec, progress) {
    if (!spec || typeof spec !== 'object') throw new TypeError('mechanism spec is required');
    const p = clamp(Number(progress) || 0), lerp = (a, b, t) => a + (b - a) * t;
    const point = (v) => ({ x: Number(v.x), y: Number(v.y) });
    if (spec.type === 'pivot') {
        const anchor = point(spec.anchor), angle = lerp(Number(spec.start_angle_deg), Number(spec.end_angle_deg), p) * Math.PI / 180;
        return { type: 'pivot', part: spec.part, anchor, angle_rad: angle };
    }
    if (spec.type === 'translation' || spec.type === 'slider') {
        const start = point(spec.start), end = point(spec.end);
        return { type: spec.type, part: spec.part, position: { x: lerp(start.x, end.x, p), y: lerp(start.y, end.y, p) } };
    }
    if (spec.type === 'gear') {
        const driverStart = Number(spec.driver_start_angle_deg || 0), driverEnd = Number(spec.driver_end_angle_deg);
        const driverAngle = lerp(driverStart, driverEnd, p);
        const ratio = Number(spec.driver_radius) / Number(spec.driven_radius);
        const sign = spec.mesh === 'internal' ? 1 : -1;
        const drivenAngle = Number(spec.driven_start_angle_deg || 0) + (driverAngle - driverStart) * ratio * sign;
        return { type: 'gear', part: spec.part, driver_part: spec.driver_part, anchor: point(spec.anchor), driver_anchor: point(spec.driver_anchor), driver_angle_rad: driverAngle * Math.PI / 180, angle_rad: drivenAngle * Math.PI / 180, ratio };
    }
    if (spec.type === 'pulley') {
        const start = Number(spec.start_angle_deg || 0), angle = lerp(start, Number(spec.end_angle_deg), p);
        const delta = (angle - start) * Math.PI / 180 * Number(spec.direction || 1), travel = Number(spec.radius) * delta, axis = point(spec.axis), origin = point(spec.start_position);
        return { type: 'pulley', part: spec.part, pulley_part: spec.pulley_part, anchor: point(spec.anchor), pulley_angle_rad: angle * Math.PI / 180, position: { x: origin.x + axis.x * travel, y: origin.y + axis.y * travel }, length_travelled: travel };
    }
    if (spec.type === 'cable') {
        const points = [];
        for (let i = 0; i < spec.points_start.length; i++) {
            const a = point(spec.points_start[i]), b = point(spec.points_end[i]);
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
    strokeReveal,
    organicPath,
    lightBeam,
    bloomLayer,
    shadedShape,
    glow,
    roundedCard,
    badge,
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
