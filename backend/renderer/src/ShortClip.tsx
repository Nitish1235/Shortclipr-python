import React from 'react'
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion'
import type {RenderPlan, ScenePlan} from './contracts'

export const defaultPlan: RenderPlan = {
  projectId: 'preview', title: 'A STORY IN MOTION', narration: '', aspectRatio: '9:16', fps: 30, durationSeconds: 15,
  palette: {background: '#171914', foreground: '#f2f0e7', accent: '#bdff32', secondary: '#c6b7ec'},
  scenes: [{index: 0, start_frame: 0, end_frame: 450, purpose: 'Preview', visual_description: 'A declarative animated short', complexity: 'light', operations: ['reveal', 'orbit'], layers: ['background', 'subject', 'path'], objects: ['central subject', 'orbit path'], events: ['subject pulses while orbit path traces'], camera: 'locked', transition_out: 'fade', animation: {visual_family: 'orbit', headline: 'A STORY IN MOTION', caption: 'CODED FRAME BY FRAME', primary_value: 'central subject', objects: ['central subject', 'orbit path'], events: ['subject pulses while orbit path traces'], motion: 'trace', density: 8, emphasis: 'bold', background: 'ink'}}],
}

type Props = {plan: RenderPlan}
type Animation = NonNullable<ScenePlan['animation']>
type Palette = Required<NonNullable<RenderPlan['palette']>>

const backgroundFor = (name: Animation['background'], palette: Palette) => ({ink: palette.background, paper: '#ece9de', midnight: '#0d1022', signal: '#30155f'}[name])

