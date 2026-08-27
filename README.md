# Module Tech Software

Workshop management app for vehicle remapping & module repair, recovery and cloning.

**🌐 Live app:** https://m0688.github.io/module-tech-software/
**📦 Repo:** https://github.com/M0688/module-tech-software

**Features**
- 🔐 Secure login (only authorised users can see any data)
- 🛠️ Jobs — the hub. Auto-numbered (JOB-0001), tracks type (remap / module repair / cloning /
  recovery / diagnostic) and status, with the customer, vehicle, files, invoice and diagnostics
  all on one page. Search across everything — name, phone, reg, make, model, VIN.
- ✅ Job checklist — a fixed workflow (read, write, resets, clear DTCs…) with a progress bar
  and an N/A toggle per step
- 👥 Customers — contact details & notes
- 🚗 Vehicles — reg, make/model, year, engine, ECU, gearbox, VIN. Type a registration and tab
  out and the make/model/year/engine fill themselves in from DVLA & MOT data.
- 📁 Files — upload read, write, backup, EEPROM, flash & diag files against a vehicle or job,
  label them afterwards, download any time. Two bulk import routes:
  **Scan folder** (reads a reg folder straight off your PC) and **Sync from Google Drive**
  (pulls `remapping/<reg>/` folders, creating vehicles and jobs it doesn't recognise).
- 🧾 Invoices — build from a job in one click, line items, VAT, notes, then print or save as PDF.
  Status tracking (draft / sent / paid / overdue).
- 🧭 Diagnostics — build step-by-step templates for PCB/module work, then run one against a job,
  capturing readings and photos as you go
- ✨ AI assistance (Google Gemini) — four places it helps, all optional:
  **fault analysis** on a job (symptoms + fault codes → ranked likely causes, each with the checks
  that confirm or rule it out), **board photo inspection** (photograph a PCB and it flags burnt or
  corroded components and reads off chip part numbers), **template generation** (describe a
  procedure and it drafts the decision tree or checklist for you to correct before saving), and
  **mid-run help** (a button on any running diagnostic that explains the check on screen or
  interprets the readings so far). Nothing it produces is saved to a job unless you press save.
- 💷 Costs — log general expenses (tools, subscriptions). Per-job "had to buy a file" costs are
  tracked on the job itself.
- 📊 Reports — invoiced / paid / outstanding, costs, net and profit margin, income by month,
  jobs by status and type, and your top customers

---

## How it's built

| Part | Technology |
|------|-----------|
| Front end (the screens) | Plain HTML / CSS / JavaScript — hostable free on GitHub Pages |
| Database, file storage, login | [Supabase](https://supabase.com) (free tier) |
| Registration lookup | Supabase Edge Function (`lookup-vehicle`) calling the DVLA & MOT APIs |
| AI assistance | Supabase Edge Function (`gemini`) calling the Google Gemini API |
| Google Drive sync | Google Identity Services + the Drive API, straight from the browser |

No build step. The whole app is static files.

```
index.html                        ← the page (login, sidebar, and one div the app renders into)
css/styles.css                    ← styling
js/config.js                      ← Supabase connection (public keys — safe to commit)
js/app.js                         ← all app logic
assets/logo.png                   ← logo, used on the login screen, sidebar and invoices
supabase/functions/gemini/        ← the AI Edge Function (source kept here for reference;
                                    deploy with the Supabase CLI or dashboard)
```

The lookup runs server-side in an Edge Function so the DVLA and MOT API keys stay
out of the public front end. The Gemini key works the same way.

## Turning on the AI features

The AI buttons stay in place whether or not a key is set — without one they just say
Gemini isn't set up yet. To switch them on:

1. Get a key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Add it to the `app_secrets` table (SQL editor in the Supabase dashboard):

   ```sql
   insert into app_secrets (key, value) values ('GEMINI_API_KEY', 'your-key-here')
   on conflict (key) do update set value = excluded.value;
   ```

That's it — no redeploy needed. The key is only ever read server-side by the `gemini`
Edge Function, which refuses anyone who isn't logged in, so it never reaches the browser.

Google retires models periodically. When that happens the AI buttons show Google's own
message ("this model is no longer available…") naming the replacement — switch to it by
adding a `GEMINI_MODEL` row, no redeploy needed:

```sql
insert into app_secrets (key, value) values ('GEMINI_MODEL', 'gemini-3.6-flash')
on conflict (key) do update set value = excluded.value;
```

Without that row the function uses whatever `DEFAULT_MODEL` is set to in
`supabase/functions/gemini/index.ts` (currently `gemini-3.6-flash`).

**A word on trusting it.** Gemini is good at narrowing a fault down and at spotting obvious
board damage, but it will occasionally state a pin number or a resistance with total confidence
and be wrong. It's asked to flag anything it isn't sure about, and every panel carries a
reminder — treat it as a second opinion from someone who hasn't seen the car, not as a diagnosis.

## Running it locally

Any static file server works. For example:

```bash
npx serve .
```

Then open the address it prints (e.g. http://localhost:3000).

## Publishing online (GitHub Pages)

This is already set up — pushing to `main` publishes the app to
https://m0688.github.io/module-tech-software/ within a minute or so. There's nothing
to build or deploy by hand.

If you ever need to set it up again from scratch: push the folder to a GitHub repo, then
**Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` / root.

> The Supabase URL and key in `js/config.js` are *publishable* (public) values. Your data is protected by login + row-level security, not by hiding them — so it's safe to commit and host publicly.

## Login

Use the email/password set up for you. You can change your password any time with the **Change password** button in the sidebar.
