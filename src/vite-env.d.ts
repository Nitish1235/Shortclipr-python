/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
  readonly VITE_DODO_MODE?: 'test' | 'live'
  readonly VITE_DEMO_MODE?: string
  readonly VITE_META_PIXEL_ID?: string
  readonly VITE_GOOGLE_ADS_ID?: string
  readonly VITE_GOOGLE_ADS_SIGNUP_LABEL?: string
  readonly VITE_GOOGLE_ADS_CHECKOUT_LABEL?: string
  readonly VITE_GOOGLE_ADS_SUBSCRIBE_LABEL?: string
  readonly VITE_REDDIT_PIXEL_ID?: string
  readonly VITE_TIKTOK_PIXEL_ID?: string
}
