// Store/privacy readiness helpers shared by web and native builds.
(() => {
  const isSettings = document.body?.dataset?.page === 'settings';
  if (!isSettings) return;

  function privacyCard() {
    return `<div class="card" id="pp-store-account-card"><h2>Privatliv &amp; konto</h2><p class="sub">Se hvordan PengePilot behandler dine data, eller slet hele din konto og alle tilknyttede PengePilot-data.</p><div class="pp7actions" style="margin-top:12px"><a class="btn ghost" href="privacy.html">Privatlivspolitik</a><a class="btn ghost pp7danger" href="delete-account.html">Slet konto og data</a></div></div>`;
  }

  function patch() {
    const content = document.querySelector('#content');
    if (!content) return;
    const native = Boolean(window.PENGEPILOT_NATIVE?.enabled);
    const cards = [...content.querySelectorAll('.card')];

    if (native) {
      const passkey = cards.find(card => card.querySelector('h2')?.textContent?.trim() === 'Passkeys');
      if (passkey && !passkey.dataset.nativePatched) {
        passkey.dataset.nativePatched = '1';
        passkey.innerHTML = `<h2>Passkeys</h2><div class="notice"><b>Web-passkeys er bevaret.</b><br>Den native app bruger email/adgangskode, indtil passkeys er verificeret mod et produktionsdom&aelig;ne p&aring; fysiske iOS- og Android-enheder. Det forhindrer at du bliver l&aring;st ude af appen.</div>`;
      }
    }

    if (!content.querySelector('#pp-store-account-card')) {
      const grid = content.querySelector('.grid.g2') || content;
      grid.insertAdjacentHTML('beforeend', privacyCard());
    }
  }

  const observer = new MutationObserver(patch);
  const start = () => {
    const content = document.querySelector('#content');
    if (!content) { setTimeout(start, 50); return; }
    observer.observe(content, { childList: true, subtree: true });
    patch();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
