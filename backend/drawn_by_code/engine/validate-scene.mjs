#!/usr/bin/env node
// Validate a generated ShortClipr film for JavaScript syntax, safety, and
// genuinely unresolved identifiers (variables or functions not defined anywhere
// in shared scope, local shot scope, or the allowed runtime globals).
//
// Usage: node validate-scene.mjs <scene.js> [optional-manifest.json]
import fs from 'node:fs';
import { parse } from 'acorn';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const eslintScope = require('eslint-scope');

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

    console.log(JSON.stringify({
        event: 'drawn_by_code.linker.passed',
        helper_count: helperFunctions.length,
        shot_count: shotFunctions.length,
        unresolved_identifiers: 0,
    }));
} catch (error) {
    fail(error?.message || String(error));
}
