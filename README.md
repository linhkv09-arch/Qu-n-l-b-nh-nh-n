# Phần mềm Quản lý bệnh nhân Tai Mũi Họng

Ứng dụng web quản lý bệnh nhân khám bệnh và phẫu thuật cho bác sĩ chuyên khoa Tai Mũi Họng.
**Lưu dữ liệu trên cloud (Supabase)** — nhiều thiết bị (máy tính, điện thoại) cùng truy cập,
cập nhật **theo thời gian thực**, có **đăng nhập** riêng cho từng người.

## Tính năng

- **Quản lý bệnh nhân**: hồ sơ, tìm kiếm, lịch sử khám theo dòng thời gian.
- **Khám bệnh**: triệu chứng, chẩn đoán, điều trị; đính kèm ảnh nội soi & đơn thuốc.
- **Kê & in đơn thuốc**: nhập thuốc có cấu trúc, in đơn khổ A5 theo mẫu.
- **Phẫu thuật**: thông tin ca mổ, ảnh trước/sau mổ, lịch tái khám.
- **Nhắc lịch tái khám** + **Báo cáo thống kê**.
- **Đăng nhập** (Supabase Auth) + **đồng bộ realtime** đa thiết bị.
- **Ảnh** lưu trên Supabase Storage.

## Công nghệ

- Giao diện: HTML/CSS/JavaScript thuần (các module trong `public/js`).
- Build/dev: **Vite**. Backend dữ liệu: **Supabase** (Postgres + Auth + Storage + Realtime).
- Triển khai: **Vercel**.

## Cấu trúc thư mục

```
index.html            – trang chính (entry của Vite)
src/main.js           – tạo Supabase client, đăng nhập, realtime
public/js/*.js         – các module giao diện (db.js = tầng dữ liệu Supabase)
public/css/styles.css  – giao diện
supabase/schema.sql    – tạo bảng, RLS, Storage, realtime (chạy trong Supabase)
migrate/import-backup.mjs – script nhập dữ liệu cũ (nếu có)
.env.example           – mẫu biến môi trường
```

## Thiết lập nhanh

1. Tạo dự án Supabase, chạy `supabase/schema.sql`, tạo tài khoản đăng nhập.
2. Deploy lên Vercel, thêm 2 biến môi trường `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
3. Mở link Vercel, đăng nhập.

Chi tiết từng bước: xem **HƯỚNG DẪN TRIỂN KHAI (Supabase + Vercel).txt**.

## Chạy thử ở máy (tùy chọn, cần Node.js)

```bash
npm install
cp .env.example .env      # rồi điền URL + anon key
npm run dev
```

## Bảo mật

- Dữ liệu chỉ truy cập được sau khi **đăng nhập** (RLS bật trên mọi bảng).
- Chỉ dùng khóa **anon public** cho web; khóa **service_role** chỉ dùng cục bộ cho migration.
- File `.env` và bản sao lưu `.json` **không** được đưa lên Git (đã cấu hình `.gitignore`).
