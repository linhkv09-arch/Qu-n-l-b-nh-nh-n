/* ============================================================
 * app.js — Bộ điều hướng chính & khởi tạo ứng dụng
 * ============================================================ */

const App = (function () {
  const views = {
    dashboard: { title: "Trang chủ", module: () => Dashboard },
    patients: { title: "Bệnh nhân", module: () => Patients },
    visits: { title: "Khám bệnh", module: () => Visits },
    surgeries: { title: "Phẫu thuật", module: () => Surgeries },
    reports: { title: "Báo cáo", module: () => Reports },
    settings: { title: "Cài đặt", module: () => Settings },
    backup: { title: "Sao lưu dữ liệu", module: () => Backup },
  };

  let current = null;
  const root = () => document.getElementById("viewRoot");

  // params: dữ liệu chuyển giữa các view (vd: mở chi tiết bệnh nhân)
  async function go(viewName, params) {
    if (!views[viewName]) viewName = "dashboard";
    current = viewName;
    U.revokeAllUrls(); // giải phóng URL ảnh của view trước

    // cập nhật nav active
    document.querySelectorAll(".nav-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === viewName);
    });

    document.getElementById("viewTitle").textContent = views[viewName].title;
    document.getElementById("topbarActions").innerHTML = "";
    root().innerHTML = `<div class="empty"><div class="empty-ico">⏳</div>Đang tải...</div>`;

    try {
      const mod = views[viewName].module();
      await mod.render(root(), params || {});
    } catch (err) {
      console.error(err);
      root().innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Có lỗi xảy ra</h3><p class="muted">${U.esc(
        err.message || String(err)
      )}</p></div>`;
    }
    updateStorageInfo();
  }

  function setTopbar(el) {
    const bar = document.getElementById("topbarActions");
    bar.innerHTML = "";
    if (el) bar.appendChild(el);
  }

  async function updateStorageInfo() {
    const info = document.getElementById("storageInfo");
    try {
      const [patients, visits, surgeries] = await Promise.all([
        DB.all("patients"),
        DB.all("visits"),
        DB.all("surgeries"),
      ]);
      let imgCount = 0;
      visits.forEach((v) => (imgCount += (v.images || []).length));
      surgeries.forEach((s) => (imgCount += (s.images || []).length));
      const est = await DB.estimate();
      let usage = "";
      if (est && est.usage != null) {
        usage = `<br>Dung lượng: ${(est.usage / 1048576).toFixed(1)} MB`;
      }
      info.innerHTML = `${patients.length} bệnh nhân · ${imgCount} ảnh${usage}`;
    } catch (e) {
      info.textContent = "";
    }
  }

  function init() {
    document.querySelectorAll(".nav-item").forEach((btn) => {
      btn.addEventListener("click", () => go(btn.dataset.view));
    });
    go("dashboard");
  }

  return { go, setTopbar, init, updateStorageInfo };
})();

document.addEventListener("DOMContentLoaded", () => {
  DB.open()
    .then(() => App.init())
    .catch((err) => {
      document.getElementById("viewRoot").innerHTML =
        `<div class="empty"><div class="empty-ico">⚠️</div><h3>Không mở được cơ sở dữ liệu</h3>
         <p class="muted">Trình duyệt có thể đang chặn lưu trữ. Hãy mở bằng Chrome hoặc Edge và không dùng chế độ ẩn danh.</p>
         <p class="muted">${U.esc(err.message || String(err))}</p></div>`;
    });
});
