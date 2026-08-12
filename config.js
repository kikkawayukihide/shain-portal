// ここに、LINE DevelopersとFirebaseで発行された値を入れています。
// あとで内容を変えたくなったら、この1ファイルだけ直せばOKです。

export const LIFF_ID = "2011070699-JcX4qtar";

export const firebaseConfig = {
  apiKey: "AIzaSyCzKJLufKXH5nIaUY48YqbnVV8Rp3uaxzE",
  authDomain: "shain-portal.firebaseapp.com",
  projectId: "shain-portal",
  storageBucket: "shain-portal.firebasestorage.app",
  messagingSenderId: "1093893369088",
  appId: "1:1093893369088:web:779b1c3c78480de36317e5",
  measurementId: "G-QECRLXFGL1",
};

// カテゴリの内部名と、画面に表示する日本語名の対応
export const CATEGORIES = [
  { key: "rules", label: "就業規則", icon: "📘" },
  { key: "company", label: "会社規程", icon: "📗" },
  { key: "manual", label: "店舗マニュアル", icon: "📕" },
  { key: "notice", label: "お知らせ", icon: "📣" },
];
