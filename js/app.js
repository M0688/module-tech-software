/* ===========================================================
   Module Tech Software — front-end application
   Plain JavaScript + Supabase (database, storage, auth)
   =========================================================== */

const cfg = window.MTS_CONFIG;
const db = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

/* ---------- tiny helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (id) => document.getElementById(id);
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-GB") : "—";
const fmtMoney = (n) => n == null ? "—" : "£" + Number(n).toFixed(2);
const fmtJobNo = (n) => n == null ? "—" : "JOB-" + String(n).padStart(4, "0");
const fmtBytes = (b) => {
  if (b == null) return "";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
};

function toast(msg, type = "") {
  const t = el("toast");
  t.textContent = msg;
  t.className = "toast " + type;
  setTimeout(() => t.classList.add("hidden"), 2600);
}

function openModal(title, bodyHtml) {
  el("modal-title").textContent = title;
  el("modal-body").innerHTML = bodyHtml;
  el("modal-overlay").classList.remove("hidden");
}
function closeModal() { el("modal-overlay").classList.add("hidden"); }

function readForm(form) {
  const data = {};
  form.querySelectorAll("[name]").forEach(i => {
    let v = i.value.trim();
    if (v === "") v = null;
    else if (i.dataset.type === "number") v = Number(v);
    data[i.name] = v;
  });
  return data;
}

/* ===========================================================
   AUTH
   =========================================================== */
async function initAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (session) showApp(session); else showLogin();

  db.auth.onAuthStateChange((_e, session) => {
    if (session) showApp(session); else showLogin();
  });
}

function showLogin() {
  el("login-screen").classList.remove("hidden");
  el("app").classList.add("hidden");
}
function showApp(session) {
  el("login-screen").classList.add("hidden");
  el("app").classList.remove("hidden");
  el("user-email").textContent = session.user.email;
  route();
}

el("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  el("login-error").textContent = "";
  el("login-btn").textContent = "Signing in…";
  const { error } = await db.auth.signInWithPassword({
    email: el("login-email").value,
    password: el("login-password").value,
  });
  el("login-btn").textContent = "Sign in";
  if (error) el("login-error").textContent = error.message;
});

el("logout-btn").addEventListener("click", () => db.auth.signOut());

el("password-btn").addEventListener("click", () => {
  openModal("Change password", `
    <form id="pw-form">
      <div class="field" style="margin-bottom:14px"><label>New password (min 6 characters)</label>
        <input type="password" name="password" minlength="6" required autocomplete="new-password"></div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Update password</button>
      </div>
    </form>`);
  $("#pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const { error } = await db.auth.updateUser({ password: e.target.password.value });
    if (error) return toast(error.message, "error");
    closeModal(); toast("Password updated", "success");
  });
});
el("modal-close").addEventListener("click", closeModal);
el("modal-overlay").addEventListener("click", (e) => {
  if (e.target.id === "modal-overlay") closeModal();
});

/* ===========================================================
   ROUTER
   =========================================================== */
const views = {};

function route() {
  const hash = location.hash.slice(1) || "dashboard";
  const [name, ...rest] = hash.split("/");
  document.querySelectorAll(".nav-link").forEach(a =>
    a.classList.toggle("active", a.dataset.view === name));
  const fn = views[name] || views.dashboard;
  el("view").innerHTML = `<div class="empty">Loading…</div>`;
  fn(rest).catch(err => {
    console.error(err);
    el("view").innerHTML = `<div class="empty">Error: ${esc(err.message)}</div>`;
  });
}
window.addEventListener("hashchange", route);

/* ===========================================================
   DASHBOARD
   =========================================================== */
