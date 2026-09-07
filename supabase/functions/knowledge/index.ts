// Knowledge library for Module Tech Software — the "learning" side of the AI.
//
// The technician uploads datasheets / notes (PDF, photo or pasted text). This
// function transcribes files with Gemini, splits the text into chunks, embeds
// each chunk, and stores them in Postgres (pgvector). Later, the `gemini`
// function embeds a question and pulls the most relevant chunks back in as
// reference — so the AI answers grounded in the workshop's own material.
//
//   POST { action: "ingest", title, source?, tags?, kind?, text?, file?:{mime,data} }
//        -> { doc_id, chunks, chars }
//   POST { action: "search", query, k?, min? } -> { matches }
//   POST { action: "embed",  text? }           -> { model, dim }   (setup check)
//
// Secrets (app_secrets rows): GEMINI_API_KEY (required),
//   GEMINI_EMBED_MODEL (optional, default gemini-embedding-001),
//   GEMINI_MODEL (optional, used to transcribe files).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

const EMBED_DIM = 768;
const GENAI = 'https://generativelanguage.googleapis.com/v1beta/models';

async function embedTexts(apiKey: string, model: string, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const requests = batch.map((t) => ({
      model: 'models/' + model,
      content: { parts: [{ text: t }] },
      outputDimensionality: EMBED_DIM,
    }));
    const r = await fetch(GENAI + '/' + model + ':batchEmbedContents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ requests }),
    });
    if (!r.ok) throw new Error('embed ' + r.status + ': ' + (await r.text()).slice(0, 300));
    const d = await r.json();
    for (const e of d.embeddings || []) out.push(e.values);
  }
  return out;
}

async function transcribe(apiKey: string, model: string, mime: string, data: string): Promise<string> {
  const parts = [
    { text: 'Transcribe ALL text and technical content from this document into clean plain text / light markdown. Preserve pinout tables, part numbers, pin functions, voltages, resistances and headings exactly. Do not summarise, shorten or omit anything. For a diagram or photo, describe its technical content (labels, connections, component values).' },
    { inline_data: { mime_type: mime, data } },
  ];
  const r = await fetch(GENAI + '/' + model + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature: 0 } }),
  });
  if (!r.ok) throw new Error('transcribe ' + r.status + ': ' + (await r.text()).slice(0, 300));
  const out = await r.json();
  const cand = out?.candidates?.[0];
  return (cand?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim();
}

function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const clean = (text || '').replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const nl = clean.lastIndexOf('\n', end);
      if (nl > i + size * 0.5) end = nl;
    }
    const piece = clean.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const SUPA_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const authHeader = req.headers.get('Authorization') ?? '';
  const userClient = createClient(SUPA_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Not authorised' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* ignore */ }
  const action = String(body.action || 'ingest');

  const admin = createClient(SUPA_URL, SERVICE);
  const { data: rows } = await admin.from('app_secrets').select('key,value');
  const S: Record<string, string> = {};
  (rows ?? []).forEach((r: any) => (S[r.key] = r.value));
  const apiKey = S.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY not set in app_secrets' }, 503);
  const embedModel = S.GEMINI_EMBED_MODEL || 'gemini-embedding-001';
  const genModel = S.GEMINI_MODEL || 'gemini-3.6-flash';

  try {
    if (action === 'embed') {
      const v = await embedTexts(apiKey, embedModel, [String(body.text || 'test')]);
      return json({ model: embedModel, dim: v[0]?.length ?? 0 });
    }

    if (action === 'search') {
      const q = String(body.query || '').trim();
      if (!q) return json({ error: 'No query' }, 400);
      const [qv] = await embedTexts(apiKey, embedModel, [q]);
      const { data: matches, error } = await admin.rpc('match_knowledge', {
        query_embedding: '[' + qv.join(',') + ']',
        match_count: body.k || 6,
        min_similarity: typeof body.min === 'number' ? body.min : 0.3,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ matches });
    }

    if (action === 'ingest') {
      const title = String(body.title || '').trim();
      if (!title) return json({ error: 'Give the document a title' }, 400);
      const kind = String(body.kind || (body.file ? 'file' : 'text'));
      const source = String(body.source || '').trim() || null;
      const tags = Array.isArray(body.tags) ? body.tags.map((t: any) => String(t).trim()).filter(Boolean) : [];

      let text = String(body.text || '');
      if (body.file && body.file.data) {
        if (String(body.file.data).length > 15_000_000) return json({ error: 'File too big — keep it under about 11MB' }, 400);
        text = await transcribe(apiKey, genModel, body.file.mime || 'application/pdf', body.file.data);
      }
      const chunks = chunkText(text);
      if (!chunks.length) return json({ error: 'No readable text found in that document.' }, 400);

      const embeds = await embedTexts(apiKey, embedModel, chunks);
      if (embeds.length !== chunks.length) return json({ error: 'Embedding count did not match chunk count' }, 500);

      const { data: doc, error: de } = await admin.from('knowledge_docs')
        .insert({ title, source, tags, kind, chunk_count: chunks.length })
        .select('id').single();
      if (de) return json({ error: de.message }, 500);

      const rowsIns = chunks.map((c, i) => ({
        doc_id: doc.id, idx: i, content: c, embedding: '[' + embeds[i].join(',') + ']',
      }));
      const { error: ce } = await admin.from('knowledge_chunks').insert(rowsIns);
      if (ce) { await admin.from('knowledge_docs').delete().eq('id', doc.id); return json({ error: ce.message }, 500); }

      return json({ doc_id: doc.id, chunks: chunks.length, chars: text.length });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
