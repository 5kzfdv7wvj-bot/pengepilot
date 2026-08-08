// PengePilot native shell v12. No-op on the normal web app except for exposing platform state.
(() => {
  const cap = window.Capacitor;
  const native = Boolean(cap?.isNativePlatform?.());
  const platform = native ? (cap?.getPlatform?.() || 'native') : 'web';
  window.PENGEPILOT_NATIVE = { enabled: native, platform };
  if (!native) return;

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !/viewport-fit=cover/i.test(viewport.content)) {
    viewport.content = `${viewport.content},viewport-fit=cover,maximum-scale=1`;
  }

  document.documentElement.classList.add('pp-native', `pp-native-${platform}`);
  const style = document.createElement('style');
  style.id = 'pp-native-css';
  style.textContent = `
    html.pp-native,html.pp-native body{overscroll-behavior:none;background:#f4f6fa;min-height:100%;min-height:100dvh}
    html.pp-native body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
    html.pp-native input,html.pp-native textarea,html.pp-native select{user-select:text;-webkit-user-select:text;font-size:16px!important}
    html.pp-native .side{padding-top:max(0px,env(safe-area-inset-top));padding-bottom:max(0px,env(safe-area-inset-bottom))}
    html.pp-native .main{padding-top:max(20px,env(safe-area-inset-top));padding-bottom:calc(54px + env(safe-area-inset-bottom))}
    html.pp-native .modal{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}
    html.pp-native .modal-card{max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 24px);overflow:auto}
    html.pp-native .btn,html.pp-native button,html.pp-native a{-webkit-tap-highlight-color:transparent;touch-action:manipulation}
    html.pp-native button,html.pp-native .btn{min-height:44px}
    html.pp-native a{cursor:pointer}
    @media(max-width:900px){
      html.pp-native .brand{padding-top:max(4px,env(safe-area-inset-top))}
      html.pp-native .main{padding-left:max(14px,env(safe-area-inset-left));padding-right:max(14px,env(safe-area-inset-right))}
      html.pp-native .toolbar{position:relative;z-index:1}
    }
  `;
  document.head.appendChild(style);

  const App = cap?.registerPlugin?.('App') || cap?.Plugins?.App;
  if (!App) return;

  const routes = {
    home: 'index.html',
    dashboard: 'index.html',
    economy: 'transactions.html',
    transactions: 'transactions.html',
    import: 'import.html',
    plan: 'budget.html',
    savings: 'savings.html',
    insights: 'reports.html',
    settings: 'settings.html',
    login: 'login.html'
  };

  function routeKey(url) {
    try {
      const u = new URL(url);
      if (u.protocol !== 'pengepilot:' && !/^https?:$/.test(u.protocol)) return null;
      if (u.protocol === 'pengepilot:') return (u.hostname || u.pathname.split('/').filter(Boolean)[0] || 'home').toLowerCase();
      return u.pathname.split('/').filter(Boolean).at(-1)?.replace(/\.html$/i, '') || 'home';
    } catch { return null; }
  }

  async function handleAuthCallback(url) {
    if (!window.ppSupabase) return false;
    try {
      const u = new URL(url);
      const code = u.searchParams.get('code');
      if (code && window.ppSupabase.auth.exchangeCodeForSession) {
        const { error } = await window.ppSupabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        location.replace('index.html');
        return true;
      }
      const rawHash = String(u.hash || '').replace(/^#/, '');
      const hash = new URLSearchParams(rawHash);
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');
      if (accessToken && refreshToken) {
        const { error } = await window.ppSupabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (error) throw error;
        location.replace('index.html');
        return true;
      }
    } catch (error) {
      console.error('PengePilot native auth callback', error);
    }
    return false;
  }

  async function openUrl(url) {
    const key = routeKey(url);
    if (!key) return;
    if (key === 'auth-callback' && await handleAuthCallback(url)) return;
    const target = routes[key];
    if (target && !location.pathname.endsWith(`/${target}`)) location.href = target;
  }

  App.addListener?.('appUrlOpen', event => openUrl(event?.url));
  App.getLaunchUrl?.().then(result => result?.url && openUrl(result.url)).catch(() => {});
  App.addListener?.('backButton', event => {
    const modal = document.querySelector('#modal');
    if (modal?.innerHTML?.trim()) { modal.innerHTML = ''; return; }
    const side = document.querySelector('.side.open');
    if (side) { side.classList.remove('open'); return; }
    if (event?.canGoBack && history.length > 1) history.back();
    else if (location.pathname.endsWith('/index.html') || location.pathname.endsWith('/')) App.minimizeApp?.();
    else location.href = 'index.html';
  });
})();
