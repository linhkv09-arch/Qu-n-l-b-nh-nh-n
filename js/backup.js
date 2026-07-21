/* ============================================================
 * backup.js — Sao lưu & Phục hồi toàn bộ dữ liệu (kèm ảnh)
 * Xuất ra 1 file .json để lưu trữ / chuyển sang máy khác.
 * ============================================================ */

const Backup = (function () {
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function dataURLToBlob(dataURL) {
    const res = await fetch(dataURL);
    return res.blob();
  }

  // Chuẩn bị bản sao có ảnh -> base64
  async function serializeRecordsWithImages(records) {
    const out = [];
    for (const rec of records) {
      const copy = Object.assign({}, rec);
      if (Array.isArray(rec.images)) {
        copy.images = [];
        for (const img of rec.images) {
          const dataURL = await blobToDataURL(img.blob);
          copy.images.push({
            id: img.id,
            kind: img.kind,
            caption: img.caption || "",
            type: img.type || "",
            data: dataURL,
          });
        }
      }
      out.push(copy);
    }
    return out;
  }

  async function exportAll() {
    const [patients, visits, surgeries, counter] = await Promise.all([
      DB.all("patients"),
      DB.all("visits"),
      DB.all("surgeries"),
      DB.getMeta("patientCounter", 0),
    ]);

    const data = {
      app: "qlbn_tmh",
      version: 1,
      exportedAt: new Date().toISOString(),
      meta: { patientCounter: counter },
      patients,
      visits: await serializeRecordsWithImages(visits),
      surgeries: await serializeRecordsWithImages(surgeries),
    };

    const json = JSON.stringify(data);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = U.todayISO();
    a.href = url;
    a.download = `sao-luu-benh-nhan-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { patients: patients.length, visits: visits.length, surgeries: surgeries.length };
  }

  // Khôi phục ảnh base64 -> Blob
  async function deserializeRecords(records) {
    const out = [];
    for (const rec of records) {
      const copy = Object.assign({}, rec);
      if (Array.isArray(rec.images)) {
        copy.images = [];
        for (const img of rec.images) {
          const blob = img.data ? await dataURLToBlob(img.data) : null;
          if (blob) {
            copy.images.push({
              id: img.id || U.uid(),
              kind: img.kind || "khac",
              caption: img.caption || "",
              type: img.type || blob.type,
              blob,
            });
          }
        }
      }
      out.push(copy);
    }
    return out;
  }

  async function importAll(data, mode) {
    if (!data || data.app !== "qlbn_tmh") {
      throw new Error("File không đúng định dạng sao lưu của phần mềm này.");
    }
    // mode: 'replace' (xóa hết rồi nạp) | 'merge' (thêm vào)
    if (mode === "replace") {
      await DB.clear("patients");
      await DB.clear("visits");
      await DB.clear("surgeries");
    }

    const patients = data.patients || [];
    const visits = await deserializeRecords(data.visits || []);
    const surgeries = await deserializeRecords(data.surgeries || []);

    for (const p of patients) await DB.put("patients", p);
    for (const v of visits) await DB.put("visits", v);
    for (const s of surgeries) await DB.put("surgeries", s);

    // cập nhật bộ đếm mã BN
    if (mode === "replace" && data.meta && data.meta.patientCounter != null) {
      await DB.setMeta("patientCounter", data.meta.patientCounter);
    } else {
      // merge: đảm bảo counter >= số BN hiện có
      const all = await DB.all("patients");
      let maxNum = await DB.getMeta("patientCounter", 0);
      all.forEach((p) => {
        const m = /^BN(\d+)$/.exec(p.code || "");
        if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
      });
      await DB.setMeta("patientCounter", maxNum);
    }

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
      <div class="grid grid-2">
        <div class="card card-pad">
          <h3 style="margin-top:0;color:var(--navy);">💾 Sao lưu dữ liệu</h3>
          <p class="muted" style="font-size:14px;line-height:1.6;">
            Xuất toàn bộ dữ liệu (bệnh nhân, lần khám, phẫu thuật, ảnh nội soi & đơn thuốc) ra một file
            để lưu trữ an toàn hoặc chuyển sang máy khác.
          </p>
          <div style="background:var(--bg);border-radius:8px;padding:14px;margin:14px 0;font-size:14px;">
            <div>Bệnh nhân: <strong>${patients.length}</strong></div>
            <div>Lần khám: <strong>${visits.length}</strong></div>
            <div>Ca phẫu thuật: <strong>${surgeries.length}</strong></div>
            <div>Ảnh: <strong>${imgCount}</strong></div>
          </div>
          <button class="btn btn-primary" id="btnExport">⬇️ Tải file sao lưu</button>
          <p class="hint">Nên sao lưu định kỳ (vd: cuối mỗi tuần) và giữ file ở nơi an toàn.</p>
        </div>

        <div class="card card-pad">
          <h3 style="margin-top:0;color:var(--navy);">📂 Phục hồi dữ liệu</h3>
          <p class="muted" style="font-size:14px;line-height:1.6;">
            Nạp lại dữ liệu từ file sao lưu. Dùng khi chuyển máy hoặc khôi phục sau sự cố.
          </p>
          <div class="field" style="margin:14px 0;">
            <label>Chọn cách phục hồi</label>
            <select id="importMode">
              <option value="merge">Gộp thêm (giữ dữ liệu hiện có)</option>
              <option value="replace">Thay thế toàn bộ (xóa dữ liệu hiện tại)</option>
            </select>
          </div>
          <input type="file" accept="application/json,.json" id="importFile" style="display:none" />
          <button class="btn" id="btnImport">⬆️ Chọn file & phục hồi</button>
          <p class="hint">⚠️ Chế độ "Thay thế toàn bộ" sẽ xóa hết dữ liệu hiện tại trước khi nạp. Hãy sao lưu trước cho chắc.</p>
        </div>
      </div>

      <div class="card card-pad" style="margin-top:16px;">
        <h3 style="margin-top:0;color:var(--navy);">ℹ️ Lưu ý quan trọng</h3>
        <ul style="font-size:14px;line-height:1.8;color:var(--ink-soft);margin:0;padding-left:20px;">
          <li>Dữ liệu được lưu <strong>ngay trên máy này</strong> (trong trình duyệt), không gửi lên internet.</li>
          <li>Không dùng chế độ <strong>ẩn danh (Incognito)</strong> — dữ liệu sẽ mất khi đóng cửa sổ.</li>
          <li>Nếu xóa lịch sử/dữ liệu duyệt web của trình duyệt, dữ liệu phần mềm có thể bị xóa theo. Hãy sao lưu thường xuyên.</li>
          <li>Luôn mở phần mềm bằng <strong>cùng một trình duyệt</strong> (Chrome hoặc Edge) để thấy đủ dữ liệu.</li>
        </ul>
      </div>
    `;

    root.querySelector("#btnExport").addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = "Đang tạo file...";
      try {
        const r = await exportAll();
        U.toast(`Đã tạo file sao lưu (${r.patients} BN, ${r.visits + r.surgeries} hồ sơ)`, "ok");
      } catch (err) {
        U.toast("Lỗi khi sao lưu: " + err.message, "err");
      }
      btn.disabled = false;
      btn.innerHTML = "⬇️ Tải file sao lưu";
    });

    const fileInput = root.querySelector("#importFile");
    root.querySelector("#btnImport").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const mode = root.querySelector("#importMode").value;

      if (mode === "replace") {
        const ok = await U.confirmBox(
          "Bạn sắp XÓA toàn bộ dữ liệu hiện tại và thay bằng dữ liệu trong file. Tiếp tục?",
          { title: "Xác nhận phục hồi", danger: true, okText: "Xóa & phục hồi" }
        );
        if (!ok) {
          fileInput.value = "";
          return;
        }
      }

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const r = await importAll(data, mode);
        U.toast(`Đã phục hồi: ${r.patients} BN, ${r.visits} khám, ${r.surgeries} PT`, "ok");
        fileInput.value = "";
        render(root);
      } catch (err) {
        U.toast("Lỗi phục hồi: " + err.message, "err");
        fileInput.value = "";
      }
    });
  }

  return { render, exportAll, importAll };
})();
