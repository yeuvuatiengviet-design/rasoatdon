/* Rà soát đơn ngoại trú – chạy hoàn toàn trên điện thoại (OCR tiếng Việt + bộ quy tắc Python qua Pyodide) */
const $ = id => document.getElementById(id);
const PY_FILES = ["ra_soat", "tuong_tac", "dinh_chi", "ghi_chu_ds", "thoi_diem", "chay_app"];
const DATA = {quy_tac: "Bang_tra_cuu_ra_soat", danh_muc: "Danh_muc_thong_tin_thuoc", thoi_diem: "Thoi_diem_dung_thuoc", ghi_chu: "Ghi_chu_DS"};
const BASE = new URL("./", location.href).href;
let py = null, dmNames = [], dmIdx = [], lastResult = null, lastDon = null, ocrWorker = null;

const EXAMPLE = {tuoi: 70, ngay: "15/10/2026", icd_chinh: ["M10"], icd_kem: ["I10", "N18"], chan_doan: "Gút; Tăng huyết áp; Bệnh thận mạn",
  thuoc: [{ten: "Colchicina Seid 1mg Tablet", sl: 30, dv: "Viên", lieu: "Sáng 1 viên, tối 1 viên sau ăn"},
          {ten: "Clarithromycin 500mg", sl: 14, dv: "Viên", lieu: "Sáng 1 viên, tối 1 viên"}]};

/* ---------- service worker: dùng khi không có mạng, tự cập nhật khi có mạng ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w && w.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) { $("upd").hidden = false; }
      });
    });
  }).catch(() => {});
}
async function showVersion() {
  try {
    const v = await (await fetch("data/version.json", {cache: "no-store"})).json();
    $("ver").textContent = `Bộ quy tắc ${v.bo_quy_tac} · ${v.ngay}`;
  } catch { $("ver").textContent = "Bộ quy tắc (bản lưu trên máy)"; }
}
showVersion();
$("net").textContent = navigator.onLine ? "Đang có mạng" : "Không có mạng – vẫn dùng được";
addEventListener("online", () => { $("net").textContent = "Đang có mạng"; });
addEventListener("offline", () => { $("net").textContent = "Không có mạng – vẫn dùng được"; });
$("chk").onclick = async () => {
  $("chk").textContent = "Đang kiểm tra…";
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.update();
    const r = await fetch("data/version.json", {cache: "no-store"}); if (!r.ok) throw 0;
    await showVersion(); $("chk").textContent = "Đã kiểm tra – đang dùng bản mới nhất";
  } catch { $("chk").textContent = "Không có mạng – dùng bản trên máy"; }
  setTimeout(() => $("chk").textContent = "Kiểm tra cập nhật", 3000);
};
$("upd").onclick = () => location.reload();

/* ---------- form ---------- */
function drugRow(t = {}) {
  const i = Date.now() + Math.random().toString(36).slice(2, 6);
  const d = document.createElement("div"); d.className = "drug";
  d.innerHTML = `<div class="top"><label for="t${i}">Tên thuốc<input id="t${i}" list="dmlist" autocomplete="off" class="ten"></label>
    <button type="button" class="x" aria-label="Xóa thuốc">Xóa</button></div>
    <div class="qty"><label for="s${i}">Số lượng<input id="s${i}" inputmode="decimal" class="sl"></label>
    <label for="d${i}">Đơn vị<input id="d${i}" class="dv" list="dvlist" autocomplete="off"></label></div>
    <label for="l${i}">Cách dùng (lời dặn)<textarea id="l${i}" rows="2" class="lieu"></textarea></label>`;
  d.querySelector(".ten").value = t.ten || ""; d.querySelector(".sl").value = t.sl ?? ""; d.querySelector(".dv").value = t.dv || "Viên";
  d.querySelector(".lieu").value = t.lieu || "";
  if (t.chua_khop) d.querySelector(".ten").style.borderColor = "var(--warn)";
  d.querySelector(".x").onclick = () => d.remove();
  $("drugs").append(d);
}
function fillForm(don, nguon) {
  $("tuoi").value = don.tuoi ?? ""; $("ngay").value = don.ngay || "";
  $("icd1").value = (don.icd_chinh || []).join(", "); $("icd2").value = (don.icd_kem || []).join(", ");
  $("cdoan").value = don.chan_doan || ""; $("drugs").innerHTML = "";
  (don.thuoc || []).forEach(drugRow); if (!(don.thuoc || []).length) drugRow();
  $("src").textContent = nguon;
}
function readForm() {
  const icds = s => (s.toUpperCase().match(/[A-Z]\d{2}(?:\.\d{1,2})?/g) || []);
  const num = s => { const v = parseFloat(String(s).replace(",", ".")); return isNaN(v) ? null : v; };
  return {tuoi: num($("tuoi").value), ngay: $("ngay").value.trim(), icd_chinh: icds($("icd1").value), icd_kem: icds($("icd2").value),
    chan_doan: $("cdoan").value.trim(),
    thuoc: [...document.querySelectorAll(".drug")].map(d => ({ten: d.querySelector(".ten").value.trim(), sl: num(d.querySelector(".sl").value),
      dv: d.querySelector(".dv").value.trim(), lieu: d.querySelector(".lieu").value.trim()})).filter(t => t.ten)};
}
$("add").onclick = () => drugRow();
fillForm(EXAMPLE, "· ví dụ minh họa, thay bằng đơn chụp");

