# Module Tech Software

Workshop management app for vehicle remapping & module repair, recovery and cloning.

**Live features**
- 🔐 Secure login (only authorised users can see any data)
- 👥 Customers — contact details & notes
- 🚗 Vehicles — reg, make/model, ECU, gearbox, VIN, linked to a customer
- 📁 Files — upload/download read, write, backup, EEPROM & flash files per vehicle
- 🛠️ Jobs — track type (remap / module repair / cloning / recovery / diagnostic) & status
- 📋 Fault log — searchable history of faults, causes and fixes for future reference

**Coming next**
- 🧾 Invoices (builds from jobs & customers)
- 🧭 Diagnostic flows (step-by-step guided procedures for PCB/module work)

---

## How it's built

| Part | Technology |
|------|-----------|
| Front end (the screens) | Plain HTML / CSS / JavaScript — hostable free on GitHub Pages |
| Database, file storage, login | [Supabase](https://supabase.com) (free tier) |

No build step. The whole app is static files.

```
index.html        ← the page
css/styles.css    ← styling
js/config.js      ← Supabase connection (public keys — safe to commit)
js/app.js         ← all app logic
```

## Running it locally

Any static file server works. For example:

```bash
npx serve .
```

Then open the address it prints (e.g. http://localhost:3000).

## Publishing online (GitHub Pages)

1. Create a new repository on GitHub and push this folder to it.
2. In the repo: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` / root.
3. After a minute your app is live at `https://<your-username>.github.io/<repo-name>/`.

> The Supabase URL and key in `js/config.js` are *publishable* (public) values. Your data is protected by login + row-level security, not by hiding them — so it's safe to commit and host publicly.

## Login

Use the email/password set up for you. You can change your password any time with the **Change password** button in the sidebar.
