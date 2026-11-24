#!/usr/bin/env node
// Validate a generated ShortClipr film for JavaScript syntax, safety, and
// genuinely unresolved identifiers (variables or functions not defined anywhere
// in shared scope, local shot scope, or the allowed runtime globals).
//
// Usage: node validate-scene.mjs <scene.js> [optional-manifest.json]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const eslintScope = require('eslint-scope');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENGINE_ROOT = path.resolve(__dirname, '..');

const [sourcePath] = process.argv.slice(2);
if (!sourcePath) {
    console.error('Usage: node validate-scene.mjs <scene.js>');
    process.exit(2);
}

const fail = (message, details = {}) => {
    console.error(JSON.stringify({
        event: 'drawn_by_code.linker.failed',
        message: String(message).slice(0, 1800),
        ...details,
    }));
    process.exit(1);
};

// Runtime globals available inside engine/player.html without exposing DOM,
// network, timers, storage, or nondeterministic APIs.
const allowedGlobals = new Set([
    'Motion', 'Ease', 'ShortcliprStyles',
    'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'BigInt', 'RegExp',
    'Error', 'TypeError', 'RangeError', 'parseInt', 'parseFloat',
    'isFinite', 'isNaN', 'NaN', 'Infinity', 'undefined',
    'Path2D', 'DOMMatrix', 'Float32Array', 'Float64Array', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint8Array', 'Uint8ClampedArray',
]);

