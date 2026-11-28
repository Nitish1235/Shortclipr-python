// Renders a scene to MP4, to individual frames or to stills.
//
//   node engine/render.mjs <scene.js>                      → <scene>/out/<name>.mp4
//   node engine/render.mjs <scene.js> --size 1920 --audio mix.wav
//   node engine/render.mjs <scene.js> --at 1.5,3,4.25      → <scene>/out/stills/*.png
//   node engine/render.mjs <scene.js> --frames --jpg       → <scene>/out/frames/f_0000.jpg…
//
// Options: --size <width px>  --from <s>  --to <s>  --step <frames>  --out <path>
//          --audio <file>  --crf <n, default 18>  --jpg (with --frames)
//          --gpu  render on the graphics card (a machine with one: minutes instead of hours;
//                 prints the GL renderer so you can see it took; MOTION_ANGLE picks the backend)
// Times are in SECONDS. Every frame is deterministic: the same t gives the same image.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { openScene, findFfmpeg, parseArgs } from './browser.mjs';

const { pos, opt } = parseArgs(process.argv.slice(2), ['frames', 'jpg', 'gpu']);
const scene = pos[0];
if (!scene || !fs.existsSync(scene)) {
    console.error('Usage: node engine/render.mjs <scene.js> [--size 1920] [--at 1,2.5] [--frames] [--from s] [--to s] [--audio f] [--out path]');
    process.exit(1);
}
const dir = path.dirname(path.resolve(scene));
const name = path.basename(dir);
const outBase = path.join(dir, 'out');
const { page, info, close, errors } = await openScene(scene, { size: opt.size ? Number(opt.size) : 1920, gpu: opt.gpu || process.env.MOTION_GPU === '1' });
const { fps, total } = info;
const t0 = Date.now();
const assertNoPageErrors = () => {
    if (errors.length) {
        throw new Error('[page error] ' + errors.slice(-8).join('\n'));
    }
};
const grab = async (i, type, phase = 'video_render') => {
    let data;
    try {
        data = await page.evaluate(([i, type]) => {
            window.renderFrame(i);
            return document.getElementById('c').toDataURL(type, 0.85).split(',')[1];
        }, [i, type]);
    } catch (error) {
        const timeSeconds = i / fps;
        const shotIndex = Array.isArray(info.shots)
            ? info.shots.findIndex(([start, end], idx) => (
                idx === info.shots.length - 1
                    ? timeSeconds >= start
                    : timeSeconds >= start && timeSeconds < end
            ))
            : -1;
        const message = String(error?.message || error);
        const typed = /^(ReferenceError|TypeError|SyntaxError|RangeError):/.exec(message);
        console.error(JSON.stringify({
            event: 'drawn_by_code.runtime_error',
            error_type: typed?.[1] || error?.name || 'Error',
            message: message.slice(0, 1200),
            frame: i,
            time_seconds: Number(timeSeconds.toFixed(6)),
            shot_index: shotIndex >= 0 ? shotIndex : null,
            shot_name: shotIndex >= 0 ? info.shots[shotIndex]?.[2] ?? null : null,
            phase,
        }));
        throw new Error(`Generated scene runtime failure during ${phase} at frame ${i} (${timeSeconds.toFixed(3)}s): ${message}`);
    }
    // Do not spend the remaining frame budget when Chromium reports an uncaught
    // browser error in addition to the directly captured frame exception.
    assertNoPageErrors();
    return data;
};

