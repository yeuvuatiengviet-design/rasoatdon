/* Service worker: lưu ứng dụng trên máy để dùng không cần mạng; khi có mạng tự lấy bản mới của quy tắc */
const SHELL = "rasoatdon-app-v19", VENDOR = "rasoatdon-vendor-v1";
const FILES = ["./", "index.html", "app.js", "scan.js", "style.css", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "py/chay_app.py.txt", "py/dinh_chi.py.txt", "py/ghi_chu_ds.py.txt", "py/ra_soat.py.txt", "py/shim_openpyxl.py.txt", "py/thoi_diem.py.txt", "py/tuong_tac.py.txt", "data/danh_muc.json", "data/chan_doan.json", "data/ghi_chu.json", "data/quy_tac.json", "data/thoi_diem.json", "data/version.json", "vendor/pyodide/pyodide-lock.json", "vendor/pyodide/pyodide.asm.js", "vendor/pyodide/pyodide.asm.wasm", "vendor/pyodide/pyodide.js", "vendor/pyodide/python_stdlib.zip", "vendor/tesseract/tesseract-core-lstm.js", "vendor/tesseract/tesseract-core-lstm.wasm", "vendor/tesseract/tesseract-core-lstm.wasm.js", "vendor/tesseract/tesseract-core-simd-lstm.js", "vendor/tesseract/tesseract-core-simd-lstm.wasm", "vendor/tesseract/tesseract-core-simd-lstm.wasm.js", "vendor/tesseract/tesseract.min.js", "vendor/tesseract/worker.min.js", "vendor/lang/vie.traineddata.gz", "py/tai_kham.py.txt"];
self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const v = await caches.open(VENDOR), a = await caches.open(SHELL);
    await Promise.all(FILES.map(async f => { const c = f.startsWith("vendor/") ? v : a; if (!(await c.match(f))) await c.add(f); }));
    self.skipWaiting();
  })());
});
self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== SHELL && k !== VENDOR) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.includes("/vendor/")) {          // thư viện lớn: lấy trên máy trước
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { const cp = res.clone(); caches.open(VENDOR).then(c => c.put(e.request, cp)); return res; })));
    return;
  }
  e.respondWith((async () => {                    // quy tắc, danh mục, giao diện: có mạng thì lấy bản mới, không có mạng dùng bản đã lưu
    try {
      const res = await fetch(e.request, {cache: "no-store"});
      if (res.ok) { const cp = res.clone(); caches.open(SHELL).then(c => c.put(e.request, cp)); }
      return res;
    } catch {
      return (await caches.match(e.request, {ignoreSearch: true})) || (await caches.match("index.html"));
    }
  })());
});
