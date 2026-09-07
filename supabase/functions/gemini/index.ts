// Gemini proxy for Module Tech Software.
//
// The front end is public static files, so the Gemini API key can never live there.
// This function holds it instead: it checks the caller is a logged-in user, reads the
// key from the `app_secrets` table (service role, so RLS doesn't hide it), and forwards
// the request to Google.
//
// The front end sends what to ask; the key never leaves the server.
//
//   POST { system?, prompt, images?: [{ mime, data }], schema?, model?, temperature?,
//          retrieve?: string,      // search the workshop knowledge library and ground the answer
//          search?: boolean,       // live Google Search for known faults on this vehicle/module
//          searchQuery?: string }
//   ->   { text, data?, model, sources?: [{ title }], webSources?: [{ title, uri }] }
//
// `schema` is an OpenAPI-subset response schema. When present Gemini is asked for JSON
// and the parsed object comes back in `data`.
//
// `retrieve` searches the workshop knowledge library (pgvector) and prepends the best
// chunks; `search` does a live web search (grounding with Google Search) as a separate
// step and prepends what it finds. Their sources come back in `sources` / `webSources`.
//
// Secrets used (rows in app_secrets):
//   GEMINI_API_KEY  required — https://aistudio.google.com/apikey
//   GEMINI_MODEL    optional — overrides DEFAULT_MODEL below without a redeploy
//   GEMINI_EMBED_MODEL optional — embedding model for retrieval (default gemini-embedding-001)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const DEFAULT_MODEL = "gemini-3.6-flash";
const EMBED_DIM = 768;
const GENAI = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_PROMPT = 60_000;   // characters
const MAX_IMAGES = 4;
const MAX_IMAGE = 6_000_000; // base64 characters, ~4.5MB of image

