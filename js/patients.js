/* ============================================================
 * patients.js — Module Quản lý bệnh nhân
 * ============================================================ */

const Patients = (function () {
  // ---- Sinh mã bệnh nhân tự động: BN0001, BN0002... ----
  async function nextCode() {
    let counter = await DB.getMeta("patientCounter", 0);
    counter = (counter || 0) + 1;
    await DB.setMeta("patientCounter", counter);
    return "BN" + String(counter).padStart(4, "0");
  }

  async function get(id) {
    return DB.get("patients", id);
  }

  async function save(p) {
    p.updatedAt = Date.now();
    return DB.put("patients", p);
  }

  // ---- Form thêm/sửa bệnh nhân ----
  function openForm(existing, onSaved) {
    const p = existing || {};
    const form = document.createElement("form");
    form.innerHTML = `
      <div class="form-grid">
        <div class="field full">
          <label>Họ và tên <span class="req">*</span></label>
          <input name="name" required value="${U.esc(p.name || "")}" placeholder="Nguyễn Văn A" />
        </div>
        <div class="field">
          <label>Giới tính</label>
          <select name="gender">
            <option value="Nam" ${p.gender === "Nam" ? "selected" : ""}>Nam</option>
            <option value="Nữ" ${p.gender === "Nữ" ? "selected" : ""}>Nữ</option>
            <option value="Khác" ${p.gender === "Khác" ? "selected" : ""}>Khác</option>
          </select>
        </div>
        <div class="field">
          <label>Năm sinh</label>
          <input name="birthYear" type="number" min="1900" max="2100" value="${U.esc(p.birthYear || "")}" placeholder="VD: 1985" />
        </div>
        <div class="field">
          <label>Số điện thoại</label>
          <input name="phone" value="${U.esc(p.phone || "")}" placeholder="09xxxxxxxx" />
        </div>
        <div class="field">
          <label>Nghề nghiệp</label>
          <input name="job" value="${U.esc(p.job || "")}" />
        </div>
        <div class="field full">
          <label>Địa chỉ</label>
          <input name="address" value="${U.esc(p.address || "")}" />
        </div>
        <div class="field full">
          <label>Tiền sử / dị ứng / ghi chú</label>
          <textarea name="note" placeholder="Tiền sử bệnh, dị ứng thuốc, lưu ý đặc biệt...">${U.esc(p.note || "")}</textarea>
        </div>
      </div>
    `;

    const foot = document.createElement("div");
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Hủy";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn btn-primary";
    submit.textContent = existing ? "Lưu thay đổi" : "Thêm bệnh nhân";
    submit.setAttribute("form", "");
    foot.appendChild(cancel);
    foot.appendChild(submit);

    const modal = U.openModal({
      title: existing ? "Sửa thông tin bệnh nhân" : "Thêm bệnh nhân mới",
      body: form,
      footer: foot,
    });
    cancel.addEventListener("click", modal.close);
    submit.addEventListener("click", (e) => {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const name = (fd.get("name") || "").trim();
      if (!name) {
        U.toast("Vui lòng nhập họ tên", "err");
        return;
      }
      const rec = existing
        ? Object.assign({}, existing)
        : { id: U.uid(), createdAt: Date.now(), code: await nextCode() };
      rec.name = name;
      rec.gender = fd.get("gender") || "";
      rec.birthYear = fd.get("birthYear") ? parseInt(fd.get("birthYear"), 10) : null;
      rec.phone = (fd.get("phone") || "").trim();
      rec.job = (fd.get("job") || "").trim();
      rec.address = (fd.get("address") || "").trim();
      rec.note = (fd.get("note") || "").trim();
      await save(rec);
      modal.close();
      U.toast(existing ? "Đã lưu thay đổi" : "Đã thêm bệnh nhân " + rec.code, "ok");
      if (onSaved) onSaved(rec);
    });
  }

  async function remove(id) {
    const ok = await U.confirmBox(
      "Xóa bệnh nhân sẽ xóa toàn bộ lần khám, ca phẫu thuật và ảnh liên quan. Bạn có chắc chắn?",
      { title: "Xóa bệnh nhân", danger: true, okText: "Xóa vĩnh viễn" }
    );
    if (!ok) return false;
    const [visits, surgeries] = await Promise.all([
      DB.byIndex("visits", "patientId", id),
      DB.byIndex("surgeries", "patientId", id),
    ]);
    for (const v of visits) await DB.del("visits", v.id);
    for (const s of surgeries) await DB.del("surgeries", s.id);
    await DB.del("patients", id);
    U.toast("Đã xóa bệnh nhân", "ok");
    return true;
  }

  // ============================================================
  // DANH SÁCH BỆNH NHÂN
  // ============================================================
  async function render(root, params) {
    if (params && params.id) return renderDetail(root, params.id);

    // nút thêm ở topbar
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-gold";
    addBtn.innerHTML = "➕ Thêm bệnh nhân";
    addBtn.addEventListener("click", () =>
      openForm(null, () => render(root, {}))
    );
    App.setTopbar(addBtn);

    const patients = await DB.all("patients");
    patients.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // đếm số lần khám / phẫu thuật cho mỗi BN
    const [visits, surgeries] = await Promise.all([
      DB.all("visits"),
      DB.all("surgeries"),
    ]);
    const visitCount = {};
    const surgCount = {};
    const lastActivity = {};
    visits.forEach((v) => {
      visitCount[v.patientId] = (visitCount[v.patientId] || 0) + 1;
      if (!lastActivity[v.patientId] || v.date > lastActivity[v.patientId])
        lastActivity[v.patientId] = v.date;
    });
    surgeries.forEach((s) => {
      surgCount[s.patientId] = (surgCount[s.patientId] || 0) + 1;
      if (!lastActivity[s.patientId] || s.date > lastActivity[s.patientId])
        lastActivity[s.patientId] = s.date;
    });

    root.innerHTML = "";

    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";
    toolbar.innerHTML = `
      <div class="search-box">
        <input type="text" id="patSearch" placeholder="Tìm theo tên, mã BN, số điện thoại..." />
      </div>
      <div class="muted" id="patCount"></div>
    `;
    root.appendChild(toolbar);

    const listWrap = document.createElement("div");
    listWrap.className = "card";
    root.appendChild(listWrap);

    function draw(list) {
      document.getElementById("patCount").textContent =
        list.length + " / " + patients.length + " bệnh nhân";
      if (!patients.length) {
        listWrap.innerHTML = `<div class="empty"><div class="empty-ico">👥</div>
          <h3>Chưa có bệnh nhân nào</h3>
          <p class="muted">Bấm "Thêm bệnh nhân" để bắt đầu.</p></div>`;
        return;
      }
      if (!list.length) {
        listWrap.innerHTML = `<div class="empty"><div class="empty-ico">🔍</div>
          <h3>Không tìm thấy</h3><p class="muted">Thử từ khóa khác.</p></div>`;
        return;
      }
      listWrap.innerHTML = `
        <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>Mã BN</th><th>Họ tên</th><th>Giới tính</th><th>Tuổi</th>
            <th>Điện thoại</th><th class="text-center">Lần khám</th>
            <th class="text-center">Phẫu thuật</th><th>Gần nhất</th><th></th>
          </tr></thead>
          <tbody>
            ${list
              .map((p) => {
                const age = U.ageFromYear(p.birthYear);
                return `<tr class="clickable" data-id="${p.id}">
                  <td><span class="badge badge-muted">${U.esc(p.code || "—")}</span></td>
                  <td><strong>${U.esc(p.name)}</strong></td>
                  <td>${U.esc(p.gender || "—")}</td>
                  <td>${age != null ? age : "—"}</td>
                  <td class="nowrap">${U.esc(p.phone || "—")}</td>
                  <td class="text-center">${visitCount[p.id] || 0}</td>
                  <td class="text-center">${surgCount[p.id] || 0}</td>
                  <td class="nowrap">${U.fmtDate(lastActivity[p.id])}</td>
                  <td class="text-right nowrap">
                    <button class="btn btn-sm act-open" data-id="${p.id}">Mở</button>
                  </td>
                </tr>`;
              })
              .join("")}
          </tbody>
        </table></div>`;

      listWrap.querySelectorAll("tr.clickable").forEach((tr) => {
        tr.addEventListener("click", () =>
          App.go("patients", { id: tr.dataset.id })
        );
      });
    }

    draw(patients);

    const search = document.getElementById("patSearch");
    search.addEventListener(
      "input",
      U.debounce(() => {
        const q = U.noAccent(search.value.trim());
        if (!q) return draw(patients);
        const filtered = patients.filter((p) => {
          return (
            U.noAccent(p.name).includes(q) ||
            U.noAccent(p.code || "").includes(q) ||
            (p.phone || "").includes(q)
          );
        });
        draw(filtered);
      }, 180)
    );
  }

  // ============================================================
  // CHI TIẾT BỆNH NHÂN
  // ============================================================
  async function renderDetail(root, id) {
    const p = await get(id);
    if (!p) {
      root.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Không tìm thấy bệnh nhân</h3></div>`;
      return;
    }

    const backBtn = document.createElement("button");
    backBtn.className = "btn";
    backBtn.innerHTML = "← Danh sách";
    backBtn.addEventListener("click", () => App.go("patients"));
    App.setTopbar(backBtn);

    const [visits, surgeries] = await Promise.all([
      DB.byIndex("visits", "patientId", id),
      DB.byIndex("surgeries", "patientId", id),
    ]);

    const age = U.ageFromYear(p.birthYear);
    root.innerHTML = "";

    // Header
    const head = document.createElement("div");
    head.className = "detail-head";
    head.innerHTML = `
      <div class="patient-title">
        <div class="avatar">${U.esc(U.initials(p.name))}</div>
        <div>
          <h2>${U.esc(p.name)}</h2>
          <div class="patient-meta">
            <span><span class="badge badge-muted">${U.esc(p.code || "—")}</span></span>
            <span>${U.esc(p.gender || "—")}</span>
            <span>${age != null ? age + " tuổi (" + p.birthYear + ")" : "Chưa rõ tuổi"}</span>
            <span>📞 ${U.esc(p.phone || "chưa có")}</span>
          </div>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn" id="pEdit">✏️ Sửa</button>
        <button class="btn btn-danger" id="pDel">🗑️ Xóa</button>
      </div>
    `;
    root.appendChild(head);

    head.querySelector("#pEdit").addEventListener("click", () =>
      openForm(p, () => renderDetail(root, id))
    );
    head.querySelector("#pDel").addEventListener("click", async () => {
      if (await remove(id)) App.go("patients");
    });

    // Thông tin chi tiết
    const infoCard = document.createElement("div");
    infoCard.className = "card card-pad";
    infoCard.innerHTML = `
      <div class="info-grid">
        <div class="info-item"><div class="info-label">Nghề nghiệp</div><div class="info-value">${U.esc(p.job || "—")}</div></div>
        <div class="info-item"><div class="info-label">Địa chỉ</div><div class="info-value">${U.esc(p.address || "—")}</div></div>
        <div class="info-item"><div class="info-label">Ngày tạo hồ sơ</div><div class="info-value">${U.fmtDateTime(p.createdAt)}</div></div>
        <div class="info-item" style="grid-column:1/-1;"><div class="info-label">Tiền sử / dị ứng / ghi chú</div><div class="info-value">${U.esc(p.note || "—")}</div></div>
      </div>
    `;
    root.appendChild(infoCard);

    // Nút thêm khám / phẫu thuật
    const actionBar = document.createElement("div");
    actionBar.className = "section-title";
    actionBar.innerHTML = `<span>Lịch sử khám & phẫu thuật</span>`;
    const actWrap = document.createElement("div");
    actWrap.style.display = "flex";
    actWrap.style.gap = "8px";
    const addVisitBtn = document.createElement("button");
    addVisitBtn.className = "btn btn-primary btn-sm";
    addVisitBtn.innerHTML = "🩺 Thêm lần khám";
    const addSurgBtn = document.createElement("button");
    addSurgBtn.className = "btn btn-sm";
    addSurgBtn.innerHTML = "🔪 Thêm phẫu thuật";
    actWrap.appendChild(addVisitBtn);
    actWrap.appendChild(addSurgBtn);
    actionBar.appendChild(actWrap);
    root.appendChild(actionBar);

    addVisitBtn.addEventListener("click", () =>
      Visits.openForm({ patientId: id, onSaved: () => renderDetail(root, id) })
    );
    addSurgBtn.addEventListener("click", () =>
      Surgeries.openForm({ patientId: id, onSaved: () => renderDetail(root, id) })
    );

    // Timeline gộp khám + phẫu thuật, sắp theo ngày giảm dần
    const events = [];
    visits.forEach((v) => events.push({ type: "visit", date: v.date, data: v }));
    surgeries.forEach((s) =>
      events.push({ type: "surgery", date: s.date, data: s })
    );
    events.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const tlWrap = document.createElement("div");
    if (!events.length) {
      tlWrap.innerHTML = `<div class="card card-pad"><div class="empty" style="padding:30px;">
        <div class="empty-ico">📋</div><h3>Chưa có lần khám hay phẫu thuật</h3>
        <p class="muted">Bấm nút phía trên để thêm.</p></div></div>`;
    } else {
      const tl = document.createElement("div");
      tl.className = "timeline";
      events.forEach((ev) => {
        const item = document.createElement("div");
        item.className = "tl-item " + (ev.type === "surgery" ? "surgery" : "");
        if (ev.type === "visit") {
          item.appendChild(Visits.card(ev.data, () => renderDetail(root, id)));
        } else {
          item.appendChild(Surgeries.card(ev.data, () => renderDetail(root, id)));
        }
        tl.appendChild(item);
      });
      tlWrap.appendChild(tl);
    }
    root.appendChild(tlWrap);
  }

  return { render, openForm, get, save, remove, nextCode };
})();
