(() => {
  const cfg = window.PENGEPILOT_CONFIG;
  if (!cfg || !window.supabase) throw new Error('Supabase-konfiguration kunne ikke indlæses.');
  window.ppSupabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      experimental: { passkey: true }
    }
  });
})();