views.dashboard = async () => {
  const [cust, veh, jobs, openJobs, unpaid] = await Promise.all([
    db.from("customers").select("*", { count: "exact", head: true }),
    db.from("vehicles").select("*", { count: "exact", head: true }),
    db.from("jobs").select("*", { count: "exact", head: true }),
    db.from("jobs").select("*", { count: "exact", head: true }).neq("status", "completed").neq("status", "invoiced"),
    db.from("invoices").select("*", { count: "exact", head: true }).neq("status", "paid"),
  ]);
  const { data: recentJobs } = await db.from("jobs")
    .select("*, vehicles(registration, make, model), customers(name)")
    .order("created_at", { ascending: false }).limit(6);

  el("view").innerHTML = `
    <div class="page-head"><div><h1>Dashboard</h1>
      <div class="page-sub">Welcome back — here's the shop at a glance.</div></div>
      <button class="btn btn-primary" id="drive-sync-btn" onclick="syncDrive()">☁ Sync from Google Drive</button></div>
    <div class="stats">
      <div class="stat-card"><div class="num">${cust.count ?? 0}</div><div class="label">Customers</div></div>
      <div class="stat-card"><div class="num">${veh.count ?? 0}</div><div class="label">Vehicles</div></div>
      <div class="stat-card"><div class="num">${openJobs.count ?? 0}</div><div class="label">Open jobs</div></div>
      <div class="stat-card"><div class="num">${jobs.count ?? 0}</div><div class="label">Total jobs</div></div>
      <div class="stat-card"><div class="num">${unpaid.count ?? 0}</div><div class="label">Unpaid invoices</div></div>
    </div>
    <div class="panel"><h3>Recent jobs</h3>
      ${recentJobs && recentJobs.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Job</th><th>Vehicle</th><th>Customer</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>${recentJobs.map(j => `<tr onclick="location.hash='jobs/${j.id}'">
          <td><strong>${fmtJobNo(j.job_number)}</strong></td>
          <td>${j.vehicles ? esc(`${j.vehicles.registration || ""} ${j.vehicles.make || ""} ${j.vehicles.model || ""}`) : "—"}</td>
          <td>${j.customers ? esc(j.customers.name) : "—"}</td>
          <td><span class="badge badge-${j.status}">${esc(j.status.replace("_", " "))}</span></td>
          <td class="muted">${fmtDate(j.created_at)}</td></tr>`).join("")}</tbody>
      </table></div>` : `<div class="empty">No jobs yet. Add a customer and vehicle, then create a job.</div>`}
    </div>`;
};

/* ===========================================================
   CUSTOMERS
   =========================================================== */
views.customers = async (rest) => {
  if (rest[0]) return customerDetail(rest[0]);
  const { data } = await db.from("customers").select("*").order("name");
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Customers</h1>
      <div class="page-sub">${data.length} total</div></div>
      <button class="btn btn-primary" onclick="customerForm()">+ New customer</button></div>
    <div class="table-wrap">${data.length ? `<table>
      <thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Email</th></tr></thead>
      <tbody>${data.map(c => `<tr onclick="location.hash='customers/${c.id}'">
        <td>${esc(c.name)}</td><td class="muted">${esc(c.company) || "—"}</td>
        <td>${esc(c.phone) || "—"}</td><td>${esc(c.email) || "—"}</td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No customers yet. Click "New customer" to add your first.</div>`}</div>`;
};

window.customerForm = async (id) => {
  let c = {};
  if (id) c = (await db.from("customers").select("*").eq("id", id).single()).data;
  openModal(id ? "Edit customer" : "New customer", `
    <form id="cust-form">
      <div class="form-grid">
        <div class="field full"><label>Name *</label><input name="name" required value="${esc(c.name)}"></div>
        <div class="field"><label>Company</label><input name="company" value="${esc(c.company)}"></div>
        <div class="field"><label>Phone</label><input name="phone" value="${esc(c.phone)}"></div>
        <div class="field"><label>Email</label><input name="email" type="email" value="${esc(c.email)}"></div>
        <div class="field full"><label>Address</label><input name="address" value="${esc(c.address)}"></div>
        <div class="field full"><label>Notes</label><textarea name="notes">${esc(c.notes)}</textarea></div>
      </div>
      <div class="form-actions">
        ${id ? `<button type="button" class="btn btn-danger" style="margin-right:auto" onclick="deleteCustomer('${id}', location.hash.slice(1) || 'jobs')">Delete</button>` : ""}
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? "Save" : "Create"}</button>
      </div>
    </form>`);
  $("#cust-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = readForm(e.target);
    const q = id ? db.from("customers").update(payload).eq("id", id)
                 : db.from("customers").insert(payload);
    const { error } = await q;
    if (error) return toast(error.message, "error");
    closeModal(); toast(id ? "Customer saved" : "Customer added", "success"); route();
  });
};

async function customerDetail(id) {
  const { data: c } = await db.from("customers").select("*").eq("id", id).single();
  if (!c) { el("view").innerHTML = `<div class="empty">Customer not found.</div>`; return; }
  const { data: vehicles } = await db.from("vehicles").select("*").eq("customer_id", id).order("created_at");
  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#customers">Customers</a> / ${esc(c.name)}</div>
    <div class="page-head"><div><h1>${esc(c.name)}</h1>
      <div class="page-sub">${esc(c.company) || ""}</div></div>
      <div class="row-actions">
        <button class="btn" onclick="customerForm('${c.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteCustomer('${c.id}','customers')">Delete</button>
      </div></div>
    <div class="panel"><h3>Contact</h3>
      <p><strong>Phone:</strong> ${esc(c.phone) || "—"} &nbsp; <strong>Email:</strong> ${esc(c.email) || "—"}</p>
      <p><strong>Address:</strong> ${esc(c.address) || "—"}</p>
      ${c.notes ? `<p class="muted" style="margin-top:8px">${esc(c.notes)}</p>` : ""}
    </div>
    <div class="page-head"><h1 style="font-size:18px">Vehicles</h1>
      <button class="btn btn-primary btn-sm" onclick="vehicleForm(null,'${c.id}')">+ Add vehicle</button></div>
    <div class="table-wrap">${vehicles.length ? `<table>
      <thead><tr><th>Reg</th><th>Make / model</th><th>ECU</th></tr></thead>
      <tbody>${vehicles.map(v => `<tr onclick="location.hash='vehicles/${v.id}'">
        <td><span class="chip">${esc(v.registration) || "—"}</span></td>
        <td>${esc(`${v.make || ""} ${v.model || ""}`)}</td>
        <td class="muted">${esc(v.ecu_type) || "—"}</td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No vehicles for this customer yet.</div>`}</div>`;
}

/* ===========================================================
   VEHICLES
   =========================================================== */
views.vehicles = async (rest) => {
  if (rest[0]) return vehicleDetail(rest[0]);
  const { data } = await db.from("vehicles")
    .select("*, customers(name)").order("created_at", { ascending: false });
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Vehicles</h1>
      <div class="page-sub">${data.length} total</div></div>
      <button class="btn btn-primary" onclick="vehicleForm()">+ New vehicle</button></div>
    <div class="table-wrap">${data.length ? `<table>
      <thead><tr><th>Reg</th><th>Make / model</th><th>Year</th><th>ECU</th><th>Customer</th></tr></thead>
      <tbody>${data.map(v => `<tr onclick="location.hash='vehicles/${v.id}'">
        <td><span class="chip">${esc(v.registration) || "—"}</span></td>
        <td>${esc(`${v.make || ""} ${v.model || ""}`)}</td>
        <td class="muted">${v.year || "—"}</td>
        <td class="muted">${esc(v.ecu_type) || "—"}</td>
        <td>${v.customers ? esc(v.customers.name) : "—"}</td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No vehicles yet.</div>`}</div>`;
};

// DVLA/MOT reg lookup — auto-fills make/model/year/engine on tab-out of the reg field.
// prefix is "" (vehicle form) or "v_" (job form).
async function runLookup(form, prefix) {
  const regEl = form.querySelector(`[name="${prefix}registration"]`);
  const reg = (regEl && regEl.value || "").trim();
  if (!reg) return;
  try {
    const { data, error } = await db.functions.invoke("lookup-vehicle", { body: { reg } });
    if (error || !data || data.error) return; // stay quiet on failure (e.g. partial reg)
    const set = (n, val) => { const i = form.querySelector(`[name="${prefix}${n}"]`); if (i && val != null && val !== "") i.value = val; };
    set("make", data.make); set("model", data.model); set("year", data.year); set("engine", data.engine);
    const bits = [data.make, data.model, data.year].filter(Boolean).join(" ");
    if (bits) toast("Found: " + bits, "success");
  } catch (_) { /* silent */ }
}
// Fires on blur; only looks up when the reg actually changed (so it never clobbers an edit).
window.autoLookup = (input, prefix) => {
  const norm = (input.value || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!norm || input.dataset.looked === norm) return;
  input.dataset.looked = norm;
  runLookup(input.closest("form"), prefix);
};

window.vehicleForm = async (id, presetCustomer) => {
  let v = { customer_id: presetCustomer };
  if (id) v = (await db.from("vehicles").select("*").eq("id", id).single()).data;
  const { data: customers } = await db.from("customers").select("id,name").order("name");
  const opts = customers.map(c =>
    `<option value="${c.id}" ${c.id === v.customer_id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  openModal(id ? "Edit vehicle" : "New vehicle", `
    <form id="veh-form">
      <div class="form-grid">
        <div class="field full"><label>Customer</label><select name="customer_id"><option value="">—</option>${opts}</select></div>
        <div class="field"><label>Registration <span class="muted" style="font-weight:400">— auto-fills on tab</span></label>
          <input name="registration" value="${esc(v.registration)}" data-looked="${esc((v.registration || "").toUpperCase().replace(/\s+/g, ""))}" onblur="autoLookup(this,'')"></div>
        <div class="field"><label>Year</label><input name="year" data-type="number" value="${v.year || ""}"></div>
        <div class="field"><label>Make</label><input name="make" value="${esc(v.make)}"></div>
        <div class="field"><label>Model</label><input name="model" value="${esc(v.model)}"></div>
        <div class="field"><label>Engine</label><input name="engine" value="${esc(v.engine)}"></div>
        <div class="field"><label>ECU type</label><input name="ecu_type" value="${esc(v.ecu_type)}"></div>
        <div class="field"><label>Gearbox</label><input name="gearbox" value="${esc(v.gearbox)}"></div>
        <div class="field"><label>VIN</label><input name="vin" value="${esc(v.vin)}"></div>
        <div class="field full"><label>Notes</label><textarea name="notes">${esc(v.notes)}</textarea></div>
      </div>
      <div class="form-actions">
        ${id ? `<button type="button" class="btn btn-danger" style="margin-right:auto" onclick="deleteVehicle('${id}', location.hash.slice(1) || 'jobs')">Delete</button>` : ""}
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? "Save" : "Create"}</button>
      </div>
    </form>`);
  $("#veh-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = readForm(e.target);
    const q = id ? db.from("vehicles").update(payload).eq("id", id)
                 : db.from("vehicles").insert(payload);
    const { error } = await q;
    if (error) return toast(error.message, "error");
    closeModal(); toast(id ? "Vehicle saved" : "Vehicle added", "success"); route();
  });
};

async function vehicleDetail(id) {
  const { data: v } = await db.from("vehicles").select("*, customers(id,name)").eq("id", id).single();
  if (!v) { el("view").innerHTML = `<div class="empty">Vehicle not found.</div>`; return; }
  const { data: files } = await db.from("vehicle_files").select("*").eq("vehicle_id", id).order("created_at", { ascending: false });

  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#vehicles">Vehicles</a> / ${esc(v.registration || v.make || "Vehicle")}</div>
    <div class="page-head"><div>
      <h1>${esc(`${v.make || ""} ${v.model || ""}`) || "Vehicle"} <span class="chip">${esc(v.registration) || ""}</span></h1>
      <div class="page-sub">${v.customers ? `Owner: <a href="#customers/${v.customers.id}" style="color:var(--blue)">${esc(v.customers.name)}</a>` : "No customer linked"}</div></div>
      <div class="row-actions">
        <button class="btn" onclick="vehicleForm('${v.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteVehicle('${v.id}','vehicles')">Delete</button>
      </div></div>

    <div class="panel"><h3>Details</h3>
      <div class="form-grid">
        <div><span class="muted">Year:</span> ${v.year || "—"}</div>
        <div><span class="muted">Engine:</span> ${esc(v.engine) || "—"}</div>
        <div><span class="muted">ECU:</span> ${esc(v.ecu_type) || "—"}</div>
        <div><span class="muted">Gearbox:</span> ${esc(v.gearbox) || "—"}</div>
        <div class="full"><span class="muted">VIN:</span> ${esc(v.vin) || "—"}</div>
      </div>
      ${v.notes ? `<p class="muted" style="margin-top:10px">${esc(v.notes)}</p>` : ""}
    </div>

    <div class="page-head"><h1 style="font-size:18px">Files</h1>
      <button class="btn btn-primary btn-sm" onclick="fileUploadForm('${v.id}')">+ Upload file</button></div>
    <div class="table-wrap" style="margin-bottom:24px">
      ${files.length ? files.map(f => `<div class="file-row">
        <div class="file-meta">
          <span class="name">${esc(f.label || f.original_name)}</span>
          <span class="sub">${esc((f.kind || "").replace("_", " "))} · ${esc(f.original_name)} · ${fmtBytes(f.size_bytes)} · ${fmtDate(f.created_at)}</span>
        </div>
        <div class="file-actions">
          <button class="btn btn-sm" onclick="fileEditForm('${f.id}')">Label</button>
          <button class="btn btn-sm" onclick="downloadFile('${esc(f.storage_path)}','${esc(f.original_name)}')">Download</button>
          <button class="btn btn-sm btn-danger" onclick="deleteFile('${f.id}','${esc(f.storage_path)}')">Delete</button>
        </div></div>`).join("") : `<div class="empty">No files uploaded for this vehicle yet.</div>`}
    </div>`;
}

/* ---------- File upload / download ---------- */
const FILE_KINDS = [["original_read", "Original read"], ["modified_write", "Modified / write"], ["backup", "Backup"], ["eeprom", "EEPROM"], ["flash", "Flash"], ["diag_scan", "Diag scan"], ["other", "Other"]];

window.fileUploadForm = async (vehicleId, jobId) => {
  const { data: jobs } = await db.from("jobs").select("id,job_number,job_type").eq("vehicle_id", vehicleId).order("created_at", { ascending: false });
  const jobOpts = (jobs || []).map(j => `<option value="${j.id}" ${j.id === jobId ? "selected" : ""}>${esc(fmtJobNo(j.job_number))}${j.job_type ? " — " + esc(JOB_TYPES[j.job_type] || j.job_type) : ""}</option>`).join("");
  const kindOpts = FILE_KINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  openModal("Upload files", `
    <form id="file-form">
      <div class="form-grid">
        <div class="field full"><label>Files * <span class="muted" style="font-weight:400">— pick one or many</span></label><input type="file" name="file" multiple required></div>
        <div class="field"><label>Type (applied to all)</label><select name="kind">${kindOpts}</select></div>
        <div class="field full"><label>Link to job (optional)</label><select name="job_id"><option value="">— none —</option>${jobOpts}</select></div>
        <div class="field full"><label>Notes (optional, applied to all)</label><textarea name="notes"></textarea></div>
        <div class="field full muted" style="font-size:12px">After uploading, click <strong>Label</strong> on any file to name it.</div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="upbtn">Upload</button>
      </div>
    </form>`);
  $("#file-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const files = [...form.file.files];
    if (!files.length) return;
    const kind = form.kind.value, jobV = form.job_id.value || null, notes = form.notes.value.trim() || null;
    let done = 0, failed = 0;
    el("upbtn").disabled = true;
    for (const file of files) {
      el("upbtn").textContent = `Uploading ${done + failed + 1}/${files.length}…`;
      const safe = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${vehicleId}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safe}`;
      const { error: upErr } = await db.storage.from(cfg.FILE_BUCKET).upload(path, file);
      if (upErr) { failed++; continue; }
      const { error } = await db.from("vehicle_files").insert({
        vehicle_id: vehicleId, job_id: jobV, kind, label: null, notes,
        storage_path: path, original_name: file.name, size_bytes: file.size,
      });
      if (error) failed++; else done++;
    }
    closeModal();
    toast(`Uploaded ${done} file${done === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`, failed ? "error" : "success");
    route();
  });
};

// Rename / relabel a single already-uploaded file.
window.fileEditForm = async (id) => {
  const { data: f } = await db.from("vehicle_files").select("*").eq("id", id).single();
  if (!f) return;
  const kindOpts = FILE_KINDS.map(([k, l]) => `<option value="${k}" ${k === f.kind ? "selected" : ""}>${l}</option>`).join("");
  openModal("Label file", `
    <form id="filelabel-form">
      <div class="muted" style="font-size:13px;margin-bottom:12px">${esc(f.original_name)} · ${fmtBytes(f.size_bytes)}</div>
      <div class="form-grid">
        <div class="field full"><label>Label</label><input name="label" value="${esc(f.label)}" placeholder="e.g. Stage 1 map"></div>
        <div class="field full"><label>Type</label><select name="kind">${kindOpts}</select></div>
        <div class="field full"><label>Notes</label><textarea name="notes">${esc(f.notes)}</textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-danger" style="margin-right:auto" onclick="deleteFile('${f.id}','${esc(f.storage_path)}')">Delete</button>
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save</button>
      </div>
    </form>`);
  $("#filelabel-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const p = readForm(e.target);
    const { error } = await db.from("vehicle_files").update({ label: p.label, kind: p.kind, notes: p.notes }).eq("id", id);
    if (error) return toast(error.message, "error");
    closeModal(); toast("File updated", "success"); route();
  });
};

window.downloadFile = async (path, name) => {
  const { data, error } = await db.storage.from(cfg.FILE_BUCKET).createSignedUrl(path, 60);
  if (error) return toast(error.message, "error");
  const a = document.createElement("a");
  a.href = data.signedUrl; a.download = name || ""; document.body.appendChild(a); a.click(); a.remove();
};

window.deleteFile = async (id, path) => {
  if (!confirm("Delete this file? This cannot be undone.")) return;
  await db.storage.from(cfg.FILE_BUCKET).remove([path]);
  const { error } = await db.from("vehicle_files").delete().eq("id", id);
  if (error) return toast(error.message, "error");
  closeModal(); toast("File deleted", "success"); route();
};

/* ===========================================================
   JOBS
   =========================================================== */
