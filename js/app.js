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
      <div class="page-sub">Welcome back — here's the shop at a glance.</div></div></div>
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
        <tbody>${recentJobs.map(j => `<tr onclick="location.hash='jobs'">
          <td>${esc(j.title || j.job_type || "Job")}</td>
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
        <button class="btn btn-danger" onclick="deleteRow('customers','${c.id}','customers')">Delete</button>
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
        <div class="field"><label>Registration</label><input name="registration" value="${esc(v.registration)}"></div>
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
  const { data: faults } = await db.from("faults").select("*").eq("vehicle_id", id).order("created_at", { ascending: false });

  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#vehicles">Vehicles</a> / ${esc(v.registration || v.make || "Vehicle")}</div>
    <div class="page-head"><div>
      <h1>${esc(`${v.make || ""} ${v.model || ""}`) || "Vehicle"} <span class="chip">${esc(v.registration) || ""}</span></h1>
      <div class="page-sub">${v.customers ? `Owner: <a href="#customers/${v.customers.id}" style="color:var(--blue)">${esc(v.customers.name)}</a>` : "No customer linked"}</div></div>
      <div class="row-actions">
        <button class="btn" onclick="vehicleForm('${v.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteRow('vehicles','${v.id}','vehicles')">Delete</button>
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
          <button class="btn btn-sm" onclick="downloadFile('${esc(f.storage_path)}','${esc(f.original_name)}')">Download</button>
          <button class="btn btn-sm btn-danger" onclick="deleteFile('${f.id}','${esc(f.storage_path)}','${v.id}')">Delete</button>
        </div></div>`).join("") : `<div class="empty">No files uploaded for this vehicle yet.</div>`}
    </div>

    <div class="page-head"><h1 style="font-size:18px">Fault log</h1>
      <button class="btn btn-primary btn-sm" onclick="faultForm(null,'${v.id}')">+ Log fault</button></div>
    <div class="table-wrap">${faults.length ? `<table>
      <thead><tr><th>Module</th><th>Code</th><th>Description</th><th>Resolution</th><th>Date</th></tr></thead>
      <tbody>${faults.map(f => `<tr onclick="faultForm('${f.id}','${v.id}')">
        <td>${esc(f.module) || "—"}</td><td><span class="chip">${esc(f.fault_code) || "—"}</span></td>
        <td>${esc(f.description) || "—"}</td><td class="muted">${esc(f.resolution) || "—"}</td>
        <td class="muted">${fmtDate(f.created_at)}</td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No faults logged for this vehicle.</div>`}</div>`;
}

