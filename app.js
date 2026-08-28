const CONFIG = Object.freeze({
  APP_PIN: "1234",
  SESSION_STORAGE_KEY: "optp_demo_session",
  DB_NAME: "OPTP_DEMO_DB",
  DB_VERSION: 1,
  STORE_ACTIVE: "active_employees",
  STORE_ARCHIVED: "archived_employees"
});

// IndexedDB Engine for high-capacity local storage
const IDB = {
  db: null,

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(CONFIG.STORE_ACTIVE)) {
          db.createObjectStore(CONFIG.STORE_ACTIVE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(CONFIG.STORE_ARCHIVED)) {
          db.createObjectStore(CONFIG.STORE_ARCHIVED, { keyPath: "id" });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  },

  async getAll(storeName) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  },

  async put(storeName, item) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.put(item);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(storeName, id) {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
};

let currentSessionUser = null;
let activeEmployees = [];
let archivedEmployees = [];
let currentScreen = "pinlock";
let filterCurrentQuery = "";
let filterArchiveQuery = "";

const root = document.getElementById("root");

function sanitize(input) {
  return String(input == null ? "" : input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showNotification(message, isError = false) {
  const node = document.createElement("div");
  node.className = "alert-toast" + (isError ? " error" : "");
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(() => node.remove(), 3200);
}

function generateId() {
  return "EMP-" + Date.now() + "-" + Math.floor(Math.random() * 9000 + 1000);
}

function persistSession(email) {
  try {
    localStorage.setItem(CONFIG.SESSION_STORAGE_KEY, JSON.stringify({ email }));
  } catch (e) {}
}

function getStoredSession() {
  try {
    const str = localStorage.getItem(CONFIG.SESSION_STORAGE_KEY);
    return str ? JSON.parse(str) : null;
  } catch (e) {
    return null;
  }
}

function purgeSession() {
  try {
    localStorage.removeItem(CONFIG.SESSION_STORAGE_KEY);
  } catch (e) {}
}

function isValidEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).trim().toLowerCase());
}

function compressImageFile(file, maxDimension, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxDimension) {
          h = Math.round(h * (maxDimension / w));
          w = maxDimension;
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function syncFromDatabase() {
  activeEmployees = await IDB.getAll(CONFIG.STORE_ACTIVE);
  archivedEmployees = await IDB.getAll(CONFIG.STORE_ARCHIVED);
}

function promptAuth(label, onSuccess) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="card auth-dialog">
      <div class="sub-header">VERIFICATION REQUIRED</div>
      <h3 class="accent-text" style="margin:8px 0 16px;font-size:16px;">${sanitize(label)}</h3>
      <div class="field"><input type="password" id="dialog-pin" placeholder="Enter PIN" autocomplete="off"></div>
      <div id="dialog-pin-error" style="color:var(--danger);font-size:11px;min-height:14px;margin-bottom:10px;"></div>
      <div style="display:flex;gap:10px;justify-content:center;">
        <button class="btn cyan" id="dialog-abort">Cancel</button>
        <button class="btn" id="dialog-ok">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector("#dialog-pin");
  input.focus();

  function verify() {
    if (input.value === CONFIG.APP_PIN) {
      overlay.remove();
      onSuccess();
    } else {
      overlay.querySelector("#dialog-pin-error").textContent = "Incorrect PIN.";
      input.value = "";
      input.focus();
    }
  }

  overlay.querySelector("#dialog-ok").onclick = verify;
  overlay.querySelector("#dialog-abort").onclick = () => overlay.remove();
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") verify();
  });
}

function performLogout() {
  promptAuth("Confirm Logout", () => {
    purgeSession();
    currentSessionUser = null;
    currentScreen = "login";
    render();
    showNotification("Demo session logged out.");
  });
}

function renderHeaderBar() {
  return `
  <div id="nav">
    <div>
      <div class="sub-header">OPTP SCH III (DEMO MODE)</div>
      <h2 class="accent-text" style="font-size:18px;">Employee Record System</h2>
    </div>
    <div style="text-align:right;">
      <div class="user-info">Signed in as <b>${sanitize(currentSessionUser)}</b></div>
      <button class="btn red" id="signout-btn" style="margin-top:8px;padding:6px 14px;font-size:11px;">Logout</button>
    </div>
  </div>`;
}

function wireLogoutButton() {
  const btn = document.getElementById("signout-btn");
  if (btn) btn.onclick = performLogout;
}