try {
    const source = fs.readFileSync(sourcePath, 'utf8');

    const ast = parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        allowHashBang: true,
        locations: true,
        ranges: true,
    });

    const scopeManager = eslintScope.analyze(ast, {
        ecmaVersion: 2022,
        sourceType: 'script',
        optimistic: true,
        ignoreEval: true,
        impliedStrict: false,
    });

    const globalScope = scopeManager.scopes.find((scope) => scope.type === 'global');
    if (!globalScope) fail('JavaScript global scope could not be constructed');

    // Only globalScope.through contains references that were NOT resolved by any
    // enclosing local, function, block, or top-level declaration.
    const unresolved = new Map();
    for (const ref of globalScope.through) {
        const name = ref.identifier.name;
        if (allowedGlobals.has(name)) continue;
        const location = ref.identifier.loc?.start;
        unresolved.set(ref.identifier.start, {
            name,
            line: location?.line ?? null,
            column: location?.column ?? null,
        });
    }

    if (unresolved.size) {
        const items = [...unresolved.values()].slice(0, 30);
        const summary = items
            .map((item) => `${item.name} at line ${item.line ?? '?'}:${item.column ?? '?'}`)
            .join('; ');
        fail('Unresolved JavaScript identifiers: ' + summary, { unresolved: items });
    }

    // Verify at least one Motion.scene(...) call exists and collect shot/helper counts.
    let motionSceneCalls = 0;
    const shotFunctions = [];
    const helperFunctions = [];
    for (const node of ast.body) {
        if (node.type === 'FunctionDeclaration' && node.id?.name) {
            if (/^drawShot_\d+$/.test(node.id.name)) {
                shotFunctions.push(node.id.name);
            } else {
                helperFunctions.push(node.id.name);
            }
        }
    }
    const countSceneCalls = (node) => {
        if (!node || typeof node !== 'object') return;
        if (
            node.type === 'CallExpression'
            && node.callee?.type === 'MemberExpression'
            && node.callee.object?.name === 'Motion'
            && node.callee.property?.name === 'scene'
        ) {
            motionSceneCalls += 1;
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === 'parent' || key === 'loc' || key === 'start' || key === 'end') continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child.type === 'string') countSceneCalls(child);
                }
            } else if (value && typeof value.type === 'string') {
                countSceneCalls(value);
            }
        }
    };
    countSceneCalls(ast);
    if (motionSceneCalls !== 1) {
        fail(`Film must contain exactly one Motion.scene(...) call; found ${motionSceneCalls}`);
    }

    // Fast sandboxed JS runtime preflight: executes core.js + styles/shortclipr.js +
    // scene.js against a lightweight Canvas 2D mock for 3 interior frames per shot
    // (+ t=0) so TypeErrors / ReferenceErrors / bad helper arg shapes are caught and
    // auto-repaired in ~50ms inside api-worker before reaching Chromium/ffmpeg-worker.
    const corePath = path.join(ENGINE_ROOT, 'engine', 'core.js');
    const stylePath = path.join(ENGINE_ROOT, 'styles', 'shortclipr.js');
    let preflightFrames = 0;
    if (fs.existsSync(corePath) && fs.existsSync(stylePath)) {
        class MockCanvasGradient {
            addColorStop() {}
        }
        class MockCanvasPattern {
            setTransform() {}
        }
        class MockDOMMatrix {
            constructor() {
                this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
                this.m11 = 1; this.m12 = 0; this.m21 = 0; this.m22 = 1; this.m41 = 0; this.m42 = 0;
            }
            translate() { return this; }
            scale() { return this; }
            rotate() { return this; }
            multiply() { return this; }
            inverse() { return new MockDOMMatrix(); }
        }
        class MockPath2D {
            constructor() {}
            moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {}
            arc() {} arcTo() {} ellipse() {} rect() {} roundRect() {}
            closePath() {} addPath() {}
        }
        class MockCanvasRenderingContext2D {
            constructor(canvas) {
                this.canvas = canvas;
                this.fillStyle = '#000000';
                this.strokeStyle = '#000000';
                this.lineWidth = 1;
                this.lineCap = 'butt';
                this.lineJoin = 'miter';
                this.miterLimit = 10;
                this.lineDashOffset = 0;
                this.globalAlpha = 1;
                this.globalCompositeOperation = 'source-over';
                this.filter = 'none';
                this.font = '10px sans-serif';
                this.textAlign = 'start';
                this.textBaseline = 'alphabetic';
                this.shadowBlur = 0;
                this.shadowColor = 'rgba(0,0,0,0)';
                this.shadowOffsetX = 0;
                this.shadowOffsetY = 0;
                this.imageSmoothingEnabled = true;
                this.imageSmoothingQuality = 'high';
                this._dash = [];
            }
            save() {} restore() {}
            scale() {} rotate() {} translate() {} transform() {} setTransform() {} resetTransform() {}
            getTransform() { return new MockDOMMatrix(); }
            beginPath() {} closePath() {} moveTo() {} lineTo() {}
            bezierCurveTo() {} quadraticCurveTo() {} arc() {} arcTo() {} ellipse() {}
            rect() {} roundRect() {} fill() {} stroke() {} clip() {}
            fillRect() {} strokeRect() {} clearRect() {}
            fillText() {} strokeText() {}
            measureText(text) {
                const len = String(text ?? '').length;
                return { width: len * 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 };
            }
            drawImage() {}
            createLinearGradient() { return new MockCanvasGradient(); }
            createRadialGradient() { return new MockCanvasGradient(); }
            createConicGradient() { return new MockCanvasGradient(); }
            createPattern() { return new MockCanvasPattern(); }
            setLineDash(seg) { this._dash = Array.isArray(seg) ? [...seg] : []; }
            getLineDash() { return [...this._dash]; }
            createImageData(w, h) {
                const sw = Math.max(1, Math.min(64, Math.floor(Number(w) || 1)));
                const sh = Math.max(1, Math.min(64, Math.floor(Number(h) || 1)));
                return { width: sw, height: sh, data: new Uint8ClampedArray(sw * sh * 4) };
            }
            getImageData(x, y, w, h) { return this.createImageData(w, h); }
            putImageData() {}
            isPointInPath() { return false; }
            isPointInStroke() { return false; }
        }
        const createMockCanvas = (w = 900, h = 1600) => {
            const canvas = {
                width: w,
                height: h,
                _ctx: null,
                getContext(type) {
                    if (type === '2d') {
                        if (!this._ctx) this._ctx = new MockCanvasRenderingContext2D(this);
                        return this._ctx;
                    }
                    return null;
                },
                toDataURL() { return 'data:image/png;base64,'; },
            };
            return canvas;
        };

        const sandbox = {
            CanvasRenderingContext2D: MockCanvasRenderingContext2D,
            CanvasGradient: MockCanvasGradient,
            CanvasPattern: MockCanvasPattern,
            Path2D: MockPath2D,
            DOMMatrix: MockDOMMatrix,
            document: {
                createElement: (tag) => (String(tag).toLowerCase() === 'canvas' ? createMockCanvas() : {}),
            },
            console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
        };
        sandbox.window = sandbox;
        sandbox.self = sandbox;
        const ctx = vm.createContext(sandbox);

        const coreSource = fs.readFileSync(corePath, 'utf8');
        const styleSource = fs.readFileSync(stylePath, 'utf8');
        vm.runInContext(coreSource, ctx, { filename: 'core.js', timeout: 2000 });
        vm.runInContext(styleSource, ctx, { filename: 'shortclipr.js', timeout: 2000 });
        vm.runInContext(source, ctx, { filename: 'scene.js', timeout: 3000 });

        const def = vm.runInContext('Motion.def', ctx, { timeout: 1000 });
        if (!def || typeof def.draw !== 'function') {
            fail('Motion.scene(...) did not register a valid draw(g, t, env) function');
        }
        const fps = Number(def.fps) || 30;
        const [W, H] = Array.isArray(def.logical) && def.logical.length === 2 ? def.logical : [900, 1600];
        const duration = Number(def.duration) || 15;
        const total = Math.max(1, Math.round(duration * fps));
        const mainCanvas = createMockCanvas(W, H);
        const mainG = mainCanvas.getContext('2d');
        const env = { W, H, k: 1, fps, duration, total, px: [W, H], sceneDir: '', state: {} };
        sandbox.__preflight = { def, mainG, env, t: 0 };

        if (typeof def.setup === 'function') {
            vm.runInContext('__preflight.def.setup(__preflight.env)', ctx, { filename: 'preflight-setup.js', timeout: 2000 });
        }

        const sampleList = [];
        if (Array.isArray(def.shots) && def.shots.length) {
            for (let sIdx = 0; sIdx < def.shots.length; sIdx++) {
                const shot = def.shots[sIdx];
                if (!Array.isArray(shot) || shot.length < 2) continue;
                const a = Number(shot[0]) || 0;
                const b = Number(shot[1]) || a;
                const span = Math.max(0, b - a);
                const sName = String(shot[2] ?? `Shot ${sIdx}`);
                for (const frac of [0.02, 0.5, 0.92]) {
                    sampleList.push({ t: a + span * frac, shotIndex: sIdx, shotName: sName });
                }
            }
        } else {
            for (const frac of [0.0, 0.5, 0.95]) {
                sampleList.push({ t: duration * frac, shotIndex: null, shotName: null });
            }
        }

        for (const sample of sampleList) {
            sandbox.__preflight.t = sample.t;
            try {
                vm.runInContext(
                    '__preflight.mainG.save(); __preflight.def.draw(__preflight.mainG, __preflight.t, __preflight.env); __preflight.mainG.restore(); if (__preflight.def.post) __preflight.def.post(__preflight.mainG, __preflight.t, __preflight.env);',
                    ctx,
                    { filename: 'preflight-frame.js', timeout: 2000 },
                );
                preflightFrames += 1;
            } catch (runtimeErr) {
                const stack = String(runtimeErr?.stack || runtimeErr?.message || runtimeErr);
                const shotTag = sample.shotIndex !== null ? ` in drawShot_${sample.shotIndex} (${sample.shotName})` : '';
                fail(
                    `Runtime preflight error${shotTag} at t=${sample.t.toFixed(3)}s: ${stack.slice(0, 1200)}`,
                    {
                        phase: 'node_vm_preflight',
                        shot_index: sample.shotIndex,
                        shot_name: sample.shotName,
                        time_seconds: Number(sample.t.toFixed(3)),
                    },
                );
            }
        }
    }

    console.log(JSON.stringify({
        event: 'drawn_by_code.linker.passed',
        helper_count: helperFunctions.length,
        shot_count: shotFunctions.length,
        unresolved_identifiers: 0,
        preflight_frames: preflightFrames,
    }));
} catch (error) {
    fail(error?.message || String(error));
}