/* ---------- File upload / download ---------- */
window.fileUploadForm = async (vehicleId, jobId) => {
  const { data: jobs } = await db.from("jobs").select("id,title,job_type").eq("vehicle_id", vehicleId).order("created_at", { ascending: false });
  const jobOpts = (jobs || []).map(j => `<option value="${j.id}" ${j.id === jobId ? "selected" : ""}>${esc(j.title || JOB_TYPES[j.job_type] || "Job")}</option>`).join("");
  openModal("Upload file", `
    <form id="file-form">
      <div class="form-grid">
        <div class="field full"><label>File *</label><input type="file" name="file" required></div>
        <div class="field"><label>Type</label><select name="kind">
          <option value="original_read">Original read</option>
          <option value="modified_write">Modified / write</option>
          <option value="backup">Backup</option>
          <option value="eeprom">EEPROM</option>
          <option value="flash">Flash</option>
          <option value="other">Other</option>
        </select></div>
        <div class="field"><label>Label</label><input name="label" placeholder="e.g. Stage 1 map"></div>
        <div class="field full"><label>Link to job (optional)</label><select name="job_id"><option value="">— none —</option>${jobOpts}</select></div>
        <div class="field full"><label>Notes</label><textarea name="notes"></textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="upbtn">Upload</button>
      </div>
    </form>`);
  $("#file-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const file = form.file.files[0];
    if (!file) return;
    el("upbtn").textContent = "Uploading…";
    const path = `${vehicleId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await db.storage.from(cfg.FILE_BUCKET).upload(path, file);
    if (upErr) { el("upbtn").textContent = "Upload"; return toast(upErr.message, "error"); }
    const { error } = await db.from("vehicle_files").insert({
      vehicle_id: vehicleId, job_id: form.job_id.value || null, kind: form.kind.value,
      label: form.label.value.trim() || null, notes: form.notes.value.trim() || null,
      storage_path: path, original_name: file.name, size_bytes: file.size,
    });
    if (error) return toast(error.message, "error");
    closeModal(); toast("File uploaded", "success"); route();
  });
};

window.downloadFile = async (path, name) => {
  const { data, error } = await db.storage.from(cfg.FILE_BUCKET).createSignedUrl(path, 60);
  if (error) return toast(error.message, "error");
  const a = document.createElement("a");
  a.href = data.signedUrl; a.download = name || ""; document.body.appendChild(a); a.click(); a.remove();
};

window.deleteFile = async (id, path, vehicleId) => {
  if (!confirm("Delete this file? This cannot be undone.")) return;
  await db.storage.from(cfg.FILE_BUCKET).remove([path]);
  const { error } = await db.from("vehicle_files").delete().eq("id", id);
  if (error) return toast(error.message, "error");
  toast("File deleted", "success"); route();
};

/* ===========================================================
   JOBS
   =========================================================== */
const JOB_TYPES = { remap: "Remap", module_repair: "Module repair", cloning: "Cloning", recovery: "Recovery", diagnostic: "Diagnostic" };
const JOB_STATUS = ["booked", "in_progress", "awaiting_parts", "completed", "invoiced"];

views.jobs = async (rest) => {
  if (rest[0]) return jobDetail(rest[0]);
  const { data } = await db.from("jobs")
    .select("*, vehicles(registration, make, model), customers(name)")
    .order("created_at", { ascending: false });
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Jobs</h1>
      <div class="page-sub">${data.length} total</div></div>
      <button class="btn btn-primary" onclick="jobCreateForm()">+ New job</button></div>
    <div class="table-wrap">${data.length ? `<table>
      <thead><tr><th>Title</th><th>Type</th><th>Vehicle</th><th>Customer</th><th>Status</th><th>Price</th></tr></thead>
      <tbody>${data.map(j => `<tr onclick="location.hash='jobs/${j.id}'">
        <td>${esc(j.title) || "—"}</td>
        <td>${esc(JOB_TYPES[j.job_type] || j.job_type) || "—"}</td>
        <td>${j.vehicles ? esc(`${j.vehicles.registration || ""} ${j.vehicles.make || ""}`) : "—"}</td>
        <td>${j.customers ? esc(j.customers.name) : "—"}</td>
        <td><span class="badge badge-${j.status}">${esc(j.status.replace("_", " "))}</span></td>
        <td>${fmtMoney(j.price)}</td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No jobs yet.</div>`}</div>`;
};

async function jobDetail(id) {
  const { data: j } = await db.from("jobs").select("*, vehicles(id,registration,make,model), customers(id,name)").eq("id", id).single();
  if (!j) { el("view").innerHTML = `<div class="empty">Job not found.</div>`; return; }
  const v = j.vehicles;
  const { data: files } = await db.from("vehicle_files").select("*").eq("job_id", id).order("created_at", { ascending: false });
  const { data: faults } = await db.from("faults").select("*").eq("job_id", id).order("created_at", { ascending: false });
  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#jobs">Jobs</a> / ${esc(j.title || "Job")}</div>
    <div class="page-head"><div>
      <h1>${esc(j.title || "Job")} <span class="badge badge-${j.status}">${esc(j.status.replace("_", " "))}</span></h1>
      <div class="page-sub">${esc(JOB_TYPES[j.job_type] || j.job_type || "")}</div></div>
      <div class="row-actions">
        <button class="btn" onclick="jobForm('${j.id}')">Edit</button>
        <button class="btn btn-danger" onclick="deleteRow('jobs','${j.id}','jobs')">Delete</button>
      </div></div>

    <div class="panel"><h3>Details</h3>
      <div class="form-grid">
        <div><span class="muted">Vehicle:</span> ${v ? `<a href="#vehicles/${v.id}" style="color:var(--blue)">${esc(`${v.registration || ""} ${v.make || ""} ${v.model || ""}`)}</a>` : "—"}</div>
        <div><span class="muted">Customer:</span> ${j.customers ? `<a href="#customers/${j.customers.id}" style="color:var(--blue)">${esc(j.customers.name)}</a>` : "—"}</div>
        <div><span class="muted">Price:</span> ${fmtMoney(j.price)}</div>
        <div><span class="muted">Created:</span> ${fmtDate(j.created_at)}</div>
      </div>
      ${j.description ? `<p class="muted" style="margin-top:10px">${esc(j.description)}</p>` : ""}
    </div>

    <div class="page-head"><h1 style="font-size:18px">Files</h1>
      ${v ? `<button class="btn btn-primary btn-sm" onclick="fileUploadForm('${v.id}','${j.id}')">+ Upload file</button>` : ""}</div>
    <div class="table-wrap" style="margin-bottom:24px">
      ${!v ? `<div class="empty">Link a vehicle to this job (Edit) to attach files.</div>`
        : files.length ? files.map(f => `<div class="file-row">
        <div class="file-meta"><span class="name">${esc(f.label || f.original_name)}</span>
          <span class="sub">${esc((f.kind || "").replace("_", " "))} · ${esc(f.original_name)} · ${fmtBytes(f.size_bytes)} · ${fmtDate(f.created_at)}</span></div>
        <div class="file-actions">
          <button class="btn btn-sm" onclick="downloadFile('${esc(f.storage_path)}','${esc(f.original_name)}')">Download</button>
          <button class="btn btn-sm btn-danger" onclick="deleteFile('${f.id}','${esc(f.storage_path)}','${v.id}')">Delete</button>
        </div></div>`).join("") : `<div class="empty">No files linked to this job yet.</div>`}
    </div>

    <div class="page-head"><h1 style="font-size:18px">Faults</h1>
      <button class="btn btn-primary btn-sm" onclick="faultForm(null,${v ? `'${v.id}'` : "null"},'${j.id}')">+ Log fault</button></div>
    <div class="table-wrap">${faults.length ? `<table>
      <thead><tr><th>Module</th><th>Code</th><th>Description</th><th>Resolution</th><th>Date</th></tr></thead>
      <tbody>${faults.map(f => `<tr onclick="faultForm('${f.id}',${v ? `'${v.id}'` : "null"},'${j.id}')">
        <td>${esc(f.module) || "—"}</td><td><span class="chip">${esc(f.fault_code) || "—"}</span></td>
        <td>${esc(f.description) || "—"}</td><td class="muted">${esc(f.resolution) || "—"}</td>
        <td class="muted">${fmtDate(f.created_at)}</td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No faults linked to this job yet.</div>`}</div>`;
}

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
  openModal(id ? "Edit job" : "New job", `
    <form id="job-form">
      <div class="form-grid">
        <div class="field full"><label>Title</label><input name="title" value="${esc(j.title)}" placeholder="e.g. Stage 1 remap"></div>
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
        <div class="field"><label>Registration</label><input name="v_registration"></div>
        <div class="field"><label>Year</label><input name="v_year"></div>
        <div class="field"><label>Make</label><input name="v_make"></div>
        <div class="field"><label>Model</label><input name="v_model"></div>
        <div class="field"><label>Engine</label><input name="v_engine"></div>
        <div class="field"><label>ECU type</label><input name="v_ecu_type"></div>
        <div class="field"><label>Gearbox</label><input name="v_gearbox"></div>
        <div class="field"><label>VIN</label><input name="v_vin"></div>
      </div>

      ${hd("Job")}
      <div class="form-grid">
        <div class="field full"><label>Title</label><input name="title" placeholder="e.g. Stage 1 remap"></div>
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
      title: val("title"), job_type: f.job_type.value || null,
      status: f.status.value || "booked", price: val("price") ? Number(val("price")) : null,
      description: val("description"),
    });
    if (error) return toast(error.message, "error");
    closeModal(); toast("Job created", "success"); route();
  });
};

