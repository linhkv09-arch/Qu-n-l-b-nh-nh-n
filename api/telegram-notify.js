/* ============================================================
 * api/telegram-notify.js — Vercel Serverless Function
 *
 * Gửi tóm tắt "cần nhắc hôm nay" (lịch hẹn khám + tái khám quá hạn)
 * qua Telegram cho bác sĩ. Được gọi theo 2 cách:
 *   1) Vercel Cron (xem vercel.json) — mỗi ngày tự động.
 *   2) Nút "Gửi thử ngay" trong Cài đặt — bác sĩ bấm thủ công.
 *
 * Cần khai báo trong Vercel > Project Settings > Environment Variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   (server, KHÔNG có tiền tố VITE_)
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   CRON_SECRET  (Vercel tự gửi kèm khi gọi theo lịch, xem docs Vercel Cron)
 * ============================================================ */

import { createClient } from "@supabase/supabase-js";

const TZ = "Asia/Ho_Chi_Minh";

function todayISO() {
  // "en-CA" trả về đúng dạng YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function daysUntil(iso, today) {
  if (!iso) return null;
  return Math.round((new Date(iso + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
}
function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function escHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// ---- Xác thực: gọi từ Vercel Cron (CRON_SECRET) hoặc từ app (token đăng nhập Supabase) ----
async function isAuthorized(req, admin) {
  const auth = req.headers.authorization || "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  try {
    const { data, error } = await admin.auth.getUser(token);
    return !!(data && data.user) && !error;
  } catch (e) {
    return false;
  }
}

// ---- Lịch hẹn cần gọi/nhắc: giống widget Trang chủ (status cho/da_nhac, ngày <= hôm nay) ----
function layLichHenCanNhac(appointments, today) {
  return appointments
    .filter((a) => ["cho", "da_nhac"].includes(a.status || "cho"))
    .map((a) => Object.assign({}, a, { days: daysUntil(a.date, today) }))
    .filter((a) => a.days <= 0)
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
}

// ---- Tái khám quá hạn chưa nhắc: cùng logic với Dashboard (public/js/dashboard.js) ----
function layTaiKhamCanNhac(visits, surgeries, patients, nhacMap, sentMessages, today) {
  const pMap = {};
  patients.forEach((p) => (pMap[p.id] = p));
  const items = [];
  const pushFU = (rec, kind) => {
    if (!rec.follow_up_date) return;
    const p = pMap[rec.patient_id];
    if (!p) return;
    items.push({
      id: rec.id,
      kind,
      patientId: rec.patient_id,
      patient: p,
      date: rec.follow_up_date,
      sourceDate: rec.date,
      days: daysUntil(rec.follow_up_date, today),
    });
  };
  visits.forEach((v) => pushFU(v, "visit"));
  surgeries.forEach((s) => pushFU(s, "surgery"));

  const msgByPatient = {};
  sentMessages.forEach((m) => {
    (msgByPatient[m.benh_nhan_id] = msgByPatient[m.benh_nhan_id] || []).push(m);
  });
  const moiHoSo = visits.concat(surgeries);

  const canNhac = [];
  items.forEach((i) => {
    if (i.days > 0) return; // chưa tới hạn
    const daTaiKham = moiHoSo.some((r) => r.patient_id === i.patientId && r.date && r.date > i.date);
    if (daTaiKham) return;

    const key = i.kind + ":" + i.id; // khớp với keyHen() trong public/js/dashboard.js
    let st = nhacMap[key];
    if (!st) {
      const tin = (msgByPatient[i.patientId] || [])
        .filter((m) => m.loai === "nhac_tai_kham" && m.trang_thai === "da_gui" && m.gui_luc && new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(Number(m.gui_luc))) >= i.sourceDate)
        .sort((a, b) => Number(b.gui_luc) - Number(a.gui_luc))[0];
      st = tin ? { lan: 1, nhacLaiNgay: null } : null;
    }
    const coNhac = st && !st.huy;
    const toiNgayNhacLai = coNhac && st.nhacLaiNgay && st.nhacLaiNgay <= today;
    if (coNhac && !toiNgayNhacLai) return; // đã nhắc, chưa tới ngày nhắc lại
    canNhac.push(i);
  });
  canNhac.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  return canNhac;
}

function soanTinNhan(lichHen, taiKham, today) {
  const dong = [`🏥 <b>Nhắc việc hôm nay ${escHtml(fmtDate(today))}</b>`];

  if (lichHen.length) {
    dong.push("");
    dong.push(`📞 <b>Lịch hẹn cần gọi/nhắc (${lichHen.length})</b>`);
    lichHen.slice(0, 15).forEach((a) => {
      const tt = a.days < 0 ? `quá ${Math.abs(a.days)} ngày` : "hôm nay" + (a.time ? " " + a.time : "");
      dong.push(`• ${escHtml(a.name)} — ${escHtml(a.phone || "chưa có SĐT")} — ${tt}`);
    });
    if (lichHen.length > 15) dong.push(`… và ${lichHen.length - 15} ca khác`);
  }

  if (taiKham.length) {
    dong.push("");
    dong.push(`🔔 <b>Tái khám quá hạn chưa nhắc (${taiKham.length})</b>`);
    taiKham.slice(0, 15).forEach((i) => {
      const tt = i.days < 0 ? `quá ${Math.abs(i.days)} ngày` : "hôm nay";
      dong.push(`• ${escHtml(i.patient.name)} — ${escHtml(i.patient.phone || "chưa có SĐT")} — ${tt}`);
    });
    if (taiKham.length > 15) dong.push(`… và ${taiKham.length - 15} ca khác`);
  }

  if (!lichHen.length && !taiKham.length) {
    dong.push("");
    dong.push("Không có lịch hẹn hay tái khám nào cần nhắc hôm nay 🎉");
  }

  return dong.join("\n");
}

// Xuất thêm các hàm thuần (không gọi mạng) để kiểm thử độc lập
export { todayISO, daysUntil, fmtDate, layLichHenCanNhac, layTaiKhamCanNhac, soanTinNhan };

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  if (!SUPABASE_URL || !SERVICE_KEY || !BOT_TOKEN || !CHAT_ID) {
    return res.status(500).json({ error: "Thiếu biến môi trường (xem comment đầu file api/telegram-notify.js)" });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  if (!(await isAuthorized(req, admin))) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const today = todayISO();
    const [apRes, vRes, sRes, pRes, metaRes, msgRes] = await Promise.all([
      admin.from("appointments").select("*"),
      admin.from("visits").select("id,patient_id,date,follow_up_date"),
      admin.from("surgeries").select("id,patient_id,date,follow_up_date"),
      admin.from("patients").select("id,name,phone"),
      admin.from("app_meta").select("value").eq("key", "nhac_tai_kham").maybeSingle(),
      admin.from("tin_nhan_da_gui").select("benh_nhan_id,loai,trang_thai,gui_luc"),
    ]);
    for (const r of [apRes, vRes, sRes, pRes, metaRes, msgRes]) {
      if (r.error) throw r.error;
    }

    const lichHen = layLichHenCanNhac(apRes.data || [], today);
    const taiKham = layTaiKhamCanNhac(vRes.data || [], sRes.data || [], pRes.data || [], (metaRes.data && metaRes.data.value) || {}, msgRes.data || [], today);
    const text = soanTinNhan(lichHen, taiKham, today);

    const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    const tgData = await tgRes.json().catch(() => ({}));
    if (!tgRes.ok || !tgData.ok) {
      return res.status(502).json({
        error: "Telegram từ chối gửi: " + (tgData.description || `HTTP ${tgRes.status}`),
        detail: tgData,
      });
    }

    return res.status(200).json({ ok: true, lichHen: lichHen.length, taiKham: taiKham.length });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || String(e) });
  }
}
