# Coffee Payper - Integrated Management Suite

Sistema de gestión integral para cafeterías y restaurantes, con soporte para múltiples sucursales, pedidos QR, gestión de inventario y procesamiento de facturas con IA.

## 🚀 Despliegue en Vercel

Este proyecto está configurado para desplegarse fácilmente en Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Feneaslivv%2FPayper2026)

### Pasos Manuales

1.  Entra a [Vercel](https://vercel.com/new).
2.  Importa tu repositorio: **`eneaslivv/Payper2026`**.
3.  **IMPORTANTE**: En la sección "Environment Variables", añade las siguientes variables copiándolas de tu archivo `.env`:
    *   `VITE_SUPABASE_URL`
    *   `VITE_SUPABASE_ANON_KEY`
    *   `VITE_RESEND_API_KEY`
    *   `VITE_GEMINI_API_KEY`
4.  Haz clic en **Deploy**.

## Tecnologías

*   React + Vite
*   TailwindCSS
*   Supabase (Auth, DB, Storage)
*   Google Gemini AI
