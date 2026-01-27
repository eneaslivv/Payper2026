/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string
    readonly VITE_SUPABASE_ANON_KEY: string
    readonly RESEND_API_KEY: string
    readonly VITE_SENTRY_DSN?: string
    readonly VITE_RELEASE?: string
    readonly VITE_COMMIT_SHA?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
