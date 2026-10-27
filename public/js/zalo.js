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
  const LOAI = { SAU_KHAM: "sau_kham", NHAC_TAI_KHAM: "nhac_tai_kham", NHAC_HEN_KHAM: "nhac_hen_kham" };

  const NHAN_LOAI = {
    sau_kham: "Sau khám",
    nhac_tai_kham: "Nhắc tái khám",
    nhac_hen_kham: "Nhắc lịch hẹn",
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
    nhac_hen_kham:
      "Chào {ho_ten}, xin nhắc anh/chị lịch hẹn khám vào {ngay_hen}{gio_hen}. " +
      "Nếu cần đổi lịch, vui lòng liên hệ lại với bác sĩ.",
  };

  const PLACEHOLDERS = [
    "{ho_ten}",
    "{chan_doan}",
    "{dieu_tri}",
    "{loi_ran}",
    "{ngay_kham}",
    "{ngay_tai_kham}",
    "{ngay_hen}",
    "{gio_hen}",
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
    const a = (data && data.appointment) || {};
    const map = {
      ho_ten: p.name || a.name || "",
      chan_doan: v.diagnosis || "",
      dieu_tri: v.treatment || "",
      loi_ran: v.advice || "", // "Lời dặn" đã có sẵn trong hồ sơ khám
      ngay_kham: v.date ? U.fmtDate(v.date) : "",
      ngay_tai_kham: v.followUpDate ? U.fmtDate(v.followUpDate) : "",
      ngay_hen: a.date ? U.fmtDate(a.date) : "",
      gio_hen: a.time ? " lúc " + a.time : "",
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
  //  ẢNH GỬI KÈM (ảnh nội soi... trong hồ sơ khám)
  //  Zalo cá nhân không nhận ảnh qua link, nên gửi bằng:
  //   - Điện thoại: bảng Chia sẻ của máy (Web Share) -> chọn Zalo
  //   - Máy tính: chép từng ảnh rồi dán vào Zalo, hoặc tải ảnh về rồi kéo vào
  // ============================================================
  function srcAnh(img) {
    if (img.tuApp) return ""; // ảnh tờ đơn trong app: hiện sau khi tạo xong
    if (img.blob) return U.blobUrl(img.blob);
    return img.path ? DB.imageUrl(img.path) : "";
  }
  async function layBlobAnh(img, patient, visit) {
    if (img.tuApp) return Rx.sheetImage(patient, visit);
    if (img.blob) return img.blob;
    const res = await fetch(srcAnh(img));
    if (!res.ok) throw new Error("Không tải được ảnh (" + res.status + ")");
    return res.blob();
  }
  function tenFileAnh(patient, img, idx, blob) {
    const ext = ((blob && blob.type) || img.type || "image/jpeg").split("/")[1] || "jpg";
    const ten = U.noAccent(patient.name || "benh-nhan").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `${ten}-${img.kind || "anh"}-${idx + 1}.${ext}`;
  }
  function coTheChiaSeFile() {
    try {
      return !!(
        navigator.canShare &&
        navigator.canShare({ files: [new File(["x"], "x.jpg", { type: "image/jpeg" })] })
      );
    } catch (e) {
      return false;
    }
  }
  // Clipboard chỉ nhận ảnh PNG -> đổi JPEG sang PNG. Gọi write() ngay trong lượt bấm
  // (truyền Promise cho ClipboardItem) để trình duyệt không chặn vì chờ quá lâu.
  async function sangPng(blobPromise) {
    const blob = await blobPromise;
    if (blob.type === "image/png") return blob;
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    c.getContext("2d").drawImage(bmp, 0, 0);
    bmp.close();
    return new Promise((r) => c.toBlob(r, "image/png"));
  }
  async function chepAnh(blobPromise) {
    if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ "image/png": sangPng(blobPromise) })]);
    return true;
  }
  function taiVe(blob, ten) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ten;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // Khối chọn ảnh gửi kèm; trả về null nếu hồ sơ không có ảnh
  function khoiAnhGuiKem(patient, visit, layNoiDung) {
    const images = ((visit && visit.images) || []).filter((im) => im.path || im.blob);
    // Tờ đơn thuốc kê trong app -> chụp thành ảnh (đứng trước ảnh đơn chụp tay)
    if (typeof Rx !== "undefined" && Rx.coDon(visit)) images.unshift({ id: "rx-app", kind: "donthuoc", tuApp: true });
    if (!images.length) return null;
    // Ảnh nội soi, rồi đơn thuốc lên trước và được chọn sẵn
    const THU_TU = { noisoi: 0, donthuoc: 1 };
    const thuTu = (im) => (im.kind in THU_TU ? THU_TU[im.kind] : 2);
    images.sort((a, b) => thuTu(a) - thuTu(b));
    const coAnhChinh = images.some((im) => thuTu(im) < 2);

    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.style.marginTop = "14px";
    wrap.innerHTML = `
      <label>Ảnh gửi kèm (bấm vào ảnh để chọn/bỏ)</label>
      <div class="zalo-anh-list" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;">
        ${coTheChiaSeFile() ? '<button type="button" class="btn btn-gold za-share">📤 Chia sẻ ảnh + tin nhắn qua Zalo</button>' : ""}
        <button type="button" class="btn za-tai">⬇️ Tải ảnh đã chọn</button>
      </div>
      <p class="hint" style="margin-top:6px;">
        ${
          coTheChiaSeFile()
            ? "<b>Điện thoại:</b> bấm <b>Chia sẻ</b> → chọn <b>Zalo</b> → chọn bệnh nhân. Nội dung tin nhắn đã được chép sẵn — nếu Zalo chỉ gửi ảnh, giữ ô chat → <b>Dán</b>.<br>"
            : ""
        }
        <b>Máy tính:</b> mở Zalo của bệnh nhân, dán tin nhắn; rồi bấm <b>📋 Chép</b> dưới từng ảnh và <b>Ctrl+V</b> vào khung chat
        (hoặc tải ảnh về rồi kéo vào Zalo).
      </p>`;

    const list = wrap.querySelector(".zalo-anh-list");
    const chon = images.map((im) => (coAnhChinh ? thuTu(im) < 2 : true));
    const blobs = images.map(() => null);
    // Tải trước ảnh để lúc bấm Chia sẻ gọi được ngay (trình duyệt chặn nếu chờ lâu)
    const sanSang = images.map((im, k) =>
      layBlobAnh(im, patient, visit)
        .then((b) => (blobs[k] = b))
        .catch((e) => console.warn("Ảnh gửi kèm:", e.message))
    );

    images.forEach((im, k) => {
      const o = document.createElement("div");
      o.style.cssText = "width:110px;text-align:center;font-size:12px;";
      o.innerHTML = `
        <div class="za-thumb" style="position:relative;cursor:pointer;border-radius:8px;overflow:hidden;border:3px solid transparent;">
          <img src="${U.esc(srcAnh(im))}" alt="${im.tuApp ? "Đang tạo ảnh đơn..." : ""}" style="display:block;width:100%;height:80px;object-fit:cover;object-position:top;background:#f3f5f8;font-size:11px;" />
          <span class="za-tick" style="position:absolute;top:4px;right:4px;background:#fff;border-radius:50%;width:22px;height:22px;line-height:22px;font-weight:700;"></span>
        </div>
        <div class="muted" style="margin:3px 0;">${im.tuApp ? "Đơn thuốc (app)" : U.esc(U.imgKindLabel(im.kind))}</div>
        <button type="button" class="btn btn-sm za-chep">📋 Chép</button>`;
      const th = o.querySelector(".za-thumb");
      if (im.tuApp) {
        const anh = th.querySelector("img");
        sanSang[k].then(() => {
          if (blobs[k]) anh.src = U.blobUrl(blobs[k]);
          else anh.alt = "Không tạo được ảnh đơn";
        });
      }
      const ve = () => {
        th.style.borderColor = chon[k] ? "var(--gold, #d4a017)" : "transparent";
        th.style.opacity = chon[k] ? "1" : "0.55";
        o.querySelector(".za-tick").textContent = chon[k] ? "✓" : "";
      };
      th.addEventListener("click", () => {
        chon[k] = !chon[k];
        ve();
      });
      o.querySelector(".za-chep").addEventListener("click", async () => {
        try {
          const ok = await chepAnh(
            sanSang[k].then(() => {
              if (!blobs[k]) throw new Error("ảnh chưa tải được");
              return blobs[k];
            })
          );
          U.toast(ok ? "Đã chép ảnh — dán (Ctrl+V) vào Zalo" : "Trình duyệt không cho chép ảnh, hãy tải ảnh về", ok ? "ok" : "err");
        } catch (e) {
          U.toast("Không chép được ảnh: " + e.message, "err");
        }
      });
      ve();
      list.appendChild(o);
    });

    const daChon = () => images.map((im, k) => k).filter((k) => chon[k]);

    const btnShare = wrap.querySelector(".za-share");
    if (btnShare) {
      btnShare.addEventListener("click", async () => {
        const ks = daChon();
        if (!ks.length) return U.toast("Chưa chọn ảnh nào", "err");
        await Promise.all(ks.map((k) => sanSang[k]));
        const files = ks
          .filter((k) => blobs[k])
          .map((k) => new File([blobs[k]], tenFileAnh(patient, images[k], k, blobs[k]), { type: blobs[k].type || "image/jpeg" }));
        if (!files.length) return U.toast("Không tải được ảnh để chia sẻ", "err");
        const text = layNoiDung();
        await saoChep(text); // phòng khi Zalo bỏ phần chữ
        try {
          await navigator.share({ files, text });
        } catch (e) {
          if (e.name !== "AbortError") U.toast("Không mở được bảng chia sẻ: " + e.message, "err");
        }
      });
    }

    wrap.querySelector(".za-tai").addEventListener("click", async () => {
      const ks = daChon();
      if (!ks.length) return U.toast("Chưa chọn ảnh nào", "err");
      await Promise.all(ks.map((k) => sanSang[k]));
      let n = 0;
      ks.forEach((k, j) => {
        if (!blobs[k]) return;
        n++;
        setTimeout(() => taiVe(blobs[k], tenFileAnh(patient, images[k], k, blobs[k])), j * 300);
      });
      U.toast(n ? `Đang tải ${n} ảnh về máy` : "Không tải được ảnh", n ? "ok" : "err");
    });

    return wrap;
  }

  // ============================================================
  //  HỘP THOẠI TIN NHẮN ZALO (dùng chung 2 luồng)
  //  opts: { patient, visit, loai, onSent }
  // ============================================================
  async function moHopThoai(opts) {
    opts = opts || {};
    const patient = opts.patient;
    const visit = opts.visit || null;
    const appointment = opts.appointment || null;
    const loai = opts.loai || LOAI.SAU_KHAM;
    if (!patient) return U.toast("Thiếu thông tin bệnh nhân", "err");

    const mau = await layMau(loai);
    const noiDung = dienNoiDung(mau, { patient, visit, appointment });
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
    const khoiAnh = khoiAnhGuiKem(patient, visit, () => ta.value);
    if (khoiAnh) body.appendChild(khoiAnh);
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
