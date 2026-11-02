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
  if (Math.abs(m - n) > Math.max(m, n) * 0.35) return 0;              // chênh độ dài lớn: bỏ qua sớm
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
const RX_DUNG = /(uong|ngay|sang|trua|chieu|toi|lan|truoc\W*an|sau\W*an|nho|boi|xit|ngam|tiem|dat|ngu|\b\d{1,2}\s*h\b|\bvien\b)/;
/* sửa lỗi OCR hay gặp trong dòng cách dùng: "Í/Ì/l viên" → "1 viên", "79h" → "19h", "ung/nong" → "uống", "sau an" → "sau ăn" */
function suaLieu(s) {
  s = s.replace(/½/g, " 1/2").replace(/¼/g, " 1/4").replace(/¾/g, " 3/4").replace(/[⁄∕]/g, "/")
    .replace(/(^|[\s(])[lIÍÌ|!](?=\s*\/\s*[234]\b)/g, "$11")                 // "l/2" → "1/2"
    .replace(/(\d)\s*\/\s*([234])(?=\s*(v|viên|vien|gói|goi|ống|ong|\b))/gi, "$1/$2");   // "1 / 2 viên" → "1/2 viên"
  return s.replace(/(^|\s)[ÍÌIïîl|!](?=\s*(viên|viện|vien|gói|goi|ống|ong|lần|lan)\b)/gi, "$11")
    .replace(/\b([2-9])(\d)\s*h\b/g, (m, a, b) => (+(a + b) > 24 ? "1" + b : a + b) + "h")
    .replace(/(\d{1,2}h\s+)[uưn]?[ôoốóòơ]{0,2}ng\b/gi, "$1uống").replace(/\b(?:uong|uông|uóng|nóng|nong)\b/gi, "uống")
    .replace(/\b(trước|truoc|sau)\W*an\b/gi, (m, a) => a.toLowerCase().replace("truoc", "trước") + " ăn").replace(/\b(vien|viện|viến|viễn)\b/gi, "viên")
    .replace(/\s{2,}/g, " ").trim();
}
const RX_KET = /(ngay\s*\d{1,2}\s*thang|bac si|y si|nguoi ke|loi dan|tong (so|cong)|ky ten|tai kham|ho ten nguoi|cong khoan)/;
function fixIcd(tok) {
  let t = tok.toUpperCase();
  if (/^[1L|][0-9O]{2}(?:[.,][0-9O]{1,2})?$/.test(t)) t = "I" + t.slice(1);   // OCR hay đọc chữ I thành số 1 (I10 → 110)
  if (!/^[A-Z]/.test(t)) return null;
  const rest = t.slice(1).replace(/[OQD]/g, "0").replace(/[IL|]/g, "1").replace(/S/g, "5").replace(/B/g, "8").replace(/,/g, ".");
  const m = (t[0] + rest).match(/^[A-Z]\d{2}(?:\.\d{1,2})?$/); return m ? m[0] : null;
}
/* Dòng thuốc kiểu HIS: "Hoạt chất (Biệt dược) - hàm lượng  SL  Đơn vị" → khớp danh mục theo biệt dược trước */
function tachDong(s) {
  const m = s.match(/^(.*?)\(([^()]{2,50})\)\s*[-–:]?\s*(.*)$/);
  if (!m) return null;
  const hl = (m[3].match(/^[\d.,]+\s*(?:mg|g|mcg|µg|ml|iu|ui|%)(?:\s*[+\/]\s*[\d.,]+\s*(?:mg|g|mcg|µg|ml|iu|ui|%))*/i) || [""])[0];
  return {hc: m[1].trim().replace(/[-–:]$/, "").trim(), bd: m[2].trim(), hl: hl.replace(/\s+/g, " ").trim()};
}
function matchLine(s) {
  const t = tachDong(s);
  if (t) {
    const r = matchDrug(`${t.bd} ${t.hl}`) || matchDrug(t.bd); if (r) return r;
    if (D && t.hc && t.hl) {                                          // biệt dược đọc sai: khớp theo hoạt chất + hàm lượng nếu danh mục chỉ có 1 thuốc như vậy
      const hc = coreTokens(suaHc(t.hc)).filter(w => w.length >= 4), so = [...nums(t.hl)].sort().join("+");
      const ung = D.dm.filter(x => hc.length && hc.every(w => ud(x.hc).includes(w)) && [...nums(x.hl || x.ten)].sort().join("+") === so);
      if (new Set(ung.map(x => x.ten)).size === 1) return {ten: ung[0].ten, score: 0.8};
    }
  }
  return matchDrug(s);
}
let hcTu = null;                                                     // từ trong tên hoạt chất của danh mục (sửa lỗi OCR tên hoạt chất)
function suaHc(s) {
  if (!hcTu && D) { hcTu = new Map(); D.dm.forEach(x => String(x.hc || "").split(/[^A-Za-zÀ-ỹ]+/).forEach(w => { if (w.length >= 4) hcTu.set(ud(w), w.toLowerCase()); })); }
  if (!hcTu) return s;
  return s.replace(/[A-Za-zÀ-ỹ]{4,}/g, w => {
    const b = ud(w); if (hcTu.has(b)) return w;
    let best = null, bs = 0; for (const [k, v] of hcTu) { const x = sim(b, k); if (x > bs) { bs = x; best = v; } }
    return bs >= 0.75 ? (w[0] !== w[0].toLowerCase() ? best[0].toUpperCase() + best.slice(1) : best) : w;
  });
}
function tenTho(s) {
  const t = tachDong(s);
  if (t) t.hc = suaHc(t.hc);
  if (t && t.hc) return `${t.bd} (${t.hc})${t.hl && !(t.hl.match(/[\d.,]+/g) || []).every(n => t.bd.includes(n)) ? " " + t.hl : ""}`;   // giữ hoạt chất để quy tắc theo hoạt chất vẫn chạy
  return s.replace(/(SL|S\.L|Số lượng)\s*[:.]?.*$/i, "").replace(/\d+\s*(Viên|Gói|Ống|Chai|Lọ|Tuýp)\s*$/i, "").trim();
}
/* ---------- sửa chính tả chẩn đoán sau OCR ----------
   Từ điển lấy từ chẩn đoán của BV (9 tháng HIS) + tên ICD chuẩn: với mỗi chữ OCR, tìm các chữ cùng "khung không dấu"
   (hoặc sai 1 ký tự), chọn chuỗi có tần suất cụm 2 chữ cao nhất (Viterbi). Vd "biên chúng" → "biến chứng". */
let CD = null, LD = null;
function moHinh(u, b) {
  const base = new Map(), base1 = new Map();
  for (const w of Object.keys(u)) {
    const b = ud(w); (base.get(b) || base.set(b, []).get(b)).push(w);
    if (b.length >= 4) for (let i = 0; i < b.length; i++) { const k = b.slice(0, i) + "*" + b.slice(i + 1); (base1.get(k) || base1.set(k, new Set()).get(k)).add(b); }
  }
  return {u, b, base, base1};
}
function napChanDoan(j) { CD = Object.assign(moHinh(j.u, j.b), {icd: j.icd}); if (j.lu) LD = moHinh(j.lu, j.lb); }
function ungVien(w, M) {
  const lw = w.toLowerCase(), b = ud(lw), out = new Map();
  (M.base.get(b) || []).forEach(c => out.set(c, 0));
  if (!out.size && b.length >= 4) {                                   // sai 1 ký tự (thay/thiếu/thừa)
    const near = new Set();
    for (let i = 0; i < b.length; i++) { (M.base1.get(b.slice(0, i) + "*" + b.slice(i + 1)) || []).forEach(x => near.add(x));
      const del = b.slice(0, i) + b.slice(i + 1); if (M.base.has(del)) near.add(del); }
    for (let i = 0; i <= b.length; i++) { const k = b.slice(0, i) + "*" + b.slice(i); (M.base1.get(k) || []).forEach(x => { if (x.length === b.length + 1) near.add(x); }); }
    near.forEach(x => (M.base.get(x) || []).forEach(c => out.set(c, -5)));
    out.set(lw, 0);                                                   // giữ nguyên chữ gốc nếu ngữ cảnh không ủng hộ chữ gần giống
  }
  if (!out.size) out.set(lw, 0);
  return [...out.entries()];
}
function suaChu(text, M = CD) {
  if (!M || !text) return text;
  const parts = text.split(/([A-Za-zÀ-ỹĐđ]+)/), idx = [];
  parts.forEach((p, i) => { if (i % 2 && p.length > 1) idx.push(i); });
  if (!idx.length) return text;
  const lg = x => Math.log((x || 0) + 1);
  let prev = null;                                                    // Viterbi theo từng cụm chữ liền nhau
  for (let k = 0; k < idx.length; k++) {
    const w = parts[idx[k]], cands = ungVien(w, M);
    const lien = k > 0 && !/[;,.:()\/]/.test(parts.slice(idx[k - 1] + 1, idx[k]).join(""));
    const cur = cands.map(([c, pen]) => {
      const own = 0.5 * lg(M.u[c]) + pen + (c === w.toLowerCase() ? 1 : 0);
      if (!prev) return {c, sc: own, back: null};
      let best = null;
      for (const p of prev) { const sc = p.sc + own + (lien ? (M.b[p.c + " " + c] ? 3 * lg(M.b[p.c + " " + c]) : -1.5) : 0); if (!best || sc > best.sc) best = {c, sc, back: p}; }
      return best;
    });
    prev = cur;
  }
  let node = prev.reduce((a, b) => (b.sc > a.sc ? b : a));
  for (let k = idx.length - 1; k >= 0; k--, node = node.back) {
    const w = parts[idx[k]], c = node.c;
    const dau = k === 0 || /[;.:(]/.test(parts.slice(idx[k - 1] + 1, idx[k]).join(""));   // đầu câu/đầu ý
    const hoa = w[0] !== w[0].toLowerCase() && (dau || !M.u[c]);                                 // giữa câu: bỏ chữ hoa do OCR
    parts[idx[k]] = w === w.toUpperCase() && w.length > 1 ? c.toUpperCase() : hoa ? c[0].toUpperCase() + c.slice(1) : c;
  }
  const r = parts.join("");
  return M === CD ? r.replace(/(^|\s)[a-z](?=\s)/g, "$1").replace(/\s{2,}/g, " ") : r;   // chẩn đoán: bỏ ký tự lẻ do OCR
}
function hienTenIcd() {                                               // tên chuẩn theo mã ICD để đối chiếu chữ chẩn đoán
  const el = $("cdicd"); if (!el) return;
  const cs = ($("icd1").value + "," + $("icd2").value).toUpperCase().match(/[A-Z]\d{2}(?:\.\d{1,2})?/g) || [], t = tenIcd(cs);
  el.hidden = !t.length; el.textContent = t.length ? "Theo mã ICD: " + cs.map(c => c + " " + (CD.icd[c] || CD.icd[c.slice(0, 3)] || "?")).join("; ") : "";
}
const tenIcd = codes => CD ? codes.map(c => CD.icd[c] || CD.icd[c.slice(0, 3)]).filter(Boolean) : [];

function parseOcr(text) {
  const lines = text.split(/\n+/).map(s => s.replace(/[|¦]/g, " ").replace(/\s{2,}/g, " ").trim()).filter(Boolean);   // bỏ kẻ bảng
  const U = lines.map(ud);
  const out = {tuoi: null, ngay: "", icd_chinh: [], icd_kem: [], chan_doan: "", thuoc: [], khong_ro: [], loi_dan: "", ngay_hen: ""};
  // lời dặn + hẹn tái khám (thường ở cuối đơn)
  const ld = [];
  U.forEach((u, i) => {
    if (/loi dan|hen (tai )?kham|tai kham|kham lai|hen ngay|ngay hen/.test(u)) {
      const k = u.search(/loi dan|hen (tai )?kham|ngay tai kham|tai kham|kham lai|hen ngay|ngay hen/);
      ld.push(lines[i].slice(k).replace(/^(Lời dặn( của bác sĩ)?|Loi dan)\s*[:.]?\s*/i, ""));
      if (/loi dan\s*[:.]?\s*$/.test(u) && lines[i + 1] && !RX_KET.test(U[i + 1]) && !/^ngay\b/.test(U[i + 1])) ld.push(lines[i + 1]);
    }
  });
  out.loi_dan = suaChu([...new Set(ld.map(x => x.trim()).filter(x => (x.match(/[A-Za-zÀ-ỹ]{2,}/g) || []).length >= 2))].join("; ").slice(0, 300), LD);
  const mh = U.join(" ").match(/(?:hen|tai kham|kham lai)[^0-9]{0,25}(\d{1,2}\s*[\/.-]\s*\d{1,2}\s*[\/.-]\s*\d{2,4})/);
  if (mh) out.ngay_hen = mh[1].replace(/\s/g, "").replace(/[.-]/g, "/");
  // ngày kê
  for (const u of U) { const m = u.match(/ngay\s*(\d{1,2})\s*thang\s*(\d{1,2})\s*nam\s*(\d{4})/); if (m) out.ngay = `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`; }
  if (!out.ngay) { const m = U.join(" ").match(/ngay (?:ky|ke(?: don)?)\s*[:.]?\s*(?:\d{1,2}:\d{2}(?::\d{2})?\s*)?(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4})/); if (m) out.ngay = `${m[1].padStart(2, "0")}/${m[2].padStart(2, "0")}/${m[3]}`; }
  // tuổi
  const full = U.join(" \n ");
  let m = full.match(/tuoi\s*[:.]?\s*(\d{1,3})\b/) || full.match(/\b(\d{1,3})\s*tuoi/);
  if (m) out.tuoi = +m[1];
  else if ((m = full.match(/(?:nam sinh|ngay sinh|sinh ngay)\s*[:.]?\s*(?:(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*)?(\d{4})/))) {
    const [dk, mk, yk] = out.ngay ? out.ngay.split("/").map(Number) : [new Date().getDate(), new Date().getMonth() + 1, new Date().getFullYear()];
    out.tuoi = yk - +m[3];
    if (m[1] && (mk < +m[2] || (mk === +m[2] && dk < +m[1]))) out.tuoi--;          // chưa tới sinh nhật trong năm
  } else if ((m = full.match(/(\d{1,2})\s*thang\s*tuoi/))) out.tuoi = Math.round(+m[1] / 12 * 10) / 10;
  // vùng thuốc
  let start = U.findIndex(u => /(thuoc dieu tri|ten thuoc|chi dinh dung thuoc|thuoc dung|don thuoc gom|r\/?\s*p\b)/.test(u) && !/don thuoc bao hiem|^don thuoc$/.test(u));
  if (start < 0) start = U.findIndex(u => /^\s*1\s*[.)\/-]\s*\D/.test(u));
  if (start < 0) start = 0;
  // ICD + chẩn đoán (trước vùng thuốc)
  const cd = [];
  let inCd = false;
  let thayCd = false;
  for (let i = 0; i < lines.length; i++) {                           // chẩn đoán có thể nằm trước hoặc sau bảng thuốc tùy mẫu đơn
    const u = U[i];
    if (thayCd && (/(thuoc dieu tri|ten thuoc|^stt\b|^\d{1,2}\s*[.)]?\s+\S.*\d\s*(mg|ml|g)\b)/.test(u) || RX_KET.test(u))) break;
    if (/han doan|chuan doan|icd|(^|\s)ma\s*\W?[il1|]?cd\b|[\[(|]cd\s*1?0|benh chinh|benh kem/.test(u)) inCd = thayCd = true;
    else if (inCd && /^(ho ten|dia chi|so the|gioi|ma (bn|benh nhan)|doi tuong|khoa|phong)/.test(u)) inCd = false;
    if (!inCd) continue;
    const isMa = /^\W*(ma\s*)?\W?[il1|]?cd\b/.test(u);
    if (!isMa) cd.push(lines[i].replace(/^.{0,4}h[aâ]n\s*đo[aá]n\s*[:.]?/i, "").replace(/^(Chẩn đoán|Chan doan)\s*[:.]?/i, "").trim());
    for (const tok of (isMa ? lines[i].replace(/^.*?[CС]D\s*-?\s*1?0?\s*[:.;]?/i, " ") : lines[i]).split(/[\s;:()\[\],-]+/)) { const c = fixIcd(tok.replace(/\.$/, "")); if (c && !out.icd_chinh.includes(c) && !out.icd_kem.includes(c)) (out.icd_chinh.length ? out.icd_kem : out.icd_chinh).push(c); }
  }
  out.chan_doan = suaChu(cd.join(" ")).replace(/\(\s*\)/g, "").replace(/\b[A-Z1l][0-9OIl]{2}(?:\.\d{1,2})?\b\s*[-–:]?\s*/g, "").replace(/\s{2,}/g, " ").trim().slice(0, 300);
  if (out.chan_doan.replace(/[^A-Za-zÀ-ỹ]/g, "").length < 6) out.chan_doan = tenIcd([...out.icd_chinh, ...out.icd_kem]).join("; ");   // không đọc được chữ → lấy tên ICD chuẩn
  // thuốc
  let cur = null;
  const push = () => { if (cur) { cur.lieu = suaChu(cur.lieu.join(" ").replace(/\s{2,}/g, " ").trim(), LD); out.thuoc.push(cur); cur = null; } };
  for (let i = start; i < lines.length; i++) {
    const u = U[i], raw = lines[i];
    if (RX_KET.test(u) && !/\d+\s*(vien|goi|ong)/.test(u)) { push(); if (out.thuoc.length) break; else continue; }
    const numbered = /^\s*\d{1,2}\s*(?:[.)\/-]\s*|\s+(?=[A-Za-zÀ-ỹ]{3}))\S/.test(u) && !/^\s*\d{1,2}\s*(h|gio)\b/.test(u);
    const body = raw.replace(/^\s*\d{1,2}\s*[.)\/-]?\s*/, "");
    const md = (numbered || !cur || !RX_DUNG.test(u)) ? matchLine(body) : null;
    const dangHis = /\([^()]{3,50}\)\s*[-–]?\s*\d/.test(raw) && /\d\s*(mg|g|mcg|ml|iu|ui|%)/i.test(raw);
    if (md || numbered || dangHis) {
      push();
      const q = [...u.replace(/\bs(\d)\b/g, "5$1").replace(/\bo(\d)\b/g, "0$1").matchAll(RX_SO_DV)];   // OCR: "s6" = 56
      let sl = null, dv = "Viên";
      const sm = u.match(/(?:sl|s\.l|so luong)\s*[:.]?\s*(\d+(?:[.,]\d+)?)\s*([a-z]+)?/);
      if (sm) { sl = parseFloat(sm[1].replace(",", ".")); if (sm[2] && DV[sm[2]]) dv = DV[sm[2]]; }
      else if (q.length) { const l = q[q.length - 1]; sl = parseFloat(l[1].replace(",", ".")); dv = DV[l[2]]; }
      let ten = md ? md.ten : tenTho(body);
      cur = {ten, sl, dv, lieu: [], chua_khop: !md};
      // lời dặn nằm cùng dòng sau tên/số lượng
      const tail = raw.split(/(?:SL|S\.L|Số lượng)\s*[:.]?\s*\d+\s*\S*/i)[1];
      if (tail && RX_DUNG.test(ud(tail))) cur.lieu.push(tail.trim());
      if (!md) out.khong_ro.push(ten);
    } else if (cur) {
      const chiSl = u.replace(/[^a-z0-9]+/g, " ").trim().match(/^(?:\d{1,2}\s+)?(?:[a-z]{1,2}\s+)*(\d+)\s*(vien|goi|ong|chai|lo|tuyp|hop|but|tui)$/);
      const cuoiSl = !/(uong|sang|trua|chieu|toi|\d\s*h\b|truoc\W*an|sau\W*an|lan|ngay|moi)/.test(ud(suaLieu(raw))) && u.replace(/[^a-z0-9]+/g, " ").trim().match(/(\d+)\s*(vien|goi|ong|chai|lo|tuyp|hop|but|tui)$/);
      if (chiSl || cuoiSl) { const q = chiSl || cuoiSl; if (cur.sl == null) { cur.sl = parseFloat(q[1]); cur.dv = DV[q[2]]; } continue; }   // dòng chỉ có STT/SL/đơn vị (cột bảng) hoặc phần tên bị tách dòng
      if (cur.sl == null) { const q = [...u.matchAll(RX_SO_DV)]; const sm = u.match(/(?:sl|so luong)\s*[:.]?\s*(\d+)/); if (sm) cur.sl = +sm[1]; else if (q.length && !RX_DUNG.test(u)) { cur.sl = parseFloat(q[0][1]); cur.dv = DV[q[0][2]]; } }
      const L2 = suaLieu(raw);
      if (RX_DUNG.test(ud(L2))) cur.lieu.push(L2.replace(/\s*[:.,;~=-]+\s*$/, "").replace(/(sau|trước):\s*/i, "$1 "));
    }
  }
  push();
  return out;
}

