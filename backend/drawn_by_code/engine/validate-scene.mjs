#!/usr/bin/env node
// Link a generated ShortClipr film against its canonical Visual Bible helper manifest.
// This runs in the FFmpeg-worker image before Chromium/FFmpeg starts.
import fs from 'node:fs';
import { parse } from 'acorn';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const eslintScope = require('eslint-scope');

const [sourcePath, manifestPath] = process.argv.slice(2);
if (!sourcePath || !manifestPath) {
    console.error('Usage: node validate-scene.mjs <scene.js> <helper-manifest.json>');
    process.exit(2);
}

const fail = (message) => {
    console.error(JSON.stringify({
        event: 'drawn_by_code.linker.failed',
        message: String(message).slice(0, 1800),
    }));
    process.exit(1);
};

const allowedGlobals = new Set([
    'Motion', 'Ease', 'ShortcliprStyles',
    'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON',
    'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'BigInt', 'RegExp',
    'Error', 'TypeError', 'RangeError', 'parseInt', 'parseFloat',
    'isFinite', 'isNaN', 'NaN', 'Infinity', 'undefined',
]);

try {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest || manifest.schema_version !== 1
        || !Array.isArray(manifest.functions) || !Array.isArray(manifest.shots)) {
        fail('Canonical helper manifest is missing or malformed');
    }

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

    // Build the set of actual top-level drawing function declarations. Do not
    // rely only on eslint-scope's unresolved-reference list: generated drawing
    // calls have a stricter contract than arbitrary browser globals.
    const topLevelDrawingFunctions = new Set();
    for (const [name, variable] of globalScope.set.entries()) {
        if (!/^draw[A-Z][A-Za-z0-9_]*$/.test(name) || name.startsWith('drawShot_')) continue;
        const definitions = variable.defs.filter((definition) =>
            definition.type === 'FunctionName' && definition.node?.type === 'FunctionDeclaration');
        if (definitions.length === 1) topLevelDrawingFunctions.add(name);
    }

    const required = new Map();
    for (const item of manifest.functions) {
        if (!item || typeof item.name !== 'string'
            || !/^draw[A-Z][A-Za-z0-9_]*$/.test(item.name)
            || required.has(item.name)
            || !Array.isArray(item.required_by_shots)
            || !Array.isArray(item.dependencies)) {
            fail('Canonical helper manifest contains an invalid or duplicate function entry');
        }
        required.set(item.name, item);
    }

    const manifestShots = new Map();
    for (const shot of manifest.shots) {
        if (!shot || !Number.isInteger(shot.index)
            || !Array.isArray(shot.required_helpers)
            || manifestShots.has(shot.index)
            || shot.required_helpers.some((name) => !required.has(name))) {
            fail('Canonical helper manifest contains an invalid shot entry');
        }
        manifestShots.set(shot.index, shot);
    }

    // Child-scope through lists also contain references that are resolved by
    // an enclosing scope. Only the global scope's through list represents names
    // that remain unresolved after the complete scope chain has been analyzed.
    const unresolved = new Map();
    for (const ref of globalScope.through) {
        const name = ref.identifier.name;
        if (allowedGlobals.has(name)) continue;
        const location = ref.identifier.loc?.start;
        const entry = {
            name,
            line: location?.line ?? null,
            column: location?.column ?? null,
        };
        unresolved.set(ref.identifier.start, entry);
    }
    if (unresolved.size) {
        const details = [...unresolved.values()]
            .slice(0, 30)
            .map((item) => `${item.name} at ${item.line ?? '?'}:${item.column ?? '?'}`);
        fail('Unresolved JavaScript identifiers: ' + details.join('; '));
    }

    const declarationNames = new Set();
    const helperNodes = new Map();
    for (const [name, variable] of globalScope.set.entries()) {
        if (!/^draw[A-Z]/.test(name) || name.startsWith('drawShot_')) continue;
        if (!required.has(name)) {
            fail(`Shared library declares drawing helper ${name} outside the canonical manifest`);
        }
        const functionDefs = variable.defs.filter((definition) =>
            definition.type === 'FunctionName' && definition.node?.type === 'FunctionDeclaration');
        if (functionDefs.length !== 1) {
            fail(`Required helper ${name} must be defined exactly once as a top-level function declaration`);
        }
        const params = functionDefs[0].node.params.map((param) => param.type === 'Identifier' ? param.name : null);
        const expectedSignature = required.get(name).signature;
        const expectedMatch = typeof expectedSignature === 'string'
            ? expectedSignature.match(/^function\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)$/)
            : null;
        const expectedParams = expectedMatch
            ? expectedMatch[1].split(',').map((value) => value.trim()).filter(Boolean)
            : null;
        if (!expectedParams || JSON.stringify(params) !== JSON.stringify(expectedParams)) {
            fail(`Required helper ${name} does not match its canonical function signature`);
        }
        declarationNames.add(name);
        helperNodes.set(name, functionDefs[0].node);
    }

    const missingDefinitions = [...required.keys()].filter((name) => !declarationNames.has(name));
    if (missingDefinitions.length) {
        fail('Missing canonical drawing implementations: ' + missingDefinitions.join(', '));
    }

    // Dependencies must be declared before implementation. Entity functions are
    // intentionally self-contained in v1; a cross-helper call not listed in the
    // manifest is a linker error, not an implicit runtime dependency.
    const collectCalledHelpers = (root, ownerName) => {
        const called = new Set();
        const visit = (node) => {
            if (!node || typeof node !== 'object') return;
            if (node.type === 'Identifier'
                && required.has(node.name) && node.name !== ownerName) {
                called.add(node.name);
            }
            for (const [key, value] of Object.entries(node)) {
                if (key === 'parent' || key === 'loc' || key === 'start' || key === 'end') continue;
                if (Array.isArray(value)) {
                    for (const child of value) {
                        if (child && typeof child.type === 'string') visit(child);
                    }
                } else if (value && typeof value.type === 'string') {
                    visit(value);
                }
            }
        };
        visit(root.body);
        return [...called].sort();
    };
    for (const [name, item] of required.entries()) {
        const expectedDependencies = [...item.dependencies].sort();
        const actualDependencies = collectCalledHelpers(helperNodes.get(name), name);
        if (JSON.stringify(expectedDependencies) !== JSON.stringify(actualDependencies)) {
            fail(`Helper ${name} dependency manifest does not match its implementation; expected [${expectedDependencies.join(', ')}], found [${actualDependencies.join(', ')}]`);
        }
    }

    // Track direct calls by enclosing drawShot_N function, including calls nested in
    // blocks/closures, so a declaration alone cannot satisfy the usage contract.
    const callsByShot = new Map();
    const walk = (node, currentShot = null) => {
        if (!node || typeof node !== 'object') return;
        let activeShot = currentShot;
        if (node.type === 'FunctionDeclaration' && node.id?.name
            && /^drawShot_\d+$/.test(node.id.name)) {
            activeShot = Number(node.id.name.slice('drawShot_'.length));
        }
        if (node.type === 'CallExpression' && node.callee?.type === 'Identifier') {
            const calledName = node.callee.name;
            if (/^draw[A-Z][A-Za-z0-9_]*$/.test(calledName)
                && !calledName.startsWith('drawShot_')
                && !topLevelDrawingFunctions.has(calledName)) {
                const shotLabel = activeShot === null ? 'outside a shot' : `in shot ${activeShot + 1}`;
                fail(`Drawing helper ${calledName} is called ${shotLabel} but has no top-level function declaration`);
            }
            if (required.has(calledName) && activeShot !== null) {
                if (!callsByShot.has(activeShot)) callsByShot.set(activeShot, new Set());
                callsByShot.get(activeShot).add(calledName);
            }
        }
        for (const [key, value] of Object.entries(node)) {
            if (key === 'parent' || key === 'loc' || key === 'start' || key === 'end') continue;
            if (Array.isArray(value)) {
                for (const child of value) {
                    if (child && typeof child.type === 'string') walk(child, activeShot);
                }
            } else if (value && typeof value.type === 'string') {
                walk(value, activeShot);
            }
        }
    };
    walk(ast);

    for (const [shotIndex, shot] of manifestShots.entries()) {
        const used = callsByShot.get(shotIndex) ?? new Set();
        const missing = shot.required_helpers.filter((name) => !used.has(name));
        if (missing.length) {
            fail(`Shot ${shotIndex + 1} does not call required Visual Bible functions: ${missing.join(', ')}`);
        }
    }
    for (const [name, item] of required.entries()) {
        const expectedShots = [...manifestShots.values()]
            .filter((shot) => shot.required_helpers.includes(name))
            .map((shot) => shot.index)
            .sort((a, b) => a - b);
        const actualShots = [...item.required_by_shots].sort((a, b) => a - b);
        if (JSON.stringify(expectedShots) !== JSON.stringify(actualShots)) {
            fail(`Helper ${name} has inconsistent required_by_shots metadata`);
        }
    }

    console.log(JSON.stringify({
        event: 'drawn_by_code.linker.passed',
        helper_count: required.size,
        shot_count: manifestShots.size,
        unresolved_identifiers: 0,
    }));
} catch (error) {
    fail(error?.stack || error?.message || String(error));
}