/* ===========================================================
   FAULTS
   =========================================================== */
views.faults = async () => {
  const { data } = await db.from("faults")
    .select("*, vehicles(registration, make, model)").order("created_at", { ascending: false });
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Fault log</h1>
      <div class="page-sub">Searchable history of faults & fixes — ${data.length} entries</div></div>
      <button class="btn btn-primary" onclick="faultForm()">+ Log fault</button></div>
    <div class="panel" style="padding:12px"><input id="fault-search" placeholder="Search module, code, description…"
      style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:9px 11px;border-radius:8px"></div>
    <div class="table-wrap" id="fault-table">${faultRows(data)}</div>`;
  const all = data;
  $("#fault-search").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = all.filter(f => JSON.stringify(f).toLowerCase().includes(q));
    $("#fault-table").innerHTML = faultRows(filtered);
  });
};

function faultRows(data) {
  if (!data.length) return `<div class="empty">No faults logged yet.</div>`;
  return `<table>
    <thead><tr><th>Module</th><th>Code</th><th>Vehicle</th><th>Description</th><th>Resolution</th><th>Date</th></tr></thead>
    <tbody>${data.map(f => `<tr onclick="faultForm('${f.id}', ${f.vehicle_id ? `'${f.vehicle_id}'` : "null"})">
      <td>${esc(f.module) || "—"}</td><td><span class="chip">${esc(f.fault_code) || "—"}</span></td>
      <td>${f.vehicles ? esc(`${f.vehicles.registration || ""} ${f.vehicles.make || ""}`) : "—"}</td>
      <td>${esc(f.description) || "—"}</td><td class="muted">${esc(f.resolution) || "—"}</td>
      <td class="muted">${fmtDate(f.created_at)}</td></tr>`).join("")}</tbody></table>`;
}

window.faultForm = async (id, vehicleId, jobId) => {
  let f = { vehicle_id: vehicleId, job_id: jobId };
  if (id) f = (await db.from("faults").select("*").eq("id", id).single()).data;
  const [{ data: vehicles }, { data: jobs }] = await Promise.all([
    db.from("vehicles").select("id,registration,make,model").order("created_at", { ascending: false }),
    db.from("jobs").select("id,title,job_type").order("created_at", { ascending: false }),
  ]);
  const vOpts = vehicles.map(v =>
    `<option value="${v.id}" ${v.id === f.vehicle_id ? "selected" : ""}>${esc(`${v.registration || ""} ${v.make || ""} ${v.model || ""}`)}</option>`).join("");
  const jOpts = jobs.map(j =>
    `<option value="${j.id}" ${j.id === f.job_id ? "selected" : ""}>${esc(j.title || JOB_TYPES[j.job_type] || "Job")}</option>`).join("");
  openModal(id ? "Edit fault" : "Log fault", `
    <form id="fault-form-modal">
      <div class="form-grid">
        <div class="field"><label>Vehicle</label><select name="vehicle_id"><option value="">—</option>${vOpts}</select></div>
        <div class="field"><label>Job (optional)</label><select name="job_id"><option value="">—</option>${jOpts}</select></div>
        <div class="field"><label>Module</label><input name="module" value="${esc(f.module)}" placeholder="e.g. ABS, ECU, BSI"></div>
        <div class="field"><label>Fault code</label><input name="fault_code" value="${esc(f.fault_code)}" placeholder="e.g. P0420"></div>
        <div class="field full"><label>Description</label><textarea name="description">${esc(f.description)}</textarea></div>
        <div class="field full"><label>Cause</label><textarea name="cause">${esc(f.cause)}</textarea></div>
        <div class="field full"><label>Resolution / fix</label><textarea name="resolution">${esc(f.resolution)}</textarea></div>
      </div>
      <div class="form-actions">
        ${id ? `<button type="button" class="btn btn-danger" style="margin-right:auto" onclick="deleteRow('faults','${id}','faults')">Delete</button>` : ""}
        <button type="button" class="btn btn-ghost" onclick="closeModalGlobal()">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? "Save" : "Log fault"}</button>
      </div>
    </form>`);
  $("#fault-form-modal").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = readForm(e.target);
    const q = id ? db.from("faults").update(payload).eq("id", id)
                 : db.from("faults").insert(payload);
    const { error } = await q;
    if (error) return toast(error.message, "error");
    closeModal(); toast(id ? "Fault saved" : "Fault logged", "success"); route();
  });
};

/* ===========================================================
   PLACEHOLDERS (next iterations)
   =========================================================== */
const INV_STATUS = ["draft", "sent", "paid", "overdue"];

function nextInvoiceNumber(existing) {
  let max = 0;
  existing.forEach(n => { const m = /(\d+)\s*$/.exec(n || ""); if (m) max = Math.max(max, parseInt(m[1], 10)); });
  return "INV-" + String(max + 1).padStart(4, "0");
}

views.invoices = async (rest) => {
  if (rest[0] === "new") return invoiceEditor(null);
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

async function invoiceEditor(id) {
  const [{ data: settings }, { data: customers }, { data: jobs }] = await Promise.all([
    db.from("business_settings").select("*").eq("id", true).single(),
    db.from("customers").select("id,name").order("name"),
    db.from("jobs").select("id,title,price,customer_id").order("created_at", { ascending: false }),
  ]);
  let inv = { status: "draft", issue_date: new Date().toISOString().slice(0, 10), tax_rate: settings?.default_tax_rate ?? 0 };
  let items = [];
  if (id) {
    inv = (await db.from("invoices").select("*").eq("id", id).single()).data;
    items = (await db.from("invoice_items").select("*").eq("invoice_id", id).order("id")).data || [];
  } else {
    const all = (await db.from("invoices").select("invoice_number")).data || [];
    inv.invoice_number = nextInvoiceNumber(all.map(x => x.invoice_number));
  }
  if (!items.length) items = [{ description: "", quantity: 1, unit_price: 0 }];

  const custOpts = customers.map(c => `<option value="${c.id}" ${c.id === inv.customer_id ? "selected" : ""}>${esc(c.name)}</option>`).join("");
  const jobOpts = jobs.map(j => `<option value="${j.id}" data-title="${esc(j.title || "Job")}" data-price="${j.price ?? 0}" data-cust="${j.customer_id || ""}">${esc(j.title || "Job")} ${j.price != null ? "— " + fmtMoney(j.price) : ""}</option>`).join("");
  const statusOpts = INV_STATUS.map(s => `<option value="${s}" ${s === inv.status ? "selected" : ""}>${s}</option>`).join("");

  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#invoices">Invoices</a> / ${id ? esc(inv.invoice_number) : "New"}</div>
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
        <button type="button" class="btn btn-ghost" onclick="location.hash='invoices'">Cancel</button>
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
    <div class="page-head no-print"><div class="breadcrumb"><a href="#invoices">Invoices</a> / ${esc(inv.invoice_number)}</div>
      <div class="row-actions">
        <select onchange="invSetStatus('${id}', this.value)" style="background:var(--surface-2);border:1px solid var(--border);color:var(--text);padding:7px 10px;border-radius:8px">
          ${INV_STATUS.map(st => `<option value="${st}" ${st === inv.status ? "selected" : ""}>${st}</option>`).join("")}
        </select>
        <button class="btn" onclick="location.hash='invoices/${id}/edit'">Edit</button>
        <button class="btn btn-primary" onclick="window.print()">Print / Save PDF</button>
        <button class="btn btn-danger" onclick="deleteRow('invoices','${id}','invoices')">Delete</button>
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
    </div></form>`;
  $("#settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = readForm(e.target);
    const { error } = await db.from("business_settings").update(payload).eq("id", true);
    if (error) return toast(error.message, "error");
    toast("Settings saved", "success");
  });
};

