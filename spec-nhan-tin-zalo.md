# Mô tả kỹ thuật: Chức năng nhắn tin Zalo chăm sóc khách hàng

## 1. Mục tiêu
Thêm vào hệ thống quản lý bệnh nhân hiện có (Supabase + Vercel) chức năng:
- Tự động soạn nội dung thông báo tình trạng bệnh ngay sau khi lưu kết quả khám.
- Nhắc lịch tái khám cho bệnh nhân đến hạn.
- Gửi bằng cách mở Zalo và dán nội dung thủ công (không dùng Zalo OA/API chính thức).

## 2. Thay đổi dữ liệu (Supabase)

Bảng mới: `message_templates`
| Trường | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | khóa chính |
| loai | text | `sau_kham` \| `nhac_tai_kham` |
| noi_dung_mau | text | nội dung mẫu, chứa placeholder |
| cap_nhat_luc | timestamp | |

Bảng mới: `tin_nhan_da_gui` (lịch sử gửi, phục vụ tra cứu/audit)
| Trường | Kiểu | Ghi chú |
|---|---|---|
| id | uuid | khóa chính |
| benh_nhan_id | uuid | FK → bảng bệnh nhân |
| loai | text | `sau_kham` \| `nhac_tai_kham` |
| noi_dung_da_gui | text | nội dung sau khi nhân viên chỉnh sửa (nếu có) |
| trang_thai | text | `da_soan` \| `da_gui` (nhân viên tự đánh dấu) |
| gui_luc | timestamp | |

Cần thêm 1 trường mới vào bảng bệnh nhân (hoặc bảng lượt khám, nếu điều trị/chẩn đoán đang lưu theo từng lượt khám): `loi_ran` (text) — lời dặn dò/lưu ý của bác sĩ sau khám, dùng để điền vào placeholder `{loi_ran}`. Các trường còn lại dùng lại: họ tên, số điện thoại, chẩn đoán, điều trị, ngày tái khám dự kiến.

## 3. Placeholder trong mẫu nội dung
```
{ho_ten}, {chan_doan}, {dieu_tri}, {loi_ran}, {ngay_kham}, {ngay_tai_kham}
```
Mẫu mặc định ban đầu (seed data), bác sĩ chỉnh sau trong màn hình Cài đặt:

- **Sau khám:**
  "Chào {ho_ten}, sau buổi khám ngày {ngay_kham}, bác sĩ chẩn đoán: {chan_doan}. Hướng điều trị: {dieu_tri} và {loi_ran}. Vui lòng tái khám vào {ngay_tai_kham}, nếu có bất thường xin liên hệ bác sĩ."

- **Nhắc tái khám:**
  "Chào {ho_ten}, đã đến hẹn tái khám ngày {ngay_tai_kham}. Vui lòng liên hệ bác sĩ để hẹn lịch."

## 4. Luồng xử lý

### 4.1 Sau khi lưu kết quả khám
1. Bác sĩ lưu kết quả khám (chẩn đoán, điều trị, ngày tái khám) như hiện tại.
2. Hệ thống tự động: lấy mẫu `sau_kham`, thay placeholder bằng dữ liệu bệnh nhân, tạo 1 bản ghi trong `tin_nhan_da_gui` với `trang_thai = da_soan`.
3. Giao diện hiển thị hộp thoại/khu vực "Tin nhắn Zalo" ngay dưới kết quả khám, gồm:
   - Ô textarea chứa nội dung (đã điền sẵn, sửa được).
   - Nút **"Sao chép nội dung"** (copy vào clipboard).
   - Nút **"Mở Zalo"** → mở tab mới tới `https://zalo.me/<so_dien_thoai>`.
   - Nút **"Đánh dấu đã gửi"** → cập nhật `trang_thai = da_gui`, lưu `noi_dung_da_gui`, `gui_luc`.

### 4.2 Nhắc tái khám
1. Job chạy khi tải trang Dashboard (không cần cron nền, vì đã có "xuất danh sách" tương tự trước đó): quét các bệnh nhân có `ngay_tai_kham` = hôm nay hoặc đã qua mà chưa tái khám.
2. Hiển thị danh sách "Cần nhắc tái khám hôm nay", mỗi dòng có:
   - Tên, số điện thoại, ngày tái khám.
   - Nút xem/sửa nội dung mẫu `nhac_tai_kham` (mở cùng loại hộp thoại như 4.1).
   - Nút "Sao chép" + "Mở Zalo" + "Đánh dấu đã gửi".
3. Bệnh nhân đã "Đánh dấu đã gửi" sẽ ẩn khỏi danh sách nhắc của ngày đó (nhưng vẫn xuất hiện lại nếu vẫn chưa tái khám vào lần quét sau, tuỳ theo cấu hình - có thể để bác sĩ chọn "ẩn vĩnh viễn" hoặc "nhắc lại sau N ngày").

## 5. Giao diện cần thêm
- Component `ZaloMessageBox`: dùng chung cho cả 2 luồng (sau khám / nhắc tái khám), nhận props `benhNhan`, `loaiTinNhan`.
- Trang/section **Cài đặt mẫu tin nhắn**: cho bác sĩ chỉnh 2 mẫu ở mục 3.
- Mục **"Cần nhắc tái khám hôm nay"** trên Dashboard.

## 6. Xử lý số điện thoại
Chuẩn hóa số điện thoại về định dạng quốc tế trước khi tạo link (VD: `0901234567` → `84901234567`) để link `https://zalo.me/84901234567` mở đúng.

## 7. Giới hạn kỹ thuật cần lưu ý
- Zalo cá nhân không có API cho phép điền sẵn nội dung tin nhắn qua link — nhân viên vẫn phải dán (paste) nội dung đã copy vào khung chat Zalo thủ công.
- Không cần đăng ký Zalo OA/ZNS ở giai đoạn này.
