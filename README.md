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
| Google Drive sync | Google Identity Services + the Drive API, straight from the browser |

No build step. The whole app is static files.

```
index.html        ← the page (login, sidebar, and one div the app renders into)
css/styles.css    ← styling
js/config.js      ← Supabase connection (public keys — safe to commit)
js/app.js         ← all app logic
assets/logo.png   ← logo, used on the login screen, sidebar and invoices
```

The lookup runs server-side in an Edge Function so the DVLA and MOT API keys stay
out of the public front end.

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
