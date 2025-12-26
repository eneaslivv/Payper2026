
import { createClient } from '@supabase/supabase-js';
import { Database } from '../supabaseTypes';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('CRITICAL: Missing Supabase environment variables. App will not function correctly.');
    // No lanzamos error aquí para evitar pantalla negra total (Black Screen of Death)
    // El usuario verá errores de conexión después.
}

export const supabase = createClient<Database>(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder'
);
