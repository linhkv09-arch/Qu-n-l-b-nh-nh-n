/* ============================================================
 * visits.js — Module Khám bệnh (kèm ảnh nội soi & đơn thuốc)
 * ============================================================ */

const Visits = (function () {
  async function get(id) {
    return DB.get("visits", id);
  }
  async function save(v) {
    v.updatedAt = Date.now();
    return DB.put("visits", v);
  }
  async function remove(id) {
    const ok = await U.confirmBox("Xóa lần khám này (kèm ảnh)?", {
      title: "Xóa lần khám",
      danger: true,
      okText: "Xóa",
    });
    if (!ok) return false;
    await DB.del("visits", id);
    U.toast("Đã xóa lần khám", "ok");
    return true;
  }

  // ---- Form thêm/sửa lần khám ----
  // opts: { patientId, visit, onSaved }
  async function openForm(opts) {
    opts = opts || {};
    const existing = opts.visit || null;
    const images = existing ? (existing.images || []).map((x) => x) : [];

    // Danh sách bệnh nhân cho dropdown (khi mở từ menu Khám bệnh)
    let patients = [];
    let lockedPatient = null;
    if (opts.patientId) {
      lockedPatient = await Patients.get(opts.patientId);
    } else {
      patients = await DB.all("patients");
      patients.sort((a, b) => U.noAccent(a.name).localeCompare(U.noAccent(b.name)));
      if (!patients.length) {
        U.toast("Chưa có bệnh nhân. Hãy thêm bệnh nhân trước.", "err");
        return;
      }
    }

    const v = existing || {};
    const settings = await Settings.get();
    const meds = existing ? (existing.meds || []).map((x) => Object.assign({}, x)) : [];
    const initialAdvice = existing ? (v.advice || "") : (settings.adviceDefault || "");
    const form = document.createElement("form");

    const patientField = lockedPatient
      ? `<div class="field full">
           <label>Bệnh nhân</label>
           <input value="${U.esc(lockedPatient.name)} — ${U.esc(lockedPatient.code || "")}" disabled />
         </div>`
      : `<div class="field full">
           <label>Bệnh nhân <span class="req">*</span></label>
           <select name="patientId" required>
             <option value="">— Chọn bệnh nhân —</option>
             ${patients
               .map(
                 (p) =>
                   `<option value="${p.id}" ${
                     v.patientId === p.id ? "selected" : ""
                   }>${U.esc(p.name)} — ${U.esc(p.code || "")}</option>`
               )
               .join("")}
           </select>
         </div>`;

    form.innerHTML = `
      <div class="form-grid">
        ${patientField}
        <div class="field">
          <label>Ngày khám <span class="req">*</span></label>
          <input name="date" type="date" required value="${U.esc(v.date || U.todayISO())}" />
        </div>
        <div class="field">
          <label>Chi phí khám (VNĐ)</label>
          <input name="fee" type="text" inputmode="numeric" value="${v.fee ? U.fmtMoney(v.fee) : ""}" placeholder="VD: 200.000" />
        </div>
        <div class="field full">
          <label>Lý do khám</label>
          <input name="reason" value="${U.esc(v.reason || "")}" placeholder="Ù tai, nghẹt mũi, đau họng..." />
        </div>
        <div class="field full">
          <label>Triệu chứng / Khám lâm sàng</label>
          <textarea name="symptoms" placeholder="Mô tả triệu chứng, kết quả nội soi...">${U.esc(v.symptoms || "")}</textarea>
        </div>
        <div class="field full">
          <label>Chẩn đoán</label>
          <input name="diagnosis" value="${U.esc(v.diagnosis || "")}" placeholder="VD: Viêm mũi xoang cấp" />
        </div>
        <div class="field full">
          <label>Hướng điều trị / Xử trí</label>
          <textarea name="treatment" placeholder="Hướng điều trị, thủ thuật đã làm...">${U.esc(v.treatment || "")}</textarea>
        </div>
        <div class="field full">
          <label>Thuốc điều trị</label>
          <div class="meds-mount"></div>
          <div class="hint">Nhập từng thuốc để in đơn đẹp; có thể kèm ảnh đơn viết tay bên dưới.</div>
        </div>
        <div class="field full">
          <label>Lời dặn</label>
          <textarea name="advice" placeholder="VD: Uống thuốc đúng giờ, tái khám khi hết thuốc hoặc khi có dấu hiệu bất thường...">${U.esc(initialAdvice)}</textarea>
        </div>
        <div class="field">
          <label>Hẹn tái khám ngày</label>
          <input name="followUpDate" type="date" value="${U.esc(v.followUpDate || "")}" />
        </div>
        <div class="field">
          <label>Ghi chú tái khám</label>
          <input name="followUpNote" value="${U.esc(v.followUpNote || "")}" placeholder="VD: tái khám sau 1 tuần" />
        </div>
        <div class="field full">
          <label>Ảnh nội soi & đơn thuốc</label>
        </div>
      </div>
    `;

    // Bảng nhập thuốc có cấu trúc
    const medsEd = Rx.medsEditor(meds);
    form.querySelector(".meds-mount").appendChild(medsEd.el);

    const uploader = U.imageUploader(images, ["noisoi", "donthuoc", "khac"]);
    form.querySelector(".form-grid").appendChild(
      Object.assign(document.createElement("div"), { className: "full" })
    ).appendChild(uploader.el);

    // Gợi ý nhanh ngày tái khám (tự nhảy ngày theo ngày khám)
    const vDateInput = form.querySelector('input[name="date"]');
    const vFollowInput = form.querySelector('input[name="followUpDate"]');
    vFollowInput.parentElement.appendChild(
      U.followUpQuick(vDateInput, vFollowInput)
    );

    // format tiền khi gõ
    const feeInput = form.querySelector('input[name="fee"]');
    feeInput.addEventListener("input", () => {
      const raw = U.parseMoney(feeInput.value);
      feeInput.value = raw ? U.fmtMoney(raw) : "";
    });

    const foot = document.createElement("div");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Hủy";
    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "btn";
    printBtn.innerHTML = "💊 Lưu &amp; In đơn";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn btn-primary";
    submit.textContent = existing ? "Lưu thay đổi" : "Lưu lần khám";
    foot.appendChild(cancel);
    foot.appendChild(printBtn);
    foot.appendChild(submit);

    const modal = U.openModal({
      title: existing ? "Sửa lần khám" : "Thêm lần khám",
      body: form,
      footer: foot,
      wide: true,
    });
    cancel.addEventListener("click", modal.close);
    submit.addEventListener("click", (e) => {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
    });

    // Gom dữ liệu từ form + kiểm tra hợp lệ
    function buildRec() {
      const fd = new FormData(form);
      const patientId = lockedPatient ? lockedPatient.id : fd.get("patientId");
      if (!patientId) {
        U.toast("Vui lòng chọn bệnh nhân", "err");
        return null;
      }
      if (!fd.get("date")) {
        U.toast("Vui lòng chọn ngày khám", "err");
        return null;
      }
      const rec = existing
        ? Object.assign({}, existing)
        : { id: U.uid(), createdAt: Date.now() };
      rec.patientId = patientId;
      rec.date = fd.get("date");
      rec.reason = (fd.get("reason") || "").trim();
      rec.symptoms = (fd.get("symptoms") || "").trim();
      rec.diagnosis = (fd.get("diagnosis") || "").trim();
      rec.treatment = (fd.get("treatment") || "").trim();
      rec.meds = meds.filter((m) => (m.name || "").trim()); // bỏ dòng thuốc trống
      rec.advice = (fd.get("advice") || "").trim();
      rec.fee = U.parseMoney(fd.get("fee"));
      rec.followUpDate = fd.get("followUpDate") || "";
      rec.followUpNote = (fd.get("followUpNote") || "").trim();
      rec.images = images;
      return rec;
    }

    async function persist() {
      const rec = buildRec();
      if (!rec) return null;
      await save(rec);
      return rec;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rec = await persist();
      if (!rec) return;
      modal.close();
      U.toast(existing ? "Đã lưu thay đổi" : "Đã lưu lần khám", "ok");
      if (opts.onSaved) opts.onSaved(rec);
    });

    printBtn.addEventListener("click", async () => {
      const rec = await persist();
      if (!rec) return;
      modal.close();
      U.toast("Đã lưu lần khám", "ok");
      if (opts.onSaved) opts.onSaved(rec);
      Rx.previewFromVisit(rec);
    });
  }

  // ---- Thẻ hiển thị 1 lần khám (dùng trong timeline bệnh nhân) ----
  function card(v, onChanged) {
    const el = document.createElement("div");
    el.className = "card card-pad";
    el.style.marginBottom = "0";
    const imgCount = (v.images || []).length;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <span class="badge badge-info">🩺 Khám bệnh</span>
          <strong style="margin-left:8px;">${U.fmtDate(v.date)}</strong>
        </div>
        <div class="row-actions">
          <button class="btn btn-sm act-print">🖨️ Đơn</button>
          <button class="btn btn-sm act-view">Xem</button>
          <button class="btn btn-sm act-edit">Sửa</button>
          <button class="btn btn-sm btn-danger act-del">Xóa</button>
        </div>
      </div>
      <div style="margin-top:10px;font-size:14px;line-height:1.6;">
        ${v.diagnosis ? `<div><span class="muted">Chẩn đoán:</span> <strong>${U.esc(v.diagnosis)}</strong></div>` : ""}
        ${v.reason ? `<div><span class="muted">Lý do:</span> ${U.esc(v.reason)}</div>` : ""}
        <div style="margin-top:6px;display:flex;gap:14px;flex-wrap:wrap;font-size:13px;" class="muted">
          ${imgCount ? `<span>📷 ${imgCount} ảnh</span>` : ""}
          ${v.fee ? `<span>💵 ${U.fmtMoney(v.fee)} đ</span>` : ""}
          ${v.followUpDate ? `<span>🔔 Hẹn tái khám: ${U.fmtDate(v.followUpDate)}</span>` : ""}
        </div>
      </div>
    `;
    el.querySelector(".act-print").addEventListener("click", () => Rx.previewFromVisit(v));
    el.querySelector(".act-view").addEventListener("click", () => detailModal(v));
    el.querySelector(".act-edit").addEventListener("click", () =>
      openForm({ patientId: v.patientId, visit: v, onSaved: onChanged })
    );
    el.querySelector(".act-del").addEventListener("click", async () => {
      if (await remove(v.id)) onChanged && onChanged();
    });
    return el;
  }

  // ---- Modal xem chi tiết lần khám ----
  async function detailModal(v) {
    const body = document.createElement("div");
    const row = (label, val) =>
      val
        ? `<div style="margin-bottom:12px;"><div class="info-label">${label}</div><div class="info-value" style="white-space:pre-wrap;">${U.esc(val)}</div></div>`
        : "";
    const medsHtml =
      v.meds && v.meds.length
        ? `<div style="margin-bottom:12px;"><div class="info-label">Thuốc điều trị</div>
             <ol style="margin:4px 0;padding-left:20px;">${v.meds
               .map(
                 (m) =>
                   `<li style="margin-bottom:5px;"><b>${U.esc(m.name)}</b>${
                     m.qty ? ` — ${U.esc(m.qty)} ${U.esc(m.unit || "")}` : ""
                   }${
                     m.usage
                       ? `<div class="muted" style="font-size:13px;">${U.esc(m.usage)}</div>`
                       : ""
                   }</li>`
               )
               .join("")}</ol></div>`
        : row("Đơn thuốc", v.medications);

    body.innerHTML = `
      <div style="margin-bottom:14px;">
        <span class="badge badge-info">🩺 Khám ngày ${U.fmtDate(v.date)}</span>
        ${v.fee ? `<span class="badge badge-muted" style="margin-left:6px;">${U.fmtMoney(v.fee)} đ</span>` : ""}
      </div>
      ${row("Lý do khám", v.reason)}
      ${row("Triệu chứng / Khám lâm sàng", v.symptoms)}
      ${row("Chẩn đoán", v.diagnosis)}
      ${row("Hướng điều trị", v.treatment)}
      ${medsHtml}
      ${row("Lời dặn", v.advice)}
      ${
        v.followUpDate
          ? row(
              "Hẹn tái khám",
              U.fmtDate(v.followUpDate) + (v.followUpNote ? " — " + v.followUpNote : "")
            )
          : ""
      }
    `;
    const galLabel = document.createElement("div");
    galLabel.className = "info-label";
    galLabel.style.marginBottom = "8px";
    galLabel.textContent = "Ảnh (" + (v.images || []).length + ")";
    body.appendChild(galLabel);
    body.appendChild(U.imageGallery(v.images || []));

    const foot = document.createElement("div");
    const close = document.createElement("button");
    close.className = "btn";
    close.textContent = "Đóng";
    const printBtn = document.createElement("button");
    printBtn.className = "btn btn-primary";
    printBtn.innerHTML = "🖨️ In đơn thuốc";
    foot.appendChild(close);
    foot.appendChild(printBtn);
    const modal = U.openModal({ title: "Chi tiết lần khám", body, footer: foot, wide: true });
    close.addEventListener("click", modal.close);
    printBtn.addEventListener("click", () => Rx.previewFromVisit(v));
  }

  // ============================================================
  // DANH SÁCH TẤT CẢ LẦN KHÁM (menu "Khám bệnh")
  // ============================================================
  async function render(root, params) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-gold";
    addBtn.innerHTML = "➕ Thêm lần khám";
    addBtn.addEventListener("click", () =>
      openForm({ onSaved: () => render(root, {}) })
    );
    App.setTopbar(addBtn);

    const [visits, patients] = await Promise.all([
      DB.all("visits"),
      DB.all("patients"),
    ]);
    const pMap = {};
    patients.forEach((p) => (pMap[p.id] = p));
    visits.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    root.innerHTML = "";
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.innerHTML = `
      <div class="search-box">
        <input type="text" id="vSearch" placeholder="Tìm theo tên bệnh nhân, chẩn đoán..." />
      </div>
      <div class="muted" id="vCount"></div>`;
    root.appendChild(toolbar);

    const wrap = document.createElement("div");
    wrap.className = "card";
    root.appendChild(wrap);

    function draw(list) {
      document.getElementById("vCount").textContent =
        list.length + " / " + visits.length + " lần khám";
      if (!visits.length) {
        wrap.innerHTML = `<div class="empty"><div class="empty-ico">🩺</div>
          <h3>Chưa có lần khám nào</h3><p class="muted">Bấm "Thêm lần khám" để bắt đầu.</p></div>`;
        return;
      }
      if (!list.length) {
        wrap.innerHTML = `<div class="empty"><div class="empty-ico">🔍</div><h3>Không tìm thấy</h3></div>`;
        return;
      }
      wrap.innerHTML = `
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>Ngày</th><th>Bệnh nhân</th><th>Chẩn đoán</th>
            <th class="text-center">Ảnh</th><th class="text-right">Chi phí</th>
            <th>Tái khám</th><th></th>
          </tr></thead>
          <tbody>
            ${list
              .map((v) => {
                const p = pMap[v.patientId];
                return `<tr class="clickable" data-id="${v.id}">
                  <td class="nowrap">${U.fmtDate(v.date)}</td>
                  <td><strong>${U.esc(p ? p.name : "?")}</strong><div class="muted" style="font-size:12px;">${U.esc(p ? p.code : "")}</div></td>
                  <td>${U.esc(v.diagnosis || "—")}</td>
                  <td class="text-center">${(v.images || []).length || "—"}</td>
                  <td class="text-right nowrap">${v.fee ? U.fmtMoney(v.fee) + " đ" : "—"}</td>
                  <td class="nowrap">${v.followUpDate ? U.fmtDate(v.followUpDate) : "—"}</td>
                  <td class="text-right"><button class="btn btn-sm act-open" data-id="${v.patientId}">Hồ sơ</button></td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table></div>`;
      wrap.querySelectorAll("tr.clickable").forEach((tr) => {
        tr.addEventListener("click", (e) => {
          if (e.target.classList.contains("act-open")) return;
          const v = visits.find((x) => x.id === tr.dataset.id);
          if (v) detailModal(v);
        });
      });
      wrap.querySelectorAll(".act-open").forEach((b) => {
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          App.go("patients", { id: b.dataset.id });
        });
      });
    }

    draw(visits);
    const search = document.getElementById("vSearch");
    search.addEventListener(
      "input",
      U.debounce(() => {
        const q = U.noAccent(search.value.trim());
        if (!q) return draw(visits);
        draw(
          visits.filter((v) => {
            const p = pMap[v.patientId];
            return (
              (p && U.noAccent(p.name).includes(q)) ||
              U.noAccent(v.diagnosis || "").includes(q) ||
              U.noAccent(v.reason || "").includes(q)
            );
          })
        );
      }, 180)
    );
  }

  return { render, openForm, card, detailModal, get, save, remove };
})();