const Visual: React.FC<{scene: ScenePlan; palette: Palette; progress: number}> = ({scene, palette, progress}) => {
  const program = scene.animation!
  const objectCount = Math.max(2, Math.min(12, program.objects.length))
  const size = 680
  const pulse = 1 + (program.motion === 'pulse' ? Math.sin(progress * Math.PI * 2) * .08 : 0)
  const shift = program.motion === 'rise' ? -50 * progress : program.motion === 'parallax' ? 80 * progress : 0
  const rotation = program.motion === 'cascade' ? 9 * progress : program.motion === 'trace' ? 18 * progress : 0
  const common: React.CSSProperties = {transform: `translate(${shift}px, 0) rotate(${rotation}deg) scale(${pulse})`, display: 'flex', alignItems: 'center', justifyContent: 'center'}
  if (program.visual_family === 'orbit') return <div style={{...common, width: 720, height: 720, position: 'relative'}}>{[0, 1, 2].map(i => <div key={i} style={{position: 'absolute', width: size - i * 150, height: size - i * 150, borderRadius: '50%', border: `${i === 1 ? 5 : 2}px solid ${i === 1 ? palette.secondary : palette.accent}`, opacity: .28 + i * .1}}/>)}<div style={{width: 150, height: 150, borderRadius: '50%', background: palette.accent}}/></div>
  if (program.visual_family === 'bars') return <div style={{...common, width: 760, height: 500, alignItems: 'flex-end', gap: 28}}>{Array.from({length: Math.min(10, program.density)}, (_, i) => <div key={i} style={{width: 42, height: 90 + ((i * 83) % 360), borderRadius: 21, background: i % 3 === 0 ? palette.accent : palette.secondary, opacity: .46 + i * .045}}/>)}</div>
  if (program.visual_family === 'timeline') return <div style={{...common, width: 820, height: 360, position: 'relative'}}><div style={{position: 'absolute', width: 760, height: 8, background: palette.secondary}}/>{Array.from({length: Math.min(8, program.density)}, (_, i) => <div key={i} style={{position: 'absolute', left: -360 + i * (720 / Math.max(1, Math.min(8, program.density) - 1)), width: i === Math.min(8, program.density) - 1 ? 76 : 38, height: i === Math.min(8, program.density) - 1 ? 76 : 38, borderRadius: '50%', background: i === Math.min(8, program.density) - 1 ? palette.accent : palette.foreground}}/>)}</div>
  if (program.visual_family === 'particles') return <div style={{...common, width: 780, height: 600, position: 'relative'}}>{Array.from({length: program.density}, (_, i) => <div key={i} style={{position: 'absolute', left: ((i * 173) % 700) - 350, top: ((i * 251) % 520) - 260, width: 28 + (i % 4) * 16, height: 28 + (i % 4) * 16, borderRadius: '50%', background: i % 3 === 0 ? palette.accent : palette.secondary, opacity: .35 + (i % 5) * .1}}/>)}</div>
  if (program.visual_family === 'diagram') return <div style={{...common, width: 840, height: 520, flexDirection: 'column', gap: 50}}><div style={{display: 'flex', gap: 42}}>{Array.from({length: Math.min(5, objectCount)}, (_, i) => <div key={i} style={{width: 145, height: 100, borderRadius: 22, background: i === Math.min(2, objectCount - 1) ? palette.accent : palette.secondary, color: palette.background, display: 'grid', placeItems: 'center', fontSize: 30, fontWeight: 900, transform: `translateY(${Math.sin(progress * Math.PI * 2 + i) * 12}px)`}}>{String(i + 1).padStart(2, '0')}</div>)}</div><div style={{width: 600, height: 5, background: palette.foreground, transform: `rotate(${12 + Math.sin(progress * Math.PI) * 8}deg)`}}/></div>
  if (program.visual_family === 'bridge') return <div style={{...common, width: 900, height: 560, position: 'relative'}}><div style={{position: 'absolute', left: 0, right: 0, bottom: 55, height: 150, background: `linear-gradient(175deg, transparent 42%, ${palette.secondary} 43%, ${palette.secondary} 48%, transparent 49%)`, opacity: .8}}/><div style={{position: 'absolute', left: 80, right: 80, top: 190, height: 18, background: palette.accent, transform: `translateY(${Math.sin(progress * Math.PI) * -12}px)`}}/><div style={{position: 'absolute', left: 150, top: 105, width: 18, height: 285, background: palette.foreground}}/><div style={{position: 'absolute', right: 150, top: 105, width: 18, height: 285, background: palette.foreground}}/><div style={{position: 'absolute', left: 150, top: 105, width: 600, height: 190, borderTop: `5px solid ${palette.foreground}`, borderRadius: '50% 50% 0 0'}}/><div style={{position: 'absolute', left: 90, right: 90, bottom: 10, display: 'flex', justifyContent: 'space-around'}}>{Array.from({length: Math.min(10, objectCount + 4)}, (_, i) => <i key={i} style={{width: 12, height: 12, borderRadius: '50%', background: palette.accent, transform: `translateY(${Math.sin(progress * Math.PI * 2 + i) * 12}px)`}}/>)}</div></div>
  if (program.visual_family === 'wave') return <div style={{...common, width: 900, height: 420, alignItems: 'center', gap: 10}}>{Array.from({length: 18}, (_, i) => <div key={i} style={{width: 22, height: 90 + Math.abs(Math.sin(progress * Math.PI * 2 + i * .55)) * 210, borderRadius: 12, background: i % 3 === 0 ? palette.accent : palette.secondary, transform: `translateY(${Math.sin(progress * Math.PI * 2 + i * .55) * 18}px)`}}/>)}</div>
  if (program.visual_family === 'map') return <div style={{...common, width: 820, height: 560, position: 'relative'}}><div style={{position: 'absolute', inset: 25, border: `3px solid ${palette.secondary}`, borderRadius: '42% 58% 49% 51%', transform: `rotate(${rotation}deg)`}}/><div style={{position: 'absolute', width: 560, height: 8, background: palette.accent, transform: `rotate(-24deg) translateX(${shift}px)`}}/>{[[-230, 130], [0, -30], [220, -130]].map(([x, y], i) => <div key={i} style={{position: 'absolute', left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, width: 36, height: 36, borderRadius: '50%', background: i === 1 ? palette.accent : palette.foreground, border: `5px solid ${palette.background}`}}/>)}</div>
  if (program.visual_family === 'mechanism') return <div style={{...common, width: 820, height: 560, position: 'relative'}}>{[0, 1, 2].map(i => <div key={i} style={{position: 'absolute', left: 120 + i * 250, top: 180 + (i % 2) * 90, width: 190 - i * 28, height: 190 - i * 28, borderRadius: '50%', border: `18px dashed ${i === 1 ? palette.accent : palette.secondary}`, transform: `rotate(${(progress * 360 * (i % 2 ? -1 : 1)) + i * 30}deg)`}}/>)}</div>
  if (program.visual_family === 'typography') return <div style={{...common, width: 900, height: 480, position: 'relative', flexDirection: 'column'}}><div style={{width: 620, height: 46, background: palette.foreground, transform: `translateX(${Math.sin(progress * Math.PI * 2) * 28}px)`}}/><div style={{width: 620, height: 22, marginTop: 35, background: palette.accent, transform: `scaleX(${.55 + progress * .45})`}}/><div style={{width: 410, height: 10, marginTop: 18, background: palette.secondary, transform: `translateX(${Math.cos(progress * Math.PI * 2) * -35}px)`}}/></div>
  if (program.visual_family === 'split') return <div style={{...common, width: 820, height: 520, gap: 24}}><div style={{width: 390, height: 500, borderRadius: 44, background: palette.secondary, opacity: .78}}/><div style={{width: 390, height: 500, borderRadius: 44, background: palette.accent, opacity: .88}}/></div>
  if (program.visual_family === 'counter') return <div style={{...common, width: 800, height: 560, position: 'relative'}}>{[0, 1, 2, 3].map(i => <div key={i} style={{position: 'absolute', width: 150 + i * 70, height: 150 + i * 70, borderRadius: '50%', border: `${i === 0 ? 16 : 5}px solid ${i % 2 ? palette.secondary : palette.accent}`, transform: `rotate(${progress * 180 * (i % 2 ? -1 : 1)}deg)`}}/>)}</div>
  throw new Error(`Unsupported visual family: ${program.visual_family}`)
}