function renderFormMarkup(emp = {}) {
  const v = (key, fallback = "") => sanitize(emp[key] !== undefined ? emp[key] : fallback);
  const raw = (key, fallback = "") => emp[key] !== undefined ? emp[key] : fallback;
  return `
    <div class="section-label">Personal Details</div>
    <div class="row">
      <div class="field"><label class="req">Position</label><input id="f-position" value="${v('position')}" placeholder="e.g. Branch Supervisor"></div>
      <div class="field"><label>Salary</label><input type="number" id="f-salary" value="${v('salary')}" placeholder="PKR"></div>
    </div>
    <div class="row">
      <div class="field"><label class="req">Full Name</label><input id="f-fullName" value="${v('fullName')}"></div>
      <div class="field"><label>Father Name</label><input id="f-fatherName" value="${v('fatherName')}"></div>
    </div>
    <div class="row">
      <div class="field"><label class="req">Date of Birth</label><input type="date" id="f-dob" value="${v('dob')}"></div>
      <div class="field"><label class="req">CNIC</label><input id="f-cnic" placeholder="xxxxx-xxxxxxx-x" maxlength="15" value="${v('cnic')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Father CNIC</label><input id="f-fatherCnic" placeholder="xxxxx-xxxxxxx-x" maxlength="15" value="${v('fatherCnic')}"></div>
      <div class="field">
        <label>Gender</label>
        <div class="radio-group">
          ${['Male','Female','Transgender'].map(item => `<label class="radio-opt"><input type="radio" name="f-gender" value="${item}" ${raw('gender') === item ? 'checked' : ''}> ${item}</label>`).join('')}
        </div>
      </div>
    </div>
    <div class="row">
      <div class="field"><label class="req">Joining Date</label><input type="date" id="f-joiningDate" value="${v('joiningDate')}"></div>
      <div class="field">
        <label>Marital Status</label>
        <div class="radio-group">
          ${['Single','Married'].map(item => `<label class="radio-opt"><input type="radio" name="f-relStatus" value="${item}" ${raw('relationshipStatus') === item ? 'checked' : ''}> ${item}</label>`).join('')}
        </div>
      </div>
    </div>
    <div class="field ${raw('relationshipStatus') === 'Married' ? '' : 'hidden'}" id="children-wrap">
      <label>Number of Children</label><input type="number" min="0" id="f-childrenCount" value="${v('childrenCount')}">
    </div>

    <div class="section-label">Address & Contact</div>
    <div class="row">
      <div class="field"><label class="req">Permanent Address</label><textarea id="f-permAddress" rows="2">${v('permanentAddress')}</textarea></div>
      <div class="field"><label class="req">Temporary Address</label><textarea id="f-tempAddress" rows="2">${v('temporaryAddress')}</textarea></div>
    </div>
    <div class="row">
      <div class="field"><label class="req">Mobile Number</label><input type="tel" id="f-mobileNumber" placeholder="03xx-xxxxxxx" value="${v('mobileNumber')}"></div>
      <div class="field"><label class="req">Home Number (Emergency)</label><input type="tel" id="f-homeNumber" placeholder="Emergency Phone" value="${v('homeNumber')}"></div>
    </div>
    <div class="row">
      <div class="field"><label>Email</label><input type="email" id="f-email" placeholder="staff@example.com" value="${v('email')}"></div>
    </div>

    <div class="section-label">Education</div>
    <div class="field">
      <label class="req">Qualification</label>
      <select id="f-qualification">
        <option value="">-- Select --</option>
        ${['Under Matric','Matric','Inter','Graduation','Graduation Continue','Masters'].map(o =>
          `<option value="${o}" ${raw('qualification') === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>
    </div>
    <div class="field ${raw('qualification') === 'Graduation Continue' ? '' : 'hidden'}" id="qual-detail-wrap">
      <label class="req">Department / University / Semester Detail</label>
      <textarea id="f-qualificationDetail" rows="2" placeholder="e.g. BSCS, 4th Semester">${v('qualificationDetail')}</textarea>
    </div>

    <div class="section-label">Background Check</div>
    <div class="row">
      <div class="field">
        <label>Serious Illness?</label>
        <div class="radio-group">
          ${['No','Yes'].map(o => `<label class="radio-opt"><input type="radio" name="f-illness" value="${o}" ${raw('illness') === o ? 'checked' : ''}> ${o}</label>`).join('')}
        </div>
      </div>
      <div class="field">
        <label>Crime Record?</label>
        <div class="radio-group">
          ${['No','Yes'].map(o => `<label class="radio-opt"><input type="radio" name="f-crime" value="${o}" ${raw('crimeRecord') === o ? 'checked' : ''}> ${o}</label>`).join('')}
        </div>
      </div>
    </div>
    <div class="field ${raw('illness') === 'Yes' ? '' : 'hidden'}" id="illness-detail-wrap">
      <label>Illness Detail</label><textarea id="f-illnessDetail" rows="2">${v('illnessDetail')}</textarea>
    </div>
    <div class="field ${raw('crimeRecord') === 'Yes' ? '' : 'hidden'}" id="crime-detail-wrap">
      <label>Crime Record Detail</label><textarea id="f-crimeDetail" rows="2">${v('crimeDetail')}</textarea>
    </div>

    <div class="section-label">Experience</div>
    <div class="field">
      <label class="req">Previous Experience?</label>
      <div class="radio-group">
        ${['No','Yes'].map(o => `<label class="radio-opt"><input type="radio" name="f-prevExp" value="${o}" ${raw('previousExperience') === o ? 'checked' : ''}> ${o}</label>`).join('')}
      </div>
    </div>
    <div id="prevexp-detail-wrap" class="${raw('previousExperience') === 'Yes' ? '' : 'hidden'}">
      <div class="field"><label class="req">Experience Detail</label><textarea id="f-prevExpDetail" rows="2">${v('prevExpDetail')}</textarea></div>
      <div class="row">
        <div class="field"><label class="req">Previous Salary</label><input type="number" id="f-prevSalary" value="${v('prevSalary')}"></div>
        <div class="field"><label class="req">Reason for Leaving</label><input id="f-prevReason" value="${v('prevReason')}"></div>
      </div>
    </div>

    <div class="section-label">Additional Information</div>
    <div class="row">
      <div class="field"><label>Courses</label><textarea id="f-courses" rows="2">${v('courses')}</textarea></div>
      <div class="field"><label>Skills</label><textarea id="f-skills" rows="2">${v('skills')}</textarea></div>
    </div>

    <div class="section-label">Attachments</div>
    <div class="row">
      <div class="field">
        <label class="req">Upload Picture</label>
        <div class="file-drop" id="pic-box">Select Photo<br><img class="file-thumb ${raw('picture') ? '' : 'hidden'}" id="pic-preview" src="${raw('picture') || ''}"></div>
        <input type="file" accept="image/*" id="f-picture" class="hidden">
      </div>
      <div class="field">
        <label class="req">CNIC Front</label>
        <div class="file-drop" id="cnicf-box">Select Front Side<br><img class="file-thumb ${raw('cnicFront') ? '' : 'hidden'}" id="cnicf-preview" src="${raw('cnicFront') || ''}"></div>
        <input type="file" accept="image/*" id="f-cnicFront" class="hidden">
      </div>
      <div class="field">
        <label class="req">CNIC Back</label>
        <div class="file-drop" id="cnicb-box">Select Back Side<br><img class="file-thumb ${raw('cnicBack') ? '' : 'hidden'}" id="cnicb-preview" src="${raw('cnicBack') || ''}"></div>
        <input type="file" accept="image/*" id="f-cnicBack" class="hidden">
      </div>
    </div>`;
}

function bindFormEvents(store) {
  function formatCnic(val) {
    const digits = val.replace(/\D/g, "").slice(0, 13);
    if (digits.length > 12) return digits.slice(0, 5) + "-" + digits.slice(5, 12) + "-" + digits.slice(12);
    if (digits.length > 5) return digits.slice(0, 5) + "-" + digits.slice(5);
    return digits;
  }

  function wireCnicField(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute("inputmode", "numeric");
    el.addEventListener("input", () => {
      const isEnd = el.selectionStart === el.value.length;
      el.value = formatCnic(el.value);
      if (isEnd) el.setSelectionRange(el.value.length, el.value.length);
    });
  }
  wireCnicField("f-cnic");
  wireCnicField("f-fatherCnic");

  ["f-dob", "f-joiningDate"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("click", () => {
        if (typeof el.showPicker === "function") {
          try { el.showPicker(); } catch (e) {}
        }
      });
    }
  });

  document.getElementById("f-qualification")?.addEventListener("change", (e) => {
    document.getElementById("qual-detail-wrap").classList.toggle("hidden", e.target.value !== "Graduation Continue");
  });

  document.querySelectorAll('input[name="f-relStatus"]').forEach((r) => r.addEventListener("change", () => {
    document.getElementById("children-wrap").classList.toggle("hidden", document.querySelector('input[name="f-relStatus"]:checked')?.value !== "Married");
  }));

  document.querySelectorAll('input[name="f-illness"]').forEach((r) => r.addEventListener("change", () => {
    document.getElementById("illness-detail-wrap").classList.toggle("hidden", document.querySelector('input[name="f-illness"]:checked')?.value !== "Yes");
  }));

  document.querySelectorAll('input[name="f-crime"]').forEach((r) => r.addEventListener("change", () => {
    document.getElementById("crime-detail-wrap").classList.toggle("hidden", document.querySelector('input[name="f-crime"]:checked')?.value !== "Yes");
  }));

  document.querySelectorAll('input[name="f-prevExp"]').forEach((r) => r.addEventListener("change", () => {
    document.getElementById("prevexp-detail-wrap").classList.toggle("hidden", document.querySelector('input[name="f-prevExp"]:checked')?.value !== "Yes");
  }));

  function setupUploader(boxId, inputId, previewId, storeKey, maxDim, quality) {
    const box = document.getElementById(boxId);
    const input = document.getElementById(inputId);
    if (!box || !input) return;

    box.onclick = () => input.click();
    input.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const b64 = await compressImageFile(file, maxDim, quality);
        store[storeKey] = b64;
        const prev = document.getElementById(previewId);
        prev.src = b64;
        prev.classList.remove("hidden");
      } catch (err) {
        showNotification("Image processing error.", true);
      }
    });
  }

  setupUploader("pic-box", "f-picture", "pic-preview", "picture", 500, 0.75);
  setupUploader("cnicf-box", "f-cnicFront", "cnicf-preview", "cnicFront", 750, 0.65);
  setupUploader("cnicb-box", "f-cnicBack", "cnicb-preview", "cnicBack", 750, 0.65);
}

function parseFormData(existing = {}) {
  const getVal = (id) => document.getElementById(id)?.value?.trim() || "";
  const getRadio = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || "";

  return Object.assign({}, existing, {
    position: getVal("f-position"),
    salary: getVal("f-salary"),
    fullName: getVal("f-fullName"),
    fatherName: getVal("f-fatherName"),
    dob: getVal("f-dob"),
    cnic: getVal("f-cnic"),
    fatherCnic: getVal("f-fatherCnic"),
    gender: getRadio("f-gender"),
    joiningDate: getVal("f-joiningDate"),
    relationshipStatus: getRadio("f-relStatus"),
    childrenCount: getVal("f-childrenCount"),
    permanentAddress: getVal("f-permAddress"),
    temporaryAddress: getVal("f-tempAddress"),
    mobileNumber: getVal("f-mobileNumber"),
    homeNumber: getVal("f-homeNumber"),
    email: getVal("f-email"),
    qualification: document.getElementById("f-qualification")?.value || "",
    qualificationDetail: getVal("f-qualificationDetail"),
    illness: getRadio("f-illness"),
    illnessDetail: getVal("f-illnessDetail"),
    crimeRecord: getRadio("f-crime"),
    crimeDetail: getVal("f-crimeDetail"),
    previousExperience: getRadio("f-prevExp"),
    prevExpDetail: getVal("f-prevExpDetail"),
    prevSalary: getVal("f-prevSalary"),
    prevReason: getVal("f-prevReason"),
    courses: getVal("f-courses"),
    skills: getVal("f-skills")
  });
}

function validateRecordForm(d) {
  const missing = [];
  if (!d.position) missing.push("Position");
  if (!d.fullName) missing.push("Full Name");
  if (!d.dob) missing.push("Date of Birth");
  if (!d.cnic) missing.push("CNIC");
  if (!d.joiningDate) missing.push("Joining Date");
  if (!d.permanentAddress) missing.push("Permanent Address");
  if (!d.temporaryAddress) missing.push("Temporary Address");
  if (!d.mobileNumber) missing.push("Mobile Number");
  if (!d.homeNumber) missing.push("Home Number (Emergency)");
  if (!d.qualification) missing.push("Qualification");
  if (d.qualification === "Graduation Continue" && !d.qualificationDetail) missing.push("Academic Details");
  if (d.previousExperience === "Yes") {
    if (!d.prevExpDetail) missing.push("Experience Details");
    if (!d.prevSalary) missing.push("Previous Salary");
    if (!d.prevReason) missing.push("Reason for Leaving");
  }
  if (!d.picture) missing.push("Picture");
  if (!d.cnicFront) missing.push("CNIC Front");
  if (!d.cnicBack) missing.push("CNIC Back");
  return missing;
}

function renderEmployeeGrid(list, statusClass) {
  if (!list.length) return `<div class="empty-view card">No demo records found.</div>`;
  return `<div class="records-grid">` + list.map((emp) => `
    <div class="card employee-card" data-id="${sanitize(emp.id)}">
      ${emp.picture ? `<img class="avatar" src="${sanitize(emp.picture)}">` : `<div class="avatar empty">👤</div>`}
      <div class="emp-name">${sanitize(emp.fullName || "(No name)")}</div>
      <div class="emp-id">${sanitize(emp.cnic || emp.id)}</div>
      <div class="emp-status ${statusClass}">${emp.status === "current" ? "Active" : sanitize(emp.exitType || "Archived")}</div>
    </div>`).join("") + `</div>`;
}

function filterRecords(list, q) {
  if (!q) return list;
  const target = q.toLowerCase();
  const targetDigits = q.replace(/\D/g, "");
  return list.filter((e) => {
    const name = (e.fullName || "").toLowerCase();
    const cnic = (e.cnic || "").toLowerCase();
    if (name.includes(target) || cnic.includes(target)) return true;
    if (targetDigits && cnic.replace(/\D/g, "").includes(targetDigits)) return true;
    return false;
  });
}

function buildPrintDocument(emp) {
  const row = (label, val) => (val !== undefined && val !== null && String(val).trim() !== "") ? `<div class="prow"><div class="plabel">${sanitize(label)}</div><div class="pvalue">${sanitize(val)}</div></div>` : "";

  let fields = "";
  fields += row("Position", emp.position);
  fields += row("Salary", emp.salary);
  fields += row("Full Name", emp.fullName);
  fields += row("Father Name", emp.fatherName);
  fields += row("Date of Birth", emp.dob);
  fields += row("CNIC", emp.cnic);
  fields += row("Father CNIC", emp.fatherCnic);
  fields += row("Gender", emp.gender);
  fields += row("Joining Date", emp.joiningDate);
  fields += row("Marital Status", emp.relationshipStatus);
  if (emp.relationshipStatus === "Married") fields += row("Children", emp.childrenCount);
  fields += row("Permanent Address", emp.permanentAddress);
  fields += row("Temporary Address", emp.temporaryAddress);
  fields += row("Mobile Number", emp.mobileNumber);
  fields += row("Emergency Contact", emp.homeNumber);
  fields += row("Email", emp.email);
  fields += row("Qualification", emp.qualification);
  if (emp.qualification === "Graduation Continue") fields += row("Academic Details", emp.qualificationDetail);
  fields += row("Serious Illness", emp.illness);
  if (emp.illness === "Yes") fields += row("Illness Detail", emp.illnessDetail);
  fields += row("Crime Record", emp.crimeRecord);
  if (emp.crimeRecord === "Yes") fields += row("Crime Detail", emp.crimeDetail);
  fields += row("Previous Experience", emp.previousExperience);
  if (emp.previousExperience === "Yes") {
    fields += row("Experience Detail", emp.prevExpDetail);
    fields += row("Previous Salary", emp.prevSalary);
    fields += row("Reason for Leaving", emp.prevReason);
  }
  fields += row("Courses", emp.courses);
  fields += row("Skills", emp.skills);
  if (emp.status === "resigned") {
    fields += row("Exit Type", emp.exitType);
    fields += row("Exit Date", emp.exitDate);
    fields += row("Exit Note", emp.exitNote);
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${sanitize(emp.fullName || "Employee")} - Record</title>
  <style>
    body{ font-family: Arial, sans-serif; color:#111; padding:24px; }
    .phead{ display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #10b981; padding-bottom:14px; margin-bottom:20px; }
    .phead h1{ font-size:20px; margin:0; }
    .ptop{ display:flex; gap:20px; margin-bottom:20px; align-items:center; }
    .ptop img.photo{ width:110px; height:110px; object-fit:cover; border:1px solid #ccc; border-radius:4px; }
    .pname{ font-size:18px; font-weight:bold; }
    .pposition{ font-size:13px; color:#555; }
    .pgrid{ display:grid; grid-template-columns:1fr 1fr; gap:0 24px; font-size:12.5px; }
    .prow{ padding:6px 0; border-bottom:1px solid #eee; break-inside:avoid; }
    .plabel{ font-size:9.5px; text-transform:uppercase; letter-spacing:0.5px; color:#777; }
    .pvalue{ margin-top:2px; }
    .pdocs{ display:flex; gap:14px; margin-top:22px; }
    .pdocs img{ width:150px; height:100px; object-fit:cover; border:1px solid #ccc; border-radius:4px; }
    .pdocs .dlbl{ font-size:10px; color:#666; text-align:center; margin-top:4px; }
    .pfooter{ margin-top:26px; font-size:10px; color:#888; border-top:1px solid #ddd; padding-top:10px; }
    @media print{ body{ padding:8mm; } }
  </style></head>
  <body>
    <div class="phead"><div><h1>OPTP Sch III (DEMO)</h1><div style="font-size:11px;color:#555;">Employee Record File</div></div></div>
    <div class="ptop">
      ${emp.picture ? `<img class="photo" src="${emp.picture}">` : ""}
      <div><div class="pname">${sanitize(emp.fullName || "")}</div><div class="pposition">${sanitize(emp.position || "")}</div></div>
    </div>
    <div class="pgrid">${fields}</div>
    <div class="pdocs">
      ${emp.cnicFront ? `<div><img src="${emp.cnicFront}"><div class="dlbl">CNIC Front</div></div>` : ""}
      ${emp.cnicBack ? `<div><img src="${emp.cnicBack}"><div class="dlbl">CNIC Back</div></div>` : ""}
    </div>
    <div class="pfooter">Confidential Employee Record &bull; OPTP Sch III (Demo High-Capacity Storage)</div>
  </body></html>`;
}

function triggerPrint(emp) {
  const html = buildPrintDocument(emp);
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) {
    showNotification("Popup blocked. Please permit popups.", true);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  const printAction = () => {
    try { win.focus(); win.print(); } catch (e) {}
  };
  win.onload = printAction;
  setTimeout(printAction, 400);
}

function renderFieldEntry(k, v) {
  return `<div class="detail-entry"><div class="prop">${sanitize(k)}</div><div class="val">${(v === undefined || v === "") ? "—" : sanitize(v)}</div></div>`;
}

function displayDetailModal(id, source) {
  const list = source === "current" ? activeEmployees : archivedEmployees;
  const emp = list.find((e) => e.id === id);
  if (!emp) return;

  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="card modal-dialog">
      <span class="modal-dismiss" id="detail-close">&times;</span>
      <div class="sub-header">${source === "current" ? "ACTIVE FILE" : "ARCHIVED FILE"}</div>
      <h2 class="accent-text" style="margin:6px 0 4px;">${sanitize(emp.fullName || "(No name)")}</h2>
      <div class="meta-text">${sanitize(emp.position || "")}</div>
      <div id="detail-thumbs" class="document-previews">
        <div>${emp.picture ? `<img src="${emp.picture}">` : ""}<div class="tag">Picture</div></div>
        <div>${emp.cnicFront ? `<img src="${emp.cnicFront}">` : ""}<div class="tag">CNIC Front</div></div>
        <div>${emp.cnicBack ? `<img src="${emp.cnicBack}">` : ""}<div class="tag">CNIC Back</div></div>
      </div>
      <div class="details-grid">
        ${renderFieldEntry("Position", emp.position)}
        ${renderFieldEntry("Salary", emp.salary)}
        ${renderFieldEntry("Full Name", emp.fullName)}
        ${renderFieldEntry("Father Name", emp.fatherName)}
        ${renderFieldEntry("DOB", emp.dob)}
        ${renderFieldEntry("CNIC", emp.cnic)}
        ${renderFieldEntry("Father CNIC", emp.fatherCnic)}
        ${renderFieldEntry("Gender", emp.gender)}
        ${renderFieldEntry("Joining Date", emp.joiningDate)}
        ${renderFieldEntry("Marital Status", emp.relationshipStatus)}
        ${renderFieldEntry("Children", emp.childrenCount)}
        ${renderFieldEntry("Permanent Address", emp.permanentAddress)}
        ${renderFieldEntry("Temporary Address", emp.temporaryAddress)}
        ${renderFieldEntry("Mobile Number", emp.mobileNumber)}
        ${renderFieldEntry("Emergency Contact", emp.homeNumber)}
        ${renderFieldEntry("Email", emp.email)}
        ${renderFieldEntry("Qualification", emp.qualification)}
        ${renderFieldEntry("Qualification Detail", emp.qualificationDetail)}
        ${renderFieldEntry("Serious Illness", emp.illness)}
        ${renderFieldEntry("Illness Detail", emp.illness === "Yes" ? emp.illnessDetail : "")}
        ${renderFieldEntry("Crime Record", emp.crimeRecord)}
        ${renderFieldEntry("Crime Detail", emp.crimeRecord === "Yes" ? emp.crimeDetail : "")}
        ${renderFieldEntry("Previous Experience", emp.previousExperience)}
        ${renderFieldEntry("Experience Detail", emp.prevExpDetail)}
        ${renderFieldEntry("Previous Salary", emp.prevSalary)}
        ${renderFieldEntry("Reason for Leaving", emp.prevReason)}
        ${renderFieldEntry("Courses", emp.courses)}
        ${renderFieldEntry("Skills", emp.skills)}
        ${source === "resigned" ? renderFieldEntry("Exit Type", emp.exitType) : ""}
        ${source === "resigned" ? renderFieldEntry("Exit Date", emp.exitDate) : ""}
        ${source === "resigned" ? renderFieldEntry("Exit Note", emp.exitNote) : ""}
      </div>
      <div class="actions-bar">
        <button class="btn cyan" id="print-btn">Print</button>
        <button class="btn cyan" id="pdf-btn">Save as PDF</button>
        <button class="btn cyan" id="edit-btn">Edit Record</button>
        ${source === "current" ? `<button class="btn amber" id="resign-btn">Mark Resigned / Retired</button>` : `<button class="btn amber" id="reactivate-btn">Reactivate</button>`}
        <button class="btn red" id="delete-btn">Delete Record</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector("#detail-close").onclick = () => overlay.remove();
  overlay.querySelector("#print-btn").onclick = () => promptAuth("Print Authorization", () => triggerPrint(emp));
  overlay.querySelector("#pdf-btn").onclick = () => promptAuth("PDF Export Authorization", () => triggerPrint(emp));
  overlay.querySelector("#edit-btn").onclick = () => promptAuth("Edit Authorization", () => {
    overlay.remove();
    displayEditModal(emp, source);
  });

  overlay.querySelector("#delete-btn").onclick = () => promptAuth("Delete Authorization", async () => {
    if (!confirm(`Are you sure to delete "${emp.fullName || "this record"}"?`)) return;
    const storeName = source === "current" ? CONFIG.STORE_ACTIVE : CONFIG.STORE_ARCHIVED;
    await IDB.delete(storeName, id);
    const arr = source === "current" ? activeEmployees : archivedEmployees;
    const idx = arr.findIndex((e) => e.id === id);
    if (idx > -1) arr.splice(idx, 1);
    overlay.remove();
    showNotification("Record deleted from demo database.");
    render();
  });

  if (source === "current") {
    overlay.querySelector("#resign-btn").onclick = () => promptAuth("Status Change Authorization", () => {
      overlay.remove();
      displayResignModal(emp);
    });
  } else {
    overlay.querySelector("#reactivate-btn").onclick = () => promptAuth("Reactivation Authorization", async () => {
      const idx = archivedEmployees.findIndex((e) => e.id === id);
      if (idx > -1) {
        const [moved] = archivedEmployees.splice(idx, 1);
        moved.status = "current";
        delete moved.exitType;
        delete moved.exitDate;
        delete moved.exitNote;
        await IDB.delete(CONFIG.STORE_ARCHIVED, moved.id);
        await IDB.put(CONFIG.STORE_ACTIVE, moved);
        activeEmployees.push(moved);
      }
      overlay.remove();
      showNotification("Employee reactivated.");
      currentScreen = "current";
      render();
    });
  }
}

function displayResignModal(emp) {
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="card auth-dialog" style="max-width:420px;text-align:left;">
      <div class="sub-header">STATUS CHANGE</div>
      <h3 style="margin:8px 0 16px;">${sanitize(emp.fullName)}</h3>
      <div class="field"><label>Type</label>
        <div class="radio-group">
          <label class="radio-opt"><input type="radio" name="exit-type" value="Resigned" checked> Resigned</label>
          <label class="radio-opt"><input type="radio" name="exit-type" value="Retired"> Retired</label>
        </div>
      </div>
      <div class="field"><label>Date</label><input type="date" id="exit-date"></div>
      <div class="field"><label>Note (optional)</label><textarea id="exit-note" rows="2"></textarea></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn cyan" id="exit-cancel">Cancel</button>
        <button class="btn amber" id="exit-confirm">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#exit-cancel").onclick = () => overlay.remove();

  overlay.querySelector("#exit-confirm").onclick = async () => {
    const type = overlay.querySelector('input[name="exit-type"]:checked').value;
    const date = overlay.querySelector("#exit-date").value.trim();
    const note = overlay.querySelector("#exit-note").value.trim();

    const idx = activeEmployees.findIndex((e) => e.id === emp.id);
    if (idx > -1) {
      const [moved] = activeEmployees.splice(idx, 1);
      moved.status = "resigned";
      moved.exitType = type;
      moved.exitDate = date;
      moved.exitNote = note;
      await IDB.delete(CONFIG.STORE_ACTIVE, moved.id);
      await IDB.put(CONFIG.STORE_ARCHIVED, moved);
      archivedEmployees.push(moved);
    }
    overlay.remove();
    showNotification(`${emp.fullName} moved to Resigned / Retired.`);
    currentScreen = "resigned";
    render();
  };
}

function displayEditModal(emp, source) {
  const store = Object.assign({}, emp);
  const overlay = document.createElement("div");
  overlay.className = "modal-backdrop";
  overlay.innerHTML = `
    <div class="card modal-dialog">
      <span class="modal-dismiss" id="edit-close">&times;</span>
      <div class="sub-header">EDIT RECORD</div>
      <h2 class="accent-text" style="margin:6px 0 16px;">${sanitize(emp.fullName || "(No name)")}</h2>
      ${renderFormMarkup(emp)}
      <div class="form-buttons">
        <button class="btn" id="save-edit-btn">Save Changes</button>
        <button class="btn cyan" id="cancel-edit-btn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  bindFormEvents(store);

  overlay.querySelector("#edit-close").onclick = () => overlay.remove();
  overlay.querySelector("#cancel-edit-btn").onclick = () => overlay.remove();
  overlay.querySelector("#save-edit-btn").onclick = async () => {
    const data = parseFormData(store);
    const missing = validateRecordForm(data);
    if (missing.length) {
      showNotification(`Missing: ${missing.join(", ")}`, true);
      return;
    }
    data.id = emp.id;
    data.status = emp.status;
    if (source === "resigned") {
      data.exitType = emp.exitType;
      data.exitDate = emp.exitDate;
      data.exitNote = emp.exitNote;
    }

    const storeName = source === "current" ? CONFIG.STORE_ACTIVE : CONFIG.STORE_ARCHIVED;
    await IDB.put(storeName, data);

    const arr = source === "current" ? activeEmployees : archivedEmployees;
    const idx = arr.findIndex((e) => e.id === emp.id);
    if (idx > -1) arr[idx] = data;

    overlay.remove();
    showNotification("Changes saved to demo database.");
    render();
  };
}

function render() {
  if (currentScreen === "pinlock") {
    root.innerHTML = `
      <div class="card auth-box">
        <div class="sub-header">OPTP SCH III &bull; SECURE ACCESS</div>
        <h1 class="accent-text" style="font-size:22px;margin:8px 0 14px;">Employee Record System</h1>
        <div class="meta-text" style="font-size:13px;margin-bottom:14px;">Enter authorization PIN to unlock.</div>
        <div class="field">
          <input type="password" id="pin-input" placeholder="Enter PIN" autocomplete="off">
        </div>
        <div id="pin-error" style="color:var(--danger);font-size:11.5px;min-height:16px;margin:6px 0 4px;"></div>
        <button class="btn" id="pin-submit" style="width:100%;margin-top:8px;">Unlock</button>
      </div>`;

    const input = document.getElementById("pin-input");
    input?.focus();

    async function checkPin() {
      if (input.value === CONFIG.APP_PIN) {
        const session = getStoredSession();
        if (session?.email) {
          currentSessionUser = session.email;
          await syncFromDatabase();
          currentScreen = "dashboard";
        } else {
          currentScreen = "login";
        }
        render();
      } else {
        document.getElementById("pin-error").textContent = "Incorrect PIN.";
        input.value = "";
        input.focus();
      }
    }

    document.getElementById("pin-submit").onclick = checkPin;
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") checkPin();
    });
  }

  else if (currentScreen === "login") {
    root.innerHTML = `
      <div class="card auth-box">
        <div class="sub-header">OPTP SCH III &bull; DEMO LOGIN</div>
        <h1 class="accent-text" style="font-size:22px;margin:8px 0 14px;">Employee Record System</h1>
        <div class="meta-text" style="font-size:13px;margin-bottom:16px;">Demo mode: Sign in using any custom or fake Gmail ID.</div>
        <div class="field" style="text-align:left;">
          <label>Gmail Address</label>
          <input type="email" id="demo-email-input" placeholder="demo.admin@gmail.com" value="demo.optp@gmail.com">
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
          <button class="btn" id="login-submit-btn" style="padding:10px;">Login with Demo Email</button>
          <button class="btn cyan" id="quick-demo-btn">Instant Guest Login</button>
        </div>
      </div>`;

    async function doLogin(email) {
      if (!isValidEmail(email)) {
        showNotification("Please enter a valid email address (e.g. name@domain.com).", true);
        return;
      }
      currentSessionUser = email.toLowerCase().trim();
      persistSession(currentSessionUser);
      await syncFromDatabase();
      currentScreen = "dashboard";
      render();
      showNotification(`Logged in as ${currentSessionUser}`);
    }

    document.getElementById("login-submit-btn").onclick = () => {
      const email = document.getElementById("demo-email-input").value;
      doLogin(email);
    };

    document.getElementById("quick-demo-btn").onclick = () => {
      doLogin("guest.admin@gmail.com");
    };
  }

  else if (currentScreen === "dashboard") {
    root.innerHTML = renderHeaderBar() + `
      <div id="main-container">
        <div class="stats-grid">
          <div class="card stat-item" id="card-active">
            <div class="icon">🗂️</div>
            <div class="lbl">Current Employees</div>
            <div class="val">${activeEmployees.length}</div>
            <div class="meta-text">Active staff members</div>
          </div>
          <div class="card stat-item" id="card-new">
            <div class="icon">➕</div>
            <div class="lbl">New Employee</div>
            <div class="val">+</div>
            <div class="meta-text">Register new profile</div>
          </div>
          <div class="card stat-item" id="card-archived">
            <div class="icon">📁</div>
            <div class="lbl">Resigned / Retired</div>
            <div class="val">${archivedEmployees.length}</div>
            <div class="meta-text">Archived profiles</div>
          </div>
        </div>
      </div>`;

    wireLogoutButton();
    document.getElementById("card-active").onclick = () => { currentScreen = "current"; render(); };
    document.getElementById("card-new").onclick = () => promptAuth("New Registration", () => { currentScreen = "new"; render(); });
    document.getElementById("card-archived").onclick = () => { currentScreen = "resigned"; render(); };
  }

  else if (currentScreen === "new") {
    const store = {};
    root.innerHTML = renderHeaderBar() + `
      <div id="main-container">
        <div class="view-heading"><span class="nav-link" id="nav-dash">&larr; Dashboard</span></div>
        <h2 class="accent-text" style="margin:10px 0 4px;">New Employee Record</h2>
        <div class="meta-text">Mandatory fields are marked with *</div>
        <div class="card form-body">
          ${renderFormMarkup()}
          <div class="form-buttons">
            <button class="btn" id="save-new-btn">Save Employee</button>
            <button class="btn cyan" id="cancel-new-btn">Cancel</button>
          </div>
        </div>
      </div>`;

    wireLogoutButton();
    bindFormEvents(store);
    document.getElementById("nav-dash").onclick = () => { currentScreen = "dashboard"; render(); };
    document.getElementById("cancel-new-btn").onclick = () => { currentScreen = "dashboard"; render(); };

    document.getElementById("save-new-btn").onclick = async () => {
      const data = parseFormData(store);
      const errors = validateRecordForm(data);
      if (errors.length) {
        showNotification(`Missing: ${errors.join(", ")}`, true);
        return;
      }
      data.id = generateId();
      data.status = "current";

      await IDB.put(CONFIG.STORE_ACTIVE, data);
      activeEmployees.push(data);

      showNotification("Employee registered successfully.");
      currentScreen = "current";
      render();
    };
  }

  else if (currentScreen === "current" || currentScreen === "resigned") {
    const isCurrent = currentScreen === "current";
    const sourceList = isCurrent ? activeEmployees : archivedEmployees;
    const query = isCurrent ? filterCurrentQuery : filterArchiveQuery;
    const filtered = filterRecords(sourceList, query);

    root.innerHTML = renderHeaderBar() + `
      <div id="main-container">
        <div class="view-heading"><span class="nav-link" id="nav-dash">&larr; Dashboard</span></div>
        <h2 class="accent-text" style="margin:10px 0 4px;">${isCurrent ? "Current Employees" : "Resigned / Retired Archives"} (${sourceList.length})</h2>
        <div class="search-wrap"><input id="search-input" placeholder="Search by name or CNIC..." value="${sanitize(query)}"></div>
        <div id="records-wrap">${renderEmployeeGrid(filtered, isCurrent ? "active" : "archived")}</div>
      </div>`;

    wireLogoutButton();
    document.getElementById("nav-dash").onclick = () => { currentScreen = "dashboard"; render(); };
    const search = document.getElementById("search-input");

    search.addEventListener("input", (e) => {
      if (isCurrent) filterCurrentQuery = e.target.value;
      else filterArchiveQuery = e.target.value;

      document.getElementById("records-wrap").innerHTML = renderEmployeeGrid(
        filterRecords(sourceList, e.target.value),
        isCurrent ? "active" : "archived"
      );
      wireCards(isCurrent ? "current" : "resigned");
    });

    wireCards(isCurrent ? "current" : "resigned");
  }
}

function wireCards(source) {
  document.querySelectorAll(".employee-card").forEach((card) => {
    card.onclick = () => displayDetailModal(card.getAttribute("data-id"), source);
  });
}

// Initial Boot
render();
