/* ============================================================
 * import-backup.mjs — Nhập dữ liệu cũ (file sao lưu .json từ bản
 * IndexedDB) vào Supabase, KHÔNG mất dữ liệu.
 *
 * Chỉ cần chạy NẾU bác sĩ đã có dữ liệu thật ở bản cũ.
 * (Nếu bắt đầu với kho trống thì bỏ qua file này.)
 *
 * Cách chạy (cần Node.js):
 *   1) Trong app cũ, vào "Sao lưu" -> tải file .json.
 *   2) Đặt biến môi trường:
 *        SUPABASE_URL=https://xxx.supabase.co
 *        SUPABASE_SERVICE_ROLE=eyJ...   (KHÓA service_role, KHÔNG phải anon)
 *      Lấy tại Supabase > Project Settings > API.
 *   3) npm install
 *   4) node migrate/import-backup.mjs duong-dan/sao-luu.json
 *
 * LƯU Ý: service_role bỏ qua RLS nên chỉ chạy trên máy tin cậy,
 * KHÔNG đưa khóa này lên web/Git.
 * ============================================================ */

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
const BUCKET = "medical-images";
const file = process.argv[2];

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE trong biến môi trường.");
  process.exit(1);
}
if (!file) {
  console.error("Thiếu đường dẫn file sao lưu. VD: node migrate/import-backup.mjs sao-luu.json");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

function camelToSnake(k) {
  return k.replace(/[A-Z]/g, (m) => "_" + m.toLowerCase());
}
const PASS = { meds: 1, images: 1 };
function toRow(obj) {
  const out = {};
  for (const k in obj) {
    if (PASS[k]) {
      out[k] = obj[k];
      continue;
    }
    let v = obj[k];
    if (v === "") v = null;
    out[camelToSnake(k)] = v;
  }
  return out;
}

// dataURL base64 -> upload lên Storage, trả về path
async function uploadImages(table, record) {
  if (!Array.isArray(record.images) || !record.images.length) return [];
  const out = [];
  for (const img of record.images) {
    if (img.path) {
      out.push({ id: img.id, kind: img.kind, caption: img.caption || "", path: img.path });
      continue;
    }
    if (!img.data) continue;
    const m = /^data:([^;]+);base64,(.*)$/.exec(img.data);
    const contentType = (m && m[1]) || img.type || "image/jpeg";
    const b64 = m ? m[2] : img.data.split(",")[1] || "";
    const buf = Buffer.from(b64, "base64");
    const ext = contentType.split("/")[1] || "jpg";
    const path = `${table}/${record.id}/${img.id}.${ext}`;
    const { error } = await sb.storage.from(BUCKET).upload(path, buf, { contentType, upsert: true });
    if (error) throw error;
    out.push({ id: img.id, kind: img.kind, caption: img.caption || "", path });
  }
  return out;
}

async function importTable(table, records, hasImages) {
  let ok = 0;
  for (const rec of records) {
    const copy = Object.assign({}, rec);
    if (hasImages) copy.images = await uploadImages(table, copy);
    // bỏ field 'data' thừa trong images đã xử lý
    const { error } = await sb.from(table).upsert(toRow(copy));
    if (error) {
      console.error(`  Lỗi ${table} id=${rec.id}:`, error.message);
    } else {
      ok++;
    }
  }
  console.log(`  ${table}: ${ok}/${records.length} bản ghi`);
}

async function main() {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (data.app !== "qlbn_tmh") {
    console.error("File không đúng định dạng sao lưu của phần mềm này.");
    process.exit(1);
  }
  console.log("Bắt đầu nhập dữ liệu vào Supabase...");
  await importTable("patients", data.patients || [], false);
  await importTable("visits", data.visits || [], true);
  await importTable("surgeries", data.surgeries || [], true);

  // Đồng bộ bộ đếm mã BN để không trùng với mã cũ
  const codes = (data.patients || [])
    .map((p) => parseInt(String(p.code || "").replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n));
  if (codes.length) {
    const maxNum = Math.max(...codes);
    const { error } = await sb.rpc("setval_patient_code_seq", { newval: maxNum }).catch(() => ({}));
    if (error) {
      console.log(
        `  (Ghi chú) Hãy chạy trong SQL Editor: select setval('patient_code_seq', ${maxNum});`
      );
    }
  }
  console.log("Hoàn tất.");
}

main().catch((e) => {
  console.error("Lỗi:", e.message || e);
  process.exit(1);
});
