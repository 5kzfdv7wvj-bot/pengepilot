window.PENGEPILOT_CONFIG = {
  supabaseUrl: 'https://ydtovbdyqxnqyitebcsg.supabase.co',
  supabasePublishableKey: 'sb_publishable_xrlVr0ynNmf2cCJRqdJ9HA_Tysy-HjB',
  baseUrl: 'https://5kzfdv7wvj-bot.github.io/pengepilot/',
  aiEnabled: true
};

(() => {
  if (window.__PENGEPILOT_POLISH_LOADER__) return;
  window.__PENGEPILOT_POLISH_LOADER__ = true;
  const files = [
    'assets/polish-core-v7.js?v=7',
    'assets/polish-finance-v7.js?v=7',
    'assets/polish-overview-v7.js?v=7',
    'assets/polish-local-v7.js?v=7',
    'assets/ai-runtime-v8.js?v=10',
    'assets/import-ai-v8.js?v=8',
    'assets/simplify-v10.js?v=10'
  ];
  const start = () => {
    let i = 0;
    const loadNext = () => {
      if (i >= files.length) {
        setTimeout(() => {
          try {
            if (typeof currentUser !== 'undefined' && currentUser && typeof render === 'function') render();
          } catch {}
        }, 150);
        return;
      }
      const script = document.createElement('script');
      script.src = files[i++];
      script.async = false;
      script.onload = loadNext;
      document.head.appendChild(script);
    };
    loadNext();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
