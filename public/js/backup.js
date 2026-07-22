/* ============================================================
 * backup.js — Xuất dữ liệu (JSON) từ Supabase để lưu trữ ngoài.
 *
 * Lưu ý: khi dùng Supabase, dữ liệu đã ở trên cloud và được sao lưu
 * tự động bởi Supabase. Trang này chỉ để XUẤT một bản JSON offline
 * (phòng khi cần đối chiếu / lưu trữ riêng). Ảnh được giữ dưới dạng
 * đường dẫn (path) + URL công khai.
 * ============================================================ */

const Backup = (function () {
  async function exportAll() {
    const [patients, visits, surgeries] = await Promise.all([
      DB.all("patients"),
      DB.all("visits"),
      DB.all("surgeries"),
    ]);
    // gắn thêm URL ảnh để dễ tra cứu
    const withUrls = (arr) =>
      arr.map((r) => {
        if (Array.isArray(r.images)) {
          r = Object.assign({}, r, {
            images: r.images.map((im) => ({
              ...im,
              url: im.path ? DB.imageUrl(im.path) : im.url || "",
            })),
          });
        }
        return r;
      });

    const data = {
      app: "qlbn_tmh",
      source: "supabase",
      version: 2,
      exportedAt: new Date().toISOString(),
      patients,
      visits: withUrls(visits),
      surgeries: withUrls(surgeries),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sao-luu-benh-nhan-${U.todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { patients: patients.length, visits: visits.length, surgeries: surgeries.length };
  }

  async function render(root) {
    App.setTopbar(null);
    const [patients, visits, surgeries] = await Promise.all([
      DB.all("patients"),
      DB.all("visits"),
      DB.all("surgeries"),
    ]);
    let imgCount = 0;
    visits.forEach((v) => (imgCount += (v.images || []).length));
    surgeries.forEach((s) => (imgCount += (s.images || []).length));

    root.innerHTML = `
      <div class="card card-pad" style="max-width:640px;">
        <h3 style="margin-top:0;color:var(--blue-deep);">☁️ Dữ liệu đang lưu trên Supabase (cloud)</h3>
        <p class="muted" style="font-size:14px;line-height:1.6;">
          Toàn bộ dữ liệu được lưu trên máy chủ Supabase và tự động sao lưu.
          Mọi thiết bị đăng nhập đều thấy dữ liệu mới nhất theo thời gian thực.
        </p>
        <div style="background:var(--bg);border-radius:8px;padding:14px;margin:14px 0;font-size:14px;">
          <div>Bệnh nhân: <strong>${patients.length}</strong></div>
          <div>Lần khám: <strong>${visits.length}</strong></div>
          <div>Ca phẫu thuật: <strong>${surgeries.length}</strong></div>
          <div>Ảnh: <strong>${imgCount}</strong></div>
        </div>
        <button class="btn btn-primary" id="btnExport">⬇️ Xuất dữ liệu ra file JSON</button>
        <p class="hint">Bản xuất dùng để lưu trữ/đối chiếu ngoài. Ảnh được lưu dưới dạng đường dẫn + URL.</p>
      </div>
    `;

    root.querySelector("#btnExport").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Đang tạo file...";
      try {
        const r = await exportAll();
        U.toast(`Đã xuất: ${r.patients} BN, ${r.visits + r.surgeries} hồ sơ`, "ok");
      } catch (err) {
        U.toast("Lỗi khi xuất: " + err.message, "err");
      }
      btn.disabled = false;
      btn.innerHTML = "⬇️ Xuất dữ liệu ra file JSON";
    });
  }

  return { render, exportAll };
})();
