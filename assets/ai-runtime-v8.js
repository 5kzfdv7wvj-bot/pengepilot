// PengePilot AI runtime v8: feature detection, secure Edge Function status and conditional AI UI.
(() => {
  const cfg = window.PENGEPILOT_CONFIG || {};
  cfg.aiEnabled = true;
  const state = { checkedAt: 0, status: null, loadingClient: false };

  function errorMessage(error) {
    let message = error?.message || 'AI-kaldet fejlede.';
    try {
      if (error?.context && typeof error.context.json === 'function') {
        return error.context.json().then(detail => detail?.error || detail?.message || message).catch(() => message);
      }
    } catch {}
    return Promise.resolve(message);
  }

  async function invoke(action, payload = {}) {
    const client = window.ppSupabase;
    if (!client) throw new Error('Supabase-klienten er ikke klar.');
    const { data, error } = await client.functions.invoke('pengepilot-ai', { body: { action, ...payload } });
    if (error) throw new Error(await errorMessage(error));
    if (data?.error) throw new Error(data.error);
    return data || {};
  }

  async function status(force = false) {
    if (!cfg.aiEnabled) return { deployed: true, configured: false, model: null, reason: 'disabled' };
    if (!force && state.status && Date.now() - state.checkedAt < 60000) return state.status;
    try {
      const data = await invoke('status');
      state.status = { deployed: true, configured: Boolean(data.configured), model: data.model || null };
    } catch (error) {
      const message = String(error?.message || error || '');
      state.status = {
        deployed: !/404|not found|function/i.test(message),
        configured: false,
        model: null,
        reason: message || 'unavailable'
      };
    }
    state.checkedAt = Date.now();
    return state.status;
  }

  async function categorizeIds(ids = []) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return { configured: true, changed: 0, ai: 0, learned: 0, remaining: 0 };
    const current = await status(true);
    if (!current.configured) return { configured: false, changed: 0, ai: 0, learned: 0, remaining: unique.length, status: current };
    const totals = { configured: true, changed: 0, ai: 0, learned: 0, remaining: 0, model: current.model };
    for (let i = 0; i < unique.length; i += 50) {
      const result = await invoke('categorize', { transaction_ids: unique.slice(i, i + 50) });
      totals.changed += Number(result.changed || 0);
      totals.ai += Number(result.ai || 0);
      totals.learned += Number(result.learned || 0);
      totals.remaining += Number(result.remaining || 0);
      totals.model = result.model || totals.model;
    }
    return totals;
  }

  window.ppAI = { invoke, status, categorizeIds };

  async function loadAiClientIfReady() {
    const pageId = document.body?.dataset?.page || '';
    if (!cfg.aiEnabled || !['transactions', 'chat', 'savings', 'reports'].includes(pageId)) return;
    const current = await status();
    if (!current.configured || state.loadingClient || window.pp6Invoke) return;
    state.loadingClient = true;
    const script = document.createElement('script');
    script.src = 'assets/ai-v6.js?v=10';
    script.async = false;
    script.onload = () => {
      state.loadingClient = false;
      try { if (typeof render === 'function' && typeof currentUser !== 'undefined' && currentUser) render(); } catch {}
    };
    script.onerror = () => { state.loadingClient = false; };
    document.head.appendChild(script);
  }

  async function decorateSettings() {
    if (document.body?.dataset?.page !== 'settings') return;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts++;
      if (typeof renderers === 'undefined' || !renderers.settings) {
        if (attempts > 80) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      const base = renderers.settings;
      const current = await status();
      renderers.settings = async function () {
        const html = await base();
        const label = current.configured
          ? `OpenAI er aktiv${current.model ? ` · ${current.model}` : ''}`
          : current.deployed
            ? 'OpenAI Edge Function er klar · API-nøgle mangler'
            : 'OpenAI Edge Function kunne ikke kontaktes';
        return `<div class="notice ${current.configured ? 'good' : ''}"><b>AI-status:</b> ${esc(label)}. API-nøglen ligger kun server-side i Supabase.</div>${html}`;
      };
      try { if (typeof currentUser !== 'undefined' && currentUser && typeof render === 'function') render(); } catch {}
    }, 25);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { loadAiClientIfReady(); decorateSettings(); }, { once: true });
  } else {
    loadAiClientIfReady();
    decorateSettings();
  }
})();
