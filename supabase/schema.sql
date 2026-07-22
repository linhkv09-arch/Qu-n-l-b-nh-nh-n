-- ============================================================
--  SCHEMA SUPABASE — Phần mềm Quản lý bệnh nhân Tai Mũi Họng
--  Chạy toàn bộ file này trong: Supabase Dashboard > SQL Editor > New query
--  (Chạy 1 lần khi thiết lập dự án. Chạy lại vẫn an toàn.)
-- ============================================================

-- ---------- 1) Bộ đếm mã bệnh nhân (BN0001, BN0002, ...) ----------
create sequence if not exists patient_code_seq;

-- ---------- 2) Bảng BỆNH NHÂN ----------
create table if not exists public.patients (
  id          text primary key,                -- id do app tạo (chuỗi ngắn)
  code        text unique default ('BN' || lpad(nextval('patient_code_seq')::text, 4, '0')),
  name        text not null,
  gender      text,
  birth_year  int,
  phone       text,
  job         text,
  address     text,
  note        text,
  created_at  bigint,                           -- epoch ms (do app cấp)
  updated_at  bigint
);

-- ---------- 3) Bảng KHÁM BỆNH ----------
create table if not exists public.visits (
  id             text primary key,
  patient_id     text references public.patients(id) on delete cascade,
  date           date,
  reason         text,
  symptoms       text,
  diagnosis      text,
  treatment      text,
  meds           jsonb default '[]'::jsonb,      -- [{name,qty,unit,usage}]
  advice         text,
  medications    text,                           -- (cũ) đơn thuốc dạng chữ tự do
  fee            bigint default 0,
  follow_up_date date,
  follow_up_note text,
  images         jsonb default '[]'::jsonb,      -- [{id,kind,caption,path}]
  created_at     bigint,
  updated_at     bigint
);
create index if not exists visits_patient_id_idx on public.visits (patient_id);
create index if not exists visits_date_idx on public.visits (date);

-- ---------- 4) Bảng PHẪU THUẬT ----------
create table if not exists public.surgeries (
  id             text primary key,
  patient_id     text references public.patients(id) on delete cascade,
  date           date,
  type           text,
  anesthesia     text,
  paid           text,
  diagnosis      text,
  procedure      text,
  result         text,
  complication   text,
  fee            bigint default 0,
  follow_up_date date,
  follow_up_note text,
  images         jsonb default '[]'::jsonb,
  created_at     bigint,
  updated_at     bigint
);
create index if not exists surgeries_patient_id_idx on public.surgeries (patient_id);
create index if not exists surgeries_date_idx on public.surgeries (date);

-- ---------- 5) Bảng CẤU HÌNH (settings phòng khám...) ----------
create table if not exists public.app_meta (
  key   text primary key,
  value jsonb
);

-- ============================================================
--  ROW LEVEL SECURITY
--  Chỉ người dùng ĐÃ ĐĂNG NHẬP mới đọc/ghi. Khách (anon) không thấy gì.
--  Mọi tài khoản dùng CHUNG dữ liệu (mô hình 1 phòng khám).
-- ============================================================
alter table public.patients  enable row level security;
alter table public.visits    enable row level security;
alter table public.surgeries enable row level security;
alter table public.app_meta  enable row level security;

drop policy if exists "patients_auth_all"  on public.patients;
drop policy if exists "visits_auth_all"    on public.visits;
drop policy if exists "surgeries_auth_all" on public.surgeries;
drop policy if exists "app_meta_auth_all"  on public.app_meta;

create policy "patients_auth_all"  on public.patients  for all to authenticated using (true) with check (true);
create policy "visits_auth_all"    on public.visits    for all to authenticated using (true) with check (true);
create policy "surgeries_auth_all" on public.surgeries for all to authenticated using (true) with check (true);
create policy "app_meta_auth_all"  on public.app_meta  for all to authenticated using (true) with check (true);

-- ============================================================
--  STORAGE — bucket chứa ảnh (nội soi, đơn thuốc, trước/sau mổ)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('medical-images', 'medical-images', true)
on conflict (id) do nothing;

drop policy if exists "images_public_read"  on storage.objects;
drop policy if exists "images_auth_insert"  on storage.objects;
drop policy if exists "images_auth_update"  on storage.objects;
drop policy if exists "images_auth_delete"  on storage.objects;

-- Xem ảnh: công khai (đường dẫn ảnh là chuỗi ngẫu nhiên khó đoán)
create policy "images_public_read" on storage.objects
  for select using (bucket_id = 'medical-images');
-- Tải lên / sửa / xóa ảnh: chỉ người đã đăng nhập
create policy "images_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'medical-images');
create policy "images_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'medical-images');
create policy "images_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'medical-images');

-- ============================================================
--  REALTIME — để nhiều thiết bị tự cập nhật khi có thay đổi
-- ============================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.patients;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.visits;
  exception when duplicate_object then null; end;
  begin
    alter publication supabase_realtime add table public.surgeries;
  exception when duplicate_object then null; end;
end $$;

-- ============================================================
--  XONG. Bước tiếp theo: tạo tài khoản đăng nhập trong
--  Authentication > Users > Add user (email + mật khẩu),
--  và tắt đăng ký công khai ở Authentication > Providers > Email
--  (bỏ tùy chọn "Allow new users to sign up").
-- ============================================================
