import type {LandingMedia} from '../types'

interface LocalMediaStore {
  readLocalMedia(): Promise<LandingMedia[]>
  saveLocalMedia(form:FormData): Promise<LandingMedia>
  deleteLocalMedia(slot:LandingMedia['slot']): Promise<void>
}
export async function localMediaStore():Promise<LocalMediaStore>{
  const modulePath='/landing-media-local.js'
  return import(/* @vite-ignore */ modulePath)
}