/* ---------- bộ quy tắc (Python chạy trong trình duyệt) ---------- */
async function initEngine() {
  try {
    py = await loadPyodide({indexURL: BASE + "vendor/pyodide/"});
    py.FS.mkdirTree("/rs/engine/openpyxl"); py.FS.mkdirTree("/rs/du_lieu");
    const txt = async p => { const r = await fetch(p); if (!r.ok) throw new Error("Không tải được " + p); return r.text(); };
    await Promise.all(PY_FILES.map(async f => py.FS.writeFile(`/rs/engine/${f}.py`, await txt(`py/${f}.py.txt`))));
    py.FS.writeFile("/rs/engine/openpyxl/__init__.py", await txt("py/shim_openpyxl.py.txt"));
    py.FS.writeFile("/rs/engine/openpyxl/styles.py", "class Font:\n    def __init__(s,*a,**k): pass\nPatternFill = Alignment = Font\n");
    py.FS.writeFile("/rs/engine/openpyxl/utils.py", "def get_column_letter(i):\n    s=''\n    while i:\n        i,r=divmod(i-1,26); s=chr(65+r)+s\n    return s\n");
    await Promise.all(Object.entries(DATA).map(async ([k, n]) => {
      py.FS.writeFile(`/rs/du_lieu/${n}.xlsx.json`, await txt(`data/${k}.json`)); py.FS.writeFile(`/rs/du_lieu/${n}.xlsx`, "");
    }));
    py.runPython("import sys; sys.path.insert(0,'/rs/engine'); import chay_app");
    dmNames = py.runPython("chay_app.ten_danh_muc()").toJs();
    dmIdx = dmNames.map(n => ({ten: n, tok: coreTokens(n), num: nums(n)})).filter(x => x.tok.length);
    const dl = $("dmlist"); dmNames.forEach(n => { const o = document.createElement("option"); o.value = n; dl.append(o); });
    $("eng").textContent = `Sẵn sàng · ${dmNames.length} thuốc danh mục`; $("eng").className = "chip ok";
    $("run").disabled = false;
    runReview();
  } catch (e) {
    $("eng").textContent = "Không tải được bộ quy tắc"; $("eng").className = "chip bad";
    $("kqst").className = "status err"; $("kqst").textContent = "Không tải được bộ máy rà soát. Lần đầu cần mở khi có mạng để tải về máy. Chi tiết: " + (e.message || e);
  }
}
initEngine();

