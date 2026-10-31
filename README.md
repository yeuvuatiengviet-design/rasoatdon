# Rà soát đơn ngoại trú – Khoa Dược BVĐK Phú Xuyên

Ứng dụng điện thoại (cài từ trình duyệt) chụp đơn thuốc ngoại trú BHYT đã đánh máy, đọc chữ ngay trên máy và rà soát theo bộ quy tắc của Khoa Dược. **Không cần mạng khi dùng**; chỉ cần mạng để nhận bản quy tắc mới.

## Cài lên điện thoại Android
1. Mở Chrome trên điện thoại, vào địa chỉ GitHub Pages của kho này (Settings → Pages).
2. Đợi chữ "Sẵn sàng" hiện ở đầu trang (lần đầu tải khoảng 30 MB, nên dùng Wi-Fi).
3. Bấm menu ⋮ → **Thêm vào màn hình chính** (hoặc **Cài đặt ứng dụng**).
4. Từ đó mở bằng biểu tượng "Rà soát đơn" như một ứng dụng bình thường, kể cả khi tắt mạng.

## Dùng
**Tab Rà soát đơn**
1. Bấm **Chụp đơn** ở thanh dưới (hoặc **Chọn ảnh**; đơn nhiều trang chọn nhiều ảnh). Kết quả hiện ngay ở đầu trang.
2. Kiểm tra phần Dữ liệu đơn; sửa chỗ đọc sai – kết quả tự cập nhật. Thuốc khung vàng là chưa khớp danh mục.
3. "Sao chép" hoặc "Gửi Zalo/tin nhắn" để trao đổi với bác sĩ (không có họ tên BN).

**Tab Tra cứu thuốc** – gõ tên thuốc/hoạt chất (hoặc mã ICD để xem thuốc có chỉ định đó): ICD đúng chỉ định, ICD chống chỉ định theo tờ HDSD, giới hạn liều, thời điểm dùng, văn bản thu hồi, chỉ định/CCĐ theo tờ HDSD và các thuốc trong danh mục có tương tác.

## Cập nhật
Khi có mạng, ứng dụng tự lấy bộ quy tắc mới (danh mục, tương tác, công văn thu hồi…). Bấm "Kiểm tra cập nhật" để kiểm tra ngay.
Tệp quy tắc: `data/quy_tac.json` (từ Bang_tra_cuu_ra_soat.xlsx), `data/danh_muc.json`, `data/version.json`; bộ máy rà soát: `py/*.py.txt`.

## Riêng tư
Ảnh đơn và chữ đọc được chỉ xử lý trên điện thoại, không gửi đi đâu. Kho chỉ chứa danh mục thuốc và bộ quy tắc, không có dữ liệu bệnh nhân.

Thư viện đóng gói kèm: Pyodide 0.27.7 (MPL-2.0), Tesseract.js 6.0.1 / tesseract.js-core 6.0.0 (Apache-2.0), dữ liệu tiếng Việt tessdata (Apache-2.0).
