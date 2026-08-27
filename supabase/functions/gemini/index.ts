// Gemini proxy for Module Tech Software.
//
// The front end is public static files, so the Gemini API key can never live there.
// This function holds it instead: it checks the caller is a logged-in user, reads the
// key from the `app_secrets` table (service role, so RLS doesn't hide it), and forwards
// the request to Google.
//
// The front end sends what to ask; the key never leaves the server.
//
//   POST { system?, prompt, images?: [{ mime, data }], schema?, model?, temperature? }
//   ->   { text, data?, model }
//
// `schema` is an OpenAPI-subset response schema. When present Gemini is asked for JSON
// and the parsed object comes back in `data`.
//
// Secrets used (rows in app_secrets):
//   GEMINI_API_KEY  required — https://aistudio.google.com/apikey
//   GEMINI_MODEL    optional — defaults to gemini-2.5-flash

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

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_PROMPT = 60_000;   // characters
const MAX_IMAGES = 4;
const MAX_IMAGE = 6_000_000; // base64 characters, ~4.5MB of image

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

  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) return json({ error: "No prompt provided" }, 400);
  if (prompt.length > MAX_PROMPT) return json({ error: "Prompt too long" }, 400);

  const images = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : [];
  for (const img of images) {
    if (!img || typeof img.data !== "string" || img.data.length > MAX_IMAGE) {
      return json({ error: "Image too large — keep photos under about 4MB" }, 400);
    }
  }

  // Load the key (service role bypasses RLS on app_secrets)
  const admin = createClient(SUPA_URL, SERVICE);
  const { data: rows } = await admin.from("app_secrets").select("key,value");
  const S: Record<string, string> = {};
  (rows ?? []).forEach((r: any) => (S[r.key] = r.value));

  const apiKey = S.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ error: "Gemini isn't set up yet — add a GEMINI_API_KEY row to app_secrets." }, 503);
  }
  const model = String(body.model || S.GEMINI_MODEL || DEFAULT_MODEL);

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
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
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

  const result: Record<string, unknown> = { text, model };
  if (body.schema) {
    // Normally clean JSON, but strip a ```json fence if one slips through.
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    try { result.data = JSON.parse(cleaned); }
    catch (_) { return json({ error: "Gemini's answer wasn't valid JSON — try again.", text }, 502); }
  }
  return json(result, 200);
});
