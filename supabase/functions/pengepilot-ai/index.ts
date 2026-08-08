import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://5kzfdv7wvj-bot.github.io";
const DEV_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:5500"]);
const MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";

function cors(req) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === APP_ORIGIN || DEV_ORIGINS.has(origin) ? origin : APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function reply(req, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json; charset=utf-8" }
  });
}

function publicKey() {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return parsed.default || Object.values(parsed)[0] || "";
    } catch {}
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
}

function norm(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "a")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function matches(rule, tx) {
  const raw = String(rule.match_field === "merchant" ? tx.merchant || "" : tx.description || "");
  const source = norm(raw);
  const needle = norm(rule.match_value);
  try {
    if (rule.match_type === "exact") return source === needle;
    if (rule.match_type === "starts_with") return source.startsWith(needle);
    if (rule.match_type === "regex") return new RegExp(rule.match_value, "i").test(raw);
    return source.includes(needle);
  } catch {
    return false;
  }
}

function outputText(payload) {
  return (payload?.output || [])
    .flatMap(item => item?.content || [])
    .filter(item => item?.type === "output_text")
    .map(item => item?.text || "")
    .join("\n")
    .trim();
}

async function openAI({ instructions, input, schema = null, name = "pengepilot_output", maxTokens = 2500 }) {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY mangler i Supabase Edge Function secrets.");
  const body = {
    model: MODEL,
    store: false,
    max_output_tokens: maxTokens,
    instructions,
    input: typeof input === "string" ? input : JSON.stringify(input)
  };
  if (schema) {
    body.text = { format: { type: "json_schema", name, strict: true, schema } };
  }
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API fejlede (${response.status}): ${text.slice(0, 400)}`);
  }
  const payload = await response.json();
  const text = outputText(payload);
  if (!text) throw new Error("OpenAI returnerede intet svar.");
  return { text, data: schema ? JSON.parse(text) : null, model: payload.model || MODEL };
}

async function categorize(req, supabase, body) {
  const ids = [...new Set((Array.isArray(body.transaction_ids) ? body.transaction_ids : []).filter(x => typeof x === "string"))].slice(0, 50);
  if (!ids.length) return reply(req, { ok: true, configured: Boolean(Deno.env.get("OPENAI_API_KEY")), changed: 0, learned: 0, ai: 0, remaining: 0, model: MODEL });

  const [txRes, catRes, ruleRes] = await Promise.all([
    supabase.from("transactions").select("id,transaction_date,description,merchant,amount,category_id").in("id", ids),
    supabase.from("categories").select("id,name,category_type,is_archived").eq("is_archived", false).order("sort_order", { ascending: true }),
    supabase.from("category_rules").select("match_field,match_type,match_value,category_id,enabled,priority").eq("enabled", true).order("priority", { ascending: true })
  ]);
  for (const result of [txRes, catRes, ruleRes]) if (result.error) throw result.error;

  const categories = catRes.data || [];
  const byId = Object.fromEntries(categories.map(c => [c.id, c]));
  const otherId = categories.find(c => norm(c.name) === "andet")?.id || null;
  const unresolved = (txRes.data || []).filter(t => !t.category_id || t.category_id === otherId);
  let learned = 0;
  const aiRows = [];

  for (const tx of unresolved) {
    const rule = (ruleRes.data || []).find(r => matches(r, tx));
    if (rule?.category_id && byId[rule.category_id]) {
      const { error } = await supabase.from("transactions").update({ category_id: rule.category_id }).eq("id", tx.id);
      if (error) throw error;
      learned++;
    } else {
      aiRows.push(tx);
    }
  }

  if (!aiRows.length) return reply(req, { ok: true, configured: Boolean(Deno.env.get("OPENAI_API_KEY")), changed: learned, learned, ai: 0, remaining: 0, model: MODEL });
  if (!Deno.env.get("OPENAI_API_KEY")) return reply(req, { ok: true, configured: false, changed: learned, learned, ai: 0, remaining: aiRows.length, model: MODEL });

  const names = categories.map(c => c.name);
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            category_name: { type: "string", enum: names },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" }
          },
          required: ["id", "category_name", "confidence", "reason"]
        }
      }
    },
    required: ["results"]
  };

  const { data, model } = await openAI({
    name: "pengepilot_categories",
    schema,
    maxTokens: 2200,
    instructions: "Du kategoriserer danske privatøkonomiske banktransaktioner. Vælg altid præcis én af de tilladte kategorier. Brug beløbets fortegn, merchant og beskrivelse. Løn, salary, payroll og tydelige arbejdsgiverbetalinger skal være Indkomst. Overførsler mellem egne konti eller til opsparing skal være en transfer/opsparingskategori, hvis den findes. Brug Andet ved reel tvivl. Returnér kun det krævede JSON.",
    input: {
      allowed_categories: categories.map(c => ({ name: c.name, type: c.category_type })),
      transactions: aiRows.map(t => ({ id: t.id, date: t.transaction_date, description: String(t.description || "").slice(0, 180), merchant: String(t.merchant || "").slice(0, 140), amount: Number(t.amount || 0) }))
    }
  });

  const byName = new Map(categories.map(c => [norm(c.name), c.id]));
  let ai = 0;
  const details = [];
  for (const item of data.results || []) {
    if (!ids.includes(item.id)) continue;
    const categoryId = byName.get(norm(item.category_name));
    if (!categoryId) continue;
    const { error } = await supabase.from("transactions").update({ category_id: categoryId }).eq("id", item.id);
    if (error) throw error;
    ai++;
    details.push({ id: item.id, category: item.category_name, confidence: item.confidence, reason: item.reason });
  }
  return reply(req, { ok: true, configured: true, changed: learned + ai, learned, ai, remaining: Math.max(0, aiRows.length - ai), model, details });
}

async function snapshot(supabase) {
  const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const [txRes, catRes, subRes, billRes, goalRes, budgetRes] = await Promise.all([
    supabase.from("transactions").select("transaction_date,description,merchant,amount,category_id").gte("transaction_date", since).order("transaction_date", { ascending: false }).limit(5000),
    supabase.from("categories").select("id,name,category_type,is_archived").eq("is_archived", false),
    supabase.from("subscriptions").select("name,amount,cadence,status,next_payment_date").limit(100),
    supabase.from("bills").select("name,amount,due_date,status,cadence").order("due_date", { ascending: true }).limit(100),
    supabase.from("goals").select("name,target_amount,current_amount,monthly_contribution,target_date,status").limit(50),
    supabase.from("budgets").select("period_start,amount,category_id").order("period_start", { ascending: false }).limit(200)
  ]);
  for (const result of [txRes, catRes, subRes, billRes, goalRes, budgetRes]) if (result.error) throw result.error;
  const categories = catRes.data || [];
  const cmap = Object.fromEntries(categories.map(c => [c.id, c]));
  const months = {};
  const categorySpend = {};
  const merchants = {};
  for (const t of txRes.data || []) {
    if (cmap[t.category_id]?.category_type === "transfer") continue;
    const month = String(t.transaction_date).slice(0, 7);
    months[month] ||= { income: 0, expenses: 0 };
    const amount = Number(t.amount || 0);
    if (amount >= 0) months[month].income += amount;
    else {
      const spend = Math.abs(amount);
      months[month].expenses += spend;
      const category = cmap[t.category_id]?.name || "Ukategoriseret";
      categorySpend[category] = (categorySpend[category] || 0) + spend;
      const merchant = String(t.merchant || t.description || "Ukendt").slice(0, 80);
      merchants[merchant] = (merchants[merchant] || 0) + spend;
    }
  }
  const divisor = Math.max(1, Object.keys(months).length);
  return {
    period: { since, months_with_data: Object.keys(months).length },
    months,
    category_spend: Object.entries(categorySpend).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, total]) => ({ name, total, monthly_average: total / divisor })),
    top_merchants: Object.entries(merchants).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, total]) => ({ name, total, monthly_average: total / divisor })),
    subscriptions: (subRes.data || []).filter(x => x.status === "active"),
    upcoming_bills: (billRes.data || []).filter(x => x.status === "expected").slice(0, 30),
    goals: (goalRes.data || []).filter(x => x.status === "active"),
    budgets: budgetRes.data || []
  };
}

async function explain(req, supabase, body) {
  const question = String(body.question || "").trim().slice(0, 1200);
  if (!question) return reply(req, { error: "Skriv et spørgsmål først." }, 400);
  const data = await snapshot(supabase);
  const result = await openAI({
    instructions: "Du er PengePilot, en nøgtern dansk privatøkonomi-assistent. Svar kun ud fra de vedlagte data. Skeln tydeligt mellem faktiske tal og estimater. Giv konkrete forklaringer om forbrug, budget og almindelige besparelser, men giv ikke investerings-, skatte-, juridisk- eller lånerådgivning. Opfind aldrig transaktioner eller beløb.",
    input: { question, financial_snapshot: data },
    maxTokens: 1800
  });
  return reply(req, { ok: true, answer: result.text, model: result.model });
}

async function savings(req, supabase, userId) {
  const data = await snapshot(supabase);
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      suggestions: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            monthly_saving: { type: "number", minimum: 0 },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            why: { type: "string" }
          },
          required: ["title", "description", "monthly_saving", "confidence", "why"]
        }
      }
    },
    required: ["suggestions"]
  };
  const result = await openAI({
    name: "pengepilot_savings",
    schema,
    instructions: "Find realistiske, frivillige besparelser i en dansk privatøkonomi. Brug kun de vedlagte kategori-, merchant-, abonnement-, regnings-, mål- og budgetdata. Vær konservativ og undgå investering, skat, kredit og gældsomlægning. Hvis datagrundlaget er tyndt, returnér færre forslag.",
    input: { financial_snapshot: data },
    maxTokens: 2200
  });
  const rows = (result.data.suggestions || []).map(s => ({
    user_id: userId,
    opportunity_type: "ai_generated",
    title: String(s.title).slice(0, 120),
    description: String(s.description).slice(0, 600),
    monthly_saving: Math.max(0, Math.round(Number(s.monthly_saving || 0) * 100) / 100),
    confidence: Math.max(0, Math.min(1, Number(s.confidence || 0.5))),
    status: "open",
    evidence: { source: "openai", model: result.model, why: String(s.why).slice(0, 500) }
  }));
  const { error: deleteError } = await supabase.from("savings_opportunities").delete().eq("opportunity_type", "ai_generated").eq("status", "open");
  if (deleteError) throw deleteError;
  if (rows.length) {
    const { error } = await supabase.from("savings_opportunities").insert(rows);
    if (error) throw error;
  }
  return reply(req, { ok: true, count: rows.length, suggestions: rows, model: result.model });
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, { error: "Method not allowed" }, 405);
  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return reply(req, { error: "Ikke logget ind." }, 401);
    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = publicKey();
    if (!url || !key) return reply(req, { error: "Supabase function environment er ikke korrekt konfigureret." }, 500);
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return reply(req, { error: "Ugyldig eller udløbet session." }, 401);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action === "status") return reply(req, { ok: true, configured: Boolean(Deno.env.get("OPENAI_API_KEY")), model: MODEL });
    if (action === "categorize") return await categorize(req, supabase, body);
    if (action === "explain") return await explain(req, supabase, body);
    if (action === "savings") return await savings(req, supabase, userData.user.id);
    return reply(req, { error: "Ukendt AI-handling." }, 400);
  } catch (error) {
    console.error("pengepilot-ai", error);
    return reply(req, { error: error instanceof Error ? error.message : "Ukendt serverfejl" }, 500);
  }
});
