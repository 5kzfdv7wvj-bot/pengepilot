// PengePilot AI runtime v13: secure Edge Function client only.
// UI ownership lives in the deterministic web modules to avoid asynchronous renderer overrides/races.
(() => {
  if (window.__PENGEPILOT_AI_V13__) return;
  window.__PENGEPILOT_AI_V13__ = true;
  const cfg = window.PENGEPILOT_CONFIG || {};
  const state = { checkedAt: 0, status: null };

  async function errorMessage(error) {
    let message = error?.message || 'AI-kaldet fejlede.';
    try {
      if (error?.context && typeof error.context.json === 'function') {
        const detail = await error.context.json();
        message = detail?.error || detail?.message || message;
      }
    } catch {}
    return message;
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
    if (cfg.aiEnabled === false) return { deployed:true, configured:false, agent:false, model:null, reason:'disabled' };
    if (!force && state.status && Date.now() - state.checkedAt < 60000) return state.status;
    try {
      const data = await invoke('status');
      state.status = { deployed:true, configured:Boolean(data.configured), agent:Boolean(data.agent), model:data.model || null };
    } catch (error) {
      const message = String(error?.message || error || '');
      state.status = { deployed:!/404|not found|function/i.test(message), configured:false, agent:false, model:null, reason:message || 'unavailable' };
    }
    state.checkedAt = Date.now();
    return state.status;
  }

  async function categorizeIds(ids = []) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return { configured:true, changed:0, ai:0, learned:0, remaining:0 };
    const current = await status(true);
    if (!current.configured) return { configured:false, changed:0, ai:0, learned:0, remaining:unique.length, status:current };
    const totals = { configured:true, changed:0, ai:0, learned:0, remaining:0, model:current.model };
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
})();
