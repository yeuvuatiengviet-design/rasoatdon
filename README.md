# Rà soát đơn ngoại trú – Khoa Dược BVĐK Phú Xuyên

Ứng dụng điện thoại (cài từ trình duyệt) chụp đơn thuốc ngoại trú BHYT đã đánh máy, đọc chữ ngay trên máy và rà soát theo bộ quy tắc của Khoa Dược. **Không cần mạng khi dùng**; chỉ cần mạng để nhận bản quy tắc mới.

## Cài lên điện thoại Android
1. Mở Chrome trên điện thoại, vào địa chỉ GitHub Pages của kho này (Settings → Pages).
2. Đợi chữ "Sẵn sàng" hiện ở đầu trang (lần đầu tải khoảng 30 MB, nên dùng Wi-Fi).
3. Bấm menu ⋮ → **Thêm vào màn hình chính** (hoặc **Cài đặt ứng dụng**).
4. Từ đó mở bằng biểu tượng "Rà soát đơn" như một ứng dụng bình thường, kể cả khi tắt mạng.

## Dùng
1. **Chụp ảnh đơn** (hoặc chọn ảnh có sẵn; đơn nhiều trang chọn nhiều ảnh).
2. Kiểm tra tuổi, ngày kê, ICD, thuốc, số lượng, cách dùng; sửa chỗ đọc sai. Thuốc viền vàng là chưa khớp danh mục.
3. **Rà soát đơn** → vấn đề theo mức Nghiêm trọng / Cần lưu ý / Tham khảo. "Sao chép" hoặc "Gửi" để trao đổi với bác sĩ (không có họ tên BN).

## Cập nhật
Khi có mạng, ứng dụng tự lấy bộ quy tắc mới (danh mục, tương tác, công văn thu hồi…). Bấm "Kiểm tra cập nhật" để kiểm tra ngay.
Tệp quy tắc: `data/quy_tac.json` (từ Bang_tra_cuu_ra_soat.xlsx), `data/danh_muc.json`, `data/version.json`; bộ máy rà soát: `py/*.py.txt`.

## Riêng tư
Ảnh đơn và chữ đọc được chỉ xử lý trên điện thoại, không gửi đi đâu. Kho chỉ chứa danh mục thuốc và bộ quy tắc, không có dữ liệu bệnh nhân.

Thư viện đóng gói kèm: Pyodide 0.27.7 (MPL-2.0), Tesseract.js 6.0.1 / tesseract.js-core 6.0.0 (Apache-2.0), dữ liệu tiếng Việt tessdata (Apache-2.0).