/* Rà soát đơn ngoại trú – chạy hoàn toàn trên điện thoại.
   Khởi động song song: tải dữ liệu (JSON) ‖ nạp Python (Pyodide) ‖ chuẩn bị bộ đọc chữ (Tesseract).
   Tra cứu thuốc và đọc ảnh dùng được ngay khi dữ liệu tải xong; rà soát chạy khi Python sẵn sàng. */
const $ = id => document.getElementById(id);
const PY_FILES = ["ra_soat", "tuong_tac", "dinh_chi", "ghi_chu_ds", "thoi_diem", "tai_kham", "chay_app"];
const DATA = {quy_tac: "Bang_tra_cuu_ra_soat", danh_muc: "Danh_muc_thong_tin_thuoc", thoi_diem: "Thoi_diem_dung_thuoc", ghi_chu: "Ghi_chu_DS"};
const BASE = new URL("./", location.href).href;
let py = null, dmNames = [], dmIdx = [], lastResult = null, lastDon = null, ocrWorker = null, ocrReady = null, D = null;
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const MUC = {"Nghiêm trọng": 1, "Cần lưu ý": 2, "Tham khảo": 3};
const debounce = (f, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, {timeout: 2500}) : setTimeout(f, 800));
function setEng(text, cls) { $("eng").textContent = text; $("eng").className = "chip " + cls; }

