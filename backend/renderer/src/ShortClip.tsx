import React from 'react'
import {AbsoluteFill, Sequence, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion'
import type {RenderPlan, ScenePlan} from './contracts'

export const defaultPlan: RenderPlan = {
  projectId: 'preview', title: 'A STORY IN MOTION', narration: '', aspectRatio: '9:16', fps: 30, durationSeconds: 15,
  palette: {background: '#171914', foreground: '#f2f0e7', accent: '#bdff32', secondary: '#c6b7ec'},
  scenes: [{index: 0, start_frame: 0, end_frame: 450, purpose: 'Preview', visual_description: 'A declarative animated short', complexity: 'light', operations: ['text_reveal'], layers: ['background', 'title'], camera: 'locked', transition_out: 'fade', animation: {visual_family: 'orbit', headline: 'A STORY IN MOTION', caption: 'CODED FRAME BY FRAME', primary_value: '60', motion: 'trace', density: 8, emphasis: 'bold', background: 'ink'}}],
}

type Props = {plan: RenderPlan}
type Animation = NonNullable<ScenePlan['animation']>
type Palette = Required<NonNullable<RenderPlan['palette']>>

const backgroundFor = (name: Animation['background'], palette: Palette) => ({ink: palette.background, paper: '#ece9de', midnight: '#0d1022', signal: '#30155f'}[name])

const Visual: React.FC<{scene: ScenePlan; palette: Palette; progress: number}> = ({scene, palette, progress}) => {
  const program = scene.animation!
  const size = 680
  const pulse = 1 + (program.motion === 'pulse' ? Math.sin(progress * Math.PI * 2) * .08 : 0)
  const shift = program.motion === 'rise' ? -50 * progress : program.motion === 'parallax' ? 80 * progress : 0
  const rotation = program.motion === 'cascade' ? 9 * progress : program.motion === 'trace' ? 18 * progress : 0
  const common: React.CSSProperties = {transform: `translate(${shift}px, 0) rotate(${rotation}deg) scale(${pulse})`, display: 'flex', alignItems: 'center', justifyContent: 'center'}
  if (program.visual_family === 'orbit') return <div style={{...common, width: 720, height: 720, position: 'relative'}}>{[0, 1, 2].map(i => <div key={i} style={{position: 'absolute', width: size - i * 150, height: size - i * 150, borderRadius: '50%', border: `${i === 1 ? 5 : 2}px solid ${i === 1 ? palette.secondary : palette.accent}`, opacity: .28 + i * .1}}/>)}<div style={{width: 150, height: 150, borderRadius: '50%', background: palette.accent, display: 'grid', placeItems: 'center', color: palette.background, fontSize: 52, fontWeight: 900}}>{program.primary_value}</div></div>
  if (program.visual_family === 'bars') return <div style={{...common, width: 760, height: 500, alignItems: 'flex-end', gap: 28}}>{Array.from({length: Math.min(10, program.density)}, (_, i) => <div key={i} style={{width: 42, height: 90 + ((i * 83) % 360), borderRadius: 21, background: i % 3 === 0 ? palette.accent : palette.secondary, opacity: .46 + i * .045}}/>)}</div>
  if (program.visual_family === 'timeline') return <div style={{...common, width: 820, height: 360, position: 'relative'}}><div style={{position: 'absolute', width: 760, height: 8, background: palette.secondary}}/>{Array.from({length: Math.min(8, program.density)}, (_, i) => <div key={i} style={{position: 'absolute', left: -360 + i * (720 / Math.max(1, Math.min(8, program.density) - 1)), width: i === Math.min(8, program.density) - 1 ? 76 : 38, height: i === Math.min(8, program.density) - 1 ? 76 : 38, borderRadius: '50%', background: i === Math.min(8, program.density) - 1 ? palette.accent : palette.foreground}}/>)}</div>
  if (program.visual_family === 'particles') return <div style={{...common, width: 780, height: 600, position: 'relative'}}>{Array.from({length: program.density}, (_, i) => <div key={i} style={{position: 'absolute', left: ((i * 173) % 700) - 350, top: ((i * 251) % 520) - 260, width: 28 + (i % 4) * 16, height: 28 + (i % 4) * 16, borderRadius: '50%', background: i % 3 === 0 ? palette.accent : palette.secondary, opacity: .35 + (i % 5) * .1}}/>)}</div>
  if (program.visual_family === 'split') return <div style={{...common, width: 820, height: 520, gap: 24}}><div style={{width: 390, height: 500, borderRadius: 44, background: palette.secondary, opacity: .78}}/><div style={{width: 390, height: 500, borderRadius: 44, background: palette.accent, opacity: .88}}/><strong style={{position: 'absolute', color: palette.background, fontSize: 72}}>{program.primary_value}</strong></div>
  if (program.visual_family === 'counter') return <div style={{...common, width: 800, height: 560, color: palette.accent, fontSize: 280, fontWeight: 900, lineHeight: .8}}>{program.primary_value}</div>
  return <div style={{...common, width: 850, height: 540, color: palette.accent, fontSize: 190, fontWeight: 900, textAlign: 'center'}}>{program.primary_value || program.headline}</div>
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
  const copySize = wide ? 84 : scene.animation!.emphasis === 'bold' ? 108 : 88
  return <AbsoluteFill style={{background: backgroundFor(scene.animation!.background, palette), color: palette.foreground}}><div style={{position: 'absolute', inset: 0, opacity, transform: `translateY(${y}px)`}}><div style={{position: 'absolute', inset: '5%', border: `2px solid ${palette.foreground}`, borderRadius: 48, opacity: .18}}/><div style={{position: 'absolute', left: '50%', top: wide ? '50%' : '34%', transform: `translate(-50%, -50%) scale(${(wide ? .72 : .82) * scale})`}}><Visual scene={scene} palette={palette} progress={progress}/></div><div style={{position: 'absolute', left: wide ? '10%' : '9%', right: wide ? '10%' : '9%', bottom: wide ? '10%' : '11%'}}><div style={{fontSize: copySize, fontWeight: 900, lineHeight: .86, textTransform: 'uppercase'}}>{scene.animation!.headline}</div><div style={{marginTop: 22, color: palette.accent, fontSize: 30, fontWeight: 700, letterSpacing: 4, textTransform: 'uppercase'}}>{scene.animation!.caption}</div></div><div style={{position: 'absolute', left: '5%', top: '4%', color: palette.foreground, opacity: .5, fontSize: 22, fontWeight: 700, letterSpacing: 3}}>SHORTCLIPR / {String(scene.index + 1).padStart(2, '0')}</div></div></AbsoluteFill>
}

export const ShortClip: React.FC<Props> = ({plan}) => {
  const palette = {...defaultPlan.palette, ...plan.palette} as Palette
  return <AbsoluteFill>{plan.scenes.map(scene => {const duration = Math.max(1, scene.end_frame - scene.start_frame); return <Sequence key={scene.index} from={scene.start_frame} durationInFrames={duration}><Scene scene={scene} palette={palette} duration={duration}/></Sequence>})}</AbsoluteFill>
}

export const RemotionComposition: React.FC<Props> = props => <ShortClip {...props}/>