views.diagnostics = async (rest) => {
  if (rest[0] === "new") return flowEditor(null);
  if (rest[0] && rest[1] === "edit") return flowEditor(rest[0]);
  if (rest[0]) return flowRun(rest[0]);
  const { data } = await db.from("diagnostic_flows").select("*").order("category").order("title");
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Diagnostic flows</h1>
      <div class="page-sub">Step-by-step guides you can follow & tick off during a job</div></div>
      <button class="btn btn-primary" onclick="location.hash='diagnostics/new'">+ New flow</button></div>
    ${data.length ? `<div class="flow-grid">${data.map(f => `
      <div class="flow-card" onclick="location.hash='diagnostics/${f.id}'">
        ${f.category ? `<div class="cat">${esc(f.category)}</div>` : ""}
        <h3>${esc(f.title)}</h3>
        ${f.summary ? `<div class="muted" style="font-size:13px">${esc(f.summary)}</div>` : ""}
        <div class="count">${(f.steps || []).length} step${(f.steps || []).length === 1 ? "" : "s"}</div>
      </div>`).join("")}</div>`
    : `<div class="empty">No diagnostic flows yet. Click "New flow" to build your first guided procedure.</div>`}`;
};

window.flowToggle = (cb) => {
  cb.closest(".step-item").classList.toggle("done", cb.checked);
  const total = document.querySelectorAll(".step-item").length;
  const done = document.querySelectorAll(".step-item.done").length;
  el("flow-progress-fill").style.width = (total ? done / total * 100 : 0) + "%";
  el("flow-progress-text").textContent = `${done} of ${total} done`;
};
window.flowReset = () => {
  document.querySelectorAll(".step-item input").forEach(c => { c.checked = false; c.closest(".step-item").classList.remove("done"); });
  const total = document.querySelectorAll(".step-item").length;
  el("flow-progress-fill").style.width = "0%";
  el("flow-progress-text").textContent = `0 of ${total} done`;
};

async function flowRun(id) {
  const { data: f } = await db.from("diagnostic_flows").select("*").eq("id", id).single();
  if (!f) { el("view").innerHTML = `<div class="empty">Flow not found.</div>`; return; }
  const steps = f.steps || [];
  el("view").innerHTML = `
    <div class="breadcrumb"><a href="#diagnostics">Diagnostic flows</a> / ${esc(f.title)}</div>
    <div class="page-head"><div>
      ${f.category ? `<div class="cat" style="color:var(--primary);font-size:12px;font-weight:600;text-transform:uppercase">${esc(f.category)}</div>` : ""}
      <h1>${esc(f.title)}</h1>
      ${f.summary ? `<div class="page-sub">${esc(f.summary)}</div>` : ""}</div>
      <div class="row-actions">
        <button class="btn" onclick="flowReset()">Reset</button>
        <button class="btn" onclick="location.hash='diagnostics/${id}/edit'">Edit</button>
        <button class="btn btn-danger" onclick="deleteRow('diagnostic_flows','${id}','diagnostics')">Delete</button>
      </div></div>
    <div class="progress-bar"><div class="progress-fill" id="flow-progress-fill"></div></div>
    <div class="page-sub" id="flow-progress-text" style="margin-bottom:18px">0 of ${steps.length} done</div>
    ${steps.length ? steps.map((s, i) => `
      <div class="step-item">
        <input type="checkbox" onchange="flowToggle(this)">
        <div class="step-num">${i + 1}</div>
        <div class="step-body">
          <div class="step-title">${esc(s.title)}</div>
          ${s.detail ? `<div class="step-detail">${esc(s.detail)}</div>` : ""}
        </div>
      </div>`).join("")
    : `<div class="empty">This flow has no steps yet. Click Edit to add some.</div>`}`;
}

function stepRowHtml(s = {}) {
  return `<div class="step-edit-row">
    <div class="step-move">
      <button type="button" onclick="flowMoveStep(this,-1)" title="Move up">&#9650;</button>
      <button type="button" onclick="flowMoveStep(this,1)" title="Move down">&#9660;</button>
    </div>
    <div class="step-edit-fields">
      <input class="se-title" placeholder="Step title (e.g. Visual inspection)" value="${esc(s.title)}">
      <textarea class="se-detail" placeholder="Details — what to check, look for, or do">${esc(s.detail)}</textarea>
    </div>
    <button type="button" class="li-del" onclick="flowDelStep(this)">&times;</button>
  </div>`;
}
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
    <div class="breadcrumb"><a href="#diagnostics">Diagnostic flows</a> / ${id ? "Edit" : "New"}</div>
    <div class="page-head"><h1>${id ? "Edit flow" : "New flow"}</h1></div>
    <form id="flow-form">
      <div class="panel"><div class="form-grid">
        <div class="field"><label>Title *</label><input name="title" required value="${esc(f.title)}" placeholder="e.g. Module PCB repair"></div>
        <div class="field"><label>Category</label><input name="category" value="${esc(f.category)}" placeholder="e.g. PCB repair, immobiliser, gearbox"></div>
        <div class="field full"><label>Summary</label><input name="summary" value="${esc(f.summary)}" placeholder="One-line description of when to use this"></div>
      </div></div>
      <div class="panel">
        <h3>Steps</h3>
        <div id="steps-body">${steps.map(stepRowHtml).join("")}</div>
        <button type="button" class="btn btn-sm" onclick="flowAddStep()">+ Add step</button>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="location.hash='diagnostics'">Cancel</button>
        <button type="submit" class="btn btn-primary">${id ? "Save flow" : "Create flow"}</button>
      </div>
    </form>`;
  $("#flow-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f2 = e.target;
    const stepsOut = [...document.querySelectorAll("#steps-body .step-edit-row")].map(r => ({
      title: r.querySelector(".se-title").value.trim(),
      detail: r.querySelector(".se-detail").value.trim(),
    })).filter(s => s.title || s.detail);
    const payload = {
      title: f2.title.value.trim(),
      category: f2.category.value.trim() || null,
      summary: f2.summary.value.trim() || null,
      steps: stepsOut,
    };
    let fid = id;
    if (id) {
      const { error } = await db.from("diagnostic_flows").update(payload).eq("id", id);
      if (error) return toast(error.message, "error");
    } else {
      const { data, error } = await db.from("diagnostic_flows").insert(payload).select("id").single();
      if (error) return toast(error.message, "error");
      fid = data.id;
    }
    toast("Flow saved", "success");
    location.hash = "diagnostics/" + fid;
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
window.closeModalGlobal = closeModal;

/* ---------- go ---------- */
initAuth();