/* ---------- tab ---------- */
function tab(which) {
  const rs = which === "rs";
  $("tab-rs").setAttribute("aria-selected", rs); $("tab-tc").setAttribute("aria-selected", !rs);
  $("pane-rs").hidden = !rs; $("pane-tc").hidden = rs; $("dock").hidden = !rs;
  if (!rs) setTimeout(() => $("q").focus(), 50);
  scrollTo({top: 0});
}
$("tab-rs").onclick = () => tab("rs"); $("tab-tc").onclick = () => tab("tc");

/* ---------- service worker: dùng không cần mạng, tự cập nhật khi có mạng ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w && w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) $("upd").hidden = false; });
    });
  }).catch(() => {});
}
async function showVersion() {
  try { const v = await (await fetch("data/version.json", {cache: "no-store"})).json(); $("ver").textContent = `Bộ quy tắc ${v.bo_quy_tac} · ${v.ngay}`; }
  catch { $("ver").textContent = "Bộ quy tắc (bản lưu trên máy)"; }
}
showVersion();
const netTxt = () => { $("net").textContent = navigator.onLine ? "Có mạng" : "Không mạng – vẫn dùng được"; };
netTxt(); addEventListener("online", netTxt); addEventListener("offline", netTxt);
$("chk").onclick = async () => {
  $("chk").textContent = "Đang kiểm tra…";
  try {
    const reg = await navigator.serviceWorker?.getRegistration(); if (reg) await reg.update();
    const r = await fetch("data/version.json", {cache: "no-store"}); if (!r.ok) throw 0;
    await showVersion(); $("chk").textContent = "Đã là bản mới nhất";
  } catch { $("chk").textContent = "Không có mạng"; }
  setTimeout(() => $("chk").textContent = "Kiểm tra cập nhật", 3000);
};
$("upd").onclick = () => location.reload();

/* ---------- form đơn ---------- */
const autoReview = debounce(() => runReview(), 450);
function drugRow(t = {}) {
  const i = Math.random().toString(36).slice(2, 8);
  const d = document.createElement("div"); d.className = "drug" + (t.chua_khop ? " warn" : "");
  d.innerHTML = `<div class="hd"><label for="t${i}">Tên thuốc${t.chua_khop ? " – chưa khớp danh mục" : ""}<input id="t${i}" list="dmlist" autocomplete="off" class="ten"></label>
    <button type="button" class="x" aria-label="Xóa thuốc">Xóa</button></div>
    <div class="qty"><label for="s${i}">Số lượng<input id="s${i}" inputmode="decimal" class="sl"></label>
    <label for="d${i}">Đơn vị<input id="d${i}" class="dv" list="dvlist" autocomplete="off"></label></div>
    <label for="l${i}">Cách dùng<textarea id="l${i}" rows="2" class="lieu"></textarea></label>`;
  d.querySelector(".ten").value = t.ten || ""; d.querySelector(".sl").value = t.sl ?? ""; d.querySelector(".dv").value = t.dv || "Viên";
  d.querySelector(".lieu").value = t.lieu || "";
  d.querySelector(".x").onclick = () => { d.remove(); autoReview(); };
  $("drugs").append(d);
}
function fillForm(don, nguon) {
  $("tuoi").value = don.tuoi ?? ""; $("ngay").value = don.ngay || "";
  $("icd1").value = (don.icd_chinh || []).join(", "); $("icd2").value = (don.icd_kem || []).join(", ");
  $("cdoan").value = don.chan_doan || ""; hienTenIcd(); $("loidan").value = don.loi_dan || ""; $("ngayhen").value = don.ngay_hen || ""; $("drugs").innerHTML = "";
  (don.thuoc || []).forEach(drugRow); if (!(don.thuoc || []).length) drugRow();
  $("src").textContent = nguon;
}
function readForm() {
  const icds = s => (s.toUpperCase().match(/[A-Z]\d{2}(?:\.\d{1,2})?/g) || []);
  const num = s => { const v = parseFloat(String(s).replace(",", ".")); return isNaN(v) ? null : v; };
  return {tuoi: num($("tuoi").value), ngay: $("ngay").value.trim(), icd_chinh: icds($("icd1").value), icd_kem: icds($("icd2").value),
    chan_doan: $("cdoan").value.trim(), loi_dan: $("loidan").value.trim(), ngay_hen: $("ngayhen").value.trim(),
    thuoc: [...document.querySelectorAll(".drug")].map(d => ({ten: d.querySelector(".ten").value.trim(), sl: num(d.querySelector(".sl").value),
      dv: d.querySelector(".dv").value.trim(), lieu: d.querySelector(".lieu").value.trim()})).filter(t => t.ten)};
}
document.querySelector("#pane-rs").addEventListener("input", e => { if (e.target.matches("input,textarea")) autoReview(); if (/^icd/.test(e.target.id)) hienTenIcd(); });
$("add").onclick = () => { drugRow(); $("drugs").lastElementChild.querySelector(".ten").focus(); };
$("clear").onclick = () => {
  fillForm({thuoc: []}, ""); $("thumbs").innerHTML = ""; $("rawbox").hidden = true;
  ["sum", "acts", "ctbox"].forEach(id => $(id).hidden = true); $("issues").innerHTML = "";
  $("st").className = "status"; $("st").textContent = "Đơn mới: chụp ảnh hoặc nhập tay ở phần Dữ liệu đơn.";
};
fillForm({tuoi: 70, ngay: "15/10/2026", icd_chinh: ["M10"], icd_kem: ["I10", "N18"], chan_doan: "Gút; Tăng huyết áp; Bệnh thận mạn", loi_dan: "Ăn nhạt, hạn chế thịt đỏ, rượu bia. Hẹn tái khám ngày 29/10/2026",
  thuoc: [{ten: "Colchicina Seid 1mg Tablet", sl: 30, dv: "Viên", lieu: "Sáng 1 viên, tối 1 viên sau ăn"},
          {ten: "Clarithromycin 500mg", sl: 14, dv: "Viên", lieu: "Sáng 1 viên, tối 1 viên"}]}, "· ví dụ minh họa");

