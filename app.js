import { LIFF_ID, firebaseConfig, CATEGORIES } from "./config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const appEl = document.getElementById("app");

let currentEmployee = null; // { id, name, storeId, role }
let currentEmployeeId = null; // LINEのユーザーID

// ---------- 画面描画のユーティリティ ----------

function render(html) {
  appEl.innerHTML = html;
}

function header(title, opts = {}) {
  const backBtn = opts.onBack
    ? `<button class="back" id="backBtn">‹</button>`
    : `<span style="width:30px;display:inline-block;"></span>`;
  return `
    <div class="header">
      ${backBtn}
      <div class="title">${title}</div>
    </div>
  `;
}

function userBar() {
  if (!currentEmployee) return "";
  return `
    <div class="user-bar">
      <strong>${escapeHtml(currentEmployee.name || "")}</strong> さん
      （${escapeHtml(currentEmployee.storeName || "所属店舗未設定")}）
    </div>
  `;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function formatDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function isRecent(ts) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const days = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  return days <= 7;
}

// ---------- 起動処理：LIFF初期化 → ログイン確認 → 従業員データ取得 ----------

async function boot() {
  try {
    await liff.init({ liffId: LIFF_ID });
  } catch (e) {
    render(`<div class="message">アプリの初期化に失敗しました。<br>時間をおいてもう一度開いてください。</div>`);
    console.error(e);
    return;
  }

  if (!liff.isLoggedIn()) {
    liff.login();
    return; // ここでLINEのログイン画面へ遷移する
  }

  let profile;
  try {
    profile = await liff.getProfile();
  } catch (e) {
    render(`<div class="message">プロフィールの取得に失敗しました。<br>もう一度開き直してください。</div>`);
    console.error(e);
    return;
  }

  currentEmployeeId = profile.userId;

  const empSnap = await getDoc(doc(db, "employees", currentEmployeeId));

  if (!empSnap.exists()) {
    renderNotRegistered(profile);
    return;
  }

  const emp = empSnap.data();
  let storeName = "";
  if (emp.storeId) {
    const storeSnap = await getDoc(doc(db, "stores", emp.storeId));
    if (storeSnap.exists()) storeName = storeSnap.data().name;
  }

  currentEmployee = {
    id: currentEmployeeId,
    name: emp.name || profile.displayName,
    storeId: emp.storeId || null,
    storeName,
    role: emp.role || "member",
  };

  renderHome();
}

// ---------- 未登録の従業員向け画面 ----------

function renderNotRegistered(profile) {
  render(`
    ${header("社内ポータル（試作）")}
    <div class="main">
      <div class="message">
        まだ利用登録がされていません。<br>
        下のIDをコピーして、管理者にLINEなどで送り、登録をお願いしてください。
        <div class="id-box">${escapeHtml(profile.userId)}</div>
        <button class="copy-btn" id="copyIdBtn">IDをコピーする</button>
        <div id="copyResult" style="margin-top:10px;font-size:13px;color:#06c755;"></div>
      </div>
    </div>
  `);

  const btn = document.getElementById("copyIdBtn");
  const result = document.getElementById("copyResult");
  if (btn) {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(profile.userId);
        result.textContent = "コピーしました。LINEのトークなどに貼り付けて管理者に送ってください。";
      } catch (e) {
        result.textContent = "コピーできませんでした。上のIDを長押しして手動でコピーしてください。";
        console.error(e);
      }
    });
  }
}

// ---------- ホーム画面 ----------

function renderHome() {
  const tiles = CATEGORIES.map(
    (c) => `
      <div class="tile" data-category="${c.key}">
        <span class="icon">${c.icon}</span>
        ${c.label}
      </div>
    `
  ).join("");

  render(`
    ${header("社内ポータル（試作）")}
    ${userBar()}
    <div class="main">
      <div class="tiles">${tiles}</div>
    </div>
  `);

  document.querySelectorAll(".tile").forEach((el) => {
    el.addEventListener("click", () => {
      const key = el.getAttribute("data-category");
      renderDocumentList(key);
    });
  });
}

// ---------- 文書一覧画面 ----------

async function renderDocumentList(categoryKey) {
  const label = CATEGORIES.find((c) => c.key === categoryKey)?.label || "";

  render(`
    ${header(label, { onBack: true })}
    <div class="main"><div class="loading">読み込み中です…</div></div>
  `);
  bindBack(renderHome);

  const docsCol = collection(db, "documents");

  const [allWideSnap, storeSnap] = await Promise.all([
    getDocs(query(docsCol, where("category", "==", categoryKey), where("storeId", "==", "all"))),
    currentEmployee.storeId
      ? getDocs(query(docsCol, where("category", "==", categoryKey), where("storeId", "==", currentEmployee.storeId)))
      : Promise.resolve({ forEach: () => {} }),
  ]);

  const items = [];
  allWideSnap.forEach((d) => items.push({ id: d.id, ...d.data() }));
  storeSnap.forEach((d) => items.push({ id: d.id, ...d.data() }));

  items.sort((a, b) => {
    const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
    const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
    return tb - ta;
  });

  const listHtml = items.length
    ? items
        .map(
          (d) => `
        <div class="doc-card" data-id="${d.id}">
          <div class="doc-title">
            ${escapeHtml(d.title || "(無題)")}
            ${isRecent(d.updatedAt) ? '<span class="badge-new">NEW</span>' : ""}
          </div>
          <div class="doc-meta">更新日：${formatDate(d.updatedAt)}</div>
        </div>
      `
        )
        .join("")
    : `<div class="empty">まだ文書がありません</div>`;

  render(`
    ${header(label, { onBack: true })}
    <div class="main">
      <div class="doc-list">${listHtml}</div>
    </div>
  `);
  bindBack(renderHome);

  document.querySelectorAll(".doc-card").forEach((el) => {
    el.addEventListener("click", () => {
      const item = items.find((i) => i.id === el.getAttribute("data-id"));
      if (item) openDocument(item, () => renderDocumentList(categoryKey));
    });
  });
}

// ---------- PDF閲覧画面（+閲覧履歴の記録） ----------

function toEmbeddableUrl(url) {
  const m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
  if (m) return `https://drive.google.com/file/d/${m[1]}/preview`;
  return url;
}

async function openDocument(item, onBack) {
  // 閲覧履歴を記録（失敗しても画面表示は止めない）
  addDoc(collection(db, "viewLogs"), {
    employeeId: currentEmployeeId,
    documentId: item.id,
    documentTitle: item.title || "",
    viewedAt: serverTimestamp(),
  }).catch((e) => console.error("閲覧履歴の記録に失敗しました", e));

  const embedUrl = toEmbeddableUrl(item.pdfUrl || "");

  render(`
    ${header(item.title || "文書", { onBack: true })}
    <iframe class="pdf-frame" src="${embedUrl}"></iframe>
  `);
  bindBack(onBack);
}

// ---------- 戻るボタンの共通処理 ----------

function bindBack(fn) {
  const btn = document.getElementById("backBtn");
  if (btn) btn.addEventListener("click", fn);
}

boot();
