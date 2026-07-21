/* ============================================================
 * prescription.js — Đơn thuốc: nhập thuốc có cấu trúc,
 * tạo bản in theo mẫu và in trực tiếp.
 * ============================================================ */

const Rx = (function () {
  const UNITS = ["viên", "vỉ", "gói", "ống", "chai", "lọ", "tuýp", "hộp", "ml", "g"];

  // ---- Bảng nhập thuốc có cấu trúc ----
  // meds: mảng {name, qty, unit, usage}. Chỉnh trực tiếp mảng này.
  function medsEditor(meds) {
    const wrap = document.createElement("div");
    wrap.className = "meds-editor";
    const head = document.createElement("div");
    head.className = "meds-head";
    head.innerHTML = `<span>#</span><span>Tên thuốc &amp; hàm lượng</span><span>SL</span><span>Đơn vị</span><span>Cách dùng</span><span></span>`;
    const list = document.createElement("div");
    list.className = "meds-list";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn btn-sm";
    addBtn.innerHTML = "➕ Thêm thuốc";

    function render() {
      list.innerHTML = "";
      if (!meds.length) {
        const e = document.createElement("div");
        e.className = "hint";
        e.style.padding = "8px 2px";
        e.textContent = 'Chưa có thuốc nào. Bấm "Thêm thuốc" để kê đơn.';
        list.appendChild(e);
      }
      meds.forEach((m, idx) => {
        const row = document.createElement("div");
        row.className = "med-row";
        row.innerHTML = `
          <div class="med-idx">${idx + 1}</div>
          <input class="med-name" placeholder="VD: Amoxicillin 500mg" value="${U.esc(m.name || "")}" />
          <input class="med-qty" type="text" inputmode="numeric" placeholder="SL" value="${U.esc(m.qty || "")}" />
          <select class="med-unit">${UNITS.map(
            (u) => `<option ${(m.unit || "viên") === u ? "selected" : ""}>${u}</option>`
          ).join("")}</select>
          <input class="med-usage" placeholder="VD: Sáng 1 viên, tối 1 viên, sau ăn" value="${U.esc(m.usage || "")}" />
          <button type="button" class="med-del" title="Xóa thuốc">✕</button>`;
        row.querySelector(".med-name").addEventListener("input", (e) => (m.name = e.target.value));
        row.querySelector(".med-qty").addEventListener("input", (e) => (m.qty = e.target.value));
        row.querySelector(".med-unit").addEventListener("change", (e) => (m.unit = e.target.value));
        row.querySelector(".med-usage").addEventListener("input", (e) => (m.usage = e.target.value));
        row.querySelector(".med-del").addEventListener("click", () => {
          meds.splice(idx, 1);
          render();
        });
        list.appendChild(row);
      });
    }

    addBtn.addEventListener("click", () => {
      meds.push({ name: "", qty: "", unit: "viên", usage: "" });
      render();
      const names = list.querySelectorAll(".med-name");
      if (names.length) names[names.length - 1].focus();
    });

    render();
    wrap.appendChild(head);
    wrap.appendChild(list);
    wrap.appendChild(addBtn);
    return { el: wrap };
  }

  // ---- Tạo tờ đơn thuốc (HTML) theo mẫu ----
  function buildSheet(patient, visit, s) {
    const age = U.ageFromYear(patient.birthYear);
    const iso = visit.date || U.todayISO();
    const d = iso.split("-"); // [yyyy, mm, dd]
    const meds = visit.meds && visit.meds.length ? visit.meds : null;
    const advice = visit.advice || "";

    const medsHtml = meds
      ? `<ol class="rx-med-list">${meds
          .map(
            (m) => `<li>
                <div class="rx-med-line">
                  <span class="rx-med-name">${U.esc(m.name || "")}</span>
                  ${m.qty ? `<span class="rx-med-qty">${U.esc(m.qty)} ${U.esc(m.unit || "")}</span>` : ""}
                </div>
                ${m.usage ? `<div class="rx-med-usage">${U.esc(m.usage)}</div>` : ""}
              </li>`
          )
          .join("")}</ol>`
      : `<div class="rx-free">${U.esc(visit.medications || "")}</div>`;

    const sheet = document.createElement("div");
    sheet.className = "rx-sheet";
    sheet.innerHTML = `
      <div class="rx-head">
        <div class="rx-hosp-name">${U.esc(s.hospitalName)}</div>
        <div class="rx-dept">${U.esc(s.department)}</div>
      </div>
      <h1 class="rx-title">ĐƠN THUỐC</h1>
      <div class="rx-info">
        <div class="rx-line">
          <span class="lbl">Họ và tên:</span>
          <span class="val">${U.esc(patient.name || "")}</span>
          <span class="lbl">Tuổi:</span>
          <span class="val narrow">${age != null ? age : ""}</span>
          <span class="lbl">${U.esc(patient.gender || "Nam/Nữ")}</span>
        </div>
        <div class="rx-line">
          <span class="lbl">Địa chỉ:</span>
          <span class="val">${U.esc(patient.address || "")}</span>
        </div>
        <div class="rx-line">
          <span class="lbl">Chẩn đoán:</span>
          <span class="val">${U.esc(visit.diagnosis || "")}</span>
        </div>
      </div>

      <div class="rx-meds">
        <div class="rx-label">Thuốc điều trị:</div>
        ${medsHtml}
      </div>

      <div class="rx-bottom">
        <div class="rx-advice-block">
          <span class="rx-label">Lời dặn:</span>
          <div class="rx-advice-text">${U.esc(advice)}</div>
        </div>
        <div class="rx-foot-right">
          <div class="rx-date">Ngày ${d[2]} tháng ${d[1]} năm ${d[0]}</div>
          <div class="rx-sign-title">Bác sĩ khám bệnh</div>
          <div class="rx-sign-sub">(Ký, ghi rõ họ tên)</div>
          <div class="rx-sign-name">${U.esc(s.doctorName)}</div>
          ${s.doctorPhone ? `<div class="rx-sign-phone">${U.esc(s.doctorPhone)}</div>` : ""}
        </div>
      </div>
    `;
    return sheet;
  }

  // ---- In tờ đơn (chỉ in phần đơn, ẩn phần còn lại) ----
  function printSheet(sheet) {
    let root = document.getElementById("rxPrintRoot");
    if (!root) {
      root = document.createElement("div");
      root.id = "rxPrintRoot";
      document.body.appendChild(root);
    }
    root.innerHTML = "";
    root.appendChild(sheet.cloneNode(true));
    document.body.classList.add("printing");
    function cleanup() {
      document.body.classList.remove("printing");
      root.innerHTML = "";
      window.removeEventListener("afterprint", cleanup);
    }
    window.addEventListener("afterprint", cleanup);
    window.print();
    // dự phòng nếu trình duyệt không bắn afterprint
    setTimeout(cleanup, 1500);
  }

  // ---- Xem trước + nút in ----
  async function preview(patient, visit) {
    const s = await Settings.get();
    const sheet = buildSheet(patient, visit, s);
    const body = document.createElement("div");
    body.className = "rx-preview-body";
    body.appendChild(sheet);

    const foot = document.createElement("div");
    const close = document.createElement("button");
    close.className = "btn";
    close.textContent = "Đóng";
    const printBtn = document.createElement("button");
    printBtn.className = "btn btn-primary";
    printBtn.innerHTML = "🖨️ In đơn thuốc";
    foot.appendChild(close);
    foot.appendChild(printBtn);

    const m = U.openModal({
      title: "Đơn thuốc — " + (patient.name || ""),
      body,
      footer: foot,
      wide: true,
    });
    close.addEventListener("click", m.close);
    printBtn.addEventListener("click", () => printSheet(sheet));
  }

  // Mở đơn thuốc từ 1 lần khám (tự lấy bệnh nhân)
  async function previewFromVisit(visit) {
    const p = await Patients.get(visit.patientId);
    if (!p) return U.toast("Không tìm thấy bệnh nhân", "err");
    return preview(p, visit);
  }

  return { medsEditor, buildSheet, printSheet, preview, previewFromVisit, UNITS };
})();