/* ---------- khởi động song song ---------- */
const texts = {};
const getText = p => texts[p] || (texts[p] = fetch(p).then(r => { if (!r.ok) throw new Error("Không tải được " + p); return r.text(); }));
const dataReady = (async () => {
  getText("data/chan_doan.json").then(t => { napChanDoan(JSON.parse(t)); hienTenIcd(); }).catch(() => {});
  const [qt, dm, td] = await Promise.all(["data/quy_tac.json", "data/danh_muc.json", "data/thoi_diem.json"].map(getText));
  D = buildLookup(JSON.parse(qt), JSON.parse(dm), JSON.parse(td));
  dmNames = [...new Set(D.dm.map(x => x.ten))];
  dmIdx = dmNames.map(n => ({ten: n, tok: coreTokens(n), num: nums(n)})).filter(x => x.tok.length);
  const dl = $("dmlist"), fr = document.createDocumentFragment();
  dmNames.forEach(n => { const o = document.createElement("option"); o.value = n; fr.append(o); }); dl.append(fr);
  if (!py) setEng("Tra cứu, đọc ảnh sẵn sàng · đang nạp bộ rà soát…", "busy");
  idle(() => { ocrReady = getOcr().catch(() => null); });           // chuẩn bị bộ đọc chữ khi rảnh
})();
const engineReady = (async () => {
  await dataReady.catch(() => {});                                  // tra cứu + đọc ảnh có trước, rồi mới nạp Python
  const pyP = loadPyodide({indexURL: BASE + "vendor/pyodide/"});
  const files = Promise.all([...PY_FILES.map(f => getText(`py/${f}.py.txt`)), getText("py/shim_openpyxl.py.txt"),
    ...Object.keys(DATA).map(k => getText(`data/${k}.json`))]);
  const [p, f] = await Promise.all([pyP, files]);
  p.FS.mkdirTree("/rs/engine/openpyxl"); p.FS.mkdirTree("/rs/du_lieu");
  PY_FILES.forEach((n, i) => p.FS.writeFile(`/rs/engine/${n}.py`, f[i]));
  p.FS.writeFile("/rs/engine/openpyxl/__init__.py", f[PY_FILES.length]);
  p.FS.writeFile("/rs/engine/openpyxl/styles.py", "class Font:\n    def __init__(s,*a,**k): pass\nPatternFill = Alignment = Font\n");
  p.FS.writeFile("/rs/engine/openpyxl/utils.py", "def get_column_letter(i):\n    s=''\n    while i:\n        i,r=divmod(i-1,26); s=chr(65+r)+s\n    return s\n");
  Object.values(DATA).forEach((n, i) => { p.FS.writeFile(`/rs/du_lieu/${n}.xlsx.json`, f[PY_FILES.length + 1 + i]); p.FS.writeFile(`/rs/du_lieu/${n}.xlsx`, ""); });
  p.runPython("import sys; sys.path.insert(0,'/rs/engine'); import chay_app; chay_app._nap()");
  py = p;
})();
Promise.all([dataReady, engineReady]).then(() => { setEng(`Sẵn sàng · ${dmNames.length} thuốc`, "ok"); runReview(); })
  .catch(e => {
    setEng("Lỗi tải", "bad");
    $("st").className = "status err"; $("st").textContent = "Không tải được bộ rà soát. Lần đầu cần mở khi có mạng để tải về máy. Chi tiết: " + (e.message || e);
  });

