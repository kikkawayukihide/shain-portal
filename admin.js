import { firebaseConfig, ADMIN_EMAILS } from "./config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const appEl = document.getElementById("app");

function render(html) {
  appEl.innerHTML = html;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ---------- ログイン画面 ----------

function renderLogin() {
  render(`
    <div class="login-box">
      <h2>社内ポータル 管理画面</h2>
      <p>管理者用のGoogleアカウントでログインしてください。</p>
      <button class="google-btn" id="googleLoginBtn">Googleでログイン</button>
    </div>
  `);
  document.getElementById("googleLoginBtn").addEventListener("click", () => {
    signInWithPopup(auth, new GoogleAuthProvider()).catch((e) => {
      alert("ログインに失敗しました: " + e.message);
      console.error(e);
    });
  });
}

// ---------- 権限なし画面 ----------

function renderDenied(email) {
  render(`
    <div class="denied-box">
      <p>${escapeHtml(email)} には管理者権限がありません。</p>
      <button class="google-btn" id="signOutBtn">サインアウトする</button>
    </div>
  `);
  document.getElementById("signOutBtn").addEventListener("click", () => signOut(auth));
}

// ---------- 管理画面本体 ----------

async function renderAdmin(user) {
  render(`
    <div class="admin-header">
      <span>${escapeHtml(user.email)} でログイン中</span>
      <button class="signout-link" id="signOutBtn">サインアウト</button>
    </div>
    <div class="main" id="mainArea">
      <div class="loading">読み込み中です…</div>
    </div>
  `);
  document.getElementById("signOutBtn").addEventListener("click", () => signOut(auth));

  const [storesSnap, requestsSnap] = await Promise.all([
    getDocs(collection(db, "stores")),
    getDocs(collection(db, "registrationRequests")),
  ]);

  const stores = [];
  storesSnap.forEach((d) => stores.push({ id: d.id, ...d.data() }));

  const requests = [];
  requestsSnap.forEach((d) => requests.push({ id: d.id, ...d.data() }));

  const mainArea = document.getElementById("mainArea");

  if (requests.length === 0) {
    mainArea.innerHTML = `<h3>登録リクエスト</h3><p style="color:#999;">今のところ、リクエストはありません。</p>`;
    return;
  }

  const storeOptions = stores
    .map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name || s.id)}</option>`)
    .join("");

  mainArea.innerHTML = `
    <h3>登録リクエスト（${requests.length}件）</h3>
    ${requests
      .map(
        (r) => `
      <div class="request-card" data-id="${escapeHtml(r.id)}">
        <div class="req-name">${escapeHtml(r.displayName || "(LINE名なし)")}</div>
        <div class="req-id">LINEユーザーID: ${escapeHtml(r.id)}</div>
        <div class="form-row">
          <label>氏名</label>
          <input type="text" class="name-input" value="${escapeHtml(r.displayName || "")}" />
        </div>
        <div class="form-row">
          <label>所属店舗</label>
          <select class="store-select">${storeOptions}</select>
        </div>
        <div class="form-row">
          <label>権限</label>
          <select class="role-select">
            <option value="member">一般（アルバイト）</option>
            <option value="manager">店長</option>
            <option value="admin">本部管理者</option>
          </select>
        </div>
        <button class="approve-btn">承認する</button>
        <button class="reject-btn">リクエストを削除</button>
      </div>
    `
      )
      .join("")}
  `;

  mainArea.querySelectorAll(".request-card").forEach((card) => {
    const requestId = card.getAttribute("data-id");

    card.querySelector(".approve-btn").addEventListener("click", async () => {
      const name = card.querySelector(".name-input").value.trim();
      const storeId = card.querySelector(".store-select").value;
      const role = card.querySelector(".role-select").value;

      if (!name) {
        alert("氏名を入力してください。");
        return;
      }
      if (!storeId) {
        alert("先に「stores」コレクションに店舗を登録してください。");
        return;
      }

      try {
        await setDoc(doc(db, "employees", requestId), { name, storeId, role });
        await deleteDoc(doc(db, "registrationRequests", requestId));
        card.remove();
      } catch (e) {
        alert("承認に失敗しました: " + e.message);
        console.error(e);
      }
    });

    card.querySelector(".reject-btn").addEventListener("click", async () => {
      if (!confirm("このリクエストを削除しますか？")) return;
      try {
        await deleteDoc(doc(db, "registrationRequests", requestId));
        card.remove();
      } catch (e) {
        alert("削除に失敗しました: " + e.message);
        console.error(e);
      }
    });
  });
}

// ---------- 起動 ----------

onAuthStateChanged(auth, (user) => {
  if (!user) {
    renderLogin();
    return;
  }
  if (!ADMIN_EMAILS.includes(user.email)) {
    renderDenied(user.email);
    return;
  }
  renderAdmin(user);
});
