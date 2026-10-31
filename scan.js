/* Quét đơn: camera trực tiếp có khung căn lề + gợi ý (ánh sáng, độ nét), chụp → kéo 4 góc cho khớp tờ đơn → làm phẳng ảnh → đọc chữ.
   Không có camera trực tiếp (trình duyệt cũ, chưa cho quyền) thì mở camera hệ thống như cũ, vẫn qua bước căn góc. */
(() => {
  const S = {stream: null, track: null, timer: 0, pages: [], img: null, pts: null, from: null};
  const el = id => document.getElementById(id);
  const RATIO = 1.414;                                   // khổ A4/A5 dọc

  /* ---------- màn hình camera ---------- */
  async function openScanner() {
    S.pages = S.from === "more" ? S.pages : [];
    if (!navigator.mediaDevices?.getUserMedia) return el("cam").click();
    show("scan");
    el("scanHint").textContent = "Đang mở camera…";
    try {
      S.stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: "environment"}, width: {ideal: 2560}, height: {ideal: 1920}}, audio: false});
    } catch (e) {
      hide("scan");
      el("st").className = "status"; el("st").textContent = "Không mở được camera trong app (chưa cấp quyền). Dùng camera của máy – sau khi chụp vẫn căn được 4 góc.";
      return el("cam").click();
    }
    const v = el("video"); v.srcObject = S.stream; await v.play().catch(() => {});
    S.track = S.stream.getVideoTracks()[0];
    const caps = S.track.getCapabilities ? S.track.getCapabilities() : {};
    el("torch").hidden = !caps.torch;
    el("pageNo").textContent = S.pages.length ? `Trang ${S.pages.length + 1}` : "";
    layoutGuide(); S.timer = setInterval(checkQuality, 450);
  }
  function stopCamera() {
    clearInterval(S.timer);
    if (S.stream) S.stream.getTracks().forEach(t => t.stop());
    S.stream = S.track = null;
  }
  function guideRect() {                                  // khung căn lề trên màn hình (px)
    const box = el("scan").getBoundingClientRect(), top = 64, bottom = 150;
    const availH = box.height - top - bottom, availW = box.width * 0.9;
    let w = availW, h = w * RATIO; if (h > availH) { h = availH; w = h / RATIO; }
    return {x: (box.width - w) / 2, y: top + (availH - h) / 2, w, h};
  }
  function layoutGuide() {
    const g = guideRect(), f = el("frame");
    Object.assign(f.style, {left: g.x + "px", top: g.y + "px", width: g.w + "px", height: g.h + "px"});
  }
  addEventListener("resize", () => { if (!el("scan").hidden) layoutGuide(); });
  function videoMap() {                                   // màn hình ↔ toạ độ video (object-fit: cover)
    const v = el("video"), box = v.getBoundingClientRect(), vw = v.videoWidth, vh = v.videoHeight;
    const s = Math.max(box.width / vw, box.height / vh);
    return {s, ox: (box.width - vw * s) / 2, oy: (box.height - vh * s) / 2, vw, vh};
  }
  const small = document.createElement("canvas");
  function checkQuality() {
    const v = el("video"); if (!v.videoWidth) return;
    const m = videoMap(), g = guideRect();
    const sx = (g.x - m.ox) / m.s, sy = (g.y - m.oy) / m.s, sw = g.w / m.s, sh = g.h / m.s;
    small.width = 120; small.height = Math.round(120 * RATIO);
    const c = small.getContext("2d", {willReadFrequently: true}); c.drawImage(v, sx, sy, sw, sh, 0, 0, small.width, small.height);
    const d = c.getImageData(0, 0, small.width, small.height).data, W = small.width, H = small.height;
    const L = new Float32Array(W * H); let sum = 0;
    for (let i = 0; i < W * H; i++) { L[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]; sum += L[i]; }
    const mean = sum / (W * H);
    let lv = 0, n = 0;                                    // độ nét: phương sai Laplacian
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, q = 4 * L[i] - L[i - 1] - L[i + 1] - L[i - W] - L[i + W]; lv += q * q; n++;
    }
    lv /= n;
    let msg, ok = false;
    if (mean < 75) msg = "Thiếu sáng – ra chỗ sáng hơn" + (el("torch").hidden ? "" : " hoặc bật đèn");
    else if (mean > 250) msg = "Quá chói – nghiêng máy tránh lóa";
    else if (lv < 90) msg = "Chưa nét – giữ yên máy, đưa gần hơn cho tờ đơn vừa khung";
    else { msg = "Tốt – bấm chụp"; ok = true; }
    el("scanHint").textContent = msg; el("frame").classList.toggle("ok", ok);
  }
  async function snap() {
    const v = el("video"); if (!v.videoWidth) return;
    const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    const m = videoMap(), g = guideRect();
    const P = (x, y) => [(x - m.ox) / m.s, (y - m.oy) / m.s];
    const pts = [P(g.x, g.y), P(g.x + g.w, g.y), P(g.x + g.w, g.y + g.h), P(g.x, g.y + g.h)]
      .map(([x, y]) => [Math.min(c.width, Math.max(0, x)), Math.min(c.height, Math.max(0, y))]);
    stopCamera(); hide("scan");
    openCrop(c, pts);
  }

  /* ---------- màn hình căn 4 góc ---------- */
  function openCrop(canvas, pts) {
    S.img = canvas; S.pts = pts || [[0.04, 0.04], [0.96, 0.04], [0.96, 0.96], [0.04, 0.96]].map(([a, b]) => [a * canvas.width, b * canvas.height]);
    show("crop");
    const cv = el("cropImg"); cv.width = canvas.width; cv.height = canvas.height; cv.getContext("2d").drawImage(canvas, 0, 0);
    requestAnimationFrame(drawCrop);
  }
  function cropMap() {
    const cv = el("cropImg"), r = cv.getBoundingClientRect(), host = el("cropBox").getBoundingClientRect();
    return {s: r.width / S.img.width, ox: r.left - host.left, oy: r.top - host.top};
  }
  function drawCrop() {
    const m = cropMap(), q = S.pts.map(([x, y]) => [m.ox + x * m.s, m.oy + y * m.s]);
    el("cropPoly").setAttribute("points", q.map(p => p.join(",")).join(" "));
    q.forEach(([x, y], i) => { const h = el("h" + i); h.style.left = x + "px"; h.style.top = y + "px"; });
  }
  addEventListener("resize", () => { if (!el("crop").hidden) drawCrop(); });
  [0, 1, 2, 3].forEach(i => {
    const h = el("h" + i);
    h.addEventListener("pointerdown", e => {
      e.preventDefault(); h.setPointerCapture(e.pointerId);
      const move = ev => {
        const m = cropMap(), host = el("cropBox").getBoundingClientRect();
        S.pts[i] = [Math.min(S.img.width, Math.max(0, (ev.clientX - host.left - m.ox) / m.s)), Math.min(S.img.height, Math.max(0, (ev.clientY - host.top - m.oy) / m.s))];
        drawCrop();
      };
      const up = () => { h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", up); };
      h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", up);
    });
  });
  function rotate() {
    const c = S.img, r = document.createElement("canvas"); r.width = c.height; r.height = c.width;
    const g = r.getContext("2d"); g.translate(r.width, 0); g.rotate(Math.PI / 2); g.drawImage(c, 0, 0);
    S.pts = S.pts.map(([x, y]) => [c.height - y, x]); S.pts = [S.pts[3], S.pts[0], S.pts[1], S.pts[2]];
    openCrop(r, S.pts);
  }
  /* làm phẳng ảnh theo 4 góc (phép chiếu phối cảnh), chuyển xám + tăng tương phản */
  function homography(src, dst) {                        // tìm H: dst → src
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = dst[i], [u, v] = src[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    for (let c = 0; c < 8; c++) {                         // khử Gauss
      let p = c; for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      for (let r = 0; r < 8; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k]; b[r] -= f * b[c]; }
    }
    return b.map((v, i) => v / A[i][i]).concat(1);
  }
  function warp() {
    const [a, b, c, d] = S.pts, len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const wSrc = (len(a, b) + len(d, c)) / 2, hSrc = (len(a, d) + len(b, c)) / 2;
    const W = Math.round(Math.min(1800, Math.max(900, wSrc))), H = Math.round(W * hSrc / wSrc);
    const h = homography(S.pts, [[0, 0], [W, 0], [W, H], [0, H]]);
    const sd = S.img.getContext("2d").getImageData(0, 0, S.img.width, S.img.height).data, SW = S.img.width, SH = S.img.height;
    const out = document.createElement("canvas"); out.width = W; out.height = H;
    const g = out.getContext("2d"), od = g.createImageData(W, H), o = od.data;
    let lo = 255, hi = 0; const gray = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const z = h[6] * x + h[7] * y + 1, u = (h[0] * x + h[1] * y + h[2]) / z, v = (h[3] * x + h[4] * y + h[5]) / z;
      const ui = u | 0, vi = v | 0; let L = 255;
      if (ui >= 0 && vi >= 0 && ui < SW && vi < SH) { const k = (vi * SW + ui) * 4; L = 0.299 * sd[k] + 0.587 * sd[k + 1] + 0.114 * sd[k + 2]; }
      gray[y * W + x] = L;
    }
    const hist = new Uint32Array(256); gray.forEach(v => hist[v]++);   // kéo giãn tương phản (bỏ 1% hai đầu)
    let acc = 0; for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > W * H * 0.01) { lo = i; break; } }
    acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > W * H * 0.01) { hi = i; break; } }
    const k = 255 / Math.max(30, hi - lo);
    for (let i = 0; i < W * H; i++) { const v = Math.max(0, Math.min(255, (gray[i] - lo) * k)); o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; o[i * 4 + 3] = 255; }
    g.putImageData(od, 0, 0);
    return out;
  }
  function usePage() {
    S.pages.push(warp()); hide("crop");
    el("moreTxt").textContent = `Đã có ${S.pages.length} trang. Đơn còn trang nữa không?`;
    show("more");
  }
  function finish() { hide("more"); const p = S.pages; S.pages = []; S.from = null; window.readPhotos(p); }

  /* ---------- chọn ảnh có sẵn → căn góc ---------- */
  async function fileToCanvas(f) {
    const bmp = await createImageBitmap(f, {imageOrientation: "from-image"}).catch(() => createImageBitmap(f));
    const sc = Math.min(1, 2600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); return c;
  }
  async function fromFiles(files) {
    files = [...files]; if (!files.length) return;
    if (files.length > 1) return window.readPhotos(files);      // nhiều ảnh: đọc thẳng
    openCrop(await fileToCanvas(files[0]));
  }

  /* ---------- tiện ích ---------- */
  function show(id) { el(id).hidden = false; document.body.classList.add("noscroll"); }
  function hide(id) { el(id).hidden = true; if (["scan", "crop", "more"].every(x => el(x).hidden)) document.body.classList.remove("noscroll"); }
  el("scanBtn").onclick = () => { S.from = null; openScanner(); };
  el("snap").onclick = snap;
  el("scanClose").onclick = () => { stopCamera(); hide("scan"); };
  el("torch").onclick = async () => {
    if (!S.track) return; S.torch = !S.torch;
    try { await S.track.applyConstraints({advanced: [{torch: S.torch}]}); el("torch").classList.toggle("on", S.torch); } catch {}
  };
  el("cropRetake").onclick = () => { hide("crop"); S.from = S.pages.length ? "more" : null; openScanner(); };
  el("cropRotate").onclick = rotate;
  el("cropFull").onclick = () => { S.pts = [[0, 0], [S.img.width, 0], [S.img.width, S.img.height], [0, S.img.height]]; drawCrop(); };
  el("cropOk").onclick = usePage;
  el("moreYes").onclick = () => { hide("more"); S.from = "more"; openScanner(); };
  el("moreNo").onclick = finish;
  el("cam").onchange = async e => { const f = e.target.files; if (f.length) openCrop(await fileToCanvas(f[0])); e.target.value = ""; };
  el("pick").onchange = e => { fromFiles(e.target.files); e.target.value = ""; };
})();
