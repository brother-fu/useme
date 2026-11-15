// 登录 + 云同步（Firebase Auth + Cloud Firestore）
// 未登录：照常只用 localStorage。登录后：users/{uid} 这一份文档就是你的卡包，多设备实时同步。
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut,
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

// 网页端配置本来就是公开的（会下发到每个浏览器），安全靠 firestore.rules 保证
const firebaseConfig = {
  apiKey: "AIzaSyBSZ2d2B2H8WhglqWQ4nqF_qngrVFoYe88",
  authDomain: "useme-de6af.firebaseapp.com",
  projectId: "useme-de6af",
  storageBucket: "useme-de6af.firebasestorage.app",
  messagingSenderId: "635204304301",
  appId: "1:635204304301:web:a7db8431cb24b2d7387524",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, { localCache: persistentLocalCache() }); // 离线也能读

const box = document.getElementById("account");
let unsub = null;
let pushTimer = null;

function setStatus(text) { const s = box.querySelector(".sync"); if (s) s.textContent = text; }

function renderAccount(user) {
  box.innerHTML = "";
  if (!user) {
    const b = document.createElement("button");
    b.className = "btn small"; b.textContent = "用 Google 登录同步";
    b.onclick = login;
    box.append(b);
    return;
  }
  box.innerHTML = `
    <span class="who"></span>
    <span class="sync">同步中…</span>
    <button class="btn small link">退出</button>`;
  box.querySelector(".who").textContent = user.displayName || user.email;
  box.querySelector("button").onclick = () => signOut(auth);
}

async function login() {
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment") {
      await signInWithRedirect(auth, provider);
    } else if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") {
      alert("登录失败：" + (e.message || e.code));
    }
  }
}

// 首次登录时把本地和云端合并：卡取并集，同一张卡的设置以云端为准
function merge(local, remote) {
  return {
    owned: [...new Set([...(remote.owned || []), ...(local.owned || [])])],
    cards: { ...(local.cards || {}), ...(remote.cards || {}) },
    cpp: { ...(local.cpp || {}), ...(remote.cpp || {}) },
  };
}

// 键顺序无关的序列化，用来判断云端数据是否真的变了
function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",")}}`;
  return JSON.stringify(v ?? null);
}

function push(ref) {
  clearTimeout(pushTimer);
  setStatus("同步中…");
  pushTimer = setTimeout(async () => {
    const s = window.useme.getState();
    try {
      await setDoc(ref, { owned: s.owned, cards: s.cards, cpp: s.cpp, updatedAt: serverTimestamp() });
      setStatus("已同步");
    } catch (e) {
      console.error(e);
      setStatus("同步失败：" + (e.code || e.message));
    }
  }, 600);
}

onAuthStateChanged(auth, async (user) => {
  renderAccount(user);
  unsub?.(); unsub = null;
  window.useme._onChange = null;
  if (!user) return;

  const ref = doc(db, "users", user.uid);
  try {
    const snap = await getDoc(ref);
    const local = window.useme.getState();
    const merged = snap.exists() ? merge(local, snap.data()) : local;
    window.useme.applyRemote(merged);
    await setDoc(ref, { ...merged, updatedAt: serverTimestamp() });
    setStatus("已同步");
  } catch (e) {
    console.error(e);
    setStatus(navigator.onLine ? "同步失败：" + (e.code || e.message) : "离线，联网后同步");
  }

  // 本地有改动 → 推到云端
  window.useme._onChange = () => push(ref);
  // 其他设备改了 → 拉下来。includeMetadataChanges：服务器确认（缓存→在线）时也要收到事件，才能更新状态
  unsub = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
    if (!snap.exists()) return;
    const m = snap.metadata;
    setStatus(m.hasPendingWrites ? "同步中…" : m.fromCache ? (navigator.onLine ? "连接中…" : "离线（已缓存）") : "已同步");
    if (m.hasPendingWrites) return;
    const d = snap.data();
    const cur = window.useme.getState();
    const same = stable([d.owned, d.cards, d.cpp]) === stable([cur.owned, cur.cards, cur.cpp]);
    if (!same) window.useme.applyRemote(d);
  }, (e) => { console.error(e); setStatus("同步失败：" + (e.code || e.message)); });
});
