export interface ScenePlan {
  index: number
  start_frame: number
  end_frame: number
  purpose: string
  visual_description: string
  complexity: 'light' | 'medium' | 'heavy'
  operations: string[]
  layers: string[]
  camera: string
  transition_out: string
  assigned_model?: string
  animation?: {
    visual_family: 'typography' | 'diagram' | 'orbit' | 'bars' | 'timeline' | 'particles' | 'split' | 'counter'
    headline: string
    caption: string
    primary_value: string
    motion: 'sweep' | 'rise' | 'pulse' | 'trace' | 'cascade' | 'parallax'
    density: number
    emphasis: 'quiet' | 'balanced' | 'bold'
    background: 'ink' | 'paper' | 'midnight' | 'signal'
  }
}

export interface RenderPlan {
  projectId: string
  title: string
  narration: string
  aspectRatio: '9:16' | '1:1' | '16:9'
  fps: number
  durationSeconds: number
  audioPath?: string
  scenes: ScenePlan[]
  palette?: { background:string; foreground:string; accent:string; secondary:string }
}
