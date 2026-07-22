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
  let currentParams = {};
  const root = () => document.getElementById("viewRoot");

  // params: dữ liệu chuyển giữa các view (vd: mở chi tiết bệnh nhân)
  async function go(viewName, params) {
    if (!views[viewName]) viewName = "dashboard";
    current = viewName;
    currentParams = params || {};
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

  // Tải lại view đang mở (dùng cho cập nhật realtime từ thiết bị khác)
  function refreshCurrent() {
    if (!current) return;
    // Không làm gián đoạn khi bác sĩ đang mở form/hộp thoại
    if (document.querySelector(".modal-overlay")) return;
    go(current, currentParams);
  }

  function closeSidebar() {
    document.getElementById("app").classList.remove("sidebar-open");
  }

  let navBound = false;
  function init() {
    if (!navBound) {
      document.querySelectorAll(".nav-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          go(btn.dataset.view);
          closeSidebar(); // đóng menu sau khi chọn (điện thoại)
        });
      });
      // Nút menu cho điện thoại
      const menuBtn = document.getElementById("menuToggle");
      const backdrop = document.getElementById("sidebarBackdrop");
      if (menuBtn)
        menuBtn.addEventListener("click", () =>
          document.getElementById("app").classList.toggle("sidebar-open")
        );
      if (backdrop) backdrop.addEventListener("click", closeSidebar);
      navBound = true;
    }
    go("dashboard");
  }

  return { go, setTopbar, init, updateStorageInfo, refreshCurrent };
})();

// Cầu nối cho src/main.js (ES module) gọi sau khi đăng nhập
window.App = App;
window.startApp = function () {
  App.init();
};
