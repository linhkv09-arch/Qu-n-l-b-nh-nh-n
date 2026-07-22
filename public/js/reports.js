/* ============================================================
 * reports.js — Báo cáo thống kê
 * ============================================================ */

const Reports = (function () {
  function bars(rows, colorClass) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return `<div class="bars">${rows
      .map(
        (r) => `<div class="bar-row">
          <div class="bar-label">${U.esc(r.label)}</div>
          <div class="bar-track"><div class="bar-fill ${colorClass || ""}" style="width:${(r.value / max) * 100}%">${r.value || ""}</div></div>
          <div class="bar-value">${r.suffix ? U.esc(r.suffix) : r.value}</div>
        </div>`
      )
      .join("")}</div>`;
  }

  async function render(root) {
    const [visits, surgeries, patients] = await Promise.all([
      DB.all("visits"),
      DB.all("surgeries"),
      DB.all("patients"),
    ]);

    root.innerHTML = "";

    // ---- Bộ lọc khoảng thời gian ----
    const now = new Date();
    const defFrom = U.toISODate(new Date(now.getFullYear(), 0, 1));
    const defTo = U.todayISO();

    const filter = document.createElement("div");
    filter.className = "card card-pad no-print";
    filter.style.marginBottom = "18px";
    filter.innerHTML = `
      <div style="display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;">
        <div class="field" style="margin:0;"><label>Từ ngày</label><input type="date" id="rFrom" value="${defFrom}" /></div>
        <div class="field" style="margin:0;"><label>Đến ngày</label><input type="date" id="rTo" value="${defTo}" /></div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-sm" data-range="month">Tháng này</button>
          <button class="btn btn-sm" data-range="quarter">Quý này</button>
          <button class="btn btn-sm" data-range="year">Năm nay</button>
        </div>
        <button class="btn btn-primary" id="rApply">Xem báo cáo</button>
        <button class="btn no-print" id="rPrint">🖨️ In</button>
      </div>
    `;
    root.appendChild(filter);

    const out = document.createElement("div");
    root.appendChild(out);

    function inRange(dateStr, from, to) {
      if (!dateStr) return false;
      return dateStr >= from && dateStr <= to;
    }

    function compute(from, to) {
      const vIn = visits.filter((v) => inRange(v.date, from, to));
      const sIn = surgeries.filter((s) => inRange(s.date, from, to));

      // Doanh thu
      const revVisit = vIn.reduce((a, v) => a + (v.fee || 0), 0);
      const revSurg = sIn.reduce((a, s) => a + (s.fee || 0), 0);
      const unpaidSurg = sIn
        .filter((s) => s.paid === "chuathanhtoan")
        .reduce((a, s) => a + (s.fee || 0), 0);

      // Theo tháng
      const byMonth = {};
      const addMonth = (dateStr, key) => {
        const m = dateStr.slice(0, 7);
        byMonth[m] = byMonth[m] || { visit: 0, surgery: 0 };
        byMonth[m][key]++;
      };
      vIn.forEach((v) => addMonth(v.date, "visit"));
      sIn.forEach((s) => addMonth(s.date, "surgery"));

      // Theo chẩn đoán (khám)
      const byDiag = {};
      vIn.forEach((v) => {
        const d = (v.diagnosis || "").trim() || "(chưa ghi chẩn đoán)";
        byDiag[d] = (byDiag[d] || 0) + 1;
      });
      // Theo loại phẫu thuật
      const bySurgType = {};
      sIn.forEach((s) => {
        const t = (s.type || "").trim() || "(chưa ghi)";
        bySurgType[t] = (bySurgType[t] || 0) + 1;
      });

      // Bệnh nhân mới trong kỳ
      const newPatients = patients.filter((p) => {
        const d = p.createdAt ? U.toISODate(new Date(p.createdAt)) : null;
        return d && inRange(d, from, to);
      }).length;

      return {
        vIn, sIn, revVisit, revSurg, unpaidSurg, byMonth, byDiag, bySurgType, newPatients,
      };
    }

    function draw(from, to) {
      const r = compute(from, to);

      const months = Object.keys(r.byMonth).sort();
      const monthRows = months.map((m) => {
        const [y, mo] = m.split("-");
        return {
          label: `Th${parseInt(mo, 10)}/${y}`,
          value: r.byMonth[m].visit + r.byMonth[m].surgery,
          suffix: `${r.byMonth[m].visit} khám · ${r.byMonth[m].surgery} PT`,
        };
      });

      const diagRows = Object.entries(r.byDiag)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([label, value]) => ({ label, value }));

      const surgRows = Object.entries(r.bySurgType)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([label, value]) => ({ label, value }));

      out.innerHTML = `
        <div style="font-size:13px;" class="muted no-print">Báo cáo từ ${U.fmtDate(from)} đến ${U.fmtDate(to)}</div>
        <h2 style="color:var(--navy);margin:6px 0 18px;">Báo cáo hoạt động — ${U.fmtDate(from)} đến ${U.fmtDate(to)}</h2>

        <div class="grid grid-4">
          <div class="stat"><div class="stat-label">Lượt khám</div><div class="stat-value">${r.vIn.length}</div></div>
          <div class="stat"><div class="stat-label">Ca phẫu thuật</div><div class="stat-value">${r.sIn.length}</div></div>
          <div class="stat"><div class="stat-label">Bệnh nhân mới</div><div class="stat-value">${r.newPatients}</div></div>
          <div class="stat"><div class="stat-label">Tổng doanh thu</div><div class="stat-value" style="font-size:22px;">${U.fmtMoney(r.revVisit + r.revSurg)}<span style="font-size:14px;font-weight:600;"> đ</span></div></div>
        </div>

        <div class="grid grid-3" style="margin-top:16px;">
          <div class="stat"><div class="stat-label">Doanh thu khám</div><div class="stat-value" style="font-size:20px;">${U.fmtMoney(r.revVisit)} đ</div></div>
          <div class="stat"><div class="stat-label">Doanh thu phẫu thuật</div><div class="stat-value" style="font-size:20px;">${U.fmtMoney(r.revSurg)} đ</div></div>
          <div class="stat" style="${r.unpaidSurg ? "border-color:var(--warn)" : ""}"><div class="stat-label">Phẫu thuật chưa thu</div><div class="stat-value" style="font-size:20px;color:${r.unpaidSurg ? "var(--warn)" : "var(--navy)"}">${U.fmtMoney(r.unpaidSurg)} đ</div></div>
        </div>

        <div class="section-title"><span>📈 Số lượng theo tháng</span></div>
        <div class="card card-pad">${monthRows.length ? bars(monthRows, "navy") : '<div class="muted">Không có dữ liệu trong kỳ.</div>'}</div>

        <div class="grid grid-2" style="margin-top:16px;">
          <div>
            <div class="section-title"><span>🩺 Theo chẩn đoán (khám)</span></div>
            <div class="card card-pad">${diagRows.length ? bars(diagRows) : '<div class="muted">Không có dữ liệu.</div>'}</div>
          </div>
          <div>
            <div class="section-title"><span>🔪 Theo loại phẫu thuật</span></div>
            <div class="card card-pad">${surgRows.length ? bars(surgRows, "ok") : '<div class="muted">Không có dữ liệu.</div>'}</div>
          </div>
        </div>
      `;
    }

    draw(defFrom, defTo);

    // sự kiện
    const fromEl = filter.querySelector("#rFrom");
    const toEl = filter.querySelector("#rTo");
    filter.querySelector("#rApply").addEventListener("click", () =>
      draw(fromEl.value, toEl.value)
    );
    filter.querySelector("#rPrint").addEventListener("click", () => window.print());
    filter.querySelectorAll("[data-range]").forEach((b) => {
      b.addEventListener("click", () => {
        const d = new Date();
        let from, to;
        to = U.todayISO();
        if (b.dataset.range === "month")
          from = U.toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
        else if (b.dataset.range === "quarter") {
          const q = Math.floor(d.getMonth() / 3);
          from = U.toISODate(new Date(d.getFullYear(), q * 3, 1));
        } else from = U.toISODate(new Date(d.getFullYear(), 0, 1));
        fromEl.value = from;
        toEl.value = to;
        draw(from, to);
      });
    });
  }

  return { render };
})();