/* ---------- rà soát ---------- */
function runReview() {
  const don = readForm(); lastDon = don;
  if (!py) { if (don.thuoc.length) $("st").textContent = "Đang nạp bộ rà soát, kết quả sẽ hiện ngay khi xong…"; return; }
  if (!don.thuoc.length) { ["sum", "acts", "ctbox"].forEach(id => $(id).hidden = true); $("issues").innerHTML = ""; return; }
  try {
    py.globals.set("DON", JSON.stringify(don));
    const r = JSON.parse(py.runPython("chay_app.ra_soat_don(DON)")); lastResult = r; render(r, don);
  } catch (e) { $("st").className = "status err"; $("st").textContent = "Lỗi khi rà soát: " + (e.message || e); }
}
function render(r, don) {
  const iss = r.issues.slice().sort((a, b) => (MUC[a.muc] || 9) - (MUC[b.muc] || 9));
  const n = m => iss.filter(i => i.muc === m).length;
  $("c1").textContent = n("Nghiêm trọng"); $("c2").textContent = n("Cần lưu ý"); $("c3").textContent = n("Tham khảo");
  $("sum").hidden = false; $("acts").hidden = false; $("ctbox").hidden = false;
  $("st").className = "status";
  const hen = r.hen ? ` · hẹn ${r.hen.ngay ? r.hen.ngay + (r.hen.so_ngay != null ? ` (${r.hen.so_ngay} ngày)` : "") : r.hen.cach}` : "";
  $("st").textContent = `${don.thuoc.length} thuốc · tuổi ${don.tuoi ?? "?"} · ICD ${[...don.icd_chinh, ...don.icd_kem].join(", ") || "chưa có"}${hen} · ${iss.length ? iss.length + " vấn đề" : "không phát hiện vấn đề"}`;
  const card = i => {
    const m = MUC[i.muc] || 3, cls = ["", "s1", "s2", "s3"][m];
    return `<article class="issue m${m}"><div class="h"><span class="pill ${cls}">${esc(i.muc)}</span><span class="small mut">${esc(i.tieu_chi)}</span>${i.xuat_toan === "Có" ? '<span class="pill s1">Nguy cơ xuất toán</span>' : ""}</div>
      <div class="t">${String(i.thuoc).includes(" + ") || String(i.thuoc).includes(", ") ? esc(i.thuoc) : `<button class="link t" type="button" data-thuoc="${esc(i.thuoc)}">${esc(i.thuoc)} ›</button>`}</div><p>${esc(i.van_de)}</p>${i.de_xuat ? `<div class="dx">→ ${esc(i.de_xuat)}</div>` : ""}
      ${i.nhan_xet ? `<p class="mut small">DS: ${esc(i.nhan_xet)}</p>` : ""}${i.can_cu ? `<div class="cc">Căn cứ: ${esc(i.can_cu).slice(0, 300)}</div>` : ""}</article>`;
  };
  const chinh = iss.filter(i => i.muc !== "Tham khảo"), tk = iss.filter(i => i.muc === "Tham khảo");
  $("issues").innerHTML = chinh.map(card).join("") + (tk.length ? `<details class="more"${chinh.length ? "" : " open"}><summary>${tk.length} mục Tham khảo</summary><div style="display:grid;gap:8px">${tk.map(card).join("")}</div></details>` : "");
  $("ct").innerHTML = r.chi_tiet.map(c => `<tr><td><button class="link" type="button" data-thuoc="${esc(c.thuoc)}">${esc(c.thuoc)}</button></td><td>${esc(c.hoat_chat)}</td><td class="n">${c.dv_ngay ?? "–"}</td><td class="n">${c.so_ngay ?? "–"}</td>
    <td>${esc(c.phu_hop_icd)}</td><td>${esc(c.can_cu_icd)}</td><td>${esc(c.danh_muc)}</td></tr>`).join("");
}
function resultText() {
  if (!lastResult) return "";
  const d = lastDon, L = [`RÀ SOÁT ĐƠN – tuổi ${d.tuoi ?? "?"}; ngày ${d.ngay || "?"}; ICD: ${[...d.icd_chinh, ...d.icd_kem].join(", ")}`];
  d.thuoc.forEach((t, k) => L.push(`${k + 1}. ${t.ten} – ${t.sl ?? ""} ${t.dv} – ${t.lieu}`));
  if (d.loi_dan || d.ngay_hen) L.push(`Lời dặn: ${[d.loi_dan, d.ngay_hen ? "hẹn " + d.ngay_hen : ""].filter(Boolean).join("; ")}`);
  L.push("");
  lastResult.issues.slice().sort((a, b) => (MUC[a.muc] || 9) - (MUC[b.muc] || 9)).forEach(i => L.push(`[${i.muc}] ${i.tieu_chi} – ${i.thuoc}: ${i.van_de}${i.de_xuat ? " → " + i.de_xuat : ""}`));
  if (!lastResult.issues.length) L.push("Không phát hiện vấn đề theo bộ quy tắc.");
  return L.join("\n");
}
$("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(resultText()); $("copy").textContent = "Đã sao chép"; }
  catch { $("copy").textContent = "Không sao chép được"; }
  setTimeout(() => $("copy").textContent = "Sao chép", 2500);
};
$("share").onclick = async () => { try { await navigator.share({title: "Kết quả rà soát đơn", text: resultText()}); } catch {} };
if (!navigator.share) $("share").hidden = true;