try {
    // Optional production QA capture: sample a few frames inside each storyboard
    // shot without opening a second Chromium session or changing MP4 rendering.
    if (opt['qa-at']) {
        const out = opt['qa-out'] ?? path.join(outBase, 'motion-qa');
        const times = [...new Set(String(opt['qa-at']).split(',').map(Number))]
            .filter((value) => Number.isFinite(value) && value >= 0);
        let canWriteFrames = true;
        try {
            fs.mkdirSync(out, { recursive: true });
        } catch (error) {
            canWriteFrames = false;
            console.warn(JSON.stringify({
                event: 'drawn_by_code.motion_qa.capture_storage_failed',
                error: String(error).slice(0, 500),
            }));
        }

        const qaStartedAt = Date.now();
        let maxQaFrameMs = 0;
        const maxAllowedQaFrameMs = Number(process.env.DRAWN_BY_CODE_MAX_QA_FRAME_MS || 15000);
        for (const [index, seconds] of times.entries()) {
            const frame = Math.min(total - 1, Math.max(0, Math.round(seconds * fps)));
            // Frame execution is the runtime preflight and is always fatal on error.
            // Only the optional PNG write is allowed to fail without aborting render.
            const frameStartedAt = Date.now();
            const imageData = await grab(frame, 'image/png', 'runtime_preflight');
            const frameMs = Date.now() - frameStartedAt;
            if (frameMs > maxQaFrameMs) maxQaFrameMs = frameMs;
            if (frameMs > maxAllowedQaFrameMs) {
                throw new Error(`Slow frame detected during runtime_preflight at frame ${frame} (${(frame / fps).toFixed(2)}s): ${frameMs}ms > ${maxAllowedQaFrameMs}ms`);
            }
            if (!canWriteFrames) continue;
            const file = path.join(out, `q_${String(index).padStart(3, '0')}.png`);
            try {
                fs.writeFileSync(file, Buffer.from(imageData, 'base64'));
            } catch (error) {
                canWriteFrames = false;
                console.warn(JSON.stringify({
                    event: 'drawn_by_code.motion_qa.capture_storage_failed',
                    error: String(error).slice(0, 500),
                }));
            }
        }

        if (canWriteFrames) {
            console.log(JSON.stringify({
                event: 'drawn_by_code.motion_qa.captured',
                frame_count: times.length,
                max_frame_ms: maxQaFrameMs,
                total_ms: Date.now() - qaStartedAt,
                output: out,
            }));
        } else {
            console.warn(JSON.stringify({
                event: 'drawn_by_code.motion_qa.capture_incomplete',
                frame_count: times.length,
                reason: 'optional_frame_storage_failed',
            }));
        }
    }

    if (opt.at) {
        const out = opt.out ?? path.join(outBase, 'stills');
        fs.mkdirSync(out, { recursive: true });
        for (const s of String(opt.at).split(',').map(Number)) {
            const i = Math.min(total - 1, Math.round(s * fps));
            const f = path.join(out, `t_${(i / fps).toFixed(2)}s.png`);
            fs.writeFileSync(f, Buffer.from(await grab(i, 'image/png'), 'base64'));
            console.log(f);
        }
    } else {
        const from = Math.round(Number(opt.from ?? 0) * fps);
        const to = Math.min(total - 1, opt.to !== undefined ? Math.round(Number(opt.to) * fps) : total - 1);
        const step = Number(opt.step ?? 1);
        if (opt.frames) {
            const out = opt.out ?? path.join(outBase, 'frames');
            fs.mkdirSync(out, { recursive: true });
            const ext = opt.jpg ? 'jpg' : 'png';
            for (let i = from; i <= to; i += step) {
                fs.writeFileSync(path.join(out, `f_${String(i).padStart(4, '0')}.${ext}`), Buffer.from(await grab(i, opt.jpg ? 'image/jpeg' : 'image/png'), 'base64'));
            }
            console.log(`frames ${from}..${to} → ${out}`);
        } else {
            const ffmpeg = findFfmpeg();
            if (!ffmpeg) throw new Error('Missing ffmpeg (or FFMPEG_PATH). Use --frames to export just the frames.');
            fs.mkdirSync(outBase, { recursive: true });
            const out = opt.out ?? path.join(outBase, `${name}.mp4`);
            const audio = opt.audio ?? (info.audio?.mix ? path.join(dir, info.audio.mix) : null);
            const args = ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps / step), '-c:v', 'mjpeg', '-i', '-'];
            if (audio && fs.existsSync(audio)) args.push('-ss', String(from / fps), '-i', audio, '-c:a', 'aac', '-b:a', '256k', '-shortest');
            args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', String(opt.crf ?? 18), '-preset', opt.preset ?? 'veryfast', '-movflags', '+faststart', out);
            const ff = spawn(ffmpeg, args, { stdio: ['pipe', 'inherit', 'inherit'] });
            const done = new Promise((ok, ko) => {
                ff.once('error', ko);
                ff.once('close', (code) => (code === 0 ? ok() : ko(new Error('ffmpeg exited with ' + code))));
            });
            let inputError = null;
            ff.stdin.on('error', (error) => { inputError = error; });
            // Attach a handler immediately; the promise is awaited below after
            // frame production, but FFmpeg may fail before the first frame.
            void done.catch(() => {});
            const frameCount = Math.max(1, Math.floor((to - from) / step) + 1);
            let renderedFrames = 0;
            try {
                for (let i = from; i <= to; i += step) {
                    if (inputError) throw inputError;
                    const buf = Buffer.from(await grab(i, 'image/jpeg'), 'base64');
                    if (!ff.stdin.write(buf)) await new Promise((ok, ko) => {
                        const cleanup = () => {
                            ff.stdin.off('drain', onDrain);
                            ff.stdin.off('error', onError);
                        };
                        const onDrain = () => { cleanup(); ok(); };
                        const onError = (error) => { cleanup(); ko(error); };
                        ff.stdin.once('drain', onDrain);
                        ff.stdin.once('error', onError);
                        if (inputError) onError(inputError);
                    });
                    renderedFrames += 1;
                    if (renderedFrames === 1 || renderedFrames % (fps * 3) === 0) {
                        console.log(JSON.stringify({
                            event: 'drawn_by_code.progress',
                            rendered_frames: renderedFrames,
                            total_frames: frameCount,
                            progress: Math.min(99, Math.round(renderedFrames / frameCount * 100)),
                        }));
                    }
                }
                ff.stdin.end();
                await done;
                if (inputError) throw inputError;
            } catch (error) {
                ff.stdin.destroy();
                if (!ff.killed && ff.exitCode === null) ff.kill('SIGKILL');
                await done.catch(() => {});
                throw error;
            }
            console.log(JSON.stringify({ event: 'drawn_by_code.progress', rendered_frames: frameCount, total_frames: frameCount, progress: 100 }));
            console.log(`${out}${audio && fs.existsSync(audio) ? ' (with audio)' : ''}`);
        }
    }
    assertNoPageErrors();
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} finally {
    await close();
}
if (errors.length) {
    console.error(`\n${errors.length} error(s) in the page: see above.`);
    process.exitCode = 1;
}
