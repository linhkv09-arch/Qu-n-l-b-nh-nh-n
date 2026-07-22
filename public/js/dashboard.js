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

  async function render(root) {
    const { items, patients, visits, surgeries } = await collectFollowUps();

    // Phân loại: quá hạn / trong 7 ngày / sắp tới (>7 ngày)
    const overdue = items.filter((i) => i.days < 0);
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

    const group = (title, list, cls) => {
      if (!list.length) return "";
      return `
        <div class="section-title" style="font-size:14px;margin:18px 0 10px;"><span>${title} <span class="badge ${cls}">${list.length}</span></span></div>
        <div class="card"><div class="table-wrap"><table class="data">
          <thead><tr><th>Bệnh nhân</th><th>Điện thoại</th><th>Loại</th><th>Ngày hẹn</th><th>Còn lại</th><th>Ghi chú</th><th></th></tr></thead>
          <tbody>
          ${list
            .map((i) => {
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
                <td class="text-right"><button class="btn btn-sm">Mở hồ sơ</button></td>
              </tr>`;
            })
            .join("")}
          </tbody>
        </table></div></div>`;
    };

    const remWrap = document.createElement("div");
    remWrap.innerHTML =
      group("⚠️ Quá hạn", overdue, "badge-danger") +
      group("📌 Trong 7 ngày tới", soon, "badge-warn") +
      group("🗓️ Sắp tới (trong 30 ngày)", upcoming, "badge-info");
    root.appendChild(remWrap);

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