const JOB_TYPES = { remap: "Remap", module_repair: "Module repair", cloning: "Cloning", recovery: "Recovery", diagnostic: "Diagnostic" };
const JOB_STATUS = ["booked", "in_progress", "awaiting_parts", "completed", "invoiced"];

views.jobs = async (rest) => {
  if (rest[0]) return jobDetail(rest[0]);
  const { data } = await db.from("jobs")
    .select("*, vehicles(registration, make, model, vin, ecu_type, engine), customers(name, phone, email, company)")
    .order("created_at", { ascending: false });
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Jobs</h1>
      <div class="page-sub">Everything for a job in one place — customer, vehicle, files & invoice</div></div>
      <button class="btn btn-primary" onclick="jobCreateForm()">+ New job</button></div>
    <div class="panel" style="padding:12px"><input id="job-search" autofocus
      placeholder="🔍  Search anything — name, phone, reg, make, model, VIN, job title…"
      style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:11px 13px;border-radius:8px;font-size:15px"></div>
    <div class="table-wrap" id="job-table">${jobRows(data)}</div>`;
  const all = data;
  const search = $("#job-search");
  search.addEventListener("input", (e) => {
    const terms = e.target.value.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = all.filter(j => { const h = jobHaystack(j); return terms.every(t => h.includes(t)); });
    $("#job-table").innerHTML = jobRows(filtered);
  });
};

function jobHaystack(j) {
  const v = j.vehicles || {}, c = j.customers || {};
  return [fmtJobNo(j.job_number), String(j.job_number || ""), JOB_TYPES[j.job_type] || j.job_type, j.status, j.description,
    v.registration, v.make, v.model, v.vin, v.ecu_type, v.engine,
    c.name, c.phone, c.email, c.company].filter(Boolean).join(" ").toLowerCase();
}

function jobRows(data) {
  if (!data.length) return `<div class="empty">No matching jobs.</div>`;
  return `<table>
    <thead><tr><th>Job</th><th>Type</th><th>Customer</th><th>Vehicle</th><th>Status</th><th>Price</th></tr></thead>
    <tbody>${data.map(j => `<tr onclick="location.hash='jobs/${j.id}'">
      <td><strong>${fmtJobNo(j.job_number)}</strong></td>
      <td>${esc(JOB_TYPES[j.job_type] || j.job_type) || "—"}</td>
      <td>${j.customers ? esc(j.customers.name) : "—"}${j.customers && j.customers.phone ? `<div class="muted" style="font-size:12px">${esc(j.customers.phone)}</div>` : ""}</td>
      <td>${j.vehicles ? `<span class="chip">${esc(j.vehicles.registration || "—")}</span> <span class="muted">${esc(`${j.vehicles.make || ""} ${j.vehicles.model || ""}`)}</span>` : "—"}</td>
      <td><span class="badge badge-${j.status}">${esc(j.status.replace("_", " "))}</span></td>
      <td>${fmtMoney(j.price)}</td></tr>`).join("")}</tbody></table>`;
}

/* ===========================================================
   FOLDER SCAN — pull files from a local reg folder into a job.
   Uses the browser File System Access API (Chrome/Edge on desktop);
   no installed program, on-demand per job.
   =========================================================== */
const SCAN_KIND = {
  ORI: "original_read", ORIREAD: "original_read", ORIGINAL: "original_read", READ: "original_read",
  MOD: "modified_write", MODIFIED: "modified_write", WRITE: "modified_write", STAGE: "modified_write",
  BACKUP: "backup", BAK: "backup", EEPROM: "eeprom", EE: "eeprom", FLASH: "flash", DIAG: "diag_scan", SCAN: "diag_scan",
};
const normReg = (s) => (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const scanKind = (name) => SCAN_KIND[(name || "").toUpperCase().replace(/[^A-Z]/g, "")] || "other";

function idb(mode, fn) {
  return new Promise((res, rej) => {
    const o = indexedDB.open("mts", 1);
    o.onupgradeneeded = () => o.result.createObjectStore("kv");
    o.onsuccess = () => {
      const tx = o.result.transaction("kv", mode);
      const req = fn(tx.objectStore("kv"));
      tx.oncomplete = () => res(req ? req.result : undefined);
      tx.onerror = () => rej(tx.error);
    };
    o.onerror = () => rej(o.error);
  });
}
const idbGet = (k) => idb("readonly", (st) => st.get(k));
const idbSet = (k, v) => idb("readwrite", (st) => st.put(v, k));

async function scanPermission(handle) {
  const opts = { mode: "read" };
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}
async function findRegDir(root, reg) {
  const target = normReg(reg);
  for await (const [name, h] of root.entries())
    if (h.kind === "directory" && normReg(name) === target) return h;
  for await (const [name, h] of root.entries())          // one level down (year folders)
    if (h.kind === "directory" && /^(19|20)\d{2}$/.test(name))
      for await (const [n2, h2] of h.entries())
        if (h2.kind === "directory" && normReg(n2) === target) return h2;
  return null;
}
async function collectFiles(dir, dirName, out) {
  for await (const [name, h] of dir.entries()) {
    if (h.kind === "file") out.push({ handle: h, kind: scanKind(dirName) });
    else if (h.kind === "directory") await collectFiles(h, name, out);
  }
}
window.changeScanFolder = async () => {
  if (!window.showDirectoryPicker) return toast("Folder scan needs Chrome or Edge on a computer", "error");
  try { const root = await window.showDirectoryPicker({ id: "mtsRoot", mode: "read" }); await idbSet("rootDir", root); toast("Scan folder saved", "success"); }
  catch (_) { /* cancelled */ }
};
window.scanJobFolder = async (jobId, vehicleId, reg) => {
  if (!window.showDirectoryPicker) return toast("Folder scan needs Chrome or Edge on a computer", "error");
  if (!reg) return toast("This job has no registration to match a folder", "error");
  let root = await idbGet("rootDir").catch(() => null);
  if (!root) {
    try { root = await window.showDirectoryPicker({ id: "mtsRoot", mode: "read" }); await idbSet("rootDir", root); }
    catch (_) { return; }
  }
  if (!(await scanPermission(root))) return toast("Folder access not granted", "error");
  let regDir;
  try { regDir = await findRegDir(root, reg); }
  catch (_) { return toast("Couldn't read that folder — re-pick it with 'Change scan folder' in Settings", "error"); }
  if (!regDir) return toast(`No folder named "${reg}" found in your scan folder`, "error");
  toast("Scanning " + reg + "…");
  const items = [];
  await collectFiles(regDir, regDir.name, items);
  const { data: existing } = await db.from("vehicle_files").select("original_name,size_bytes").eq("job_id", jobId);
  const seen = new Set((existing || []).map((f) => f.original_name + "|" + f.size_bytes));
  let up = 0, skip = 0, fail = 0;
  for (const it of items) {
    const file = await it.handle.getFile();
    if (file.size === 0 || seen.has(file.name + "|" + file.size)) { skip++; continue; }
    const safe = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${vehicleId}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safe}`;
    const { error: ue } = await db.storage.from(cfg.FILE_BUCKET).upload(path, file);
    if (ue) { fail++; continue; }
    const { error } = await db.from("vehicle_files").insert({
      vehicle_id: vehicleId, job_id: jobId, kind: it.kind, label: null,
      notes: "Scanned from folder", storage_path: path, original_name: file.name, size_bytes: file.size,
    });
    if (error) fail++; else { up++; seen.add(file.name + "|" + file.size); }
  }
  toast(`${reg}: ${up} file${up === 1 ? "" : "s"} added${skip ? `, ${skip} already there` : ""}${fail ? `, ${fail} failed` : ""}`, fail ? "error" : "success");
  route();
};

/* ===========================================================
   GOOGLE DRIVE SYNC — pull files from Drive "remapping/<reg>/" into jobs.
   Cloud-to-cloud, triggered by the Dashboard button; works on any device.
   =========================================================== */
let _tokenClient, _driveToken, _driveTokenExp = 0;

function getDriveToken() {
  return new Promise((resolve, reject) => {
    if (_driveToken && Date.now() < _driveTokenExp) return resolve(_driveToken);
    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2)
      return reject(new Error("Google library still loading — try again in a moment"));
    if (!_tokenClient) {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: cfg.GOOGLE_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/drive.readonly",
        callback: () => {},
      });
    }
    _tokenClient.callback = (resp) => {
      if (resp && resp.error) return reject(new Error(resp.error));
      _driveToken = resp.access_token;
      _driveTokenExp = Date.now() + ((resp.expires_in || 3600) - 60) * 1000;
      resolve(_driveToken);
    };
    _tokenClient.requestAccessToken({ prompt: "" });
  });
}

async function driveList(q, token, fields = "files(id,name)") {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true`;
  const r = await fetch(url, { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("Drive API error " + r.status);
  return (await r.json()).files || [];
}

async function vehicleForReg(reg) {
  const { data: vs } = await db.from("vehicles").select("id,registration,customer_id");
  const t = normReg(reg);
  const found = (vs || []).find((v) => normReg(v.registration) === t);
  if (found) return found;
  const { data } = await db.from("vehicles").insert({ registration: reg.trim() }).select("id,customer_id").single();
  return data;
}
async function jobForVehicle(vehicleId, customerId) {
  const { data: jobs } = await db.from("jobs").select("id").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }).limit(1);
  if (jobs && jobs.length) return jobs[0].id;
  const payload = { vehicle_id: vehicleId, status: "booked" };
  if (customerId) payload.customer_id = customerId;
  const { data } = await db.from("jobs").insert(payload).select("id").single();
  return data.id;
}

window.syncDrive = async () => {
  const btn = el("drive-sync-btn");
  const reset = (msg, type) => { if (btn) { btn.disabled = false; btn.textContent = "☁ Sync from Google Drive"; } toast(msg, type); };
  if (btn) { btn.disabled = true; btn.textContent = "Connecting…"; }
  let token;
  try { token = await getDriveToken(); }
  catch (e) { return reset("Google sign-in failed: " + e.message, "error"); }
  try {
    if (btn) btn.textContent = "Finding folder…";
    const roots = await driveList(`name='${cfg.DRIVE_ROOT_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, token);
    if (!roots.length) return reset(`No "${cfg.DRIVE_ROOT_FOLDER}" folder found in your Google Drive`, "error");
    const regFolders = await driveList(`'${roots[0].id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, token);
    let up = 0, skip = 0, fail = 0, found = 0, firstErr = "";
    const sample = [];
    for (const rf of regFolders) {
      const files = await driveList(`'${rf.id}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed=false`, token, "files(id,name,size,mimeType)");
      if (!files.length) continue;
      found += files.length;
      if (btn) btn.textContent = "Syncing " + rf.name + "…";
      const veh = await vehicleForReg(rf.name);
      const jobId = await jobForVehicle(veh.id, veh.customer_id);
      const { data: existing } = await db.from("vehicle_files").select("original_name").eq("vehicle_id", veh.id);
      const seenNames = new Set((existing || []).map((f) => f.original_name));
      for (const f of files) {
        if (sample.length < 12) sample.push(`${rf.name}/${f.name} (${f.size ?? "?"}b)`);
        if (seenNames.has(f.name)) { skip++; continue; }
        let blob;
        try {
          const r = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: "Bearer " + token } });
          if (!r.ok) { if (!firstErr) firstErr = "download " + r.status; fail++; continue; }
          blob = await r.blob();
        } catch (ex) { if (!firstErr) firstErr = "download: " + ex.message; fail++; continue; }
        if (blob.size === 0) { skip++; continue; }
        const path = `${veh.id}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${f.name.replace(/[^\w.\-]+/g, "_")}`;
        const { error: ue } = await db.storage.from(cfg.FILE_BUCKET).upload(path, blob);
        if (ue) { if (!firstErr) firstErr = "upload: " + ue.message; fail++; continue; }
        const { error } = await db.from("vehicle_files").insert({
          vehicle_id: veh.id, job_id: jobId, kind: "other", label: null,
          notes: "Synced from Google Drive", storage_path: path, original_name: f.name, size_bytes: blob.size,
        });
        if (error) { if (!firstErr) firstErr = "save: " + error.message; fail++; } else { up++; seenNames.add(f.name); }
      }
    }
    const summary = `Google Drive sync\n\nAdded: ${up}\nSkipped: ${skip}\nFailed: ${fail}\nFound: ${found} file(s)${firstErr ? "\n\nFirst error: " + firstErr : ""}${sample.length ? "\n\nFiles seen:\n" + sample.join("\n") : ""}`;
    alert(summary);
    reset(`${up} added · ${skip} skipped · ${fail} failed · found ${found}`, fail ? "error" : "success");
    route();
  } catch (e) {
    reset("Sync error: " + e.message, "error");
  }
};

