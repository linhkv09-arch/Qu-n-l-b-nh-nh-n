/* ============================================================
 * settings.js — Cài đặt thông tin phòng khám / bác sĩ
 * Dùng để in trên đầu đơn thuốc.
 * ============================================================ */

const Settings = (function () {
  const DEFAULTS = {
    hospitalName: "BỆNH VIỆN ĐA KHOA TỈNH THANH HÓA",
    department: "KHOA TAI MŨI HỌNG",
    doctorName: "BS Khương Vũ Linh",
    doctorPhone: "0912.542.451",
    adviceDefault: "Tái khám khi hết thuốc hoặc khi có dấu hiệu bất thường.",
  };

  async function get() {
    const s = await DB.getMeta("settings", {});
    return Object.assign({}, DEFAULTS, s || {});
  }
  async function save(s) {
    return DB.setMeta("settings", s);
  }

  async function render(root) {
    App.setTopbar(null);
    const s = await get();
    root.innerHTML = `
      <div class="grid grid-2">
        <div class="card card-pad">
          <h3 style="margin-top:0;color:var(--blue-deep);">🏥 Thông tin trên đơn thuốc</h3>
          <p class="muted" style="font-size:14px;line-height:1.6;">
            Những thông tin này sẽ tự động in ở đầu và cuối mỗi đơn thuốc.
          </p>
          <form id="setForm">
            <div class="field" style="margin-bottom:14px;">
              <label>Tên bệnh viện / phòng khám</label>
              <input name="hospitalName" value="${U.esc(s.hospitalName)}" />
            </div>
            <div class="field" style="margin-bottom:14px;">
              <label>Khoa / chuyên khoa</label>
              <input name="department" value="${U.esc(s.department)}" />
            </div>
            <div class="field" style="margin-bottom:14px;">
              <label>Tên bác sĩ (ký tên)</label>
              <input name="doctorName" value="${U.esc(s.doctorName)}" />
            </div>
            <div class="field" style="margin-bottom:14px;">
              <label>Số điện thoại</label>
              <input name="doctorPhone" value="${U.esc(s.doctorPhone)}" />
            </div>
            <div class="field" style="margin-bottom:16px;">
              <label>Lời dặn mặc định (điền sẵn khi kê đơn mới)</label>
              <textarea name="adviceDefault">${U.esc(s.adviceDefault)}</textarea>
            </div>
            <button type="submit" class="btn btn-primary">💾 Lưu cài đặt</button>
          </form>
        </div>

        <div class="card card-pad">
          <h3 style="margin-top:0;color:var(--blue-deep);">👁️ Xem thử đơn thuốc mẫu</h3>
          <p class="muted" style="font-size:14px;line-height:1.6;">
            Xem trước đơn thuốc sẽ trông như thế nào khi in (với dữ liệu mẫu).
          </p>
          <button class="btn" id="btnPreviewSample">Xem thử mẫu đơn</button>
        </div>
      </div>
    `;

    root.querySelector("#setForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const rec = {
        hospitalName: (fd.get("hospitalName") || "").trim(),
        department: (fd.get("department") || "").trim(),
        doctorName: (fd.get("doctorName") || "").trim(),
        doctorPhone: (fd.get("doctorPhone") || "").trim(),
        adviceDefault: (fd.get("adviceDefault") || "").trim(),
      };
      await save(rec);
      U.toast("Đã lưu cài đặt", "ok");
    });

    root.querySelector("#btnPreviewSample").addEventListener("click", () => {
      const samplePatient = {
        name: "Nguyễn Văn A",
        birthYear: 1985,
        gender: "Nam",
        address: "123 Lê Lợi, TP. Thanh Hóa",
      };
      const sampleVisit = {
        date: U.todayISO(),
        diagnosis: "Viêm mũi xoang cấp",
        meds: [
          { name: "Amoxicillin 500mg", qty: "20", unit: "viên", usage: "Sáng 1 viên, tối 1 viên, sau ăn" },
          { name: "Alphachymotrypsin 4.2mg", qty: "20", unit: "viên", usage: "Ngày 2 lần, mỗi lần 2 viên, ngậm dưới lưỡi" },
          { name: "Xịt mũi Nasonex", qty: "1", unit: "chai", usage: "Xịt mỗi bên mũi 1 nhát, ngày 1 lần buổi sáng" },
        ],
        advice: s.adviceDefault,
      };
      Rx.preview(samplePatient, sampleVisit);
    });
  }

  return { get, save, render, DEFAULTS };
})();