/* ---------- tra cứu thuốc (JavaScript thuần, tức thì) ---------- */
function rows(sheet) { const [h, ...r] = sheet || [[]]; return r.filter(x => x && x[0] != null && x[0] !== "").map(x => Object.fromEntries(h.map((k, i) => [String(k || "").split(" (")[0], x[i] ?? null]))); }
const norm = s => ud(s).replace(/\s+/g, " ").trim();
function pyRe(src) { try { return new RegExp(String(src).replace(/\(\?P</g, "(?<").replace(/^\(\?i\)/, ""), ""); } catch { return null; } }
function buildLookup(qt, dmj, tdj) {
  const dmRows = Object.values(dmj)[0], H = dmRows[0].map(x => ud(x).trim());
  const col = k => H.findIndex(h => h.includes(k));
  const C = {ten: col("ten thuoc"), hc: col("hoat chat"), hl: col("ham luong"), dang: col("dang bao che"), duong: col("duong dung"), cd: col("chi dinh"),
    lieu: col("lieu dung"), ccd: col("chong chi dinh"), cach: col("cach dung"), tt: col("than trong"), pnct: col("phu nu co thai"), tuongtac: col("tuong tac"),
    tdkmm: col("tac dung khong mong muon"), link: col("to huong dan"), gc: col("ghi chu")};
  const dm = dmRows.slice(1).filter(r => r[C.ten]).map(r => Object.fromEntries(Object.entries(C).map(([k, i]) => [k, i >= 0 ? r[i] : null])));
  const hdsd = new Map(rows(qt.Thuoc_HDSD).map(r => [norm(r.ten_thuoc), r]));
  const td = new Map((tdj.Thoi_diem_dung || []).slice(1).filter(r => r && r[1]).map(r => [norm(r[1]), r]));
  const hcn = rows(qt.Hoat_chat_nhom).map(r => ({...r, rx: pyRe(r.tu_khoa), nh: String(r.nhom || "").split(",").map(s => s.trim()).filter(Boolean)})).filter(r => r.rx);
  const tt = rows(qt.Tuong_tac);
  const qtt = rows(qt.Quy_tac_thuoc).map(r => ({...r, rx: pyRe(r.tu_khoa)})).filter(r => r.rx);
  const dc = rows(qt.Thuoc_dinh_chi).filter(r => !ud(r.trang_thai).startsWith("ngung")).map(r => ({...r, rx: r.tu_khoa_ten ? pyRe(r.tu_khoa_ten) : null}));
  const local = /nho mat|nho tai|nho mui|xit mui|dung ngoai|boi|ngoai da|dat am dao|suc mieng/;
  for (const d of dm) {
    const text = ud(d.hc) + " | " + ud(d.ten), duong = ud(d.duong), tai_cho = local.test(duong);
    d.k = norm(d.ten); d.s = ud(`${d.ten} ${d.hc}`);
    d.tags = new Set(); d.hcs = new Set();
    for (const h of hcn) {
      if (!h.rx.test(text)) continue;
      if (h.duong_dung === "he_thong" && tai_cho) continue;
      if (h.duong_dung === "uong" && duong && !duong.includes("uong")) continue;
      d.hcs.add(h.hoat_chat); h.nh.forEach(x => d.tags.add(x)); d.tags.add(h.hoat_chat);
    }
    d.hd = hdsd.get(d.k); d.td = td.get(d.k); d.qt = qtt.filter(r => r.rx.test(text));
    d.dc = dc.filter(v => v.rx && v.rx.test(ud(d.ten)));
  }
  return {dm, tt, hdsd};
}
const MTT = {"Chống chỉ định": 0, "Chống chỉ định có điều kiện": 0.5, "Nghiêm trọng": 1, "Cần lưu ý": 2, "Tham khảo": 3};
function search(q) {
  const u = ud(q).trim(); if (!u || !D) return [];
  const icd = q.trim().toUpperCase().match(/^[A-Z]\d{2}(\.\d{1,2})?$/);
  if (icd) {
    const c = icd[0];
    const hit = (spec) => String(spec || "").toUpperCase().split(/[,;]\s*/).some(t => { t = t.trim(); if (!t) return false;
      if (t.includes("-")) { const [a, b] = t.split("-"); const x = c.slice(0, a.length); return x >= a && x <= b; } return c.startsWith(t); });
    return D.dm.filter(d => d.hd && (hit(d.hd.icd_HDSD) || hit(d.hd.icd_HDSD_co_dieu_kien))).map(d => ({d, why: hit(d.hd.icd_HDSD) ? "Chỉ định HDSD" : "Chỉ định có điều kiện"}));
  }
  const words = u.split(/\s+/);
  return D.dm.map(d => {
    let sc = 0;
    if (d.k.startsWith(u)) sc = 3; else if (words.every(w => d.s.includes(w))) sc = 2;
    else { const t = d.s.split(/[^a-z0-9]+/); if (words.every(w => t.some(x => x.length > 3 && sim(w, x) >= 0.75))) sc = 1; }
    return {d, sc};
  }).filter(x => x.sc).sort((a, b) => b.sc - a.sc || a.d.ten.localeCompare(b.d.ten)).slice(0, 30);
}
function showHits() {
  const q = $("q").value, h = search(q);
  $("info").hidden = true;
  $("hits").innerHTML = !q.trim() ? `<p class="mut small" style="margin:0">Gõ vài chữ đầu tên thuốc hoặc hoạt chất; gõ mã ICD (vd I10) để xem thuốc có chỉ định đó.</p>` :
    h.length ? h.map((x, i) => `<button class="hit" type="button" data-i="${D.dm.indexOf(x.d)}"><b>${esc(x.d.ten)}</b><span class="small mut">${esc(x.d.hc)} ${esc(x.d.hl || "")}${x.why ? " · " + x.why : ""}${x.d.dc.length ? ' · <span style="color:var(--crit)">có văn bản thu hồi</span>' : ""}</span></button>`).join("")
    : `<p class="mut small" style="margin:0">Không tìm thấy trong danh mục ${D.dm.length} thuốc.</p>`;
}
$("q").addEventListener("input", debounce(showHits, 120));
$("hits").addEventListener("click", e => { const b = e.target.closest(".hit"); if (b) showInfo(D.dm[+b.dataset.i]); });
function showInfo(d) {
  const hd = d.hd || {}, row = (k, v, cls) => v != null && v !== "" ? `<dt>${k}</dt><dd${cls ? ` class="${cls}"` : ""}>${esc(v)}</dd>` : "";
  const uniq = a => [...new Set(a.flatMap(x => String(x || "").split(",")).map(x => x.trim()).filter(Boolean))].join(", ");
  const lieu = [hd.max_dv_ngay_nguoi_lon != null ? `Tối đa ${hd.max_dv_ngay_nguoi_lon} đv/ngày (người lớn)` : "", hd.max_dv_ngay_tre_em != null ? `trẻ em tối đa ${hd.max_dv_ngay_tre_em} đv/ngày` : "",
    hd.min_dv_ngay_nguoi_lon != null ? `tối thiểu ${hd.min_dv_ngay_nguoi_lon} đv/ngày` : "", hd.max_dv_ngay_theo_icd ? `tối đa theo ICD: ${hd.max_dv_ngay_theo_icd}` : "", hd.min_dv_ngay_theo_icd ? `tối thiểu theo ICD: ${hd.min_dv_ngay_theo_icd}` : ""].filter(Boolean).join("; ");
  const tdv = d.td ? [d.td[4], d.td[5], d.td[6] ? "trước ăn " + d.td[6] : ""].filter(x => x && x !== "Không nêu").join("; ") : "";
  const ccd = uniq([hd.icd_ccd, ...d.qt.map(r => r.icd_ccd_tuyet_doi)]), kt = uniq([hd.icd_ccd_kiem_tra]), thtr = uniq(d.qt.map(r => r.icd_than_trong));
  const items = [];
  for (const r of D.tt) {
    const a = String(r.nhom_A).trim(), b = String(r.nhom_B).trim();
    let other = null; if (d.tags.has(a)) other = b; else if (d.tags.has(b)) other = a; else continue;
    const ds = D.dm.filter(x => x !== d && x.tags.has(other)).map(x => x.ten);
    if (!ds.length) continue;
    const key = r.muc_do + "|" + ds.join(",");
    const old = items.find(x => x.key === key);
    const add = (arr, v) => { if (v && !arr.includes(v)) arr.push(v); };
    if (old) { add(old.hq, r.hau_qua); add(old.xt, r.xu_tri); add(old.cc, r.co_che); add(old.ng, r.nguon); old.qd = old.qd || r.qd5948; if (r.dieu_kien_ccd) add(old.dk, r.dieu_kien_ccd); }
    else items.push({key, m: r.muc_do, hq: [r.hau_qua].filter(Boolean), xt: [r.xu_tri].filter(Boolean), cc: [r.co_che].filter(Boolean), ng: [r.nguon].filter(Boolean), dk: [r.dieu_kien_ccd].filter(Boolean), qd: r.qd5948, ds});
  }
  items.sort((x, y) => (MTT[x.m] ?? 9) - (MTT[y.m] ?? 9));
  const mcls = m => "m" + String(MTT[m] ?? 3).replace(".", "");
  const list = t => {
    const it = String(t || "").replace(/\r/g, "").split(/\n+|;\s+|(?:^|\s)[-–•●]\s+|(?:^|\s)\+\s+/).map(x => x.trim()).filter(x => x.length > 1);
    return it.length ? `<ul class="li">${it.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : '<p class="mut small" style="margin:0">Danh mục chưa có nội dung.</p>';
  };
  const box = (title, body, extra) => `<details class="fold"${extra || ""}><summary>${title}</summary><div class="foldin">${body}</div></details>`;
  const ruleDl = `<dl class="dl">${row("ICD đúng chỉ định", hd.icd_HDSD === "*" ? "Không đối chiếu ICD (thuốc triệu chứng/thủ thuật)" : hd.icd_HDSD)}${row("ICD chỉ định có điều kiện", hd.icd_HDSD_co_dieu_kien)}
    ${row("ICD bắt buộc kèm", hd.icd_can_kem)}${row("ICD chống chỉ định", ccd, "bad")}${row("ICD chống chỉ định – xác định mức độ", kt, "warnc")}${row("ICD thận trọng", thtr)}
    ${row("Căn cứ chống chỉ định", hd.ccd_can_cu)}
    ${row("Tuổi", [hd.tuoi_ccd ? "Chống chỉ định dưới " + hd.tuoi_ccd + " tuổi" : "", hd.tuoi_hdsd_tu ? "HDSD có chỉ định từ " + hd.tuoi_hdsd_tu + " tuổi" : ""].filter(Boolean).join("; "))}
    ${row("Giới hạn liều", lieu)}${row("Liều tóm tắt", hd.lieu_tom_tat)}${row("Ghi chú quy tắc", hd.ghi_chu)}
    ${row("Thời điểm dùng", tdv)}${row("Trích HDSD về cách uống", d.td ? d.td[7] : "")}${row("Nguồn quy tắc", [hd.nguon, hd.trang_thai].filter(Boolean).join(" · "))}</dl>`;
  const hdsdDl = `<dl class="dl">${row("Liều dùng", d.lieu)}${row("Cách dùng", d.cach)}${row("Thận trọng", d.tt)}${row("Phụ nữ có thai, cho con bú", d.pnct)}${row("Tương tác thuốc", d.tuongtac)}${row("Tác dụng không mong muốn", d.tdkmm)}${row("Ghi chú đối chiếu", d.gc)}</dl>
    ${d.link ? `<p class="small" style="margin:6px 0 0"><a href="${esc(d.link)}" target="_blank" rel="noopener">Mở tờ HDSD gốc (cần mạng)</a></p>` : ""}`;
  const ttHtml = items.length ? `<div class="tt">${items.map(x => `<div class="ttr ${mcls(x.m)}"><b>${esc(x.m)}</b>${x.qd ? " · QĐ 5948" : ""} – ${esc(x.hq.join("; "))}${x.dk.length ? `<br><span class="small">Điều kiện: ${esc(x.dk.join("; "))}</span>` : ""}<br><span class="mut">Với: ${esc(x.ds.join(", "))}</span><br><span class="small">Cơ chế: ${esc(x.cc.join("; "))}</span><br><span class="small">→ ${esc(x.xt.join(" | "))}</span><br><span class="small mut">Nguồn: ${esc(x.ng.join("; "))}</span></div>`).join("")}</div>` : '<p class="mut small" style="margin:0">Chưa có quy tắc tương tác nào với thuốc khác trong danh mục.</p>';
  const dcHtml = d.dc.map(v => `<div class="issue m1"><div class="t">${esc(v.loai)} – ${esc(v.so_van_ban)} (${esc(v.ngay_van_ban)})</div><p>${esc(v.pham_vi === "Toàn bộ" ? "Toàn bộ các lô" : "Lô " + (v.so_lo || "?") + (v.han_dung ? ", HD " + v.han_dung : ""))}${v.ly_do ? " – " + esc(v.ly_do) : ""}${v.so_dang_ky ? " – SĐK " + esc(v.so_dang_ky) : ""}</p>${v.link ? `<a class="small" href="${esc(v.link)}" target="_blank" rel="noopener">Xem văn bản</a>` : ""}</div>`).join("");
  $("info").innerHTML = `<h2>${esc(d.ten)}</h2>
    <p class="small mut" style="margin:0">${esc([d.hc, d.hl, d.dang, d.duong].filter(Boolean).join(" · "))}</p>
    <h3 class="sec">Chỉ định <span class="small mut">(theo tờ HDSD)</span></h3>${list(d.cd)}
    <h3 class="sec">Chống chỉ định <span class="small mut">(theo tờ HDSD)</span></h3>${list(d.ccd)}
    <div class="folds">
    ${d.dc.length ? box(`<span class="pill s1">Văn bản thu hồi (${d.dc.length})</span>`, dcHtml) : ""}
    ${box(`Tương tác & nguy cơ <span class="small mut">${items.length} nhóm</span>`, ttHtml)}
    ${box("Quy tắc kê đơn (ICD, liều, thời điểm uống)", ruleDl)}
    ${box("Liều dùng, thận trọng, tác dụng phụ… (tờ HDSD)", hdsdDl)}
    </div>`;
  $("info").hidden = false; $("info").scrollIntoView({behavior: "smooth", block: "start"});
}
function moThuoc(ten) {
  const k = norm(ten), d = D && (D.dm.find(x => x.k === k) || D.dm.find(x => x.k.replace(/ /g, "") === k.replace(/ /g, "")));
  if (!d) return;
  tab("tc"); $("q").value = d.ten; showHits(); showInfo(d);
}
showHits();

/* ---------- chụp ảnh → đọc chữ → rà soát ---------- */
async function prep(file) {
  const bmp = await createImageBitmap(file);
  const sc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));            // 1800 px đủ cho chữ in, đọc nhanh hơn
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const g = c.getContext("2d"); g.filter = "grayscale(1) contrast(1.35)"; g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return c;
}
let ocrProgress = () => {};
async function getOcr() {
  if (ocrWorker) return ocrWorker;
  while (!window.Tesseract) await new Promise(r => setTimeout(r, 100));
  const w = await Tesseract.createWorker("vie", 1, {
    workerPath: BASE + "vendor/tesseract/worker.min.js", corePath: BASE + "vendor/tesseract/", langPath: BASE + "vendor/lang",
    gzip: true, workerBlobURL: false, cacheMethod: "none",
    logger: m => { if (m.status === "recognizing text") ocrProgress(m.progress); }
  });
  await w.setParameters({preserve_interword_spaces: "1", tessedit_pageseg_mode: "6"});
  return (ocrWorker = w);
}
function setProg(p) { $("prog").hidden = p == null; $("progbar").style.width = Math.round((p || 0) * 100) + "%"; }
async function readPhotos(files) {
  if (!files.length) return;
  tab("rs");
  files = [...files].slice(0, 4);
  const isCv = f => f instanceof HTMLCanvasElement;
  $("thumbs").innerHTML = ""; files.forEach(f => { const im = document.createElement("img"); im.alt = "Ảnh đơn"; im.src = isCv(f) ? f.toDataURL("image/jpeg", 0.4) : URL.createObjectURL(f); $("thumbs").append(im); });
  ["sum", "acts", "ctbox"].forEach(id => $(id).hidden = true); $("issues").innerHTML = "";
  $("st").className = "status"; $("st").textContent = "Đang chuẩn bị bộ đọc chữ…"; setProg(0.02);
  $("scanBtn").disabled = true;
  scrollTo({top: 0, behavior: "smooth"});
  try {
    await dataReady;
    const imgs = await Promise.all(files.map(f => isCv(f) ? f : prep(f)));
    const w = await (ocrReady || getOcr()) || await getOcr();
    let text = "";
    for (let k = 0; k < imgs.length; k++) {
      ocrProgress = p => { setProg((k + p) / imgs.length); $("st").textContent = `Đang đọc chữ${imgs.length > 1 ? ` trang ${k + 1}/${imgs.length}` : ""}… ${Math.round(p * 100)}%`; };
      const { data } = await w.recognize(imgs[k]); text += data.text + "\n";
    }
    $("raw").textContent = text; $("rawbox").hidden = false;
    const d = parseOcr(text);
    if (!d.thuoc.length) throw new Error("không nhận ra dòng thuốc nào");
    fillForm(d, "· đọc từ ảnh – đối chiếu đơn giấy");
    const nk = d.khong_ro.length;
    const note = [nk ? `${nk} thuốc chưa khớp danh mục (khung vàng)` : "", d.icd_chinh.length ? "" : "chưa đọc được mã ICD", d.tuoi == null ? "chưa đọc được tuổi" : ""].filter(Boolean).join(", ");
    runReview();
    if (note) $("st").textContent += " · Cần kiểm tra: " + note;
  } catch (e) {
    $("st").className = "status err";
    $("st").textContent = "Chưa đọc được đơn từ ảnh (" + (e.message || e) + "). Chụp lại thẳng, đủ sáng, rõ chữ, hoặc nhập tay ở phần Dữ liệu đơn.";
  } finally { setProg(null); ocrProgress = () => {}; $("scanBtn").disabled = false; }
}


/* ---------- cài ra màn hình chính ---------- */
let installEvt = null;
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone;
let hideInstall = false; try { hideInstall = localStorage.getItem("an_cai_dat") === "1"; } catch {}
addEventListener("beforeinstallprompt", e => {
  e.preventDefault(); installEvt = e;
  if (!standalone() && !hideInstall) $("installbox").hidden = false;
});
$("installbtn").onclick = async () => {
  if (installEvt) {
    installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null;
    if (r && r.outcome === "accepted") $("installbox").hidden = true;
  } else {
    $("installtxt").innerHTML = huongDanCai();
  }
};
$("installno").onclick = () => { $("installbox").hidden = true; try { localStorage.setItem("an_cai_dat", "1"); } catch {} };
addEventListener("appinstalled", () => { $("installbox").hidden = true; });
// Chrome chưa báo được (đang tải lần đầu, hoặc trình duyệt khác): vẫn hiện hướng dẫn thủ công sau vài giây
setTimeout(() => { if (!standalone() && !hideInstall && $("installbox").hidden) { $("installbox").hidden = false; } }, 6000);

document.addEventListener("click", e => { const b = e.target.closest("[data-thuoc]"); if (b) moThuoc(b.dataset.thuoc); });

// nút "Cài app" luôn có ở thanh trên khi chưa cài
if (!standalone()) $("instTop").hidden = false;
$("instTop").onclick = () => { $("installbox").hidden = false; scrollTo({top: 0, behavior: "smooth"}); $("installbtn").click(); };
addEventListener("appinstalled", () => { $("instTop").hidden = true; });

/* hướng dẫn cài theo loại máy/trình duyệt */
function huongDanCai() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const inApp = /Zalo|FBAN|FBAV|FB_IAB|Instagram|Messenger|Line\/|; wv\)/i.test(ua);
  if (ios && !/Safari/i.test(ua) || ios && /CriOS|FxiOS|Zalo/i.test(ua))
    return "Trên iPhone phải dùng <b>Safari</b>: bấm <b>⋯</b> hoặc biểu tượng la bàn → <b>Mở trong Safari</b>, rồi làm theo bước dưới.";
  if (ios) return "Trên iPhone (Safari): bấm nút <b>Chia sẻ</b> (ô vuông có mũi tên lên, ở thanh dưới) → kéo xuống chọn <b>Thêm vào MH chính</b> → <b>Thêm</b>.";
  if (inApp) return "Trang đang mở trong trình duyệt của Zalo/Facebook nên không cài được. Bấm <b>⋮</b> góc trên bên phải → <b>Mở bằng Chrome</b> (hoặc <b>Mở trong trình duyệt</b>), rồi bấm lại nút Cài.";
  return "Trong Chrome: bấm nút <b>⋮</b> góc trên bên phải → <b>Thêm vào màn hình chính</b> (hoặc <b>Cài đặt ứng dụng</b>) → <b>Cài đặt</b>. Nếu menu không có mục này, bấm <b>⋮</b> → <b>Mở bằng Chrome</b> trước.";
}
$("installtxt").innerHTML = huongDanCai();
