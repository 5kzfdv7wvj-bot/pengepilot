// Native shell polish for Capacitor builds. No-op on the normal GitHub Pages app.
(() => {
  const cap = window.Capacitor;
  const native = Boolean(cap?.isNativePlatform?.());
  window.PENGEPILOT_NATIVE = {
    enabled: native,
    platform: native ? (cap?.getPlatform?.() || 'native') : 'web'
  };
  if (!native) return;

  const viewport = document.querySelector('meta[name="viewport"]');
  if (viewport && !/viewport-fit=cover/i.test(viewport.content)) {
    viewport.content = `${viewport.content},viewport-fit=cover`;
  }

  document.documentElement.classList.add('pp-native');
  const style = document.createElement('style');
  style.id = 'pp-native-css';
  style.textContent = `
    html.pp-native,html.pp-native body{overscroll-behavior:none;background:#f4f6fa}
    html.pp-native body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
    html.pp-native input,html.pp-native textarea,html.pp-native select{user-select:text;-webkit-user-select:text}
    html.pp-native .side{padding-top:max(0px,env(safe-area-inset-top));padding-bottom:max(0px,env(safe-area-inset-bottom))}
    html.pp-native .main{padding-bottom:calc(50px + env(safe-area-inset-bottom))}
    html.pp-native .modal-card{margin-bottom:env(safe-area-inset-bottom)}
    html.pp-native .btn,html.pp-native button,html.pp-native a{-webkit-tap-highlight-color:transparent}
    @media(max-width:900px){
      html.pp-native .brand{padding-top:max(4px,env(safe-area-inset-top))}
      html.pp-native .main{padding-left:max(14px,env(safe-area-inset-left));padding-right:max(14px,env(safe-area-inset-right))}
    }
  `;
  document.head.appendChild(style);
})();
