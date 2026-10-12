// ==========================================================
// Configuración de Supabase (modo online)
// ----------------------------------------------------------
// Reemplazá estos valores por los de TU proyecto de Supabase:
// Panel de Supabase → Project Settings → API (o "Data API")
//   - Project URL          → SUPABASE_URL
//   - anon / publishable key → SUPABASE_ANON_KEY
// Mientras queden los valores de ejemplo, el modo online muestra
// un aviso y el resto del juego funciona igual.
// ==========================================================

export const SUPABASE_URL = 'https://nvlwlmyuqorxaupcdbdb.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im52bHdsbXl1cW9yeGF1cGNkYmRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMDA2NzcsImV4cCI6MjEwNTg3NjY3N30.Q72VI5FTTR7WwqsbxSAJo6JRPTL_rhoUsXKwnm6TTPQ';

// ¿Están configuradas las claves?
export function supabaseConfigurado() {
  return (
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('TU-PROYECTO') &&
    SUPABASE_ANON_KEY.length > 20 &&
    !SUPABASE_ANON_KEY.includes('TU-ANON')
  );
}