/* ---------- rà soát ---------- */
const MUC = {"Nghiêm trọng": 1, "Cần lưu ý": 2, "Tham khảo": 3};
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
function runReview() {
  if (!py) return;
  const don = readForm(); lastDon = don;
  if (!don.thuoc.length) { $("kqst").className = "status err"; $("kqst").textContent = "Đơn chưa có thuốc nào. Thêm thuốc rồi bấm Rà soát đơn."; return; }
  try {
    py.globals.set("DON", JSON.stringify(don));
    const r = JSON.parse(py.runPython("chay_app.ra_soat_don(DON)")); lastResult = r; render(r, don);
  } catch (e) { $("kqst").className = "status err"; $("kqst").textContent = "Lỗi khi rà soát: " + (e.message || e); }
}
$("run").onclick = () => { runReview(); $("kq").scrollIntoView({behavior: "smooth", block: "start"}); };

function render(r, don) {
  const iss = r.issues.slice().sort((a, b) => (MUC[a.muc] || 9) - (MUC[b.muc] || 9));
  const n = m => iss.filter(i => i.muc === m).length;
  $("c1").textContent = n("Nghiêm trọng"); $("c2").textContent = n("Cần lưu ý"); $("c3").textContent = n("Tham khảo");
  $("sum").hidden = false; $("acts").hidden = false; $("ctwrap").hidden = false;
  $("kqst").className = "status";
  $("kqst").textContent = `${don.thuoc.length} thuốc · tuổi ${don.tuoi ?? "?"} · ICD ${[...don.icd_chinh, ...don.icd_kem].join(", ") || "chưa có"} · ${iss.length ? iss.length + " vấn đề" : "không phát hiện vấn đề"}`;
  $("issues").innerHTML = iss.map(i => {
    const m = MUC[i.muc] || 3, cls = ["", "s1", "s2", "s3"][m];
    return `<article class="issue m${m}"><div class="h"><span class="pill ${cls}">${esc(i.muc)}</span><span class="small mut">${esc(i.tieu_chi)}</span>${i.xuat_toan === "Có" ? '<span class="pill s1">Nguy cơ xuất toán</span>' : ""}</div>
      <div class="t">${esc(i.thuoc)}</div><p>${esc(i.van_de)}</p>${i.de_xuat ? `<div class="dx">→ ${esc(i.de_xuat)}</div>` : ""}
      ${i.nhan_xet ? `<p class="mut small">DS: ${esc(i.nhan_xet)}</p>` : ""}${i.can_cu ? `<div class="cc">Căn cứ: ${esc(i.can_cu).slice(0, 300)}</div>` : ""}</article>`;
  }).join("");
  $("ct").innerHTML = r.chi_tiet.map(c => `<tr><td>${esc(c.thuoc)}</td><td>${esc(c.hoat_chat)}</td><td class="n">${c.dv_ngay ?? "–"}</td><td class="n">${c.so_ngay ?? "–"}</td>
    <td>${esc(c.phu_hop_icd)}</td><td>${esc(c.can_cu_icd)}</td><td>${esc(c.danh_muc)}</td></tr>`).join("");
}
function resultText() {
  if (!lastResult) return "";
  const d = lastDon, L = [`RÀ SOÁT ĐƠN – tuổi ${d.tuoi ?? "?"}; ngày ${d.ngay || "?"}; ICD: ${[...d.icd_chinh, ...d.icd_kem].join(", ")}`];
  d.thuoc.forEach((t, k) => L.push(`${k + 1}. ${t.ten} – ${t.sl ?? ""} ${t.dv} – ${t.lieu}`));
  L.push("");
  lastResult.issues.slice().sort((a, b) => (MUC[a.muc] || 9) - (MUC[b.muc] || 9)).forEach(i => L.push(`[${i.muc}] ${i.tieu_chi} – ${i.thuoc}: ${i.van_de}${i.de_xuat ? " → " + i.de_xuat : ""}`));
  if (!lastResult.issues.length) L.push("Không phát hiện vấn đề theo bộ quy tắc.");
  return L.join("\n");
}
$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(resultText()); $("copy").textContent = "Đã sao chép"; }
  catch { $("copy").textContent = "Không sao chép được – bấm giữ để chọn chữ"; }
  setTimeout(() => $("copy").textContent = "Sao chép kết quả", 2500);
};
$("share").onclick = async () => {
  try { await navigator.share({title: "Kết quả rà soát đơn", text: resultText()}); } catch {}
};
if (!navigator.share) $("share").hidden = true;

