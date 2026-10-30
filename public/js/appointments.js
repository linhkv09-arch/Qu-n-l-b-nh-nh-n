/* ============================================================
 * appointments.js — Lịch hẹn khám (bệnh nhân gọi điện hẹn trước)
 *
 * Bác sĩ ghi lại lịch hẹn khi bệnh nhân gọi điện; app nhắc lại
 * vào đúng ngày hẹn (ở đây và trên Trang chủ) để bác sĩ gọi/nhắn
 * nhắc bệnh nhân đến khám.
 * ============================================================ */

const Appointments = (function () {
  const STATUS = {
    CHO: "cho",
    DA_NHAC: "da_nhac",
    DA_DEN: "da_den",
    KHONG_DEN: "khong_den",
    HUY: "huy",
  };
  const STATUS_LABEL = {
    cho: "Chờ đến ngày",
    da_nhac: "Đã nhắc",
    da_den: "Đã đến khám",
    khong_den: "Không đến",
    huy: "Đã hủy",
  };
  const DANG_CHO = [STATUS.CHO, STATUS.DA_NHAC]; // lịch hẹn còn hiệu lực

  async function get(id) {
    return DB.get("appointments", id);
  }

  async function save(a) {
    a.updatedAt = Date.now();
    delete a.days; // trường tính tạm (collectUpcoming/render) — không phải cột trong Supabase
    return DB.put("appointments", a);
  }

  async function setStatus(a, status) {
    const rec = Object.assign({}, a, { status, updatedAt: Date.now() });
    delete rec.days; // trường tính tạm (collectUpcoming/render) — không phải cột trong Supabase
    await DB.put("appointments", rec);
    return rec;
  }

  async function remove(id) {
    const ok = await U.confirmBox("Xóa lịch hẹn này?", {
      title: "Xóa lịch hẹn",
      danger: true,
      okText: "Xóa",
    });
    if (!ok) return false;
    await DB.del("appointments", id);
    U.toast("Đã xóa lịch hẹn", "ok");
    return true;
  }

  // Danh sách lịch hẹn còn hiệu lực (chờ/đã nhắc), sắp theo ngày+giờ tăng dần.
  // Dùng chung cho trang này và widget ở Trang chủ.
  async function collectUpcoming() {
    const list = await DB.all("appointments");
    const active = list.filter((a) => DANG_CHO.includes(a.status || STATUS.CHO));
    active.forEach((a) => (a.days = U.daysUntil(a.date)));
    active.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
    return active;
  }

  // ============================================================
  //  FORM THÊM / SỬA LỊCH HẸN (tìm bệnh nhân có sẵn hoặc nhập tên mới)
  // ============================================================
  async function openForm(opts) {
    opts = opts || {};
    const existing = opts.existing || null;
    const a = existing || {};
    const patients = await DB.all("patients");

    const form = document.createElement("form");
    form.innerHTML = `
      <div class="form-grid">
        <div class="field full" style="position:relative;">
          <label>Bệnh nhân <span class="req">*</span></label>
          <input name="name" required autocomplete="off" value="${U.esc(a.name || "")}"
                 placeholder="Nhập tên — nếu đã có hồ sơ, chọn trong danh sách gợi ý" />
          <input type="hidden" name="patientId" value="${U.esc(a.patientId || "")}" />
          <div class="ap-suggest" style="display:none;position:absolute;left:0;right:0;top:100%;z-index:20;
               background:var(--card,#fff);border:1px solid var(--line,#dde3ea);border-radius:10px;
               box-shadow:0 10px 24px rgba(0,0,0,.12);max-height:220px;overflow:auto;margin-top:4px;"></div>
          <p class="hint" id="apLinkHint" style="margin-top:6px;"></p>
        </div>
        <div class="field">
          <label>Số điện thoại</label>
          <input name="phone" value="${U.esc(a.phone || "")}" placeholder="09xxxxxxxx" />
        </div>
        <div class="field">
          <label>Ngày hẹn <span class="req">*</span></label>
          <input name="date" type="date" required value="${U.esc(a.date || U.todayISO())}" />
        </div>
        <div class="field">
          <label>Giờ hẹn (nếu có)</label>
          <input name="time" type="time" value="${U.esc(a.time || "")}" />
        </div>
        <div class="field full">
          <label>Lý do khám (bệnh nhân nói qua điện thoại)</label>
          <input name="reason" value="${U.esc(a.reason || "")}" placeholder="VD: đau họng, tái khám sau mổ..." />
        </div>
        <div class="field full">
          <label>Ghi chú nội bộ</label>
          <textarea name="note" placeholder="Ghi chú thêm cho bác sĩ/lễ tân...">${U.esc(a.note || "")}</textarea>
        </div>
      </div>
    `;

    // ---- Tìm & chọn bệnh nhân có sẵn ----
    const nameInp = form.querySelector('[name="name"]');
    const phoneInp = form.querySelector('[name="phone"]');
    const pidInp = form.querySelector('[name="patientId"]');
    const suggestBox = form.querySelector(".ap-suggest");
    const linkHint = form.querySelector("#apLinkHint");

    function capNhatHint() {
      if (pidInp.value) {
        linkHint.innerHTML = "🔗 Đã liên kết với hồ sơ bệnh nhân có sẵn.";
      } else {
        linkHint.innerHTML = "Chưa liên kết hồ sơ — nếu là bệnh nhân mới, hệ thống chỉ lưu tên/SĐT ở lịch hẹn này.";
      }
    }
    capNhatHint();

    function anSuggest() {
      suggestBox.style.display = "none";
      suggestBox.innerHTML = "";
    }
    function chonBenhNhan(p) {
      nameInp.value = p.name;
      phoneInp.value = p.phone || "";
      pidInp.value = p.id;
      capNhatHint();
      anSuggest();
    }
    nameInp.addEventListener(
      "input",
      U.debounce(() => {
        pidInp.value = ""; // gõ lại tên -> bỏ liên kết cũ, chọn lại nếu muốn
        capNhatHint();
        const q = U.noAccent(nameInp.value.trim());
        if (!q) return anSuggest();
        const matches = patients
          .filter((p) => U.noAccent(p.name).includes(q) || (p.phone || "").includes(q))
          .slice(0, 8);
        if (!matches.length) return anSuggest();
        suggestBox.innerHTML = matches
          .map(
            (p, i) => `<div class="ap-sug-item" data-i="${i}" style="padding:9px 12px;cursor:pointer;font-size:14px;">
              <strong>${U.esc(p.name)}</strong>
              <span class="muted" style="font-size:12.5px;"> · ${U.esc(p.phone || "chưa có SĐT")}</span>
            </div>`
          )
          .join("");
        suggestBox.querySelectorAll(".ap-sug-item").forEach((el, i) => {
          el.addEventListener("mousedown", (e) => {
            e.preventDefault(); // tránh blur trước khi click
            chonBenhNhan(matches[i]);
          });
          el.addEventListener("mouseenter", () => (el.style.background = "var(--accent-soft,#eef4ff)"));
          el.addEventListener("mouseleave", () => (el.style.background = ""));
        });
        suggestBox.style.display = "block";
      }, 180)
    );
    nameInp.addEventListener("blur", () => setTimeout(anSuggest, 120));

    const foot = document.createElement("div");
    if (existing) {
      const del = document.createElement("button");
      del.type = "button";
      del.className = "btn btn-danger";
      del.textContent = "🗑️ Xóa";
      del.style.marginRight = "auto";
      del.addEventListener("click", async () => {
        if (await remove(existing.id)) {
          modal.close();
          if (opts.onSaved) opts.onSaved();
        }
      });
      foot.appendChild(del);
    }
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "btn";
    cancel.textContent = "Hủy";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "btn btn-primary";
    submit.textContent = existing ? "Lưu thay đổi" : "Thêm lịch hẹn";
    foot.appendChild(cancel);
    foot.appendChild(submit);

    const modal = U.openModal({
      title: existing ? "Sửa lịch hẹn" : "Thêm lịch hẹn khám",
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
      const date = fd.get("date") || "";
      if (!name) return U.toast("Vui lòng nhập tên bệnh nhân", "err");
      if (!date) return U.toast("Vui lòng chọn ngày hẹn", "err");
      const rec = existing ? Object.assign({}, existing) : { id: U.uid(), createdAt: Date.now(), status: STATUS.CHO };
      rec.name = name;
      rec.phone = (fd.get("phone") || "").trim();
      rec.patientId = fd.get("patientId") || null;
      rec.date = date;
      rec.time = fd.get("time") || "";
      rec.reason = (fd.get("reason") || "").trim();
      rec.note = (fd.get("note") || "").trim();
      // Sửa lại ngày cho lịch đã hủy/không đến -> coi như hẹn lại, mở lại trạng thái
      if (existing && (existing.status === STATUS.HUY || existing.status === STATUS.KHONG_DEN)) {
        rec.status = STATUS.CHO;
      }
      submit.disabled = true;
      try {
        await save(rec);
        U.toast(existing ? "Đã lưu thay đổi" : "Đã thêm lịch hẹn", "ok");
        modal.close();
        if (opts.onSaved) opts.onSaved();
      } catch (err) {
        submit.disabled = false;
        U.toast("Lỗi khi lưu: " + err.message, "err");
      }
    });
  }

  // Mở hộp thoại nhắc qua Zalo cho một lịch hẹn, đánh dấu "đã nhắc" sau khi gửi
  function nhacZalo(a, onDone) {
    Zalo.moHopThoai({
      patient: { id: a.patientId || null, name: a.name, phone: a.phone },
      appointment: a,
      loai: Zalo.LOAI.NHAC_HEN_KHAM,
      onSent: async () => {
        try {
          await setStatus(a, STATUS.DA_NHAC);
          U.toast("Đã đánh dấu đã nhắc", "ok");
        } catch (e) {
          U.toast("Lỗi khi lưu: " + e.message, "err");
        }
        if (onDone) onDone();
      },
    });
  }

  // ============================================================
  //  TRANG DANH SÁCH LỊCH HẸN
  // ============================================================
  async function render(root) {
    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-gold";
    addBtn.innerHTML = "➕ Thêm lịch hẹn";
    addBtn.addEventListener("click", () => openForm({ onSaved: () => render(root) }));
    App.setTopbar(addBtn);

    const all = await DB.all("appointments");
    all.forEach((a) => (a.days = U.daysUntil(a.date)));
    const active = all
      .filter((a) => DANG_CHO.includes(a.status || STATUS.CHO))
      .sort((x, y) => (x.date + (x.time || "")).localeCompare(y.date + (y.time || "")));
    const closed = all
      .filter((a) => !DANG_CHO.includes(a.status || STATUS.CHO))
      .sort((x, y) => (y.date + (y.time || "")).localeCompare(x.date + (x.time || "")));

    root.innerHTML = "";

    if (!all.length) {
      root.innerHTML = `<div class="card"><div class="empty"><div class="empty-ico">📞</div>
        <h3>Chưa có lịch hẹn nào</h3>
        <p class="muted">Khi bệnh nhân gọi điện hẹn khám, bấm "Thêm lịch hẹn" để lưu lại và được nhắc đúng ngày.</p></div></div>`;
      return;
    }

    const overdue = active.filter((a) => a.days < 0);
    const today = active.filter((a) => a.days === 0);
    const soon = active.filter((a) => a.days > 0 && a.days <= 7);
    const later = active.filter((a) => a.days > 7);

    const rerender = () => render(root);

    const rowActions = (a) => {
      const tel = a.phone ? `<a class="btn btn-sm" href="tel:${U.esc(a.phone)}">📞 Gọi</a>` : "";
      return `${tel}
        <button class="btn btn-sm btn-gold ap-zalo" data-id="${a.id}">💬 Nhắc Zalo</button>
        <button class="btn btn-sm ap-dden" data-id="${a.id}">✔ Đã đến</button>
        <button class="btn btn-sm ap-kden" data-id="${a.id}">✖ Không đến</button>
        <button class="btn btn-sm ap-edit" data-id="${a.id}">✏️ Sửa</button>`;
    };

    const group = (title, list, cls) => {
      if (!list.length) return "";
      return `
        <div class="section-title" style="margin:18px 0 10px;"><span>${title} <span class="badge ${cls}">${list.length}</span></span></div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Bệnh nhân</th><th>Điện thoại</th><th>Ngày hẹn</th><th>Lý do</th><th>Trạng thái</th><th></th></tr></thead>
          <tbody>
          ${list
            .map((a) => {
              let when;
              if (a.days < 0) when = `<span class="badge badge-danger">Quá ${Math.abs(a.days)} ngày</span>`;
              else if (a.days === 0) when = `<span class="badge badge-warn">Hôm nay</span>`;
              else when = `<span class="badge badge-info">Còn ${a.days} ngày</span>`;
              const gio = a.time ? " · " + U.esc(a.time) : "";
              const trangThai =
                a.status === STATUS.DA_NHAC
                  ? '<span class="badge badge-info">Đã nhắc</span>'
                  : '<span class="badge badge-muted">Chờ nhắc</span>';
              return `<tr>
                <td>
                  <strong>${U.esc(a.name)}</strong>
                  ${a.patientId ? '<span class="badge badge-muted" style="margin-left:4px;">BN có hồ sơ</span>' : ""}
                </td>
                <td class="nowrap">${U.esc(a.phone || "—")}</td>
                <td class="nowrap">${U.fmtDate(a.date)}${gio}<br>${when}</td>
                <td>${U.esc(a.reason || "—")}</td>
                <td class="nowrap">${trangThai}</td>
                <td class="text-right nowrap">${rowActions(a)}</td>
              </tr>`;
            })
            .join("")}
          </tbody>
        </table></div></div>`;
    };

    const wrap = document.createElement("div");
    wrap.innerHTML =
      group("⚠️ Quá hạn chưa nhắc", overdue, "badge-danger") +
      group("📞 Hôm nay", today, "badge-warn") +
      group("🗓️ Trong 7 ngày tới", soon, "badge-info") +
      group("📅 Xa hơn", later, "badge-muted");
    root.appendChild(wrap);

    if (!active.length) {
      const info = document.createElement("div");
      info.className = "card card-pad muted";
      info.textContent = "Không có lịch hẹn nào đang chờ.";
      root.appendChild(info);
    }

    // Lịch sử (đã đến / không đến / hủy) — thu gọn
    if (closed.length) {
      const hist = document.createElement("div");
      hist.innerHTML = `
        <details class="card" style="margin-top:14px;">
          <summary class="card-pad" style="cursor:pointer;font-weight:600;">
            📋 Lịch sử lịch hẹn <span class="badge badge-muted">${closed.length}</span>
          </summary>
          <div class="table-wrap"><table class="data">
            <thead><tr><th>Bệnh nhân</th><th>Điện thoại</th><th>Ngày hẹn</th><th>Lý do</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
            ${closed
              .map(
                (a) => `<tr>
                <td><strong>${U.esc(a.name)}</strong></td>
                <td class="nowrap">${U.esc(a.phone || "—")}</td>
                <td class="nowrap">${U.fmtDate(a.date)}${a.time ? " · " + U.esc(a.time) : ""}</td>
                <td>${U.esc(a.reason || "—")}</td>
                <td class="nowrap"><span class="badge badge-muted">${U.esc(STATUS_LABEL[a.status] || a.status)}</span></td>
                <td class="text-right nowrap">
                  <button class="btn btn-sm ap-edit" data-id="${a.id}">✏️ Sửa</button>
                  <button class="btn btn-sm ap-del" data-id="${a.id}">🗑️ Xóa</button>
                </td>
              </tr>`
              )
              .join("")}
            </tbody>
          </table></div>
        </details>`;
      root.appendChild(hist);
    }

    const byId = (id) => all.find((a) => a.id === id);
    root.querySelectorAll(".ap-zalo").forEach((btn) =>
      btn.addEventListener("click", () => nhacZalo(byId(btn.dataset.id), rerender))
    );
    root.querySelectorAll(".ap-dden").forEach((btn) =>
      btn.addEventListener("click", async () => {
        try {
          await setStatus(byId(btn.dataset.id), STATUS.DA_DEN);
          U.toast("Đã đánh dấu đã đến khám", "ok");
          rerender();
        } catch (e) {
          U.toast("Lỗi khi lưu: " + e.message, "err");
        }
      })
    );
    root.querySelectorAll(".ap-kden").forEach((btn) =>
      btn.addEventListener("click", async () => {
        const a = byId(btn.dataset.id);
        const ok = await U.confirmBox(`Đánh dấu "${a.name}" không đến khám theo lịch hẹn này?`);
        if (!ok) return;
        try {
          await setStatus(a, STATUS.KHONG_DEN);
          rerender();
        } catch (e) {
          U.toast("Lỗi khi lưu: " + e.message, "err");
        }
      })
    );
    root.querySelectorAll(".ap-edit").forEach((btn) =>
      btn.addEventListener("click", () => openForm({ existing: byId(btn.dataset.id), onSaved: rerender }))
    );
    root.querySelectorAll(".ap-del").forEach((btn) =>
      btn.addEventListener("click", async () => {
        if (await remove(btn.dataset.id)) rerender();
      })
    );
  }

  return { render, openForm, get, save, remove, setStatus, collectUpcoming, nhacZalo, STATUS, STATUS_LABEL };
})();