const Scene: React.FC<{scene: ScenePlan; palette: Palette; duration: number}> = ({scene, palette, duration}) => {
  const frame = useCurrentFrame()
  const {fps, width} = useVideoConfig()
  const enter = Math.min(Math.round(fps * .55), Math.max(1, Math.round(duration * .25)))
  const exit = Math.min(Math.round(fps * .4), Math.max(1, Math.round(duration * .2)))
  const opacity = interpolate(frame, [0, enter, Math.max(enter + 1, duration - exit), duration], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
  const y = interpolate(frame, [0, enter, duration], [44, 0, -30], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
  const scale = spring({frame, fps, config: {damping: 18, stiffness: 100}, durationInFrames: enter})
  const progress = duration <= 1 ? 1 : frame / (duration - 1)
  const wide = width >= 1900
  return <AbsoluteFill style={{background: backgroundFor(scene.animation!.background, palette), color: palette.foreground}}><div style={{position: 'absolute', inset: 0, opacity, transform: `translateY(${y}px)`}}><div style={{position: 'absolute', inset: '5%', border: `2px solid ${palette.foreground}`, borderRadius: 48, opacity: .18}}/><div style={{position: 'absolute', left: '50%', top: wide ? '50%' : '42%', transform: `translate(-50%, -50%) scale(${(wide ? .72 : .82) * scale})`}}><Visual scene={scene} palette={palette} progress={progress}/></div></div></AbsoluteFill>
}

export const ShortClip: React.FC<Props> = ({plan}) => {
  const palette = {...defaultPlan.palette, ...plan.palette} as Palette
  return <AbsoluteFill>{plan.scenes.map(scene => {const duration = Math.max(1, scene.end_frame - scene.start_frame); return <Sequence key={scene.index} from={scene.start_frame} durationInFrames={duration}><Scene scene={scene} palette={palette} duration={duration}/></Sequence>})}</AbsoluteFill>
}

export const RemotionComposition: React.FC<Props> = props => <ShortClip {...props}/>
