/* ============================================================
 * db.js — Tầng lưu trữ dữ liệu bằng SUPABASE (Postgres + Storage)
 *
 * Giữ NGUYÊN giao diện (API) như bản IndexedDB cũ để các module
 * khác không phải sửa: all/get/put/del/byIndex/getMeta/setMeta...
 *
 * Client Supabase được tạo trong src/main.js và gán vào window.sb.
 * Ảnh (nội soi/đơn thuốc/mổ) được tải lên Storage bucket 'medical-images'.
 * ============================================================ */

const DB = (function () {
  const BUCKET = "medical-images";
  // tên "store" trong app  ->  tên bảng trong Postgres
  const TABLE = {
    patients: "patients",
    visits: "visits",
    surgeries: "surgeries",
    meta: "app_meta",
  };

  function sb() {
    if (!window.sb) throw new Error("Chưa kết nối Supabase (window.sb chưa sẵn sàng).");
    return window.sb;
  }

  // ---- Chuyển tên field: camelCase (app) <-> snake_case (Postgres) ----
  function camelToSnake(k) {
    return k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
  }
  function snakeToCamel(k) {
    return k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  }
  // Chỉ đổi tên khóa ở cấp cao nhất; giữ nguyên nội dung meds/images (JSONB)
  const PASS = { meds: 1, images: 1 };
  function toRow(obj) {
    const out = {};
    for (const k in obj) {
      if (PASS[k]) {
        out[k] = obj[k];
        continue;
      }
      let v = obj[k];
      if (v === "") v = null; // "" -> null (an toàn cho cột date/int)
      out[camelToSnake(k)] = v;
    }
    return out;
  }
  const NUMERIC = { created_at: 1, updated_at: 1 };
  function fromRow(row) {
    const out = {};
    for (const k in row) {
      if (PASS[k]) {
        out[k] = row[k] || [];
        continue;
      }
      let v = row[k];
      // bigint có thể trả về dạng chuỗi -> ép về số để new Date()/sắp xếp đúng
      if (NUMERIC[k] && v != null) v = Number(v);
      out[snakeToCamel(k)] = v;
    }
    return out;
  }

  // ---- Ảnh: tải blob mới lên Storage, giữ ảnh cũ (đã có path) ----
  async function uploadImages(store, record) {
    if (!Array.isArray(record.images)) return record.images;
    const bucket = sb().storage.from(BUCKET);
    const out = [];
    for (const img of record.images) {
      if (img.path) {
        // ảnh đã ở trên cloud
        out.push({ id: img.id, kind: img.kind, caption: img.caption || "", path: img.path });
      } else if (img.blob) {
        const ext = (img.type && img.type.split("/")[1]) || "jpg";
        const path = `${store}/${record.id}/${img.id}.${ext}`;
        const { error } = await bucket.upload(path, img.blob, {
          contentType: img.type || "image/jpeg",
          upsert: true,
        });
        if (error) throw error;
        out.push({ id: img.id, kind: img.kind, caption: img.caption || "", path });
      }
    }
    return out;
  }

  // URL công khai để hiển thị ảnh từ path lưu trong DB
  function imageUrl(path) {
    if (!path) return "";
    return sb().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  // ---- CRUD ----
  async function all(store) {
    const { data, error } = await sb().from(TABLE[store]).select("*");
    if (error) throw error;
    return (data || []).map(fromRow);
  }

  async function get(store, id) {
    const { data, error } = await sb().from(TABLE[store]).select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? fromRow(data) : null;
  }

  async function byIndex(store, indexName, value) {
    const col = camelToSnake(indexName); // patientId -> patient_id
    const { data, error } = await sb().from(TABLE[store]).select("*").eq(col, value);
    if (error) throw error;
    return (data || []).map(fromRow);
  }

  async function put(store, obj) {
    const rec = Object.assign({}, obj);
    if (Array.isArray(rec.images)) rec.images = await uploadImages(store, rec);
    const row = toRow(rec);
    const { data, error } = await sb().from(TABLE[store]).upsert(row).select().maybeSingle();
    if (error) throw error;
    return data ? fromRow(data) : rec;
  }

  async function del(store, id) {
    const { error } = await sb().from(TABLE[store]).delete().eq("id", id);
    if (error) throw error;
  }

  async function clear(store) {
    const { error } = await sb().from(TABLE[store]).delete().neq("id", "__none__");
    if (error) throw error;
  }

  // ---- Meta (cấu hình: settings phòng khám...) ----
  async function getMeta(key, fallback) {
    const { data, error } = await sb().from(TABLE.meta).select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    return data ? data.value : fallback;
  }
  async function setMeta(key, value) {
    const { error } = await sb().from(TABLE.meta).upsert({ key, value }).select();
    if (error) throw error;
  }

  // ---- Không dùng cho cloud, giữ để tương thích ----
  async function open() {
    return true;
  }
  async function estimate() {
    return null; // dữ liệu ở cloud, không đo dung lượng cục bộ
  }

  return {
    open,
    put,
    get,
    del,
    all,
    byIndex,
    clear,
    getMeta,
    setMeta,
    estimate,
    imageUrl,
    TABLE,
    BUCKET,
  };
})();

// Cho phép src/main.js (ES module) truy cập nếu cần
window.DB = DB;
