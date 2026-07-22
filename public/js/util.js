/* ============================================================
 * util.js — Hàm tiện ích dùng chung
 * ============================================================ */

const U = (function () {
  // ---- ID ----
  function uid() {
    return (
      Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
    );
  }

  // ---- Escape HTML để tránh lỗi hiển thị / injection ----
  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // ---- Ngày tháng ----
  function todayISO() {
    const d = new Date();
    return toISODate(d);
  }
  function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  // "2026-07-21" -> "21/07/2026"
  function fmtDate(iso) {
    if (!iso) return "—";
    const parts = String(iso).split("-");
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  function fmtDateTime(ts) {
    if (!ts) return "—";
    const d = new Date(ts);
    return (
      String(d.getDate()).padStart(2, "0") +
      "/" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "/" +
      d.getFullYear() +
      " " +
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0")
    );
  }
  // Số ngày từ hôm nay tới ngày iso (âm = đã qua)
  function daysUntil(iso) {
    if (!iso) return null;
    const today = new Date(todayISO() + "T00:00:00");
    const target = new Date(iso + "T00:00:00");
    return Math.round((target - today) / 86400000);
  }
  function addDaysISO(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return toISODate(d);
  }

  // ---- Tuổi ----
  function ageFromYear(birthYear) {
    if (!birthYear) return null;
    const y = parseInt(birthYear, 10);
    if (isNaN(y)) return null;
    return new Date().getFullYear() - y;
  }

  // ---- Tiền tệ ----
  function fmtMoney(n) {
    if (n === null || n === undefined || n === "") return "0";
    const num = Number(n) || 0;
    return num.toLocaleString("vi-VN");
  }
  function parseMoney(s) {
    if (s === null || s === undefined) return 0;
    const n = String(s).replace(/[^\d]/g, "");
    return n ? parseInt(n, 10) : 0;
  }

  // ---- Viết tắt tên (avatar) ----
  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (
      parts[parts.length - 2].charAt(0) + parts[parts.length - 1].charAt(0)
    ).toUpperCase();
  }

  // ---- Toast ----
  function toast(msg, type) {
    const root = document.getElementById("toastRoot");
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity 0.3s";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  // ---- Modal ----
  // openModal({ title, body(HTMLElement|string), footer(HTMLElement|string), wide })
  // returns { close }
  function openModal(opts) {
    const root = document.getElementById("modalRoot");
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const modal = document.createElement("div");
    modal.className = "modal" + (opts.wide ? " wide" : "");

    const head = document.createElement("div");
    head.className = "modal-head";
    head.innerHTML = `<h2>${esc(opts.title || "")}</h2>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "modal-close";
    closeBtn.innerHTML = "&times;";
    head.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "modal-body";
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    modal.appendChild(head);
    modal.appendChild(body);

    if (opts.footer) {
      const foot = document.createElement("div");
      foot.className = "modal-foot";
      if (typeof opts.footer === "string") foot.innerHTML = opts.footer;
      else foot.appendChild(opts.footer);
      modal.appendChild(foot);
    }

    overlay.appendChild(modal);
    root.appendChild(overlay);

    function close() {
      overlay.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", onKey);

    return { close, overlay, modal, body };
  }

  // ---- Hộp xác nhận ----
  function confirmBox(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const foot = document.createElement("div");
      const cancel = document.createElement("button");
      cancel.className = "btn";
      cancel.textContent = opts.cancelText || "Hủy";
      const ok = document.createElement("button");
      ok.className = "btn " + (opts.danger ? "btn-danger" : "btn-primary");
      ok.textContent = opts.okText || "Đồng ý";
      foot.appendChild(cancel);
      foot.appendChild(ok);

      const m = openModal({
        title: opts.title || "Xác nhận",
        body: `<div style="font-size:14.5px;line-height:1.6;">${esc(message)}</div>`,
        footer: foot,
      });
      cancel.addEventListener("click", () => {
        m.close();
        resolve(false);
      });
      ok.addEventListener("click", () => {
        m.close();
        resolve(true);
      });
    });
  }

  // ---- Ảnh: đọc file -> {id, kind, caption, blob, type} ----
  function readImageFile(file, kind) {
    return new Promise((resolve, reject) => {
      if (!file.type || !file.type.startsWith("image/")) {
        reject(new Error("Không phải file ảnh"));
        return;
      }
      resolve({
        id: uid(),
        kind: kind || "khac",
        caption: "",
        type: file.type,
        blob: file, // File là một Blob, IndexedDB lưu trực tiếp được
      });
    });
  }

  // Tạo URL tạm để hiển thị ảnh từ blob
  const _objectUrls = [];
  function blobUrl(blob) {
    const url = URL.createObjectURL(blob);
    _objectUrls.push(url);
    return url;
  }
  function revokeAllUrls() {
    _objectUrls.forEach((u) => URL.revokeObjectURL(u));
    _objectUrls.length = 0;
  }

  // Nguồn ảnh để hiển thị: blob (ảnh mới chọn) hoặc path trên Supabase Storage
  function imgSrc(img) {
    if (!img) return "";
    if (img.blob) return blobUrl(img.blob); // ảnh mới, chưa tải lên
    if (img.path && window.DB && DB.imageUrl) return DB.imageUrl(img.path); // ảnh trên cloud
    if (img.url) return img.url;
    return "";
  }

  // ---- Lightbox xem ảnh phóng to ----
  function lightbox(url, caption) {
    const lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML = `
      <button class="lb-close">&times;</button>
      <img src="${url}" alt="" />
      ${caption ? `<div class="lb-cap">${esc(caption)}</div>` : ""}
    `;
    document.body.appendChild(lb);
    function close() {
      lb.remove();
      document.removeEventListener("keydown", onKey);
    }
    function onKey(e) {
      if (e.key === "Escape") close();
    }
    lb.addEventListener("click", (e) => {
      if (e.target === lb || e.target.classList.contains("lb-close")) close();
    });
    document.addEventListener("keydown", onKey);
  }

  // ---- Nhãn loại ảnh ----
  const IMG_KINDS = {
    noisoi: "Nội soi",
    donthuoc: "Đơn thuốc",
    truocmo: "Trước mổ",
    saumo: "Sau mổ",
    khac: "Khác",
  };
  function imgKindLabel(k) {
    return IMG_KINDS[k] || "Khác";
  }

  // ---- Thành phần tải & quản lý ảnh (dùng chung cho Khám & Phẫu thuật) ----
  // images: mảng {id, kind, caption, type, blob}. Chỉnh sửa trực tiếp mảng này.
  // allowedKinds: mảng key loại ảnh cho phép chọn khi thêm.
  function imageUploader(images, allowedKinds) {
    allowedKinds = allowedKinds || ["noisoi", "donthuoc", "khac"];
    const wrap = document.createElement("div");
    wrap.className = "img-uploader";

    const kindSelect = allowedKinds
      .map((k) => `<option value="${k}">${esc(imgKindLabel(k))}</option>`)
      .join("");

    wrap.innerHTML = `
      <div class="field" style="margin-bottom:10px;max-width:220px;">
        <label>Loại ảnh sắp thêm</label>
        <select class="iu-kind">${kindSelect}</select>
      </div>
      <div class="img-drop">📷 Bấm để chọn ảnh (có thể chọn nhiều ảnh cùng lúc)</div>
      <input type="file" accept="image/*" multiple class="iu-input" style="display:none" />
      <div class="img-grid"></div>
    `;

    const drop = wrap.querySelector(".img-drop");
    const input = wrap.querySelector(".iu-input");
    const grid = wrap.querySelector(".img-grid");
    const kindEl = wrap.querySelector(".iu-kind");

    function render() {
      grid.innerHTML = "";
      images.forEach((img) => {
        const url = imgSrc(img);
        const cell = document.createElement("div");
        cell.className = "img-thumb";
        cell.innerHTML = `
          <span class="img-kind-tag">${esc(imgKindLabel(img.kind))}</span>
          <button class="img-del" title="Xóa ảnh">&times;</button>
          <img src="${url}" alt="" />
          <div class="img-cap"><input type="text" placeholder="Ghi chú ảnh..." value="${esc(img.caption || "")}" /></div>
        `;
        cell.querySelector("img").addEventListener("click", () =>
          lightbox(url, img.caption)
        );
        cell.querySelector(".img-del").addEventListener("click", () => {
          const i = images.indexOf(img);
          if (i > -1) images.splice(i, 1);
          render();
        });
        cell.querySelector(".img-cap input").addEventListener("input", (e) => {
          img.caption = e.target.value;
        });
        grid.appendChild(cell);
      });
    }

    drop.addEventListener("click", () => input.click());
    input.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        try {
          const img = await readImageFile(f, kindEl.value);
          images.push(img);
        } catch (err) {
          toast("Bỏ qua file không phải ảnh: " + f.name, "err");
        }
      }
      input.value = "";
      render();
    });

    render();
    return { el: wrap, render };
  }

  // Hiển thị lưới ảnh chỉ để xem (trong trang chi tiết)
  function imageGallery(images) {
    const grid = document.createElement("div");
    grid.className = "img-grid";
    if (!images || !images.length) {
      grid.innerHTML = `<div class="muted" style="font-size:13.5px;">Chưa có ảnh</div>`;
      return grid;
    }
    images.forEach((img) => {
      const url = imgSrc(img);
      const cell = document.createElement("div");
      cell.className = "img-thumb";
      cell.innerHTML = `
        <span class="img-kind-tag">${esc(imgKindLabel(img.kind))}</span>
        <img src="${url}" alt="" />
        ${img.caption ? `<div class="img-cap">${esc(img.caption)}</div>` : ""}
      `;
      cell.querySelector("img").addEventListener("click", () =>
        lightbox(url, img.caption)
      );
      grid.appendChild(cell);
    });
    return grid;
  }

  // ---- Hàng nút gợi ý hẹn tái khám nhanh ----
  // dateInput: ô ngày mốc (ngày khám/mổ). followInput: ô hẹn tái khám.
  // Bấm nút -> tự nhảy ngày = ngày mốc + số ngày.
  function followUpQuick(dateInput, followInput, options) {
    options = options || [
      ["3 ngày", 3],
      ["5 ngày", 5],
      ["1 tuần", 7],
      ["2 tuần", 14],
      ["1 tháng", 30],
    ];
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:8px;";
    const lbl = document.createElement("span");
    lbl.className = "hint";
    lbl.style.margin = "0 2px 0 0";
    lbl.textContent = "Gợi ý:";
    row.appendChild(lbl);

    function markActive(btn) {
      row.querySelectorAll("button").forEach((x) => x.classList.remove("btn-primary"));
      if (btn) btn.classList.add("btn-primary");
    }

    options.forEach(([label, days]) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "btn btn-sm";
      b.textContent = label;
      b.addEventListener("click", () => {
        const base = dateInput && dateInput.value ? dateInput.value : todayISO();
        followInput.value = addDaysISO(base, days);
        markActive(b);
      });
      row.appendChild(b);
    });

    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "btn btn-sm btn-ghost";
    clear.textContent = "Xóa hẹn";
    clear.addEventListener("click", () => {
      followInput.value = "";
      markActive(null);
    });
    row.appendChild(clear);

    // Nếu bác sĩ tự sửa ngày thủ công thì bỏ đánh dấu nút gợi ý
    followInput.addEventListener("input", () => markActive(null));
    return row;
  }

  // ---- Debounce ----
  function debounce(fn, ms) {
    let t;
    return function () {
      const args = arguments,
        ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms || 200);
    };
  }

  // ---- Bỏ dấu tiếng Việt để tìm kiếm ----
  function noAccent(str) {
    if (!str) return "";
    return str
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
  }

  return {
    uid,
    esc,
    todayISO,
    toISODate,
    fmtDate,
    fmtDateTime,
    daysUntil,
    addDaysISO,
    ageFromYear,
    fmtMoney,
    parseMoney,
    initials,
    toast,
    openModal,
    confirmBox,
    readImageFile,
    blobUrl,
    revokeAllUrls,
    lightbox,
    imgKindLabel,
    IMG_KINDS,
    imageUploader,
    imageGallery,
    followUpQuick,
    debounce,
    noAccent,
  };
})();
