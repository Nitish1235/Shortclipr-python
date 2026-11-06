export type Department = 'learn' | 'story' | 'engage'
export type AspectRatio = '9:16' | '1:1' | '16:9'
export type ProjectStatus = 'draft' | 'queued' | 'planning' | 'rendering' | 'complete' | 'failed' | 'cancelled'

export interface User {
  id: string
  email: string
  fullName: string
  avatarUrl?: string
  plan: string
  subscriptionStatus?: string
  isAdmin: boolean
}

export interface CreditBalance {
  total: number
  used: number
  remaining: number
  cycleEndsAt?: string
}

export interface BillingCheckoutStatus {
  sessionId: string
  plan: 'starter' | 'creator' | 'studio'
  status: 'created' | 'completed' | 'failed'
}

export interface Project {
  id: string
  title: string
  brief: string
  clipType: string
  department: Department
  language: string
  voiceId: string
  visualStyle: string
  durationSeconds: number
  aspectRatio: AspectRatio
  status: ProjectStatus
  progress: number
  creditsReserved: number
  outputUrl?: string
  posterUrl?: string
  createdAt: string
  updatedAt: string
}

export interface ShowcaseClip {
  id: string
  title: string
  description: string
  department: Department
  aspectRatio: AspectRatio
  videoUrl: string
  posterUrl?: string
  published: boolean
  featured: boolean
  landingVisible?: boolean
  sourceProjectId?: string
  sortOrder: number
  createdAt: string
}

export type LandingThumbnailSlot = `landing_thumbnail_${1 | 2 | 3 | 4 | 5 | 6}`
export type LandingCollectionSlot = `collection_${'learn' | 'story' | 'engage'}_${1 | 2 | 3}`
export type LandingMediaSlot = 'landing_hero_background' | 'landing_hero_machine' | 'screening_feature' | 'screening_side' | LandingThumbnailSlot | LandingCollectionSlot
export interface LandingMedia {
  id: string
  slot: LandingMediaSlot
  title: string
  caption: string
  mediaKind: 'image' | 'video'
  mediaUrl: string
  createdAt: string
}

export interface AdminJob extends Project {
  ownerEmail: string
  ownerName: string
}

export interface Voice {
  id: string
  name: string
  language: string
  description?: string
  previewUrl?: string
}

export interface VoiceLibraryGeneration {
  generated: number
  failed: number
  total: number
  failures: string[]
}

export interface WorkerRegionStatus {
  jobClass: 'api' | 'render'
  region: string
  capacity: number
  assigned: number
  available: number
  status: 'available' | 'full' | 'cooldown'
  blockedUntil?: string
  lastError?: string
  lastRejectionAt?: string
  lastSuccessAt?: string
  updatedAt: string
}

export interface WorkerFleetStatus {
  regions: WorkerRegionStatus[]
  queuedApi: number
  queuedRender: number
  runningApi: number
  runningRender: number
  failed24h: number
  generatedAt: string
}

export interface CreateProjectInput {
  brief: string
  clipType: string
  department: Department
  language: string
  voiceId: string
  visualStyle: string
  durationSeconds: number
  aspectRatio: AspectRatio
}