async function embedOne(apiKey: string, model: string, text: string): Promise<number[]> {
  const r = await fetch(`${GENAI}/${model}:embedContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ model: "models/" + model, content: { parts: [{ text }] }, outputDimensionality: EMBED_DIM }),
  });
  if (!r.ok) throw new Error("embed " + r.status);
  const d = await r.json();
  return d.embedding.values;
}

// Live web search (grounding with Google Search) as its own step, so it can be
// combined with a JSON response schema on the main call (the two can't share a call).
async function groundedSearch(apiKey: string, model: string, subject: string): Promise<{ text: string; webSources: { title: string; uri: string }[] }> {
  const q = "Search the web for known common faults, weak points, recalls and technical service bulletins relevant to: " +
    subject + ". List the specific real failure modes and their fixes, most common first. Only include things you can support from a source.";
  const payload = {
    contents: [{ role: "user", parts: [{ text: q }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.2 },
  };
  const r = await fetch(`${GENAI}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error("search " + r.status + ": " + (await r.text()).slice(0, 400));
  const out = await r.json();
  const cand = out?.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();
  const chunks = cand?.groundingMetadata?.groundingChunks ?? [];
  const seen = new Set<string>();
  const webSources: { title: string; uri: string }[] = [];
  for (const c of chunks) {
    const w = c?.web;
    if (w?.uri && !seen.has(w.uri)) { seen.add(w.uri); webSources.push({ title: w.title || w.uri, uri: w.uri }); }
  }
  return { text, webSources };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Require a logged-in user (protects the Gemini quota / bill)
  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Not authorised" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }

  let prompt = String(body.prompt ?? "").trim();
  if (!prompt) return json({ error: "No prompt provided" }, 400);
  if (prompt.length > MAX_PROMPT) return json({ error: "Prompt too long" }, 400);

  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  for (const img of images) {
    if (!img || typeof img.data !== "string" || img.data.length > MAX_IMAGE) {
      return json({ error: "Image too large — keep photos under about 4MB" }, 400);
    }
  }

  // Load secrets (service role bypasses RLS on app_secrets)
  const admin = createClient(SUPA_URL, SERVICE);
  const { data: rows } = await admin.from("app_secrets").select("key,value");
  const S: Record<string, string> = {};
  (rows ?? []).forEach((r: any) => (S[r.key] = r.value));

  const apiKey = S.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: "Gemini isn't set up yet — add a GEMINI_API_KEY row to app_secrets." }, 503);
  }
  const model = String(body.model || S.GEMINI_MODEL || DEFAULT_MODEL);
  const embedModel = S.GEMINI_EMBED_MODEL || "gemini-embedding-001";

  // ----- live web search for known faults (grounding with Google Search) -----
  let webSources: { title: string; uri: string }[] = [];
  let searchError = "";
  if (body.search === true) {
    try {
      const subject = String(body.searchQuery || body.retrieve || prompt).slice(0, 600);
      const g = await groundedSearch(apiKey, model, subject);
      if (g.text) {
        prompt = "Known issues found on the web for this exact vehicle / module (real-world common faults, recalls, TSBs — treat as leads to verify against the car in front of you, not gospel):\n\n" +
          g.text + "\n\n=====\n\n" + prompt;
      }
      webSources = g.webSources;
    } catch (e) {
      // Best-effort: the answer still runs without the web search. Report why it was skipped.
      const m = String((e as Error).message || e);
      searchError = /\b429\b|RESOURCE_EXHAUSTED|quota/i.test(m)
        ? "Live web search is unavailable on this Gemini key (Google Search grounding needs billing enabled)."
        : "Live web search couldn't run this time.";
    }
  }

  // ----- knowledge retrieval (grounding from the workshop library) -----
  let sources: { title: string }[] = [];
  const retrieve = String(body.retrieve ?? "").trim();
  if (retrieve) {
    try {
      const qv = await embedOne(apiKey, embedModel, retrieve);
      const { data: matches } = await admin.rpc("match_knowledge", {
        query_embedding: "[" + qv.join(",") + "]",
        match_count: Number(body.knowledgeK) || 6,
        min_similarity: typeof body.knowledgeMin === "number" ? body.knowledgeMin : 0.35,
      });
      if (matches && matches.length) {
        const ctx = matches.map((m: any) => `[${m.title}]\n${m.content}`).join("\n\n---\n\n");
        prompt =
          "Reference material from the workshop's own library. Prefer it where it applies to THIS exact vehicle/module; " +
          "if it doesn't cover something, rely on your own knowledge and say which parts weren't in the library.\n\n" +
          ctx + "\n\n=====\n\n" + prompt;
        const seen = new Set<string>();
        for (const m of matches) {
          if (!seen.has(m.title)) { seen.add(m.title); sources.push({ title: m.title }); }
        }
      }
    } catch (_) { /* retrieval is best-effort — never fail the answer over it */ }
  }

  const parts: unknown[] = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inline_data: { mime_type: img.mime || "image/jpeg", data: img.data } });
  }

  const payload: Record<string, unknown> = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: typeof body.temperature === "number" ? body.temperature : 0.2,
    },
  };
  if (body.system) payload.systemInstruction = { parts: [{ text: String(body.system) }] };
  if (body.schema) {
    (payload.generationConfig as any).responseMimeType = "application/json";
    (payload.generationConfig as any).responseSchema = body.schema;
  }

  let res: Response;
  try {
    res = await fetch(
      `${GENAI}/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(payload),
      },
    );
  } catch (e) {
    return json({ error: "Couldn't reach Gemini: " + String(e) }, 502);
  }

  if (!res.ok) {
    const detail = await res.text();
    let msg = `Gemini returned ${res.status}`;
    try { msg = JSON.parse(detail)?.error?.message || msg; } catch (_) { /* ignore */ }
    return json({ error: msg }, 502);
  }

  const out = await res.json();
  const cand = out?.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p: any) => p.text ?? "").join("").trim();

  if (!text) {
    const why = cand?.finishReason || out?.promptFeedback?.blockReason || "no answer";
    return json({ error: `Gemini gave nothing back (${why}). Try rewording.` }, 502);
  }

  const result: Record<string, unknown> = { text, model, sources, webSources };
  if (searchError) result.searchError = searchError;
  if (body.schema) {
    // Normally clean JSON, but strip a ```json fence if one slips through.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { result.data = JSON.parse(cleaned); }
    catch (_) { return json({ error: "Gemini's answer wasn't valid JSON — try again.", text }, 502); }
  }
  return json(result, 200);
});
