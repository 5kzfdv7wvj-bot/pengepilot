import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://5kzfdv7wvj-bot.github.io";
const DEV_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:5500"]);
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-5-mini";

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === APP_ORIGIN || DEV_ORIGINS.has(origin) ? origin : APP_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

function publishableKey() {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return parsed.default || Object.values(parsed)[0] || "";
    } catch {
      // fall through to legacy key
    }
  }
  return Deno.env.get("SUPABASE_ANON_KEY") || "";
}

function normalize(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ruleMatches(rule: any, tx: any) {
  const source = normalize(rule.match_field === "merchant" ? tx.merchant : tx.description);
  const needle = normalize(rule.match_value);
  try {
    if (rule.match_type === "exact") return source === needle;
    if (rule.match_type === "starts_with") return source.startsWith(needle);
    if (rule.match_type === "regex") return new RegExp(rule.match_value, "i").test(source);
    return source.includes(needle);
  } catch {
    return false;
  }
}

function responseText(payload: any) {
  return (payload?.output || [])
    .flatMap((item: any) => item?.content || [])
    .filter((item: any) => item?.type === "output_text")
    .map((item: any) => item?.text || "")
    .join("\n")
    .trim();
}

async function openAI(payload: Record<string, unknown>) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY mangler i Supabase Edge Function secrets.");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      store: false,
      max_output_tokens: 3000,
      ...payload,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API fejlede (${response.status}): ${text.slice(0, 500)}`);
  }
  return await response.json();
}

async function openAIJson(name: string, schema: Record<string, unknown>, instructions: string, input: unknown) {
  const payload = await openAI({
    instructions,
    input: JSON.stringify(input),
    text: {
      format: {
        type: "json_schema",
        name,
        strict: true,
        schema,
      },
    },
  });
  const text = responseText(payload);
  if (!text) throw new Error("AI returnerede intet struktureret svar.");
  return { data: JSON.parse(text), model: payload.model || OPENAI_MODEL };
}

async function openAIText(instructions: string, input: unknown) {
  const payload = await openAI({ instructions, input: JSON.stringify(input) });
  const text = responseText(payload);
  if (!text) throw new Error("AI returnerede intet svar.");
  return { text, model: payload.model || OPENAI_MODEL };
}

function monthKey(date: string) {
  return String(date || "").slice(0, 7);
}

async function buildSnapshot(supabase: any) {
  const since = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const [txRes, allTxRes, catRes, accountRes, budgetRes, subRes, billRes, goalRes] = await Promise.all([
    supabase.from("transactions").select("id,transaction_date,description,merchant,amount,category_id,account_id").gte("transaction_date", since).order("transaction_date", { ascending: false }).limit(5000),
    supabase.from("transactions").select("account_id,amount").limit(10000),
    supabase.from("categories").select("id,name,category_type,is_archived").eq("is_archived", false),
    supabase.from("accounts").select("id,name,bank_name,opening_balance,is_archived").eq("is_archived", false),
    supabase.from("budgets").select("period_start,amount,category_id").order("period_start", { ascending: false }).limit(200),
    supabase.from("subscriptions").select("name,amount,cadence,status,next_payment_date").eq("status", "active").limit(100),
    supabase.from("bills").select("name,amount,due_date,status,cadence").order("due_date", { ascending: true }).limit(100),
    supabase.from("goals").select("name,target_amount,current_amount,monthly_contribution,target_date,status").eq("status", "active").limit(50),
  ]);

  for (const result of [txRes, allTxRes, catRes, accountRes, budgetRes, subRes, billRes, goalRes]) {
    if (result.error) throw result.error;
  }

  const tx = txRes.data || [];
  const categories = catRes.data || [];
  const categoryById = Object.fromEntries(categories.map((c: any) => [c.id, c]));
  const isTransfer = (t: any) => categoryById[t.category_id]?.category_type === "transfer";

  const months: Record<string, { income: number; expenses: number }> = {};
  const categorySpend: Record<string, number> = {};
  const merchantSpend: Record<string, number> = {};

  for (const t of tx) {
    if (isTransfer(t)) continue;
    const m = monthKey(t.transaction_date);
    months[m] ||= { income: 0, expenses: 0 };
    const amount = Number(t.amount || 0);
    if (amount >= 0) months[m].income += amount;
    else {
      const spend = Math.abs(amount);
      months[m].expenses += spend;
      const category = categoryById[t.category_id]?.name || "Ukategoriseret";
      categorySpend[category] = (categorySpend[category] || 0) + spend;
      const merchant = String(t.merchant || t.description || "Ukendt").slice(0, 80);
      merchantSpend[merchant] = (merchantSpend[merchant] || 0) + spend;
    }
  }

  const monthValues = Object.values(months);
  const divisor = Math.max(1, monthValues.length);
  const avgIncome = monthValues.reduce((s, v) => s + v.income, 0) / divisor;
  const avgExpenses = monthValues.reduce((s, v) => s + v.expenses, 0) / divisor;

  const movementByAccount: Record<string, number> = {};
  for (const row of allTxRes.data || []) {
    movementByAccount[row.account_id] = (movementByAccount[row.account_id] || 0) + Number(row.amount || 0);
  }

  const accounts = (accountRes.data || []).map((a: any) => ({
    name: a.name,
    bank_name: a.bank_name,
    estimated_balance: Number(a.opening_balance || 0) + Number(movementByAccount[a.id] || 0),
  }));

  return {
    period: { since, months_with_data: Object.keys(months).length },
    averages: {
      monthly_income: Math.round(avgIncome * 100) / 100,
      monthly_expenses: Math.round(avgExpenses * 100) / 100,
      monthly_net: Math.round((avgIncome - avgExpenses) * 100) / 100,
    },
    months,
    category_spend: Object.entries(categorySpend).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, total]) => ({ name, total, monthly_average: total / divisor })),
    top_merchants: Object.entries(merchantSpend).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, total]) => ({ name, total, monthly_average: total / divisor })),
    accounts,
    budgets: budgetRes.data || [],
    subscriptions: subRes.data || [],
    upcoming_bills: (billRes.data || []).filter((b: any) => b.status === "expected").slice(0, 30),
    goals: goalRes.data || [],
  };
}

async function categorize(req: Request, supabase: any, body: any) {
  const ids = Array.from(new Set((Array.isArray(body.transaction_ids) ? body.transaction_ids : []).filter((id: unknown) => typeof id === "string"))).slice(0, 50);
  if (!ids.length) return json(req, { ok: true, changed: 0, ai: 0, learned: 0, remaining: 0, model: OPENAI_MODEL });

  const [txRes, catRes, ruleRes] = await Promise.all([
    supabase.from("transactions").select("id,transaction_date,description,merchant,amount,category_id").in("id", ids),
    supabase.from("categories").select("id,name,category_type,is_archived").eq("is_archived", false).order("sort_order", { ascending: true }),
    supabase.from("category_rules").select("match_field,match_type,match_value,category_id,enabled,priority").eq("enabled", true).order("priority", { ascending: true }),
  ]);
  if (txRes.error) throw txRes.error;
  if (catRes.error) throw catRes.error;
  if (ruleRes.error) throw ruleRes.error;

  const categories = catRes.data || [];
  const categoryById = Object.fromEntries(categories.map((c: any) => [c.id, c]));
  const otherId = categories.find((c: any) => normalize(c.name) === "andet")?.id || null;
  const unresolved = (txRes.data || []).filter((t: any) => !t.category_id || t.category_id === otherId);

  let learned = 0;
  const afterRules: any[] = [];
  for (const tx of unresolved) {
    const rule = (ruleRes.data || []).find((r: any) => ruleMatches(r, tx));
    if (rule?.category_id && categoryById[rule.category_id]) {
      const { error } = await supabase.from("transactions").update({ category_id: rule.category_id }).eq("id", tx.id);
      if (error) throw error;
      learned++;
    } else {
      afterRules.push(tx);
    }
  }

  if (!afterRules.length) return json(req, { ok: true, changed: learned, ai: 0, learned, remaining: 0, model: OPENAI_MODEL });

  const names = categories.map((c: any) => c.name);
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
            reason: { type: "string" },
          },
          required: ["id", "category_name", "confidence", "reason"],
        },
      },
    },
    required: ["results"],
  };

  const aiInput = afterRules.map((t: any) => ({
    id: t.id,
    date: t.transaction_date,
    description: String(t.description || "").slice(0, 160),
    merchant: String(t.merchant || "").slice(0, 120),
    amount: Number(t.amount || 0),
  }));

  const { data, model } = await openAIJson(
    "pengepilot_categories",
    schema,
    `Du kategoriserer danske privatøkonomiske banktransaktioner. Vælg altid præcis én af de tilladte kategorier. Brug beløbets fortegn, merchant og tekst. Positive løn-/arbejdsgiverbetalinger skal være Indkomst. Overførsler mellem egne konti eller til opsparing skal være en transfer/opsparingskategori, hvis den findes. Vær konservativ ved tvivl og brug Andet, hvis ingen konkret kategori passer. Returnér kun det krævede JSON.`,
    { allowed_categories: categories.map((c: any) => ({ name: c.name, type: c.category_type })), transactions: aiInput },
  );

  const categoryByName = new Map(categories.map((c: any) => [normalize(c.name), c.id]));
  let aiChanged = 0;
  const details: any[] = [];
  for (const result of data.results || []) {
    const categoryId = categoryByName.get(normalize(result.category_name));
    if (!categoryId || !ids.includes(result.id)) continue;
    const { error } = await supabase.from("transactions").update({ category_id: categoryId }).eq("id", result.id);
    if (error) throw error;
    aiChanged++;
    details.push({ id: result.id, category: result.category_name, confidence: result.confidence, reason: result.reason });
  }

  return json(req, {
    ok: true,
    changed: learned + aiChanged,
    learned,
    ai: aiChanged,
    remaining: Math.max(0, afterRules.length - aiChanged),
    model,
    details,
  });
}

async function explain(req: Request, supabase: any, body: any) {
  const question = String(body.question || "").trim().slice(0, 1200);
  if (!question) return json(req, { error: "Skriv et spørgsmål først." }, 400);
  const snapshot = await buildSnapshot(supabase);
  const { text, model } = await openAIText(
    `Du er PengePilot, en nøgtern dansk privatøkonomi-assistent. Svar kun ud fra de vedlagte brugerdata og sig tydeligt, når datagrundlaget ikke er nok. Forklar tal og mønstre konkret på dansk. Skeln mellem faktiske tal og estimater. Giv gerne praktiske forslag til almindeligt forbrug og budget, men giv ikke investerings-, skatte-, juridisk- eller lånerådgivning og opfind aldrig transaktioner eller beløb.`,
    { question, financial_snapshot: snapshot },
  );
  return json(req, { ok: true, answer: text, model });
}

async function savings(req: Request, supabase: any, userId: string) {
  const snapshot = await buildSnapshot(supabase);
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
            why: { type: "string" },
          },
          required: ["title", "description", "monthly_saving", "confidence", "why"],
        },
      },
    },
    required: ["suggestions"],
  };

  const { data, model } = await openAIJson(
    "pengepilot_savings",
    schema,
    `Du analyserer en dansk privatøkonomi og finder realistiske, frivillige besparelser. Brug kun observerede kategori-, merchant-, abonnements- og budgetdata. Vær konservativ: foreslå ikke at fjerne nødvendige bolig-, sundheds- eller familieudgifter uden konkret grundlag. Undgå investering, skat, kredit, gældsomlægning og finansielle produkter. Estimer månedlig besparelse realistisk og forklar kort hvorfor. Hvis der ikke er nok data, returnér færre forslag.`,
    { financial_snapshot: snapshot },
  );

  const suggestions = (data.suggestions || []).map((s: any) => ({
    user_id: userId,
    opportunity_type: "ai_generated",
    title: String(s.title).slice(0, 120),
    description: String(s.description).slice(0, 600),
    monthly_saving: Math.max(0, Math.round(Number(s.monthly_saving || 0) * 100) / 100),
    confidence: Math.max(0, Math.min(1, Number(s.confidence || 0.5))),
    status: "open",
    evidence: { source: "openai", model, why: String(s.why).slice(0, 500) },
  }));

  const { error: deleteError } = await supabase.from("savings_opportunities").delete().eq("opportunity_type", "ai_generated").eq("status", "open");
  if (deleteError) throw deleteError;
  if (suggestions.length) {
    const { error: insertError } = await supabase.from("savings_opportunities").insert(suggestions);
    if (insertError) throw insertError;
  }

  return json(req, { ok: true, count: suggestions.length, suggestions, model });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return json(req, { error: "Ikke logget ind." }, 401);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = publishableKey();
    if (!url || !key) return json(req, { error: "Supabase function environment er ikke korrekt konfigureret." }, 500);

    const supabase = createClient(url, key, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return json(req, { error: "Ugyldig eller udløbet session." }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "categorize") return await categorize(req, supabase, body);
    if (action === "explain") return await explain(req, supabase, body);
    if (action === "savings") return await savings(req, supabase, userData.user.id);

    return json(req, { error: "Ukendt AI-handling." }, 400);
  } catch (error) {
    console.error("pengepilot-ai", error);
    const message = error instanceof Error ? error.message : "Ukendt serverfejl";
    return json(req, { error: message }, 500);
  }
});