async function jobDetail(id) {
  const { data: j } = await db.from("jobs").select("*, vehicles(*), customers(*)").eq("id", id).single();
  if (!j) { el("view").innerHTML = `<div class="empty">Job not found.</div>`; return; }
  const v = j.vehicles, c = j.customers;
  const [{ data: files }, { data: invoices }, { data: diagRuns }] = await Promise.all([
    db.from("vehicle_files").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    db.from("invoices").select("*").eq("job_id", id).order("created_at", { ascending: false }),
    db.from("diagnostic_runs").select("id,title,created_at").eq("job_id", id).order("created_at", { ascending: false }),
  ]);
  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#jobs">Jobs</a> / ${fmtJobNo(j.job_number)}</div>
    <div class="page-head"><div>
      <h1>${fmtJobNo(j.job_number)} <span class="badge badge-${j.status}">${esc(j.status.replace("_", " "))}</span></h1>
      <div class="page-sub">${esc(JOB_TYPES[j.job_type] || j.job_type || "")} · ${fmtMoney(j.price)}</div></div>
      <div class="row-actions">
        <button class="btn" onclick="jobForm('${j.id}')">Edit job</button>
        <button class="btn btn-danger" onclick="deleteJob('${j.id}')">Delete</button>
      </div></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div class="panel">
        <div class="page-head" style="margin-bottom:10px"><h3 style="margin:0">Customer</h3>
          <button class="btn btn-sm" onclick="${c ? `customerForm('${c.id}')` : `linkCustomerToJob('${j.id}', ${v ? `'${v.id}'` : "null"})`}">${c ? "Edit" : "Add"}</button></div>
        ${c ? `<div><strong>${esc(c.name)}</strong></div>
          ${c.company ? `<div class="muted">${esc(c.company)}</div>` : ""}
          <div style="margin-top:6px">${c.phone ? `Tel: ${esc(c.phone)}` : ""}${c.phone && c.email ? " · " : ""}${c.email ? `${esc(c.email)}` : ""}</div>
          ${c.address ? `<div class="muted" style="margin-top:4px">${esc(c.address)}</div>` : ""}`
        : `<div class="muted">No customer linked.</div>`}
      </div>
      <div class="panel">
        <div class="page-head" style="margin-bottom:10px"><h3 style="margin:0">Vehicle</h3>
          <button class="btn btn-sm" onclick="${v ? `vehicleForm('${v.id}')` : `jobForm('${j.id}')`}">${v ? "Edit" : "Add"}</button></div>
        ${v ? `<div><strong>${esc(`${v.make || ""} ${v.model || ""}`) || "Vehicle"}</strong> <span class="chip">${esc(v.registration || "—")}</span></div>
          <div class="muted" style="margin-top:6px">${[v.year ? `Year ${v.year}` : "", v.engine ? esc(v.engine) : "", v.ecu_type ? `ECU ${esc(v.ecu_type)}` : "", v.gearbox ? `Gearbox ${esc(v.gearbox)}` : ""].filter(Boolean).join(" · ")}</div>
          ${v.vin ? `<div class="muted" style="margin-top:4px">VIN: ${esc(v.vin)}</div>` : ""}`
        : `<div class="muted">No vehicle linked.</div>`}
      </div>
    </div>

    ${j.description ? `<div class="panel"><h3>Notes</h3><p class="muted" style="white-space:pre-wrap">${esc(j.description)}</p></div>` : ""}

    <div class="page-head"><h1 style="font-size:18px">Invoice</h1>
      <button class="btn btn-primary btn-sm" onclick="location.hash='invoices/new/${j.id}'">+ Create invoice</button></div>
    <div class="table-wrap" style="margin-bottom:24px">${invoices.length ? `<table>
      <thead><tr><th>Number</th><th>Issued</th><th>Total</th><th>Status</th><th></th></tr></thead>
      <tbody>${invoices.map(i => `<tr>
        <td>${esc(i.invoice_number) || "—"}</td><td class="muted">${fmtDate(i.issue_date)}</td>
        <td>${fmtMoney(i.total)}</td><td><span class="badge badge-${i.status}">${esc(i.status)}</span></td>
        <td class="row-actions"><button class="btn btn-sm" onclick="location.hash='invoices/${i.id}'">View / Print</button></td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No invoice yet. Click "Create invoice" to bill this job.</div>`}</div>

    <div class="page-head"><h1 style="font-size:18px">Files</h1>
      <div class="row-actions">
        ${v && v.registration ? `<button class="btn btn-sm" onclick="scanJobFolder('${j.id}','${v.id}','${esc(v.registration)}')">🔍 Scan folder</button>` : ""}
        ${v ? `<button class="btn btn-primary btn-sm" onclick="fileUploadForm('${v.id}','${j.id}')">+ Upload file</button>` : ""}
      </div></div>
    <div class="table-wrap" style="margin-bottom:24px">
      ${!v ? `<div class="empty">Link a vehicle to this job (Edit) to attach files.</div>`
        : files.length ? files.map(f => `<div class="file-row">
        <div class="file-meta"><span class="name">${esc(f.label || f.original_name)}</span>
          <span class="sub">${esc((f.kind || "").replace("_", " "))} · ${esc(f.original_name)} · ${fmtBytes(f.size_bytes)} · ${fmtDate(f.created_at)}</span></div>
        <div class="file-actions">
          <button class="btn btn-sm" onclick="fileEditForm('${f.id}')">Label</button>
          <button class="btn btn-sm" onclick="downloadFile('${esc(f.storage_path)}','${esc(f.original_name)}')">Download</button>
          <button class="btn btn-sm btn-danger" onclick="deleteFile('${f.id}','${esc(f.storage_path)}')">Delete</button>
        </div></div>`).join("") : `<div class="empty">No files linked to this job yet.</div>`}
    </div>

    <div class="page-head"><h1 style="font-size:18px">Diagnostics</h1>
      <button class="btn btn-primary btn-sm" onclick="pickDiagnostic('${j.id}')">+ New diagnostic</button></div>
    <div class="table-wrap">${diagRuns.length ? `<table>
      <thead><tr><th>Diagnostic</th><th>Recorded</th><th></th></tr></thead>
      <tbody>${diagRuns.map(r => `<tr onclick="location.hash='diagnostics/view/${r.id}'">
        <td>${esc(r.title || "Diagnostic")}</td><td class="muted">${fmtDate(r.created_at)}</td>
        <td class="row-actions"><button class="btn btn-sm" onclick="event.stopPropagation();location.hash='diagnostics/view/${r.id}'">View</button></td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No diagnostics recorded for this job yet.</div>`}</div>`;
}

// Delete a job and everything attached to it (invoices + items, and the job's files incl. storage).
// The customer and vehicle are left intact.
window.deleteJob = async (jobId) => {
  if (!confirm("Delete this job and everything attached to it (invoices and files)?\nThe customer and vehicle will be kept. This cannot be undone.")) return;
  // 1. files: remove from storage, then rows
  const { data: files } = await db.from("vehicle_files").select("storage_path").eq("job_id", jobId);
  if (files && files.length) {
    await db.storage.from(cfg.FILE_BUCKET).remove(files.map(f => f.storage_path));
    await db.from("vehicle_files").delete().eq("job_id", jobId);
  }
  // 2. invoices (invoice_items cascade on invoice delete)
  await db.from("invoices").delete().eq("job_id", jobId);
  // 3. the job itself
  const { error } = await db.from("jobs").delete().eq("id", jobId);
  if (error) return toast(error.message, "error");
  toast("Job and attached records deleted", "success");
  location.hash = "jobs"; route();
};

// Add / link a customer to a job (pick existing or create new). Also sets the vehicle's owner.
window.linkCustomerToJob = async (jobId, vehicleId) => {
  const { data: customers } = await db.from("customers").select("id,name").order("name");
  const opts = (customers || []).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  openModal("Add customer", `
    <form id="linkcust-form">
      <div class="field full" style="margin-bottom:12px"><label>Use existing customer</label>
        <select id="lc-existing" onchange="document.getElementById('lc-new').style.display = this.value ? 'none' : 'grid'"><option value="">＋ New customer</option>${opts}</select></div>
      <div id="lc-new" class="form-grid">
        <div class="field"><label>Name</label><input name="name"></div>
        <div class="field"><label>Phone</label><input name="phone"></div>
        <div class="field"><label>Email</label><input name="email"></div>
        <div class="field"><label>Company</label><input name="company"></div>
        <div class="field full"><label>Address</label><input name="address"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Add</button>
      </div>
    </form>`);
  $("#linkcust-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    let custId = el("lc-existing").value;
    if (!custId) {
      const name = f.name.value.trim();
      if (!name) return toast("Enter a name, or pick an existing customer", "error");
      const { data, error } = await db.from("customers").insert({
        name, phone: f.phone.value.trim() || null, email: f.email.value.trim() || null,
        company: f.company.value.trim() || null, address: f.address.value.trim() || null,
      }).select("id").single();
      if (error) return toast(error.message, "error");
      custId = data.id;
    }
    const { error } = await db.from("jobs").update({ customer_id: custId }).eq("id", jobId);
    if (error) return toast(error.message, "error");
    if (vehicleId) await db.from("vehicles").update({ customer_id: custId }).eq("id", vehicleId);
    closeModal(); toast("Customer added", "success"); route();
  });
};

window.jobForm = async (id) => {
  let j = {};
  if (id) j = (await db.from("jobs").select("*").eq("id", id).single()).data;
  const { data: vehicles } = await db.from("vehicles").select("id,registration,make,model,customer_id").order("created_at", { ascending: false });
  const vOpts = vehicles.map(v =>
    `<option value="${v.id}" data-cust="${v.customer_id || ""}" ${v.id === j.vehicle_id ? "selected" : ""}>${esc(`${v.registration || ""} ${v.make || ""} ${v.model || ""}`)}</option>`).join("");
  const typeOpts = Object.entries(JOB_TYPES).map(([k, label]) =>
    `<option value="${k}" ${k === j.job_type ? "selected" : ""}>${label}</option>`).join("");
  const statusOpts = JOB_STATUS.map(s =>
    `<option value="${s}" ${s === j.status ? "selected" : ""}>${s.replace("_", " ")}</option>`).join("");
  openModal(id ? `Edit ${fmtJobNo(j.job_number)}` : "New job", `
    <form id="job-form">
      <div class="form-grid">
        <div class="field"><label>Type</label><select name="job_type"><option value="">—</option>${typeOpts}</select></div>
        <div class="field"><label>Status</label><select name="status">${statusOpts}</select></div>
        <div class="field full"><label>Vehicle</label><select name="vehicle_id" id="job-vehicle"><option value="">—</option>${vOpts}</select></div>
        <div class="field"><label>Price (£)</label><input name="price" data-type="number" value="${j.price ?? ""}"></div>
        <div class="field"></div>
        <div class="field full"><label>Description</label><textarea name="description">${esc(j.description)}</textarea></div>
      </div>
      <div class="form-actions">
        ${id ? `<button type="button" class="btn btn-danger" style="margin-right:auto" onclick="deleteRow('jobs','${id}','jobs')">Delete</button>` : ""}
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? "Save" : "Create"}</button>
      </div>
    </form>`);
  $("#job-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = readForm(e.target);
    if (!payload.status) payload.status = "booked";
    // derive customer from selected vehicle
    const sel = $("#job-vehicle").selectedOptions[0];
    payload.customer_id = sel ? (sel.dataset.cust || null) : null;
    const q = id ? db.from("jobs").update(payload).eq("id", id)
                 : db.from("jobs").insert(payload);
    const { error } = await q;
    if (error) return toast(error.message, "error");
    closeModal(); toast(id ? "Job saved" : "Job created", "success"); route();
  });
};

/* New job — enter customer + vehicle + job all in one form */
window.jnToggleCust = () => { el("jn-cust-fields").style.display = el("jn-cust").value ? "none" : "grid"; };
window.jnToggleVeh = () => { el("jn-veh-fields").style.display = el("jn-veh").value ? "none" : "grid"; };

window.jobCreateForm = async () => {
  const [{ data: customers }, { data: vehicles }] = await Promise.all([
    db.from("customers").select("id,name").order("name"),
    db.from("vehicles").select("id,registration,make,model,customer_id").order("created_at", { ascending: false }),
  ]);
  const custOpts = customers.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join("");
  const vehOpts = vehicles.map(v => `<option value="${v.id}" data-cust="${v.customer_id || ""}">${esc(`${v.registration || ""} ${v.make || ""} ${v.model || ""}`)}</option>`).join("");
  const typeOpts = Object.entries(JOB_TYPES).map(([k, label]) => `<option value="${k}">${label}</option>`).join("");
  const statusOpts = JOB_STATUS.map(s => `<option value="${s}">${s.replace("_", " ")}</option>`).join("");
  const hd = (t) => `<h3 style="font-size:13px;color:var(--primary);text-transform:uppercase;letter-spacing:.04em;margin:4px 0 10px">${t}</h3>`;

  openModal("New job", `
    <form id="jobnew-form">
      ${hd("Customer")}
      <div class="field full" style="margin-bottom:12px">
        <label>Use existing customer</label>
        <select id="jn-cust" onchange="jnToggleCust()"><option value="">＋ Add new customer</option>${custOpts}</select>
      </div>
      <div id="jn-cust-fields" class="form-grid" style="margin-bottom:20px">
        <div class="field"><label>Name</label><input name="c_name" placeholder="Customer name"></div>
        <div class="field"><label>Phone</label><input name="c_phone"></div>
        <div class="field"><label>Email</label><input name="c_email"></div>
        <div class="field"><label>Company</label><input name="c_company"></div>
        <div class="field full"><label>Address</label><input name="c_address"></div>
      </div>

      ${hd("Vehicle")}
      <div class="field full" style="margin-bottom:12px">
        <label>Use existing vehicle</label>
        <select id="jn-veh" onchange="jnToggleVeh()"><option value="">＋ Add new vehicle</option>${vehOpts}</select>
      </div>
      <div id="jn-veh-fields" class="form-grid" style="margin-bottom:20px">
        <div class="field"><label>Registration <span class="muted" style="font-weight:400">— auto-fills on tab</span></label>
          <input name="v_registration" data-looked="" onblur="autoLookup(this,'v_')"></div>
        <div class="field"><label>Year</label><input name="v_year"></div>
        <div class="field"><label>Make</label><input name="v_make"></div>
        <div class="field"><label>Model</label><input name="v_model"></div>
        <div class="field"><label>Engine</label><input name="v_engine"></div>
        <div class="field"><label>ECU type</label><input name="v_ecu_type"></div>
        <div class="field"><label>Gearbox</label><input name="v_gearbox"></div>
        <div class="field"><label>VIN</label><input name="v_vin"></div>
      </div>

      ${hd("Job")}
      <div class="muted" style="font-size:13px;margin-bottom:10px">A job number is assigned automatically.</div>
      <div class="form-grid">
        <div class="field"><label>Type</label><select name="job_type"><option value="">—</option>${typeOpts}</select></div>
        <div class="field"><label>Status</label><select name="status">${statusOpts}</select></div>
        <div class="field"><label>Price (£)</label><input name="price"></div>
        <div class="field"></div>
        <div class="field full"><label>Description</label><textarea name="description"></textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Create job</button>
      </div>
    </form>`);

  $("#jobnew-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const val = (n) => f[n].value.trim() || null;
    let customerId = el("jn-cust").value || null;
    let vehicleId = el("jn-veh").value || null;

    // create new customer if none chosen and a name was entered
    if (!customerId && val("c_name")) {
      const { data, error } = await db.from("customers").insert({
        name: val("c_name"), phone: val("c_phone"), email: val("c_email"),
        company: val("c_company"), address: val("c_address"),
      }).select("id").single();
      if (error) return toast(error.message, "error");
      customerId = data.id;
    }

    if (vehicleId) {
      // existing vehicle chosen — inherit its customer if none set
      if (!customerId) {
        const sel = el("jn-veh").selectedOptions[0];
        customerId = sel ? (sel.dataset.cust || null) : null;
      }
    } else {
      // create new vehicle if any vehicle detail was entered
      const vAny = ["v_registration","v_make","v_model","v_engine","v_ecu_type","v_gearbox","v_vin","v_year"].some(n => val(n));
      if (vAny) {
        const { data, error } = await db.from("vehicles").insert({
          customer_id: customerId, registration: val("v_registration"), make: val("v_make"),
          model: val("v_model"), year: val("v_year") ? Number(val("v_year")) : null,
          engine: val("v_engine"), ecu_type: val("v_ecu_type"), gearbox: val("v_gearbox"), vin: val("v_vin"),
        }).select("id").single();
        if (error) return toast(error.message, "error");
        vehicleId = data.id;
      }
    }

    const { error } = await db.from("jobs").insert({
      vehicle_id: vehicleId, customer_id: customerId,
      job_type: f.job_type.value || null,
      status: f.status.value || "booked", price: val("price") ? Number(val("price")) : null,
      description: val("description"),
    });
    if (error) return toast(error.message, "error");
    closeModal(); toast("Job created", "success"); route();
  });
};

/* ===========================================================
   INVOICES
   =========================================================== */
const INV_STATUS = ["draft", "sent", "paid", "overdue"];

function nextInvoiceNumber(existing) {
  let max = 0;
  existing.forEach(n => { const m = /(\d+)\s*$/.exec(n || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return "INV-" + String(max + 1).padStart(4, "0");
}

views.invoices = async (rest) => {
  if (rest[0] === "new") return invoiceEditor(null, rest[1]);
  if (rest[0] && rest[1] === "edit") return invoiceEditor(rest[0]);
  if (rest[0]) return invoiceView(rest[0]);
  const { data } = await db.from("invoices").select("*, customers(name)").order("created_at", { ascending: false });
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Invoices</h1><div class="page-sub">${data.length} total</div></div>
      <button class="btn btn-primary" onclick="location.hash='invoices/new'">+ New invoice</button></div>
    <div class="table-wrap">${data.length ? `<table>
      <thead><tr><th>Number</th><th>Customer</th><th>Issued</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>${data.map(i => `<tr onclick="location.hash='invoices/${i.id}'">
        <td>${esc(i.invoice_number) || "—"}</td>
        <td>${i.customers ? esc(i.customers.name) : "—"}</td>
        <td class="muted">${fmtDate(i.issue_date)}</td>
        <td>${fmtMoney(i.total)}</td>
        <td><span class="badge badge-${i.status}">${esc(i.status)}</span></td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No invoices yet. Click "New invoice" to create one.</div>`}</div>`;
};

function invRowHtml(it = {}) {
  return `<tr>
    <td><input class="li-desc" value="${esc(it.description)}" placeholder="Description"></td>
    <td class="col-qty"><input class="li-qty" type="number" step="any" value="${it.quantity ?? 1}" oninput="invRecalc()"></td>
    <td class="col-price"><input class="li-price" type="number" step="any" value="${it.unit_price ?? 0}" oninput="invRecalc()"></td>
    <td class="col-total li-total num">£0.00</td>
    <td class="col-x"><button type="button" class="li-del" onclick="invDelRow(this)">&times;</button></td></tr>`;
}
window.invRecalc = () => {
  let sub = 0;
  document.querySelectorAll("#li-body tr").forEach(tr => {
    const q = parseFloat(tr.querySelector(".li-qty").value) || 0;
    const p = parseFloat(tr.querySelector(".li-price").value) || 0;
    const lt = q * p; sub += lt;
    tr.querySelector(".li-total").textContent = "£" + lt.toFixed(2);
  });
  const rate = parseFloat(el("inv-tax").value) || 0;
  const tax = sub * rate / 100;
  el("inv-subtotal").textContent = "£" + sub.toFixed(2);
  el("inv-taxamt").textContent = "£" + tax.toFixed(2);
  el("inv-grand").textContent = "£" + (sub + tax).toFixed(2);
};
window.invAddRow = () => { el("li-body").insertAdjacentHTML("beforeend", invRowHtml()); invRecalc(); };
window.invDelRow = (btn) => { btn.closest("tr").remove(); invRecalc(); };
window.invAddJobLine = (sel) => {
  const o = sel.selectedOptions[0];
  if (!o.value) return;
  el("li-body").insertAdjacentHTML("beforeend", invRowHtml({ description: o.dataset.title, quantity: 1, unit_price: o.dataset.price || 0 }));
  // if a customer isn't chosen yet, adopt the job's customer
  const cust = el("inv-customer");
  if (cust && !cust.value && o.dataset.cust) cust.value = o.dataset.cust;
  sel.value = "";
  invRecalc();
};

async function invoiceEditor(id, jobId) {
  const [{ data: settings }, { data: customers }, { data: jobs }] = await Promise.all([
    db.from("business_settings").select("*").eq("id", true).single(),
    db.from("customers").select("id,name").order("name"),
    db.from("jobs").select("id,job_number,job_type,description,price,customer_id").order("created_at", { ascending: false }),
  ]);
  let inv = { status: "draft", issue_date: new Date().toISOString().slice(0, 10), tax_rate: settings?.default_tax_rate ?? 0 };
  let items = [];
  if (id) {
    inv = (await db.from("invoices").select("*").eq("id", id).single()).data;
    items = (await db.from("invoice_items").select("*").eq("invoice_id", id).order("id")).data || [];
  } else {
    const all = (await db.from("invoices").select("invoice_number")).data || [];
    inv.invoice_number = nextInvoiceNumber(all.map(x => x.invoice_number));
    if (jobId) {
      const { data: job } = await db.from("jobs").select("job_number,job_type,description,price,customer_id").eq("id", jobId).single();
      if (job) {
        inv.customer_id = job.customer_id;
        const d = job.description || JOB_TYPES[job.job_type] || job.job_type || fmtJobNo(job.job_number);
        items = [{ description: d, quantity: 1, unit_price: job.price ?? 0 }];
      }
    }
  }
  const curJobId = id ? (inv.job_id || null) : (jobId || null);
  if (!items.length) items = [{ description: "", quantity: 1, unit_price: 0 }];

  const custOpts = customers.map(c => `<option value="${c.id}" ${c.id === inv.customer_id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  const jobLineDesc = (j) => j.description || JOB_TYPES[j.job_type] || j.job_type || fmtJobNo(j.job_number);
  const jobOpts = jobs.map(j => `<option value="${j.id}" data-title="${esc(jobLineDesc(j))}" data-price="${j.price ?? 0}" data-cust="${j.customer_id || ""}">${esc(fmtJobNo(j.job_number))}${j.job_type ? " — " + esc(JOB_TYPES[j.job_type] || j.job_type) : ""}${j.price != null ? " (" + fmtMoney(j.price) + ")" : ""}</option>`).join("");
  const statusOpts = INV_STATUS.map(s => `<option value="${s}" ${s === inv.status ? "selected" : ""}>${s}</option>`).join("");

  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#${curJobId ? `jobs/${curJobId}` : "jobs"}">${curJobId ? "Job" : "Jobs"}</a> / ${id ? esc(inv.invoice_number) : "New invoice"}</div>
    <div class="page-head"><h1>${id ? "Edit invoice" : "New invoice"}</h1></div>
    <form id="inv-form">
      <div class="panel">
        <div class="form-grid">
          <div class="field"><label>Customer *</label><select id="inv-customer" name="customer_id" required><option value="">—</option>${custOpts}</select></div>
          <div class="field"><label>Invoice number</label><input name="invoice_number" value="${esc(inv.invoice_number)}"></div>
          <div class="field"><label>Issue date</label><input type="date" name="issue_date" value="${inv.issue_date || ""}"></div>
          <div class="field"><label>Due date</label><input type="date" name="due_date" value="${inv.due_date || ""}"></div>
          <div class="field"><label>Status</label><select name="status">${statusOpts}</select></div>
          <div class="field"><label>Add line from job</label><select onchange="invAddJobLine(this)"><option value="">Pick a job…</option>${jobOpts}</select></div>
        </div>
      </div>

      <div class="panel">
        <h3>Line items</h3>
        <table class="line-items">
          <thead><tr><th>Description</th><th class="col-qty">Qty</th><th class="col-price">Unit £</th><th class="col-total">Total</th><th class="col-x"></th></tr></thead>
          <tbody id="li-body">${items.map(invRowHtml).join("")}</tbody>
        </table>
        <button type="button" class="btn btn-sm" style="margin-top:10px" onclick="invAddRow()">+ Add line</button>

        <div class="totals">
          <div class="row"><span class="muted">Subtotal</span><span id="inv-subtotal">£0.00</span></div>
          <div class="row"><span class="muted">VAT (<input id="inv-tax" name="tax_rate" type="number" step="any" value="${inv.tax_rate ?? 0}" style="width:60px;display:inline-block;background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:3px 6px;border-radius:6px" oninput="invRecalc()">%)</span><span id="inv-taxamt">£0.00</span></div>
          <div class="row grand"><span>Total</span><span id="inv-grand">£0.00</span></div>
        </div>
      </div>

      <div class="panel">
        <div class="field"><label>Notes (shown on invoice)</label><textarea name="notes">${esc(inv.notes)}</textarea></div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="location.hash='${curJobId ? `jobs/${curJobId}` : "jobs"}'">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? "Save invoice" : "Create invoice"}</button>
      </div>
    </form>`;
  invRecalc();

  $("#inv-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.customer_id.value) return toast("Please choose a customer", "error");
    // gather items
    const rows = [...document.querySelectorAll("#li-body tr")].map(tr => ({
      description: tr.querySelector(".li-desc").value.trim(),
      quantity: parseFloat(tr.querySelector(".li-qty").value) || 0,
      unit_price: parseFloat(tr.querySelector(".li-price").value) || 0,
    })).filter(r => r.description || r.unit_price || r.quantity);
    rows.forEach(r => r.line_total = r.quantity * r.unit_price);
    const subtotal = rows.reduce((s, r) => s + r.line_total, 0);
    const tax_rate = parseFloat(f.tax_rate.value) || 0;
    const tax_amount = subtotal * tax_rate / 100;
    const payload = {
      customer_id: f.customer_id.value || null,
      job_id: curJobId,
      invoice_number: f.invoice_number.value.trim() || null,
      status: f.status.value,
      issue_date: f.issue_date.value || null,
      due_date: f.due_date.value || null,
      tax_rate, subtotal, tax_amount, total: subtotal + tax_amount,
      notes: f.notes.value.trim() || null,
    };
    let invId = id;
    if (id) {
      const { error } = await db.from("invoices").update(payload).eq("id", id);
      if (error) return toast(error.message, "error");
      await db.from("invoice_items").delete().eq("invoice_id", id);
    } else {
      const { data, error } = await db.from("invoices").insert(payload).select("id").single();
      if (error) return toast(error.message, "error");
      invId = data.id;
    }
    if (rows.length) {
      const { error } = await db.from("invoice_items").insert(rows.map(r => ({ ...r, invoice_id: invId })));
      if (error) return toast(error.message, "error");
    }
    toast("Invoice saved", "success");
    location.hash = "invoices/" + invId;
  });
}

async function invoiceView(id) {
  const [{ data: inv }, { data: settings }] = await Promise.all([
    db.from("invoices").select("*, customers(name,company,address,phone,email)").eq("id", id).single(),
    db.from("business_settings").select("*").eq("id", true).single(),
  ]);
  if (!inv) { el("view").innerHTML = `<div class="empty">Invoice not found.</div>`; return; }
  const { data: items } = await db.from("invoice_items").select("*").eq("invoice_id", id).order("id");
  const c = inv.customers || {};
  const s = settings || {};
  const bizLine = (x) => x ? `<div>${esc(x)}</div>` : "";

  el("view").innerHTML = `
    <div class="page-head no-print"><div class="breadcrumb"><a href="#${inv.job_id ? `jobs/${inv.job_id}` : "jobs"}">${inv.job_id ? "Job" : "Jobs"}</a> / ${esc(inv.invoice_number)}</div>
      <div class="row-actions">
        <select onchange="invSetStatus('${id}', this.value)" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:8px">
          ${INV_STATUS.map(st => `<option value="${st}" ${st === inv.status ? "selected" : ""}>${st}</option>`).join("")}
        </select>
        <button class="btn" onclick="location.hash='invoices/${id}/edit'">Edit</button>
        <button class="btn btn-primary" onclick="window.print()">Print / Save PDF</button>
        <button class="btn btn-danger" onclick="deleteRow('invoices','${id}','${inv.job_id ? `jobs/${inv.job_id}` : "jobs"}')">Delete</button>
      </div></div>

    <div class="invoice-doc">
      <div class="inv-head">
        <div class="inv-biz">
          <img class="inv-logo" src="assets/logo.png" alt="Module Tech">
          <h2>${esc(s.business_name) || "Your business"}</h2>
          ${bizLine(s.address)}${bizLine(s.phone)}${bizLine(s.email)}
          ${s.vat_number ? `<div>VAT: ${esc(s.vat_number)}</div>` : ""}
        </div>
        <div class="inv-meta">
          <div class="inv-title">Invoice</div>
          <div><strong>${esc(inv.invoice_number) || ""}</strong></div>
          <div>Issued: ${fmtDate(inv.issue_date)}</div>
          ${inv.due_date ? `<div>Due: ${fmtDate(inv.due_date)}</div>` : ""}
        </div>
      </div>

      <div class="inv-parties">
        <div><div class="label">Bill to</div>
          <div><strong>${esc(c.name) || "—"}</strong></div>
          ${bizLine(c.company)}${bizLine(c.address)}${bizLine(c.phone)}${bizLine(c.email)}
        </div>
      </div>

      <table class="inv-items">
        <thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit £</th><th class="num">Amount</th></tr></thead>
        <tbody>${(items || []).map(it => `<tr>
          <td>${esc(it.description)}</td>
          <td class="num">${Number(it.quantity)}</td>
          <td class="num">${Number(it.unit_price).toFixed(2)}</td>
          <td class="num">${Number(it.line_total).toFixed(2)}</td></tr>`).join("")}</tbody>
      </table>

      <div class="inv-totals">
        <div class="row"><span>Subtotal</span><span>${fmtMoney(inv.subtotal)}</span></div>
        <div class="row"><span>VAT (${Number(inv.tax_rate)}%)</span><span>${fmtMoney(inv.tax_amount)}</span></div>
        <div class="row grand"><span>Total</span><span>${fmtMoney(inv.total)}</span></div>
      </div>

      ${inv.notes ? `<div class="inv-foot"><strong>Notes:</strong> ${esc(inv.notes)}</div>` : ""}
      ${s.invoice_terms ? `<div class="inv-foot">${esc(s.invoice_terms)}</div>` : ""}
      ${s.bank_details ? `<div class="inv-foot"><strong>Payment:</strong> ${esc(s.bank_details)}</div>` : ""}
    </div>`;
}

window.invSetStatus = async (id, status) => {
  const { error } = await db.from("invoices").update({ status }).eq("id", id);
  if (error) return toast(error.message, "error");
  toast("Status updated to " + status, "success");
};

/* ===================== SETTINGS ===================== */
views.settings = async () => {
  const { data: s } = await db.from("business_settings").select("*").eq("id", true).single();
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Settings</h1>
      <div class="page-sub">Your business details — these appear on invoices.</div></div></div>
    <form id="settings-form"><div class="panel"><div class="form-grid">
      <div class="field full"><label>Business name</label><input name="business_name" value="${esc(s.business_name)}"></div>
      <div class="field full"><label>Address</label><textarea name="address">${esc(s.address)}</textarea></div>
      <div class="field"><label>Phone</label><input name="phone" value="${esc(s.phone)}"></div>
      <div class="field"><label>Email</label><input name="email" value="${esc(s.email)}"></div>
      <div class="field"><label>VAT number</label><input name="vat_number" value="${esc(s.vat_number)}"></div>
      <div class="field"><label>Default VAT rate (%)</label><input name="default_tax_rate" data-type="number" value="${s.default_tax_rate ?? 0}"></div>
      <div class="field full"><label>Bank / payment details</label><textarea name="bank_details">${esc(s.bank_details)}</textarea></div>
      <div class="field full"><label>Invoice terms / footer</label><textarea name="invoice_terms">${esc(s.invoice_terms)}</textarea></div>
    </div>
    <div class="form-actions"><button type="submit" class="btn btn-primary">Save settings</button></div>
    </div></form>
    <div class="panel">
      <h3>Folder scanning</h3>
      <div class="muted" style="font-size:13px;margin-bottom:12px">Choose your files folder (the one that holds your year/reg folders). The <strong>Scan folder</strong> button on each job then pulls in that reg's files. Chrome or Edge on a computer only.</div>
      <button type="button" class="btn" onclick="changeScanFolder()">Choose scan folder…</button>
    </div>`;
  $("#settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = readForm(e.target);
    const { error } = await db.from("business_settings").update(payload).eq("id", true);
    if (error) return toast(error.message, "error");
    toast("Settings saved", "success");
  });
};

const FIELD_TYPES = [["text", "Text"], ["number", "Number"], ["textarea", "Long text"], ["photo", "Photo / file"]];

window.openFile = async (path) => {
  const { data, error } = await db.storage.from(cfg.FILE_BUCKET).createSignedUrl(path, 120);
  if (error) return toast(error.message, "error");
  window.open(data.signedUrl, "_blank");
};

// Pick a template to run against a specific job (from the job page).
window.pickDiagnostic = async (jobId) => {
  const { data: flows } = await db.from("diagnostic_flows").select("id,title,category,steps").order("title");
  if (!flows || !flows.length) return toast("No templates yet — create one in Diagnostics", "error");
  openModal("Start a diagnostic", `<div style="display:flex;flex-direction:column;gap:8px">
    ${flows.map(f => `<button type="button" class="btn" style="justify-content:flex-start;text-align:left" onclick="closeModalGlobal();location.hash='diagnostics/run/${f.id}/${jobId}'">
      <div><div>${esc(f.title)}</div><div class="muted" style="font-size:12px">${(f.steps || []).length} steps${f.category ? " · " + esc(f.category) : ""}</div></div>
    </button>`).join("")}
  </div>`);
};

views.diagnostics = async (rest) => {
  if (rest[0] === "new") return flowEditor(null);
  if (rest[0] === "edit") return flowEditor(rest[1]);
  if (rest[0] === "run") return flowRunForm(rest[1], rest[2]);
  if (rest[0] === "view") return flowRunView(rest[1]);
  const { data } = await db.from("diagnostic_flows").select("*").order("category").order("title");
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Diagnostics</h1>
      <div class="page-sub">Fill-in checklists that capture readings & photos against a job</div></div>
      <button class="btn btn-primary" onclick="location.hash='diagnostics/new'">+ New template</button></div>
    ${data.length ? `<div class="flow-grid">${data.map(f => `
      <div class="flow-card">
        <div onclick="location.hash='diagnostics/run/${f.id}'" style="cursor:pointer">
          ${f.category ? `<div class="cat">${esc(f.category)}</div>` : ""}
          <h3>${esc(f.title)}</h3>
          ${f.summary ? `<div class="muted" style="font-size:13px">${esc(f.summary)}</div>` : ""}
          <div class="count">${(f.steps || []).length} step${(f.steps || []).length === 1 ? "" : "s"}</div>
        </div>
        <div class="row-actions" style="margin-top:10px">
          <button class="btn btn-sm btn-primary" onclick="location.hash='diagnostics/run/${f.id}'">Start</button>
          <button class="btn btn-sm" onclick="location.hash='diagnostics/edit/${f.id}'">Edit template</button>
        </div>
      </div>`).join("")}</div>`
    : `<div class="empty">No templates yet. Click "New template" to build your first one.</div>`}`;
};

// Fill-in capture form: run a template against a job, capturing readings + photos.
async function flowRunForm(flowId, presetJobId) {
  const [{ data: f }, { data: jobs }] = await Promise.all([
    db.from("diagnostic_flows").select("*").eq("id", flowId).single(),
    db.from("jobs").select("id,job_number,customers(name),vehicles(registration)").order("job_number", { ascending: false }),
  ]);
  if (!f) { el("view").innerHTML = `<div class="empty">Template not found.</div>`; return; }
  const steps = f.steps || [];
  const jobOpts = (jobs || []).map(j => `<option value="${j.id}" ${j.id === presetJobId ? "selected" : ""}>${esc(fmtJobNo(j.job_number))}${j.customers ? " — " + esc(j.customers.name) : ""}${j.vehicles ? " (" + esc(j.vehicles.registration || "") + ")" : ""}</option>`).join("");

  const fieldInput = (si, fi, field) => {
    const id = `f_${si}_${fi}`;
    if (field.type === "photo") return `<input id="${id}" type="file" accept="image/*,application/pdf">`;
    if (field.type === "textarea") return `<textarea id="${id}"></textarea>`;
    if (field.type === "number") return `<input id="${id}" type="number" step="any">`;
    return `<input id="${id}" type="text">`;
  };

  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#diagnostics">Diagnostics</a> / ${esc(f.title)}</div>
    <div class="page-head"><div><h1>${esc(f.title)}</h1>
      ${f.summary ? `<div class="page-sub">${esc(f.summary)}</div>` : ""}</div></div>
    <form id="run-form">
      <div class="panel"><div class="field"><label>Link to job *</label>
        <select id="run-job" required><option value="">— choose a job —</option>${jobOpts}</select></div></div>
      ${steps.map((s, si) => `
        <div class="panel">
          <div style="display:flex;gap:12px;align-items:flex-start">
            <div class="step-num">${si + 1}</div>
            <div style="flex:1">
              <div class="step-title">${esc(s.title)}</div>
              ${s.detail ? `<div class="step-detail" style="margin-bottom:12px">${esc(s.detail)}</div>` : ""}
              <div class="form-grid">
                ${(s.fields || []).map((field, fi) => `
                  <div class="field ${field.type === "textarea" || field.type === "photo" ? "full" : ""}">
                    <label>${esc(field.label)}</label>${fieldInput(si, fi, field)}
                  </div>`).join("")}
                <div class="field full"><label>Notes</label><textarea id="note_${si}"></textarea></div>
              </div>
            </div>
          </div>
        </div>`).join("")}
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="location.hash='${presetJobId ? `jobs/${presetJobId}` : "diagnostics"}'">Cancel</button>
        <button type="submit" class="btn btn-primary" id="run-save">Save diagnostic</button>
      </div>
    </form>`;

  $("#run-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const jobId = el("run-job").value;
    if (!jobId) return toast("Please choose a job to link this to", "error");
    const btn = el("run-save"); btn.disabled = true; btn.textContent = "Saving…";
    const values = {};
    for (let si = 0; si < steps.length; si++) {
      const s = steps[si];
      for (let fi = 0; fi < (s.fields || []).length; fi++) {
        const field = s.fields[fi];
        const inp = el(`f_${si}_${fi}`);
        if (!inp) continue;
        if (field.type === "photo") {
          const file = inp.files && inp.files[0];
          if (file) {
            const safe = file.name.replace(/[^\w.\-]+/g, "_");
            const path = `diag/${jobId}/${Date.now()}_${Math.random().toString(36).slice(2, 6)}_${safe}`;
            const { error } = await db.storage.from(cfg.FILE_BUCKET).upload(path, file);
            if (!error) values[`s${si}f${fi}`] = { photo: path, name: file.name };
          }
        } else if (inp.value.trim()) {
          values[`s${si}f${fi}`] = inp.value.trim();
        }
      }
      const note = el(`note_${si}`);
      if (note && note.value.trim()) values[`s${si}note`] = note.value.trim();
    }
    const { error } = await db.from("diagnostic_runs").insert({
      flow_id: flowId, job_id: jobId, title: f.title, data: { steps, values },
    });
    if (error) { btn.disabled = false; btn.textContent = "Save diagnostic"; return toast(error.message, "error"); }
    toast("Diagnostic saved to job", "success");
    location.hash = "jobs/" + jobId;
  });
}

