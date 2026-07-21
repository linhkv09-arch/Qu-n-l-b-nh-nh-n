# Phần mềm Quản lý bệnh nhân Tai Mũi Họng

Ứng dụng web quản lý bệnh nhân khám bệnh và phẫu thuật cho bác sĩ chuyên khoa Tai Mũi Họng.
Chạy trực tiếp trên trình duyệt, **không cần cài đặt**, dữ liệu lưu ngay trên máy.

## Tính năng

- **Quản lý bệnh nhân**: hồ sơ, tìm kiếm, lịch sử khám theo dòng thời gian.
- **Khám bệnh**: triệu chứng, chẩn đoán, điều trị; đính kèm ảnh nội soi & đơn thuốc.
- **Kê & in đơn thuốc**: nhập thuốc có cấu trúc, in đơn khổ A5 theo mẫu (tự điền thông tin bệnh nhân).
- **Phẫu thuật**: thông tin ca mổ, ảnh trước/sau mổ, lịch tái khám.
- **Nhắc lịch tái khám**: danh sách sắp đến hạn / quá hạn ngay trang chủ.
- **Báo cáo**: số lượng khám/phẫu thuật, theo chẩn đoán, doanh thu.
- **Sao lưu / Phục hồi**: xuất và nhập lại toàn bộ dữ liệu (kèm ảnh).

## Cách sử dụng

Mở file `index.html` bằng **Google Chrome** hoặc **Microsoft Edge**.
Xem chi tiết trong `HƯỚNG DẪN SỬ DỤNG.txt`.

## Công nghệ

- HTML, CSS, JavaScript thuần (không framework, không cần build).
- Lưu trữ dữ liệu và ảnh bằng **IndexedDB** (trong trình duyệt).

## Lưu ý bảo mật

Dữ liệu bệnh nhân được lưu **cục bộ trên máy**, không gửi lên internet.
File sao lưu (`sao-luu-benh-nhan-*.json`) chứa dữ liệu bệnh nhân nên **không** được đưa lên kho Git (đã loại trừ trong `.gitignore`).
