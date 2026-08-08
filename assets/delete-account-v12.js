(() => {
  const url = 'https://ydtovbdyqxnqyitebcsg.supabase.co';
  const key = 'sb_publishable_xrlVr0ynNmf2cCJRqdJ9HA_Tysy-HjB';
  const sb = window.supabase.createClient(url, key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const status = message => { const node = document.querySelector('#status'); if (node) node.innerHTML = message || ''; };

  async function render() {
    const { data } = await sb.auth.getUser();
    const user = data?.user;
    document.querySelector('#signedOut').hidden = Boolean(user);
    document.querySelector('#signedIn').hidden = !user;
    if (user) document.querySelector('#accountEmail').textContent = user.email || '';
  }

  window.ppDeleteLogin = async event => {
    event.preventDefault();
    status('<div class="notice">Logger ind...</div>');
    const email = document.querySelector('#email').value.trim();
    const password = document.querySelector('#password').value;
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { status(`<div class="notice bad">${esc(error.message)}</div>`); return; }
    status('');
    await render();
  };

  window.ppDeleteAccount = async event => {
    event.preventDefault();
    const confirmText = document.querySelector('#confirmDelete').value.trim().toUpperCase();
    if (confirmText !== 'SLET') {
      status('<div class="notice bad">Skriv SLET for at bekraefte.</div>');
      return;
    }
    const button = document.querySelector('#deleteButton');
    button.disabled = true;
    button.textContent = 'Sletter...';
    status('<div class="notice">Sletter konto og PengePilot-data...</div>');
    const { data, error } = await sb.functions.invoke('delete-account', { body: { confirm: 'SLET' } });
    if (error || !data?.ok) {
      status(`<div class="notice bad">${esc(error?.message || data?.error || 'Kunne ikke slette kontoen.')}</div>`);
      button.disabled = false;
      button.textContent = 'Slet konto permanent';
      return;
    }
    try { await sb.auth.signOut(); } catch {}
    document.querySelector('#signedIn').hidden = true;
    document.querySelector('#signedOut').hidden = true;
    status('<div class="notice good"><b>Kontoen er slettet.</b><br>Din PengePilot-bruger og tilknyttede appdata er fjernet.</div>');
  };

  sb.auth.onAuthStateChange(() => render());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
  else render();
})();