// Read-only view of a saved diagnostic report.
async function flowRunView(runId) {
  const { data: run } = await db.from("diagnostic_runs").select("*, jobs(id,job_number)").eq("id", runId).single();
  if (!run) { el("view").innerHTML = `<div class="empty">Diagnostic not found.</div>`; return; }
  const steps = (run.data && run.data.steps) || [];
  const values = (run.data && run.data.values) || {};
  const backJob = run.jobs ? `jobs/${run.jobs.id}` : "diagnostics";
  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#${backJob}">${run.jobs ? fmtJobNo(run.jobs.job_number) : "Diagnostics"}</a> / ${esc(run.title || "Diagnostic")}</div>
    <div class="page-head"><div><h1>${esc(run.title || "Diagnostic")}</h1>
      <div class="page-sub">Recorded ${fmtDate(run.created_at)}</div></div>
      <div class="row-actions"><button class="btn btn-danger" onclick="deleteRow('diagnostic_runs','${run.id}','${backJob}')">Delete</button></div></div>
    ${steps.map((s, si) => {
      const rows = (s.fields || []).map((field, fi) => {
        const v = values[`s${si}f${fi}`];
        if (v == null) return "";
        if (field.type === "photo" && v.photo) return `<div class="field full"><label>${esc(field.label)}</label>
          <img class="diag-photo" data-path="${esc(v.photo)}" alt="${esc(field.label)}" onclick="openFile('${esc(v.photo)}')" title="Click to open"></div>`;
        return `<div class="field ${field.type === "textarea" ? "full" : ""}"><label>${esc(field.label)}</label><div class="ro-val">${esc(typeof v === "string" ? v : "")}</div></div>`;
      }).join("");
      const note = values[`s${si}note`];
      return `<div class="panel"><div style="display:flex;gap:12px;align-items:flex-start">
        <div class="step-num">${si + 1}</div>
        <div style="flex:1"><div class="step-title">${esc(s.title)}</div>
          <div class="form-grid" style="margin-top:8px">${rows}
            ${note ? `<div class="field full"><label>Notes</label><div class="ro-val muted">${esc(note)}</div></div>` : ""}</div>
        </div></div></div>`;
    }).join("")}`;
  document.querySelectorAll("img.diag-photo").forEach(async (img) => {
    const { data } = await db.storage.from(cfg.FILE_BUCKET).createSignedUrl(img.dataset.path, 300);
    if (data) img.src = data.signedUrl;
  });
}

function fieldRowHtml(field = {}) {
  const opts = FIELD_TYPES.map(([v, l]) => `<option value="${v}" ${v === field.type ? "selected" : ""}>${l}</option>`).join("");
  return `<div class="se-field-row">
    <input class="sef-label" placeholder="Input label (e.g. Part number)" value="${esc(field.label)}">
    <select class="sef-type">${opts}</select>
    <button type="button" class="li-del" onclick="this.closest('.se-field-row').remove()">&times;</button>
  </div>`;
}
function stepRowHtml(s = {}) {
  const fields = s.fields || [];
  return `<div class="step-edit-row">
    <div class="step-move">
      <button type="button" onclick="flowMoveStep(this,-1)" title="Move up">&#9650;</button>
      <button type="button" onclick="flowMoveStep(this,1)" title="Move down">&#9660;</button>
    </div>
    <div class="step-edit-fields">
      <input class="se-title" placeholder="Step title (e.g. Visual inspection)" value="${esc(s.title)}">
      <textarea class="se-detail" placeholder="Instructions — what to check, look for, or do">${esc(s.detail)}</textarea>
      <div class="se-fields">
        <div class="muted" style="font-size:11px;margin:2px 0 6px">Inputs to capture on this step:</div>
        <div class="se-field-list">${fields.map(fieldRowHtml).join("")}</div>
        <button type="button" class="btn btn-sm" onclick="flowAddField(this)">+ Add input</button>
      </div>
    </div>
    <button type="button" class="li-del" onclick="flowDelStep(this)">&times;</button>
  </div>`;
}
window.flowAddField = (btn) => { btn.previousElementSibling.insertAdjacentHTML("beforeend", fieldRowHtml()); };
window.flowAddStep = () => { el("steps-body").insertAdjacentHTML("beforeend", stepRowHtml()); };
window.flowDelStep = (b) => b.closest(".step-edit-row").remove();
window.flowMoveStep = (btn, dir) => {
  const row = btn.closest(".step-edit-row");
  if (dir < 0 && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
  if (dir > 0 && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
};

async function flowEditor(id) {
  let f = { steps: [] };
  if (id) f = (await db.from("diagnostic_flows").select("*").eq("id", id).single()).data;
  const steps = (f.steps && f.steps.length) ? f.steps : [{ title: "", detail: "" }];
  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#diagnostics">Diagnostics</a> / ${id ? "Edit template" : "New template"}</div>
    <div class="page-head"><h1>${id ? "Edit template" : "New template"}</h1></div>
    <form id="flow-form">
      <div class="panel"><div class="form-grid">
        <div class="field"><label>Title *</label><input name="title" required value="${esc(f.title)}" placeholder="e.g. Module PCB repair"></div>
        <div class="field"><label>Category</label><input name="category" value="${esc(f.category)}" placeholder="e.g. PCB repair, immobiliser, gearbox"></div>
        <div class="field full"><label>Summary</label><input name="summary" value="${esc(f.summary)}" placeholder="One-line description of when to use this"></div>
      </div></div>
      <div class="panel">
        <h3>Steps</h3>
        <div class="muted" style="font-size:12px;margin-bottom:10px">Each step has instructions plus the inputs you want to capture (text, number, long text, or a photo).</div>
        <div id="steps-body">${steps.map(stepRowHtml).join("")}</div>
        <button type="button" class="btn btn-sm" onclick="flowAddStep()">+ Add step</button>
      </div>
      <div class="form-actions">
        ${id ? `<button type="button" class="btn btn-danger" style="margin-right:auto" onclick="deleteRow('diagnostic_flows','${id}','diagnostics')">Delete template</button>` : ""}
        <button type="button" class="btn btn-ghost" onclick="location.hash='diagnostics'">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? "Save template" : "Create template"}</button>
      </div>
    </form>`;
  $("#flow-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f2 = e.target;
    const stepsOut = [...document.querySelectorAll("#steps-body .step-edit-row")].map(r => {
      const fields = [...r.querySelectorAll(".se-field-row")].map(fr => ({
        label: fr.querySelector(".sef-label").value.trim(),
        type: fr.querySelector(".sef-type").value,
      })).filter(x => x.label);
      return { title: r.querySelector(".se-title").value.trim(), detail: r.querySelector(".se-detail").value.trim(), fields };
    }).filter(s => s.title || s.detail || s.fields.length);
    const payload = {
      title: f2.title.value.trim(),
      category: f2.category.value.trim() || null,
      summary: f2.summary.value.trim() || null,
      steps: stepsOut,
    };
    if (id) {
      const { error } = await db.from("diagnostic_flows").update(payload).eq("id", id);
      if (error) return toast(error.message, "error");
    } else {
      const { error } = await db.from("diagnostic_flows").insert(payload);
      if (error) return toast(error.message, "error");
    }
    toast("Template saved", "success");
    location.hash = "diagnostics";
  });
}

