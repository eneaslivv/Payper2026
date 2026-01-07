
import { createClient } from '@supabase/supabase-js';
import { Database } from '../supabaseTypes';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check for missing environment variables
const isProd = import.meta.env.PROD;
if (!supabaseUrl || !supabaseAnonKey) {
    const errorMsg = 'CRITICAL: Missing Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)';
    console.error(errorMsg);
    if (isProd) {
        // In production, show error to user
        document.body.innerHTML = `<div style="padding:40px;text-align:center;font-family:sans-serif;color:#ff4444;">
            <h1>Error de Configuración</h1>
            <p>Variables de entorno faltantes. Contacta al administrador.</p>
        </div>`;
        throw new Error(errorMsg);
    }
}

export const supabase = createClient<Database>(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
);
