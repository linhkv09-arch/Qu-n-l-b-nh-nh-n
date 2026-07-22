/* ============================================================
 * surgeries.js — Module Phẫu thuật (kèm ảnh trước/sau mổ)
 * ============================================================ */

const Surgeries = (function () {
  async function get(id) {
    return DB.get("surgeries", id);
  }
  async function save(s) {
    s.updatedAt = Date.now();
    return DB.put("surgeries", s);
  }
  async function remove(id) {
    const ok = await U.confirmBox("Xóa ca phẫu thuật này (kèm ảnh)?", {
      title: "Xóa phẫu thuật",
      danger: true,
      okText: "Xóa",
    });
    if (!ok) return false;
    await DB.del("surgeries", id);
    U.toast("Đã xóa ca phẫu thuật", "ok");
    return true;
  }

  // ---- Form thêm/sửa phẫu thuật ----
  // opts: { patientId, surgery, onSaved }
  async function openForm(opts) {
    opts = opts || {};
    const existing = opts.surgery || null;
    const images = existing ? (existing.images || []).map((x) => x) : [];

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

    const s = existing || {};
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
                     s.patientId === p.id ? "selected" : ""
                   }>${U.esc(p.name)} — ${U.esc(p.code || "")}</option>`
               )
               .join("")}
           </select>
         </div>`;

    form.innerHTML = `
      <div class="form-grid">
        ${patientField}
        <div class="field">
          <label>Ngày phẫu thuật <span class="req">*</span></label>
          <input name="date" type="date" required value="${U.esc(s.date || U.todayISO())}" />
        </div>
        <div class="field">
          <label>Chi phí phẫu thuật (VNĐ)</label>
          <input name="fee" type="text" inputmode="numeric" value="${s.fee ? U.fmtMoney(s.fee) : ""}" placeholder="VD: 5.000.000" />
        </div>
        <div class="field full">
          <label>Tên / Loại phẫu thuật <span class="req">*</span></label>
          <input name="type" required value="${U.esc(s.type || "")}" placeholder="VD: Nạo VA, Cắt amidan, Chỉnh hình vách ngăn..." />
        </div>
        <div class="field">
          <label>Phương pháp vô cảm</label>
          <select name="anesthesia">
            ${["", "Gây mê nội khí quản", "Gây mê tĩnh mạch", "Gây tê tại chỗ", "Tiền mê"]
              .map(
                (a) =>
                  `<option value="${U.esc(a)}" ${s.anesthesia === a ? "selected" : ""}>${a || "— Chọn —"}</option>`
              )
              .join("")}
          </select>
        </div>
        <div class="field">
          <label>Tình trạng thanh toán</label>
          <select name="paid">
            <option value="chuathanhtoan" ${s.paid === "chuathanhtoan" ? "selected" : ""}>Chưa thanh toán</option>
            <option value="dathanhtoan" ${s.paid === "dathanhtoan" || s.paid === undefined ? "selected" : ""}>Đã thanh toán</option>
          </select>
        </div>
        <div class="field full">
          <label>Chẩn đoán trước mổ</label>
          <input name="diagnosis" value="${U.esc(s.diagnosis || "")}" />
        </div>
        <div class="field full">
          <label>Tường trình / Cách thức phẫu thuật</label>
          <textarea name="procedure" placeholder="Mô tả các bước phẫu thuật, ghi nhận trong mổ...">${U.esc(s.procedure || "")}</textarea>
        </div>
        <div class="field full">
          <label>Kết quả</label>
          <textarea name="result" placeholder="Kết quả phẫu thuật, tình trạng sau mổ...">${U.esc(s.result || "")}</textarea>
        </div>
        <div class="field full">
          <label>Biến chứng (nếu có)</label>
          <input name="complication" value="${U.esc(s.complication || "")}" placeholder="Không / mô tả biến chứng" />
        </div>
        <div class="field">
          <label>Hẹn tái khám sau mổ</label>
          <input name="followUpDate" type="date" value="${U.esc(s.followUpDate || "")}" />
        </div>
        <div class="field">
          <label>Ghi chú tái khám</label>
          <input name="followUpNote" value="${U.esc(s.followUpNote || "")}" placeholder="VD: cắt chỉ sau 7 ngày" />
        </div>
      </div>
    `;

    // Gợi ý mốc tái khám nhanh (tự nhảy ngày theo ngày mổ)
    const dateInput = form.querySelector('input[name="date"]');
    const followInput = form.querySelector('input[name="followUpDate"]');
    followInput.parentElement.appendChild(
      U.followUpQuick(dateInput, followInput, [
        ["3 ngày", 3],
        ["5 ngày", 5],
        ["1 tuần", 7],
        ["2 tuần", 14],
        ["1 tháng", 30],
        ["3 tháng", 90],
      ])
    );

    // Ảnh trước/sau mổ
    const imgLabel = document.createElement("div");
    imgLabel.className = "field full";
    imgLabel.innerHTML = `<label>Ảnh trước/sau mổ, nội soi</label>`;
    form.querySelector(".form-grid").appendChild(imgLabel);
    const uploader = U.imageUploader(images, ["truocmo", "saumo", "noisoi", "khac"]);
    const imgHolder = document.createElement("div");
    imgHolder.className = "full";
    imgHolder.appendChild(uploader.el);
    form.querySelector(".form-grid").appendChild(imgHolder);

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
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn btn-primary";
    submit.textContent = existing ? "Lưu thay đổi" : "Lưu phẫu thuật";
    foot.appendChild(cancel);
    foot.appendChild(submit);

    const modal = U.openModal({
      title: existing ? "Sửa ca phẫu thuật" : "Thêm ca phẫu thuật",
      body: form,
      footer: foot,
      wide: true,
    });
    cancel.addEventListener("click", modal.close);
    submit.addEventListener("click", (e) => {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const patientId = lockedPatient ? lockedPatient.id : fd.get("patientId");
      if (!patientId) return U.toast("Vui lòng chọn bệnh nhân", "err");
      if (!fd.get("type") || !fd.get("type").trim())
        return U.toast("Vui lòng nhập tên phẫu thuật", "err");
      const rec = existing
        ? Object.assign({}, existing)
        : { id: U.uid(), createdAt: Date.now() };
      rec.patientId = patientId;
      rec.date = fd.get("date");
      rec.type = fd.get("type").trim();
      rec.anesthesia = fd.get("anesthesia") || "";
      rec.paid = fd.get("paid") || "dathanhtoan";
      rec.diagnosis = (fd.get("diagnosis") || "").trim();
      rec.procedure = (fd.get("procedure") || "").trim();
      rec.result = (fd.get("result") || "").trim();
      rec.complication = (fd.get("complication") || "").trim();
      rec.fee = U.parseMoney(fd.get("fee"));
      rec.followUpDate = fd.get("followUpDate") || "";
      rec.followUpNote = (fd.get("followUpNote") || "").trim();
      rec.images = images;
      await save(rec);
      modal.close();
      U.toast(existing ? "Đã lưu thay đổi" : "Đã lưu ca phẫu thuật", "ok");
      if (opts.onSaved) opts.onSaved(rec);
    });
  }

  // ---- Thẻ hiển thị trong timeline ----
  function card(s, onChanged) {
    const el = document.createElement("div");
    el.className = "card card-pad";
    const imgCount = (s.images || []).length;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
        <div>
          <span class="badge badge-danger">🔪 Phẫu thuật</span>
          <strong style="margin-left:8px;">${U.fmtDate(s.date)}</strong>
        </div>
        <div class="row-actions">
          <button class="btn btn-sm act-view">Xem</button>
          <button class="btn btn-sm act-edit">Sửa</button>
          <button class="btn btn-sm btn-danger act-del">Xóa</button>
        </div>
      </div>
      <div style="margin-top:10px;font-size:14px;line-height:1.6;">
        <div><strong>${U.esc(s.type || "")}</strong></div>
        ${s.anesthesia ? `<div class="muted" style="font-size:13px;">Vô cảm: ${U.esc(s.anesthesia)}</div>` : ""}
        ${s.complication ? `<div style="color:var(--danger);font-size:13px;">⚠️ Biến chứng: ${U.esc(s.complication)}</div>` : ""}
        <div style="margin-top:6px;display:flex;gap:14px;flex-wrap:wrap;font-size:13px;" class="muted">
          ${imgCount ? `<span>📷 ${imgCount} ảnh</span>` : ""}
          ${s.fee ? `<span>💵 ${U.fmtMoney(s.fee)} đ ${s.paid === "chuathanhtoan" ? "(chưa TT)" : ""}</span>` : ""}
          ${s.followUpDate ? `<span>🔔 Tái khám: ${U.fmtDate(s.followUpDate)}</span>` : ""}
        </div>
      </div>
    `;
    el.querySelector(".act-view").addEventListener("click", () => detailModal(s));
    el.querySelector(".act-edit").addEventListener("click", () =>
      openForm({ patientId: s.patientId, surgery: s, onSaved: onChanged })
    );
    el.querySelector(".act-del").addEventListener("click", async () => {
      if (await remove(s.id)) onChanged && onChanged();
    });
    return el;
  }

  async function detailModal(s) {
    const body = document.createElement("div");
    const row = (label, val) =>
      val
        ? `<div style="margin-bottom:12px;"><div class="info-label">${label}</div><div class="info-value" style="white-space:pre-wrap;">${U.esc(val)}</div></div>`
        : "";
    body.innerHTML = `
      <div style="margin-bottom:14px;">
        <span class="badge badge-danger">🔪 ${U.esc(s.type || "Phẫu thuật")}</span>
        <span class="badge badge-muted" style="margin-left:6px;">${U.fmtDate(s.date)}</span>
        ${s.fee ? `<span class="badge ${s.paid === "chuathanhtoan" ? "badge-warn" : "badge-ok"}" style="margin-left:6px;">${U.fmtMoney(s.fee)} đ ${s.paid === "chuathanhtoan" ? "· chưa TT" : "· đã TT"}</span>` : ""}
      </div>
      ${row("Chẩn đoán trước mổ", s.diagnosis)}
      ${row("Phương pháp vô cảm", s.anesthesia)}
      ${row("Tường trình phẫu thuật", s.procedure)}
      ${row("Kết quả", s.result)}
      ${row("Biến chứng", s.complication)}
      ${
        s.followUpDate
          ? row("Hẹn tái khám", U.fmtDate(s.followUpDate) + (s.followUpNote ? " — " + s.followUpNote : ""))
          : ""
      }
    `;
    const galLabel = document.createElement("div");
    galLabel.className = "info-label";
    galLabel.style.marginBottom = "8px";
    galLabel.textContent = "Ảnh (" + (s.images || []).length + ")";
    body.appendChild(galLabel);
    body.appendChild(U.imageGallery(s.images || []));
    U.openModal({ title: "Chi tiết ca phẫu thuật", body, wide: true });
  }

  // ============================================================
  // DANH SÁCH TẤT CẢ PHẪU THUẬT
  // ============================================================
  async function render(root, params) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-gold";
    addBtn.innerHTML = "➕ Thêm phẫu thuật";
    addBtn.addEventListener("click", () =>
      openForm({ onSaved: () => render(root, {}) })
    );
    App.setTopbar(addBtn);

    const [surgeries, patients] = await Promise.all([
      DB.all("surgeries"),
      DB.all("patients"),
    ]);
    const pMap = {};
    patients.forEach((p) => (pMap[p.id] = p));
    surgeries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    root.innerHTML = "";
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.innerHTML = `
      <div class="search-box">
        <input type="text" id="sSearch" placeholder="Tìm theo tên bệnh nhân, loại phẫu thuật..." />
      </div>
      <div class="muted" id="sCount"></div>`;
    root.appendChild(toolbar);

    const wrap = document.createElement("div");
    wrap.className = "card";
    root.appendChild(wrap);

    function draw(list) {
      document.getElementById("sCount").textContent =
        list.length + " / " + surgeries.length + " ca phẫu thuật";
      if (!surgeries.length) {
        wrap.innerHTML = `<div class="empty"><div class="empty-ico">🔪</div>
          <h3>Chưa có ca phẫu thuật nào</h3><p class="muted">Bấm "Thêm phẫu thuật" để bắt đầu.</p></div>`;
        return;
      }
      if (!list.length) {
        wrap.innerHTML = `<div class="empty"><div class="empty-ico">🔍</div><h3>Không tìm thấy</h3></div>`;
        return;
      }
      wrap.innerHTML = `
        <div class="table-wrap"><table class="data">
          <thead><tr>
            <th>Ngày</th><th>Bệnh nhân</th><th>Loại phẫu thuật</th>
            <th class="text-center">Ảnh</th><th class="text-right">Chi phí</th>
            <th>Tái khám</th><th></th>
          </tr></thead>
          <tbody>
            ${list
              .map((s) => {
                const p = pMap[s.patientId];
                return `<tr class="clickable" data-id="${s.id}">
                  <td class="nowrap">${U.fmtDate(s.date)}</td>
                  <td><strong>${U.esc(p ? p.name : "?")}</strong><div class="muted" style="font-size:12px;">${U.esc(p ? p.code : "")}</div></td>
                  <td>${U.esc(s.type || "—")}</td>
                  <td class="text-center">${(s.images || []).length || "—"}</td>
                  <td class="text-right nowrap">${s.fee ? U.fmtMoney(s.fee) + " đ" : "—"}</td>
                  <td class="nowrap">${s.followUpDate ? U.fmtDate(s.followUpDate) : "—"}</td>
                  <td class="text-right"><button class="btn btn-sm act-open" data-id="${s.patientId}">Hồ sơ</button></td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table></div>`;
      wrap.querySelectorAll("tr.clickable").forEach((tr) => {
        tr.addEventListener("click", (e) => {
          if (e.target.classList.contains("act-open")) return;
          const s = surgeries.find((x) => x.id === tr.dataset.id);
          if (s) detailModal(s);
        });
      });
      wrap.querySelectorAll(".act-open").forEach((b) => {
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          App.go("patients", { id: b.dataset.id });
        });
      });
    }

    draw(surgeries);
    const search = document.getElementById("sSearch");
    search.addEventListener(
      "input",
      U.debounce(() => {
        const q = U.noAccent(search.value.trim());
        if (!q) return draw(surgeries);
        draw(
          surgeries.filter((s) => {
            const p = pMap[s.patientId];
            return (
              (p && U.noAccent(p.name).includes(q)) ||
              U.noAccent(s.type || "").includes(q)
            );
          })
        );
      }, 180)
    );
  }

  return { render, openForm, card, detailModal, get, save, remove };
})();
