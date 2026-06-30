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
window.fileUploadForm = (vehicleId) => {
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
      vehicle_id: vehicleId, kind: form.kind.value,
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

views.jobs = async () => {
  const { data } = await db.from("jobs")
    .select("*, vehicles(registration, make, model), customers(name)")
    .order("created_at", { ascending: false });
  el("view").innerHTML = `
    <div class="page-head"><div><h1>Jobs</h1>
      <div class="page-sub">${data.length} total</div></div>
      <button class="btn btn-primary" onclick="jobForm()">+ New job</button></div>
    <div class="table-wrap">${data.length ? `<table>
      <thead><tr><th>Title</th><th>Type</th><th>Vehicle</th><th>Customer</th><th>Status</th><th>Price</th></tr></thead>
      <tbody>${data.map(j => `<tr onclick="jobForm('${j.id}')">
        <td>${esc(j.title) || "—"}</td>
        <td>${esc(JOB_TYPES[j.job_type] || j.job_type) || "—"}</td>
        <td>${j.vehicles ? esc(`${j.vehicles.registration || ""} ${j.vehicles.make || ""}`) : "—"}</td>
        <td>${j.customers ? esc(j.customers.name) : "—"}</td>
        <td><span class="badge badge-${j.status}">${esc(j.status.replace("_", " "))}</span></td>
        <td>${fmtMoney(j.price)}</td></tr>`).join("")}</tbody>
    </table>` : `<div class="empty">No jobs yet.</div>`}</div>`;
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

window.faultForm = async (id, vehicleId) => {
  let f = { vehicle_id: vehicleId };
  if (id) f = (await db.from("faults").select("*").eq("id", id).single()).data;
  const { data: vehicles } = await db.from("vehicles").select("id,registration,make,model").order("created_at", { ascending: false });
  const vOpts = vehicles.map(v =>
    `<option value="${v.id}" ${v.id === f.vehicle_id ? "selected" : ""}>${esc(`${v.registration || ""} ${v.make || ""} ${v.model || ""}`)}</option>`).join("");
  openModal(id ? "Edit fault" : "Log fault", `
    <form id="fault-form-modal">
      <div class="form-grid">
        <div class="field full"><label>Vehicle</label><select name="vehicle_id"><option value="">—</option>${vOpts}</select></div>
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
views.invoices = async () => {
  el("view").innerHTML = `<div class="coming-soon"><h2>Invoices</h2>
    <p>Invoice builder is the next feature on the list — it'll pull from jobs and customers automatically.</p></div>`;
};
views.diagnostics = async () => {
  el("view").innerHTML = `<div class="coming-soon"><h2>Diagnostic flows</h2>
    <p>Step-by-step guided procedures for module/PCB work are coming next. You'll be able to build your own checklists here.</p></div>`;
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