/* ===========================================================
   REPORTS
   =========================================================== */
views.reports = async () => {
  const [{ data: invoices }, { data: jobs }] = await Promise.all([
    db.from("invoices").select("total,status,issue_date, customers(name)"),
    db.from("jobs").select("status,job_type"),
  ]);
  const sum = (arr) => arr.reduce((s, x) => s + (Number(x.total) || 0), 0);
  const invoiced = sum(invoices);
  const paid = sum(invoices.filter(i => i.status === "paid"));
  const outstanding = sum(invoices.filter(i => i.status !== "paid"));

  const byMonth = {};
  invoices.filter(i => i.status === "paid" && i.issue_date).forEach(i => {
    const m = i.issue_date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + (Number(i.total) || 0);
  });
  const months = Object.keys(byMonth).sort().slice(-12);
  const maxMonth = Math.max(1, ...months.map(m => byMonth[m]));
  const monthLabel = (m) => { const [y, mo] = m.split("-"); return new Date(y, mo - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" }); };

  const countBy = (arr, key, map) => {
    const o = {};
    arr.forEach(x => { const k = (map && map[x[key]]) || x[key] || "Unspecified"; o[k] = (o[k] || 0) + 1; });
    return Object.entries(o).sort((a, b) => b[1] - a[1]);
  };
  const jobStatus = countBy(jobs, "status", Object.fromEntries(JOB_STATUS.map(s => [s, s.replace("_", " ")])));
  const jobType = countBy(jobs, "job_type", JOB_TYPES);
  const maxJobs = Math.max(1, jobs.length);

  const custPaid = {};
  invoices.filter(i => i.status === "paid").forEach(i => { const n = i.customers ? i.customers.name : "—"; custPaid[n] = (custPaid[n] || 0) + (Number(i.total) || 0); });
  const topCust = Object.entries(custPaid).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCust = Math.max(1, ...topCust.map(c => c[1]));

  const bar = (pct, color) => `<div style="height:8px;background:var(--surface-2);border-radius:20px;overflow:hidden;flex:1"><div style="height:100%;width:${pct}%;background:${color || "var(--primary)"}"></div></div>`;

  el("view").innerHTML = `
    <div class="page-head"><div><h1>Reports</h1>
      <div class="page-sub">Income & workload overview</div></div></div>

    <div class="stats">
      <div class="stat-card"><div class="num">${fmtMoney(invoiced)}</div><div class="label">Total invoiced</div></div>
      <div class="stat-card"><div class="num" style="color:var(--green)">${fmtMoney(paid)}</div><div class="label">Paid</div></div>
      <div class="stat-card"><div class="num" style="color:var(--red)">${fmtMoney(outstanding)}</div><div class="label">Outstanding</div></div>
      <div class="stat-card"><div class="num">${jobs.length}</div><div class="label">Jobs total</div></div>
    </div>

    <div class="panel"><h3>Income by month (paid invoices)</h3>
      ${months.length ? months.map(m => `<div style="display:flex;align-items:center;gap:12px;margin:8px 0">
        <span class="muted" style="width:90px;font-size:13px">${monthLabel(m)}</span>
        ${bar(byMonth[m] / maxMonth * 100, "var(--green)")}
        <span style="width:80px;text-align:right">${fmtMoney(byMonth[m])}</span></div>`).join("")
      : `<div class="empty">No paid invoices yet.</div>`}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
      <div class="panel"><h3>Jobs by status</h3>
        ${jobStatus.length ? jobStatus.map(([k, n]) => `<div style="display:flex;align-items:center;gap:12px;margin:8px 0">
          <span class="muted" style="width:120px;font-size:13px;text-transform:capitalize">${esc(k)}</span>
          ${bar(n / maxJobs * 100)}<span style="width:30px;text-align:right">${n}</span></div>`).join("")
        : `<div class="empty">No jobs yet.</div>`}
      </div>
      <div class="panel"><h3>Jobs by type</h3>
        ${jobType.length ? jobType.map(([k, n]) => `<div style="display:flex;align-items:center;gap:12px;margin:8px 0">
          <span class="muted" style="width:120px;font-size:13px">${esc(k)}</span>
          ${bar(n / maxJobs * 100, "var(--blue)")}<span style="width:30px;text-align:right">${n}</span></div>`).join("")
        : `<div class="empty">No jobs yet.</div>`}
      </div>
    </div>

    <div class="panel"><h3>Top customers (by paid)</h3>
      ${topCust.length ? topCust.map(([n, amt]) => `<div style="display:flex;align-items:center;gap:12px;margin:8px 0">
        <span class="muted" style="width:140px;font-size:13px">${esc(n)}</span>
        ${bar(amt / maxCust * 100)}<span style="width:80px;text-align:right">${fmtMoney(amt)}</span></div>`).join("")
      : `<div class="empty">No paid invoices yet.</div>`}
    </div>`;
};

/* ---------- generic delete ---------- */
window.deleteRow = async (table, id, backTo) => {
  if (!confirm("Delete this record? This cannot be undone.")) return;
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) return toast(error.message, "error");
  closeModal(); toast("Deleted", "success");
  location.hash = backTo; route();
};

// Delete a vehicle and its files (from storage too). Jobs are kept but unlinked.
window.deleteVehicle = async (id, backTo) => {
  if (!confirm("Delete this vehicle and all its files? Any jobs stay but are unlinked from it. This cannot be undone.")) return;
  const { data: files } = await db.from("vehicle_files").select("storage_path").eq("vehicle_id", id);
  if (files && files.length) await db.storage.from(cfg.FILE_BUCKET).remove(files.map(f => f.storage_path));
  const { error } = await db.from("vehicles").delete().eq("id", id);
  if (error) return toast(error.message, "error");
  closeModal(); toast("Vehicle deleted", "success");
  location.hash = backTo || "vehicles"; route();
};

// Delete a customer AND their vehicles + files. Jobs are kept but unlinked.
window.deleteCustomer = async (id, backTo) => {
  if (!confirm("Delete this customer, along with their vehicles and files? Any jobs stay but are unlinked. This cannot be undone.")) return;
  const { data: vehicles } = await db.from("vehicles").select("id").eq("customer_id", id);
  const vids = (vehicles || []).map(v => v.id);
  if (vids.length) {
    const { data: files } = await db.from("vehicle_files").select("storage_path").in("vehicle_id", vids);
    if (files && files.length) await db.storage.from(cfg.FILE_BUCKET).remove(files.map(f => f.storage_path));
  }
  const { error } = await db.from("customers").delete().eq("id", id);
  if (error) return toast(error.message, "error");
  closeModal(); toast("Customer deleted", "success");
  location.hash = backTo || "customers"; route();
};
window.closeModalGlobal = closeModal;

/* ---------- go ---------- */
initAuth();
