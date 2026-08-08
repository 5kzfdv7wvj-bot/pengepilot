window.PENGEPILOT_CONFIG = {
  supabaseUrl: 'https://ydtovbdyqxnqyitebcsg.supabase.co',
  supabasePublishableKey: 'sb_publishable_xrlVr0ynNmf2cCJRqdJ9HA_Tysy-HjB',
  baseUrl: 'https://5kzfdv7wvj-bot.github.io/pengepilot/',
  aiEnabled: true
};

(() => {
  if (window.__PENGEPILOT_STABLE_LOADER__) return;
  window.__PENGEPILOT_STABLE_LOADER__ = true;

  for (const href of ['assets/mobile-v14.css?v=14','assets/ai-action-center-v15.css?v=15']) {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = href;
    document.head.appendChild(css);
  }

  const files = [
    'assets/native-runtime-v12.js?v=12',
    'assets/ai-runtime-v13.js?v=13',
    'assets/web-core-v13.js?v=13',
    'assets/import-ai-v8.js?v=8',
    'assets/import-fix-v13.js?v=13',
    'assets/web-economy-v13.js?v=13',
    'assets/web-budget-v13.js?v=13',
    'assets/web-fixed-v13.js?v=13',
    'assets/web-savings-v13.js?v=13',
    'assets/web-dashboard-v13.js?v=13',
    'assets/web-settings-v13.js?v=13',
    'assets/web-economy-v14.js?v=14',
    'assets/web-dashboard-v14.js?v=14',
    'assets/debts-v15.js?v=15',
    'assets/web-boot-v15.js?v=15',
    'assets/ai-action-center-v15.js?v=15'
  ];

  const start = () => {
    let i = 0;
    const loadNext = () => {
      if (i >= files.length) return;
      const script = document.createElement('script');
      script.src = files[i++];
      script.async = false;
      script.onload = loadNext;
      script.onerror = () => console.error('PengePilot kunne ikke indlæse runtime:', script.src);
      document.head.appendChild(script);
    };
    loadNext();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
