/* ============================================================
 * main.js — Điểm khởi động (ES module, xử lý bởi Vite)
 *  - Đọc biến môi trường (Supabase URL/key)
 *  - Tạo Supabase client -> window.sb
 *  - Màn hình đăng nhập (Supabase Auth)
 *  - Đồng bộ realtime giữa các thiết bị
 *  - Gọi window.startApp() (định nghĩa trong /js/app.js)
 * ============================================================ */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const authScreen = document.getElementById("authScreen");
const appEl = document.getElementById("app");

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

// ---- Trường hợp chưa cấu hình biến môi trường ----
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  authScreen.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">TMH</div>
      <h1 class="auth-title">Chưa cấu hình Supabase</h1>
      <p class="auth-sub" style="text-align:left">
        Chưa tìm thấy biến môi trường <b>VITE_SUPABASE_URL</b> và
        <b>VITE_SUPABASE_ANON_KEY</b>.<br><br>
        • Khi chạy local: tạo file <b>.env</b> (sao chép từ <b>.env.example</b>).<br>
        • Khi deploy Vercel: thêm 2 biến này trong
        <b>Project Settings → Environment Variables</b> rồi build lại.
      </p>
    </div>`;
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.sb = supabase;

  let appStarted = false;
  let realtimeChannel = null;

  function startRealtime() {
    if (realtimeChannel) return;
    let timer = null;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (window.App && window.App.refreshCurrent) window.App.refreshCurrent();
      }, 400);
    };
    realtimeChannel = supabase
      .channel("qlbn-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "patients" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "visits" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "surgeries" }, refresh)
      .subscribe();
  }

  function showApp(session) {
    authScreen.style.display = "none";
    appEl.style.display = "";

    const email = (session && session.user && session.user.email) || "";
    const bar = document.getElementById("userBar");
    if (bar) {
      bar.innerHTML = `
        <div class="user-email" title="${esc(email)}">👤 ${esc(email)}</div>
        <button class="btn btn-sm" id="btnLogout">Đăng xuất</button>`;
      const out = document.getElementById("btnLogout");
      if (out)
        out.addEventListener("click", async () => {
          await supabase.auth.signOut();
          location.reload();
        });
    }

    if (!appStarted) {
      appStarted = true;
      window.startApp();
      startRealtime();
    }
  }

  function showLogin() {
    appEl.style.display = "none";
    authScreen.style.display = "";
    authScreen.innerHTML = `
      <form id="loginForm" class="auth-card" autocomplete="on">
        <div class="auth-logo">TMH</div>
        <h1 class="auth-title">Đăng nhập</h1>
        <p class="auth-sub">Quản lý bệnh nhân Tai Mũi Họng</p>
        <div class="field">
          <label>Email</label>
          <input type="email" name="email" required placeholder="bacsi@vidu.com" autocomplete="username" />
        </div>
        <div class="field" style="margin-top:12px;">
          <label>Mật khẩu</label>
          <input type="password" name="password" required placeholder="••••••••" autocomplete="current-password" />
        </div>
        <div id="loginErr" class="auth-err" style="display:none"></div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:16px;">Đăng nhập</button>
        <p class="auth-note">Tài khoản do quản trị viên tạo trong Supabase. Nếu quên mật khẩu, liên hệ người quản trị.</p>
      </form>`;

    const form = document.getElementById("loginForm");
    const errBox = document.getElementById("loginErr");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = form.email.value.trim();
      const password = form.password.value;
      const btn = form.querySelector('button[type="submit"]');
      errBox.style.display = "none";
      btn.disabled = true;
      btn.textContent = "Đang đăng nhập...";
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        errBox.textContent =
          "Đăng nhập thất bại: " +
          (error.message === "Invalid login credentials"
            ? "sai email hoặc mật khẩu."
            : error.message || "");
        errBox.style.display = "block";
        btn.disabled = false;
        btn.textContent = "Đăng nhập";
      }
      // Thành công: onAuthStateChange sẽ tự gọi showApp()
    });
  }

  // Kiểm tra phiên đăng nhập hiện có
  supabase.auth.getSession().then(({ data }) => {
    if (data && data.session) showApp(data.session);
    else showLogin();
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session);
  });
}