/* ---------- đọc ảnh trên máy (Tesseract, tiếng Việt) ---------- */
const ud = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const STOP = new Set(["tablet", "tablets", "tab", "cap", "caps", "capsule", "vien", "nen", "nang", "bao", "phim", "film", "coated", "inj", "injection",
  "solution", "for", "infusion", "dung", "dich", "tiem", "truyen", "goi", "hop", "chai", "ong", "mg", "ml", "mcg", "and", "va"]);
function coreTokens(s) {
  return ud(s).replace(/\(.*?\)/g, " ").replace(/\d+(?:[.,]\d+)?\s*(mg|g|mcg|ml|iu|ui|%)?/g, " ").split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !STOP.has(t));
}
function nums(s) { return new Set((ud(s).replace(/,/g, ".").match(/\d+(?:\.\d+)?/g) || []).map(x => String(parseFloat(x)))); }
function sim(a, b) {
  if (a === b) return 1; const m = a.length, n = b.length; if (!m || !n) return 0;
  let prev = Array.from({length: n + 1}, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}
function matchDrug(line) {
  const lt = ud(line).split(/[^a-z0-9]+/).filter(t => t.length >= 2), ln = nums(line);
  let best = null;
  for (const d of dmIdx) {
    let hit = 0;
    for (const t of d.tok) { let b = 0; for (const x of lt) { const s = sim(t, x); if (s > b) b = s; if (b === 1) break; } if (b >= (t.length <= 4 ? 0.95 : 0.8)) hit++; }
    const sc = hit / d.tok.length;
    if (sc < 0.75) continue;
    const ov = [...d.num].filter(x => ln.has(x)).length;
    const score = sc + (ov ? 0.3 : 0) - (d.num.size && ln.size && !ov ? 0.4 : 0) + d.tok.length * 0.01;
    if (!best || score > best.score) best = {ten: d.ten, score};
  }
  return best && best.score >= 0.75 ? best : null;
}
const DV = {vien: "Viên", goi: "Gói", ong: "Ống", chai: "Chai", lo: "Lọ", tuyp: "Tuýp", hop: "Hộp", but: "Bút", tui: "Túi", vi: "Vỉ"};
const RX_SO_DV = /(\d+(?:[.,]\d+)?)\s*(vien|goi|ong|chai|lo|tuyp|hop|but|tui)\b/g;
const RX_DUNG = /(uong|ngay|sang|trua|chieu|toi|lan|truoc an|sau an|nho|boi|xit|ngam|tiem|dat|ngu)/;
const RX_KET = /(ngay\s*\d{1,2}\s*thang|bac si|y si|nguoi ke|loi dan|tong (so|cong)|ky ten|tai kham|ho ten nguoi|cong khoan)/;
function fixIcd(tok) {
  let t = tok.toUpperCase();
  if (/^[1L|][0-9O]{2}(?:[.,][0-9O]{1,2})?$/.test(t)) t = "I" + t.slice(1);   // OCR hay đọc chữ I thành số 1 (I10 → 110)
  if (!/^[A-Z]/.test(t)) return null;
  const rest = t.slice(1).replace(/[OQD]/g, "0").replace(/[IL|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/,/g, ".");
  const m = (t[0] + rest).match(/^[A-Z]\d{2}(?:\.\d{1,2})?$/); return m ? m[0] : null;
}
function parseOcr(text) {
  const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const U = lines.map(ud);
  const out = {tuoi: null, ngay: "", icd_chinh: [], icd_kem: [], chan_doan: "", thuoc: [], khong_ro: []};
  // ngày kê
  for (const u of U) { const m = u.match(/ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(\d{4})/); if (m) out.ngay = `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`; }
  // tuổi
  const full = U.join(" \n ");
  let m = full.match(/tuoi\s*[:.]?\s*(\d{1,3})\b/) || full.match(/\b(\d{1,3})\s*tuoi/);
  if (m) out.tuoi = +m[1];
  else if ((m = full.match(/(?:nam sinh|ngay sinh|sinh ngay)\s*[:.]?\s*(?:\d{1,2}\s*[\/.-]\s*\d{1,2}\s*[\/.-]\s*)?(\d{4})/))) {
    const nk = +(out.ngay.slice(-4) || new Date().getFullYear()); out.tuoi = nk - +m[1];
  } else if ((m = full.match(/(\d{1,2})\s*thang\s*tuoi/))) out.tuoi = Math.round(+m[1] / 12 * 10) / 10;
  // vùng thuốc
  let start = U.findIndex(u => /(thuoc dieu tri|ten thuoc|chi dinh dung thuoc|thuoc dung|don thuoc gom|r\/?\s*p\b)/.test(u) && !/don thuoc bao hiem|^don thuoc$/.test(u));
  if (start < 0) start = U.findIndex(u => /^\s*1\s*[.)\/-]\s*\D/.test(u));
  if (start < 0) start = 0;
  // ICD + chẩn đoán (trước vùng thuốc)
  const cd = [];
  let inCd = false;
  for (let i = 0; i < (start || lines.length); i++) {
    const u = U[i];
    if (/chan doan|icd|benh chinh|benh kem/.test(u)) inCd = true;
    else if (inCd && /^(ho ten|dia chi|so the|gioi|ma (bn|benh nhan)|doi tuong|khoa|phong)/.test(u)) inCd = false;
    if (!inCd) continue;
    cd.push(lines[i].replace(/^(Chẩn đoán|Chan doan|CHẨN ĐOÁN)\s*[:.]?/i, "").trim());
    for (const tok of lines[i].split(/[\s;:()\[\],-]+/)) { const c = fixIcd(tok.replace(/\.$/, "")); if (c && !out.icd_chinh.includes(c) && !out.icd_kem.includes(c)) (out.icd_chinh.length ? out.icd_kem : out.icd_chinh).push(c); }
  }
  out.chan_doan = cd.join(" ").replace(/\b[A-Z1l][0-9OIl]{2}(?:\.\d{1,2})?\b\s*[-–:]?\s*/g, "").replace(/\s{2,}/g, " ").slice(0, 200);
  // thuốc
  let cur = null;
  const push = () => { if (cur) { cur.lieu = cur.lieu.join(" ").replace(/\s{2,}/g, " ").trim(); out.thuoc.push(cur); cur = null; } };
  for (let i = start; i < lines.length; i++) {
    const u = U[i], raw = lines[i];
    if (RX_KET.test(u) && !/\d+\s*(vien|goi|ong)/.test(u)) { push(); if (out.thuoc.length) break; else continue; }
    const numbered = /^\s*\d{1,2}\s*[.)\/-]\s*\S/.test(u);
    const md = (numbered || !cur || !RX_DUNG.test(u)) ? matchDrug(raw.replace(/^\s*\d{1,2}\s*[.)\/-]\s*/, "")) : null;
    if (md || numbered) {
      push();
      const q = [...u.matchAll(RX_SO_DV)];
      let sl = null, dv = "Viên";
      const sm = u.match(/(?:sl|s\.l|so luong)\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*([a-z]+)?/);
      if (sm) { sl = parseFloat(sm[1].replace(",", ".")); if (sm[2] && DV[sm[2]]) dv = DV[sm[2]]; }
      else if (q.length) { const l = q[q.length - 1]; sl = parseFloat(l[1].replace(",", ".")); dv = DV[l[2]]; }
      let ten = md ? md.ten : raw.replace(/^\s*\d{1,2}\s*[.)\/-]\s*/, "").replace(/(SL|S\.L|Số lượng)\s*[:.]?.*$/i, "").replace(/\d+\s*(Viên|Gói|Ống|Chai|Lọ|Tuýp)\s*$/i, "").trim();
      cur = {ten, sl, dv, lieu: [], chua_khop: !md};
      // lời dặn nằm cùng dòng sau tên/số lượng
      const tail = raw.split(/(?:SL|S\.L|Số lượng)\s*[:.]?\s*\d+\s*\S*/i)[1];
      if (tail && RX_DUNG.test(ud(tail))) cur.lieu.push(tail.trim());
      if (!md) out.khong_ro.push(ten);
    } else if (cur) {
      if (cur.sl == null) { const q = [...u.matchAll(RX_SO_DV)]; const sm = u.match(/(?:sl|so luong)\s*[:.]?\s*(\d+)/); if (sm) cur.sl = +sm[1]; else if (q.length && !RX_DUNG.test(u)) { cur.sl = parseFloat(q[0][1]); cur.dv = DV[q[0][2]]; } }
      if (RX_DUNG.test(u)) cur.lieu.push(raw);
    }
  }
  push();
  return out;
}
async function prep(file) {
  const bmp = await createImageBitmap(file);
  const sc = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const g = c.getContext("2d"); g.filter = "grayscale(1) contrast(1.35)"; g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
async function getOcr() {
  if (ocrWorker) return ocrWorker;
  ocrWorker = await Tesseract.createWorker("vie", 1, {
    workerPath: BASE + "vendor/tesseract/worker.min.js", corePath: BASE + "vendor/tesseract/", langPath: BASE + "vendor/lang",
    gzip: true, workerBlobURL: false, cacheMethod: "none",
    logger: m => { if (m.status === "recognizing text") $("st").textContent = `Đang đọc chữ… ${Math.round(m.progress * 100)}%`; }
  });
  await ocrWorker.setParameters({preserve_interword_spaces: "1", tessedit_pageseg_mode: "6"});
  return ocrWorker;
}
async function readPhotos(files) {
  if (!files.length) return;
  files = [...files].slice(0, 4);
  $("thumbs").innerHTML = ""; files.forEach(f => { const im = document.createElement("img"); im.alt = "Ảnh đơn"; im.src = URL.createObjectURL(f); $("thumbs").append(im); });
  if (!dmIdx.length) { $("st").className = "status err"; $("st").textContent = "Đợi bộ quy tắc tải xong rồi chụp lại."; return; }
  $("st").className = "status"; $("st").textContent = "Đang chuẩn bị bộ đọc chữ…";
  $("cam").disabled = $("pick").disabled = true;
  try {
    const w = await getOcr(); let text = "";
    for (const f of files) { const { data } = await w.recognize(await prep(f)); text += data.text + "\n"; }
    $("raw").textContent = text; $("rawbox").hidden = false;
    const d = parseOcr(text);
    if (!d.thuoc.length) throw new Error("Không nhận ra dòng thuốc nào");
    fillForm(d, "· đọc từ ảnh, kiểm tra lại trước khi rà soát");
    const nk = d.khong_ro.length;
    $("st").textContent = `Đã đọc ${d.thuoc.length} thuốc` + (nk ? `, ${nk} thuốc chưa khớp danh mục (viền vàng)` : "") +
      (d.icd_chinh.length ? "" : ", chưa đọc được mã ICD") + (d.tuoi == null ? ", chưa đọc được tuổi" : "") + ". Đối chiếu với đơn giấy ở bước 2.";
    runReview();
  } catch (e) {
    $("st").className = "status err";
    $("st").textContent = "Chưa đọc được đơn từ ảnh (" + (e.message || e) + "). Chụp lại thẳng, đủ sáng, rõ chữ, hoặc nhập tay ở bước 2.";
  } finally { $("cam").disabled = $("pick").disabled = false; $("cam").value = ""; $("pick").value = ""; }
}
$("cam").onchange = e => readPhotos(e.target.files);
$("pick").onchange = e => readPhotos(e.target.files);
