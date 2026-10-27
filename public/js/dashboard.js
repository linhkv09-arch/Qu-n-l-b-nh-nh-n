/* ============================================================
 * dashboard.js — Trang chủ: nhắc lịch tái khám & thống kê nhanh
 * ============================================================ */

const Dashboard = (function () {
  // Gom tất cả lịch hẹn tái khám từ khám & phẫu thuật
  async function collectFollowUps() {
    const [visits, surgeries, patients] = await Promise.all([
      DB.all("visits"),
      DB.all("surgeries"),
      DB.all("patients"),
    ]);
    const pMap = {};
    patients.forEach((p) => (pMap[p.id] = p));

    const items = [];
    const pushFU = (rec, kind) => {
      if (!rec.followUpDate) return;
      const p = pMap[rec.patientId];
      if (!p) return;
      items.push({
        kind, // 'visit' | 'surgery'
        patient: p,
        date: rec.followUpDate,
        note: rec.followUpNote || "",
        source: rec,
        days: U.daysUntil(rec.followUpDate),
      });
    };
    visits.forEach((v) => pushFU(v, "visit"));
    surgeries.forEach((s) => pushFU(s, "surgery"));
    items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return { items, patients, visits, surgeries };
  }

  // ============================================================
  //  ĐÁNH DẤU "ĐÃ NHẮC TÁI KHÁM" — theo từng lịch hẹn
  //  Lưu ở app_meta["nhac_tai_kham"]:
  //    { "<visit|surgery>:<id hồ sơ>": { lan, nhacLuc, nhacLaiNgay, huy } }
  //  nhacLaiNgay = "YYYY-MM-DD": tới ngày đó hiện lại để nhắc lần tiếp;
  //  null: đã nhắc, không hiện lại nữa. huy = true: bác sĩ bỏ đánh dấu.
  // ============================================================
  const META_NHAC = "nhac_tai_kham";
  const keyHen = (i) => i.kind + ":" + i.source.id;

  async function docNhac() {
    try {
      return (await DB.getMeta(META_NHAC, {})) || {};
    } catch (e) {
      console.warn("Không đọc được trạng thái đã nhắc:", e.message);
      return {};
    }
  }
  // Đọc lại ngay trước khi ghi để không đè thay đổi từ máy khác
  async function suaNhac(i, fn) {
    const map = await docNhac();
    const moi = fn(map[keyHen(i)]);
    if (moi) map[keyHen(i)] = moi;
    else delete map[keyHen(i)];
    await DB.setMeta(META_NHAC, map);
  }
  // Ghi nhận một lần nhắc mới (chưa hẹn nhắc lại)
  function ghiDaNhac(i) {
    const lanTruoc = i.nhac && !i.nhac.huy ? i.nhac.lan || 1 : 0;
    return suaNhac(i, () => ({ lan: lanTruoc + 1, nhacLuc: Date.now(), nhacLaiNgay: null }));
  }
  function datNhacLai(i, ngay) {
    return suaNhac(i, (cu) =>
      Object.assign({ lan: 1, nhacLuc: Date.now() }, cu, { nhacLaiNgay: ngay || null, huy: false })
    );
  }
  function boDaNhac(i) {
    return suaNhac(i, () => ({ huy: true }));
  }

  // Trạng thái nhắc của một lịch hẹn. Tương thích dữ liệu cũ: tin Zalo
  // "nhắc tái khám" đã gửi kể từ ngày khám/mổ tạo ra lịch hẹn này.
  function trangThaiNhac(i, map, msgByPatient) {
    const st = map[keyHen(i)];
    if (st) return st;
    const moc = i.source.date || "";
    const tin = (msgByPatient[i.patient.id] || [])
      .filter(
        (m) =>
          m.loai === "nhac_tai_kham" &&
          m.trangThai === "da_gui" &&
          m.guiLuc &&
          U.toISODate(new Date(Number(m.guiLuc))) >= moc
      )
      .sort((a, b) => Number(b.guiLuc) - Number(a.guiLuc))[0];
    return tin ? { lan: 1, nhacLuc: Number(tin.guiLuc), nhacLaiNgay: null } : null;
  }

  // Hộp thoại: (đã) đánh dấu nhắc + hẹn ngày nhắc lại (để trống = không nhắc lại)
  function hopNhacLai(i, opts) {
    return new Promise((resolve) => {
      const homNay = U.todayISO();
      const body = document.createElement("div");
      body.innerHTML = `
        <div style="font-size:14.5px;line-height:1.6;margin-bottom:12px;">
          ${opts.daGhi ? "Đã ghi nhận đã nhắc" : "Đánh dấu đã nhắc"} <strong>${U.esc(i.patient.name)}</strong>
          (hẹn tái khám ${U.fmtDate(i.date)}).<br>
          Bệnh nhân sẽ không còn hiện trong danh sách quá hẹn.
        </div>
        <div class="field">
          <label>Hẹn nhắc lại (để trống nếu không cần nhắc lại)</label>
          <input type="date" class="nl-date" min="${homNay}" value="${U.esc((i.nhac && i.nhac.nhacLaiNgay) || "")}" />
        </div>
        <div class="nl-quick" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
          ${[3, 7, 14, 30].map((d) => `<button type="button" class="btn btn-sm" data-d="${d}">+${d} ngày</button>`).join("")}
          <button type="button" class="btn btn-sm" data-d="">Không nhắc lại</button>
        </div>`;
      const inp = body.querySelector(".nl-date");
      body.querySelectorAll(".nl-quick button").forEach((b) =>
        b.addEventListener("click", () => {
          inp.value = b.dataset.d ? U.addDaysISO(homNay, parseInt(b.dataset.d, 10)) : "";
        })
      );

      const foot = document.createElement("div");
      const huy = document.createElement("button");
      huy.className = "btn";
      huy.textContent = opts.daGhi ? "Không hẹn nhắc lại" : "Hủy";
      const luu = document.createElement("button");
      luu.className = "btn btn-primary";
      luu.textContent = "Lưu";
      foot.appendChild(huy);
      foot.appendChild(luu);

      const m = U.openModal({ title: "Đã nhắc tái khám", body, footer: foot });
      huy.addEventListener("click", () => {
        m.close();
        resolve(false);
      });
      luu.addEventListener("click", async () => {
        luu.disabled = true;
        try {
          if (!opts.daGhi) await ghiDaNhac(i);
          await datNhacLai(i, inp.value);
          U.toast(inp.value ? "Đã lưu, sẽ nhắc lại ngày " + U.fmtDate(inp.value) : "Đã lưu", "ok");
          m.close();
          resolve(true);
        } catch (e) {
          luu.disabled = false;
          U.toast("Lỗi khi lưu: " + e.message, "err");
        }
      });
    });
  }

  async function render(root) {
    const { items, patients, visits, surgeries } = await collectFollowUps();
    const rerender = () => render(root);

    // Lịch sử tin nhắn Zalo + trạng thái đã nhắc
    let sentMessages = [];
    try {
      sentMessages = await DB.all("sentMessages");
    } catch (e) {
      console.warn("Chưa đọc được lịch sử tin nhắn:", e.message);
    }
    const msgByPatient = {};
    sentMessages.forEach((m) => {
      (msgByPatient[m.benhNhanId] = msgByPatient[m.benhNhanId] || []).push(m);
    });
    const nhacMap = await docNhac();

    // ============================================================
    //  Lịch hẹn đã tới hạn (hôm nay hoặc quá hạn), CHƯA tái khám:
    //   - đã nhắc và không có hẹn nhắc lại / chưa tới ngày nhắc lại -> "Đã nhắc"
    //   - còn lại -> "Cần nhắc" (gồm cả ca tới ngày nhắc lại)
    // ============================================================
    const homNay = U.todayISO();
    const moiHoSo = visits.concat(surgeries);
    const canNhac = [];
    const daNhac = [];
    items.forEach((i) => {
      if (i.days > 0) return; // chưa tới hạn
      // đã quay lại khám sau ngày hẹn -> coi như đã tái khám
      const daTaiKham = moiHoSo.some(
        (r) => r.patientId === i.patient.id && r.date && r.date > i.date
      );
      if (daTaiKham) return;
      const st = trangThaiNhac(i, nhacMap, msgByPatient);
      i.nhac = st;
      const coNhac = st && !st.huy;
      const toiNgayNhacLai = coNhac && st.nhacLaiNgay && st.nhacLaiNgay <= homNay;
      if (coNhac && !toiNgayNhacLai) daNhac.push(i);
      else canNhac.push(i);
    });

    // Phân loại: quá hạn (chưa nhắc) / trong 7 ngày / sắp tới (>7 ngày)
    const overdue = canNhac.filter((i) => i.days < 0);
    const soon = items.filter((i) => i.days >= 0 && i.days <= 7);
    const upcoming = items.filter((i) => i.days > 7 && i.days <= 30);

    // Thống kê tháng hiện tại
    const now = new Date();
    const ym = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
    const visitsThisMonth = visits.filter((v) => (v.date || "").startsWith(ym)).length;
    const surgThisMonth = surgeries.filter((s) => (s.date || "").startsWith(ym)).length;

    root.innerHTML = "";

    // ---- Stat tiles ----
    const stats = document.createElement("div");
    stats.className = "grid grid-4";
    stats.innerHTML = `
      <div class="stat"><div class="stat-label">Tổng bệnh nhân</div><div class="stat-value">${patients.length}</div></div>
      <div class="stat"><div class="stat-label">Lượt khám tháng này</div><div class="stat-value">${visitsThisMonth}</div><div class="stat-sub">Tháng ${now.getMonth() + 1}/${now.getFullYear()}</div></div>
      <div class="stat"><div class="stat-label">Phẫu thuật tháng này</div><div class="stat-value">${surgThisMonth}</div><div class="stat-sub">Tháng ${now.getMonth() + 1}/${now.getFullYear()}</div></div>
      <div class="stat" style="border-color:${overdue.length ? "var(--danger)" : "var(--line)"}">
        <div class="stat-label">Quá hạn tái khám</div>
        <div class="stat-value" style="color:${overdue.length ? "var(--danger)" : "var(--navy)"}">${overdue.length}</div>
        <div class="stat-sub">${soon.length} ca trong 7 ngày tới</div>
      </div>
    `;
    root.appendChild(stats);

    // ============================================================
    //  LỊCH HẸN KHÁM (bệnh nhân hẹn qua điện thoại) — hôm nay & quá hạn chưa nhắc
    // ============================================================
    let apUpcoming = [];
    try {
      apUpcoming = await Appointments.collectUpcoming();
    } catch (e) {
      console.warn("Không đọc được lịch hẹn:", e.message);
    }
    const apCanNhac = apUpcoming.filter((a) => a.days <= 0);
    if (apCanNhac.length) {
      const apWrap = document.createElement("div");
      apWrap.innerHTML = `
        <div class="section-title"><span>📞 Lịch hẹn cần gọi/nhắc <span class="badge badge-warn">${apCanNhac.length}</span></span></div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Bệnh nhân</th><th>Điện thoại</th><th>Ngày hẹn</th><th>Tình trạng</th><th></th></tr></thead>
          <tbody>
          ${apCanNhac
            .map((a) => {
              const tt =
                a.days < 0
                  ? `<span class="badge badge-danger">Quá ${Math.abs(a.days)} ngày</span>`
                  : `<span class="badge badge-warn">Hôm nay${a.time ? " · " + U.esc(a.time) : ""}</span>`;
              const tel = a.phone ? `<a class="btn btn-sm" href="tel:${U.esc(a.phone)}">📞 Gọi</a>` : "";
              return `<tr>
                <td><strong>${U.esc(a.name)}</strong></td>
                <td class="nowrap">${U.esc(a.phone || "—")}</td>
                <td class="nowrap">${U.fmtDate(a.date)}</td>
                <td class="nowrap">${tt}</td>
                <td class="text-right nowrap">${tel}
                  <button class="btn btn-sm btn-gold ap-zalo" data-id="${a.id}">💬 Nhắc Zalo</button>
                </td>
              </tr>`;
            })
            .join("")}
          </tbody>
        </table></div></div>`;
      root.appendChild(apWrap);
      apWrap.querySelectorAll(".ap-zalo").forEach((btn) => {
        btn.addEventListener("click", () => {
          const a = apCanNhac.find((x) => x.id === btn.dataset.id);
          Appointments.nhacZalo(a, rerender);
        });
      });
    }

    // Nhãn lần nhắc tiếp theo cho ca tới ngày nhắc lại
    const nhanLanNhac = (i) =>
      i.nhac && !i.nhac.huy
        ? ` <span class="badge badge-info">Nhắc lần ${(i.nhac.lan || 1) + 1}</span>`
        : "";

    // Nút "Đã nhắc": dùng khi nhắc ngoài app (gọi điện, nhắn trực tiếp)
    const ganNutDaNhac = (wrap, list) =>
      wrap.querySelectorAll(".danhac-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          e.stopPropagation();
          const i = list[parseInt(btn.dataset.idx, 10)];
          if (await hopNhacLai(i, { daGhi: false })) rerender();
        });
      });

    // ============================================================
    //  CẦN NHẮC TÁI KHÁM (nhắn Zalo hoặc đánh dấu đã nhắc)
    // ============================================================
    const zaloWrap = document.createElement("div");
    if (canNhac.length) {
      zaloWrap.innerHTML = `
        <div class="section-title"><span>💬 Cần nhắc tái khám <span class="badge badge-warn">${canNhac.length}</span></span></div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Bệnh nhân</th><th>Điện thoại</th><th>Ngày hẹn</th><th>Tình trạng</th><th></th></tr></thead>
          <tbody>
          ${canNhac
            .map((i, idx) => {
              const tt =
                i.days < 0
                  ? `<span class="badge badge-danger">Quá ${Math.abs(i.days)} ngày</span>`
                  : `<span class="badge badge-warn">Hôm nay</span>`;
              return `<tr>
                <td><strong>${U.esc(i.patient.name)}</strong> <span class="muted" style="font-size:12px;">${U.esc(i.patient.code || "")}</span></td>
                <td class="nowrap">${U.esc(i.patient.phone || "—")}</td>
                <td class="nowrap">${U.fmtDate(i.date)}</td>
                <td class="nowrap">${tt}${nhanLanNhac(i)}</td>
                <td class="text-right nowrap">
                  <button class="btn btn-sm danhac-btn" data-idx="${idx}">✔ Đã nhắc</button>
                  <button class="btn btn-sm btn-gold zalo-btn" data-idx="${idx}">💬 Nhắn Zalo</button>
                </td>
              </tr>`;
            })
            .join("")}
          </tbody>
        </table></div></div>`;
      root.appendChild(zaloWrap);

      ganNutDaNhac(zaloWrap, canNhac);
      zaloWrap.querySelectorAll(".zalo-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const i = canNhac[parseInt(btn.dataset.idx, 10)];
          Zalo.moHopThoai({
            patient: i.patient,
            visit: i.source,
            loai: Zalo.LOAI.NHAC_TAI_KHAM,
            // gửi xong: ghi nhận đã nhắc, hỏi có hẹn nhắc lại không, rồi ẩn khỏi danh sách
            onSent: async () => {
              try {
                await ghiDaNhac(i);
                i.nhac = Object.assign({}, i.nhac, { nhacLaiNgay: null });
                await hopNhacLai(i, { daGhi: true });
              } catch (e) {
                U.toast("Lỗi khi lưu: " + e.message, "err");
              }
              rerender();
            },
          });
        });
      });
    }

    // ============================================================
    //  ĐÃ NHẮC — CHỜ BỆNH NHÂN QUAY LẠI (thu gọn)
    // ============================================================
    if (daNhac.length) {
      const daNhacWrap = document.createElement("div");
      daNhacWrap.innerHTML = `
        <details class="card" style="margin-top:14px;">
          <summary class="card-pad" style="cursor:pointer;font-weight:600;">
            ✅ Đã nhắc — chờ bệnh nhân quay lại <span class="badge badge-info">${daNhac.length}</span>
          </summary>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Bệnh nhân</th><th>Điện thoại</th><th>Ngày hẹn</th><th>Đã nhắc</th><th>Nhắc lại</th><th></th></tr></thead>
            <tbody>
            ${daNhac
              .map(
                (i, idx) => `<tr>
                <td><strong>${U.esc(i.patient.name)}</strong> <span class="muted" style="font-size:12px;">${U.esc(i.patient.code || "")}</span></td>
                <td class="nowrap">${U.esc(i.patient.phone || "—")}</td>
                <td class="nowrap">${U.fmtDate(i.date)}</td>
                <td class="nowrap">Lần ${i.nhac.lan || 1} · ${U.fmtDate(U.toISODate(new Date(Number(i.nhac.nhacLuc))))}</td>
                <td class="nowrap">${i.nhac.nhacLaiNgay ? U.fmtDate(i.nhac.nhacLaiNgay) : "—"}</td>
                <td class="text-right nowrap">
                  <button class="btn btn-sm hennhac-btn" data-idx="${idx}">🗓️ Hẹn nhắc lại</button>
                  <button class="btn btn-sm bodanhdau-btn" data-idx="${idx}">Bỏ đánh dấu</button>
                </td>
              </tr>`
              )
              .join("")}
            </tbody>
          </table></div>
        </details>`;
      root.appendChild(daNhacWrap);

      daNhacWrap.querySelectorAll(".hennhac-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const i = daNhac[parseInt(btn.dataset.idx, 10)];
          if (await hopNhacLai(i, { daGhi: true })) rerender();
        });
      });
      daNhacWrap.querySelectorAll(".bodanhdau-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const i = daNhac[parseInt(btn.dataset.idx, 10)];
          const ok = await U.confirmBox(
            `Bỏ đánh dấu đã nhắc cho ${i.patient.name}? Bệnh nhân sẽ hiện lại trong danh sách cần nhắc.`
          );
          if (!ok) return;
          try {
            await boDaNhac(i);
            rerender();
          } catch (e) {
            U.toast("Lỗi khi lưu: " + e.message, "err");
          }
        });
      });
    }

    // ---- Nhắc lịch tái khám ----
    const remTitle = document.createElement("div");
    remTitle.className = "section-title";
    remTitle.innerHTML = `<span>🔔 Nhắc lịch tái khám</span>`;
    root.appendChild(remTitle);

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "card";
      empty.innerHTML = `<div class="empty"><div class="empty-ico">📅</div>
        <h3>Chưa có lịch hẹn tái khám</h3>
        <p class="muted">Khi thêm ngày hẹn tái khám trong lần khám hoặc phẫu thuật, chúng sẽ hiện ở đây.</p></div>`;
      root.appendChild(empty);
      return;
    }

    const group = (title, list, cls, coNutNhac) => {
      if (!list.length) return "";
      return `
        <div class="section-title" style="font-size:14px;margin:18px 0 10px;"><span>${title} <span class="badge ${cls}">${list.length}</span></span></div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Bệnh nhân</th><th>Điện thoại</th><th>Loại</th><th>Ngày hẹn</th><th>Còn lại</th><th>Ghi chú</th><th></th></tr></thead>
          <tbody>
          ${list
            .map((i, idx) => {
              let when;
              if (i.days < 0) when = `<span class="badge badge-danger">Quá ${Math.abs(i.days)} ngày</span>`;
              else if (i.days === 0) when = `<span class="badge badge-warn">Hôm nay</span>`;
              else when = `<span class="badge badge-info">Còn ${i.days} ngày</span>`;
              return `<tr class="clickable" data-pid="${i.patient.id}">
                <td><strong>${U.esc(i.patient.name)}</strong> <span class="muted" style="font-size:12px;">${U.esc(i.patient.code || "")}</span></td>
                <td class="nowrap">${U.esc(i.patient.phone || "—")}</td>
                <td>${i.kind === "surgery" ? '<span class="badge badge-danger">Sau mổ</span>' : '<span class="badge badge-info">Khám</span>'}</td>
                <td class="nowrap">${U.fmtDate(i.date)}</td>
                <td class="nowrap">${when}</td>
                <td>${U.esc(i.note || "—")}</td>
                <td class="text-right nowrap">${
                  coNutNhac ? `<button class="btn btn-sm danhac-btn" data-idx="${idx}">✔ Đã nhắc</button> ` : ""
                }<button class="btn btn-sm">Mở hồ sơ</button></td>
              </tr>`;
            })
            .join("")}
          </tbody>
        </table></div></div>`;
    };

    const remWrap = document.createElement("div");
    remWrap.innerHTML =
      group("⚠️ Quá hạn (chưa nhắc)", overdue, "badge-danger", true) +
      group("📌 Trong 7 ngày tới", soon, "badge-warn") +
      group("🗓️ Sắp tới (trong 30 ngày)", upcoming, "badge-info");
    root.appendChild(remWrap);
    ganNutDaNhac(remWrap, overdue);

    remWrap.querySelectorAll("tr.clickable").forEach((tr) => {
      tr.addEventListener("click", () =>
        App.go("patients", { id: tr.dataset.pid })
      );
    });

    if (!overdue.length && !soon.length && !upcoming.length) {
      const info = document.createElement("div");
      info.className = "card card-pad muted";
      info.textContent =
        "Không có lịch tái khám trong 30 ngày tới. Các lịch xa hơn vẫn được lưu trong hồ sơ.";
      root.appendChild(info);
    }
  }

  return { render, collectFollowUps };
})();
