import React from 'react'
import {Composition} from 'remotion'
import {ShortClip, defaultPlan} from './ShortClip'
import type {RenderPlan} from './contracts'

const dimensions: Record<RenderPlan['aspectRatio'], [number, number]> = {
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
  '16:9': [1920, 1080],
}

export const RemotionRoot: React.FC = () => {
  const [width, height] = dimensions[defaultPlan.aspectRatio]
  return <Composition id="ShortClipr" component={ShortClip} durationInFrames={defaultPlan.durationSeconds * defaultPlan.fps} fps={defaultPlan.fps} width={width} height={height} defaultProps={{plan: defaultPlan}} calculateMetadata={({props}) => {const plan = (props as {plan?: RenderPlan}).plan ?? defaultPlan; const [planWidth, planHeight] = dimensions[plan.aspectRatio]; return {durationInFrames: Math.round(plan.durationSeconds * plan.fps), fps: plan.fps, width: planWidth, height: planHeight}}} />
}
