window.PENGEPILOT_CONFIG = {
  supabaseUrl: 'https://ydtovbdyqxnqyitebcsg.supabase.co',
  supabasePublishableKey: 'sb_publishable_xrlVr0ynNmf2cCJRqdJ9HA_Tysy-HjB',
  baseUrl: 'https://5kzfdv7wvj-bot.github.io/pengepilot/',
  aiEnabled: false
};

(() => {
  if (window.__PENGEPILOT_POLISH_LOADER__) return;
  window.__PENGEPILOT_POLISH_LOADER__ = true;
  const files = [
    'assets/polish-core-v7.js?v=7',
    'assets/polish-finance-v7.js?v=7',
    'assets/polish-local-v7.js?v=7'
  ];
  let i = 0;
  const loadNext = () => {
    if (i >= files.length) return;
    const script = document.createElement('script');
    script.src = files[i++];
    script.async = false;
    script.onload = loadNext;
    document.head.appendChild(script);
  };
  loadNext();
})();
