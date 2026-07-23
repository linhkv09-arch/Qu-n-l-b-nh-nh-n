/* ============================================================
 * zalo.js — Nhắn tin Zalo chăm sóc bệnh nhân
 *
 * Dùng chung cho 2 luồng:
 *   - sau_kham       : soạn tin ngay sau khi lưu kết quả khám
 *   - nhac_tai_kham  : nhắc bệnh nhân đến hạn tái khám
 *
 * Gửi bằng cách MỞ ZALO + DÁN nội dung thủ công (Zalo cá nhân
 * không có API điền sẵn nội dung qua link).
 * ============================================================ */

const Zalo = (function () {
  const LOAI = { SAU_KHAM: "sau_kham", NHAC_TAI_KHAM: "nhac_tai_kham" };

  const NHAN_LOAI = {
    sau_kham: "Sau khám",
    nhac_tai_kham: "Nhắc tái khám",
  };

  // Mẫu mặc định (bác sĩ sửa được trong mục Cài đặt)
  const MAU_MAC_DINH = {
    sau_kham:
      "Chào {ho_ten}, sau buổi khám ngày {ngay_kham}, bác sĩ chẩn đoán: {chan_doan}. " +
      "Hướng điều trị: {dieu_tri} và {loi_ran}. Vui lòng tái khám vào {ngay_tai_kham}, " +
      "nếu có bất thường xin liên hệ bác sĩ.",
    nhac_tai_kham:
      "Chào {ho_ten}, đã đến hẹn tái khám ngày {ngay_tai_kham}. " +
      "Vui lòng liên hệ bác sĩ để hẹn lịch.",
  };

  const PLACEHOLDERS = [
    "{ho_ten}",
    "{chan_doan}",
    "{dieu_tri}",
    "{loi_ran}",
    "{ngay_kham}",
    "{ngay_tai_kham}",
  ];

  // ---- Chuẩn hóa số điện thoại về dạng quốc tế: 0901234567 -> 84901234567 ----
  function chuanHoaSoDienThoai(phone) {
    if (!phone) return "";
    let s = String(phone).replace(/[^\d+]/g, "");
    s = s.replace(/^\+/, "");
    if (s.startsWith("84")) return s;
    if (s.startsWith("0")) return "84" + s.slice(1);
    if (s.length === 9) return "84" + s; // số 9 chữ số, thiếu số 0 đầu
    return s;
  }

  function linkZalo(phone) {
    const so = chuanHoaSoDienThoai(phone);
    return so ? "https://zalo.me/" + so : "";
  }

  // ---- Mẫu nội dung ----
  async function layMau(loai) {
    try {
      const rows = await DB.byIndex("messageTemplates", "loai", loai);
      if (rows && rows.length && rows[0].noiDungMau) return rows[0].noiDungMau;
    } catch (e) {
      console.warn("Không đọc được mẫu tin nhắn:", e.message);
    }
    return MAU_MAC_DINH[loai] || "";
  }

  async function luuMau(loai, noiDungMau) {
    const rows = await DB.byIndex("messageTemplates", "loai", loai);
    const rec = rows && rows.length ? Object.assign({}, rows[0]) : { id: U.uid(), loai };
    rec.noiDungMau = noiDungMau;
    rec.capNhatLuc = Date.now();
    return DB.put("messageTemplates", rec);
  }

  // ---- Điền placeholder ----
  function dienNoiDung(mau, data) {
    const p = (data && data.patient) || {};
    const v = (data && data.visit) || {};
    const map = {
      ho_ten: p.name || "",
      chan_doan: v.diagnosis || "",
      dieu_tri: v.treatment || "",
      loi_ran: v.advice || "", // "Lời dặn" đã có sẵn trong hồ sơ khám
      ngay_kham: v.date ? U.fmtDate(v.date) : "",
      ngay_tai_kham: v.followUpDate ? U.fmtDate(v.followUpDate) : "",
    };
    return String(mau || "")
      .replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m))
      // dọn dấu câu thừa khi placeholder rỗng
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([,.])/g, "$1")
      .trim();
  }

  // ---- Lịch sử tin nhắn ----
  async function taoBanGhiDaSoan(patientId, loai, noiDung) {
    const rec = {
      id: U.uid(),
      benhNhanId: patientId,
      loai,
      noiDungDaGui: noiDung,
      trangThai: "da_soan",
      taoLuc: Date.now(),
    };
    return DB.put("sentMessages", rec);
  }

  async function danhDauDaGui(id, noiDung) {
    const rec = await DB.get("sentMessages", id);
    if (!rec) return null;
    rec.noiDungDaGui = noiDung;
    rec.trangThai = "da_gui";
    rec.guiLuc = Date.now();
    return DB.put("sentMessages", rec);
  }

  // Đã đánh dấu "đã gửi" tin nhắc tái khám trong HÔM NAY chưa?
  async function daNhacHomNay(patientId, allMessages) {
    const list = allMessages || (await DB.byIndex("sentMessages", "benhNhanId", patientId));
    const homNay = U.todayISO();
    return (list || []).some(
      (m) =>
        m.loai === LOAI.NHAC_TAI_KHAM &&
        m.trangThai === "da_gui" &&
        m.guiLuc &&
        U.toISODate(new Date(Number(m.guiLuc))) === homNay
    );
  }

  // ---- Sao chép vào clipboard ----
  async function saoChep(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {
      /* rơi xuống cách dự phòng */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) {
      return false;
    }
  }

  // ============================================================
  //  HỘP THOẠI TIN NHẮN ZALO (dùng chung 2 luồng)
  //  opts: { patient, visit, loai, onSent }
  // ============================================================
  async function moHopThoai(opts) {
    opts = opts || {};
    const patient = opts.patient;
    const visit = opts.visit || null;
    const loai = opts.loai || LOAI.SAU_KHAM;
    if (!patient) return U.toast("Thiếu thông tin bệnh nhân", "err");

    const mau = await layMau(loai);
    const noiDung = dienNoiDung(mau, { patient, visit });
    const so84 = chuanHoaSoDienThoai(patient.phone);
    const url = linkZalo(patient.phone);

    // Tạo bản ghi "đã soạn"
    let banGhi = null;
    try {
      banGhi = await taoBanGhiDaSoan(patient.id, loai, noiDung);
    } catch (e) {
      console.warn("Không lưu được lịch sử tin nhắn:", e.message);
    }

    const body = document.createElement("div");
    body.innerHTML = `
      <div class="zalo-head">
        <div>
          <div class="zalo-name">${U.esc(patient.name || "")}</div>
          <div class="zalo-phone">${
            so84
              ? "📞 " + U.esc(patient.phone || "") + " → <code>" + U.esc(so84) + "</code>"
              : '<span class="zalo-warn">⚠️ Bệnh nhân chưa có số điện thoại — không mở được Zalo</span>'
          }</div>
        </div>
        <span class="badge badge-info">${U.esc(NHAN_LOAI[loai] || loai)}</span>
      </div>
      <div class="field" style="margin-top:14px;">
        <label>Nội dung tin nhắn (sửa được trước khi gửi)</label>
        <textarea class="zalo-text" rows="7">${U.esc(noiDung)}</textarea>
      </div>
      <p class="hint">
        Zalo cá nhân không cho điền sẵn nội dung qua link — hãy bấm <b>Sao chép nội dung</b>,
        rồi <b>Mở Zalo</b> và <b>dán</b> vào khung chat.
      </p>
    `;

    const foot = document.createElement("div");
    const btnDong = document.createElement("button");
    btnDong.className = "btn";
    btnDong.textContent = "Đóng";
    const btnChep = document.createElement("button");
    btnChep.className = "btn";
    btnChep.innerHTML = "📋 Sao chép nội dung";
    const btnZalo = document.createElement("button");
    btnZalo.className = "btn btn-primary";
    btnZalo.innerHTML = "💬 Mở Zalo";
    if (!so84) btnZalo.disabled = true;
    const btnGui = document.createElement("button");
    btnGui.className = "btn btn-gold";
    btnGui.innerHTML = "✓ Đánh dấu đã gửi";
    foot.appendChild(btnDong);
    foot.appendChild(btnChep);
    foot.appendChild(btnZalo);
    foot.appendChild(btnGui);

    const modal = U.openModal({
      title: "Tin nhắn Zalo — " + (NHAN_LOAI[loai] || loai),
      body,
      footer: foot,
      wide: true,
    });

    const ta = body.querySelector(".zalo-text");
    btnDong.addEventListener("click", modal.close);

    btnChep.addEventListener("click", async () => {
      const ok = await saoChep(ta.value);
      U.toast(ok ? "Đã sao chép nội dung" : "Không sao chép được, hãy bôi đen và Ctrl+C", ok ? "ok" : "err");
    });

    btnZalo.addEventListener("click", async () => {
      if (!url) return U.toast("Bệnh nhân chưa có số điện thoại", "err");
      await saoChep(ta.value); // chép luôn cho tiện dán
      window.open(url, "_blank", "noopener");
    });

    btnGui.addEventListener("click", async () => {
      try {
        if (banGhi) await danhDauDaGui(banGhi.id, ta.value);
        U.toast("Đã đánh dấu là đã gửi", "ok");
        modal.close();
        if (opts.onSent) opts.onSent();
      } catch (e) {
        U.toast("Lỗi khi lưu: " + e.message, "err");
      }
    });
  }

  return {
    LOAI,
    NHAN_LOAI,
    MAU_MAC_DINH,
    PLACEHOLDERS,
    chuanHoaSoDienThoai,
    linkZalo,
    layMau,
    luuMau,
    dienNoiDung,
    taoBanGhiDaSoan,
    danhDauDaGui,
    daNhacHomNay,
    saoChep,
    moHopThoai,
  };
})();
