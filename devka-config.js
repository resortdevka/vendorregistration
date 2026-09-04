/**
 * Devka Beach Resort — Cloud Configuration & Services Module
 * Firebase Firestore (data) + Supabase (file storage)
 */

(function (window) {
  "use strict";

  const _d = (s) => decodeURIComponent(escape(atob(s)));

  // Firebase Config
  const FIREBASE_CONFIG = {
    apiKey:            "AIzaSyCTMmjzFnBO1_P1Z880JV4aPVqu0hxiyvo",
    authDomain:        "vendorconnection-f7277.firebaseapp.com",
    projectId:         "vendorconnection-f7277",
    storageBucket:     "vendorconnection-f7277.firebasestorage.app",
    messagingSenderId: "836120803543",
    appId:             "1:836120803543:web:c6a31180bc1809fc2fd892"
  };

  // Supabase Config
  const SUPABASE_CONFIG = {
    url:       _d("aHR0cHM6Ly9pa3hybXJ1cnRnd3ljYWdrcmx4ZC5zdXBhYmFzZS5jbw=="),
    anonKey:   _d("c2JfcHVibGlzaGFibGVfSkt1VzZWVVRFcXVtMHdYYWplbEFoZ184NjBJTFVnVw=="),
    secretKey: _d("c2Jfc2VjcmV0X1gza002a2ZiVHE3c3JZT01HbXMyQ2dfRmJpc2szZUs="),
    bucket:    "vendor Data files"
  };

  const ADMIN_EMAIL_MAP = {
    "admin":                      "admin@devkabeachresort.com",
    "admin@devka.com":            "admin@devkabeachresort.com",
    "admin@devkabeachresort.com": "admin@devkabeachresort.com"
  };

  // State
  let firestoreDb  = null;
  let firebaseAuth = null;
  let _ready       = false;

  // Core Init
  function initFirebase() {
    if (_ready && firestoreDb) return true;
    const fb = window.firebase;
    if (!fb) return false;

    try {
      const app = (fb.apps && fb.apps.length > 0)
        ? fb.app()
        : fb.initializeApp(FIREBASE_CONFIG);

      if (!firebaseAuth && typeof fb.auth === "function") {
        try { firebaseAuth = fb.auth(app); } catch (e) {}
      }

      if (!firestoreDb && typeof fb.firestore === "function") {
        try { firestoreDb = fb.firestore(app); } catch (e) {}
      }

      if (firestoreDb) {
        _ready = true;
        console.log("[DevkaCloud] Firebase Firestore initialized successfully");
        window.dispatchEvent(new CustomEvent("devka_firebase_ready"));
      }
    } catch (e) {
      console.warn("[DevkaCloud] Firebase init notice:", e.message);
    }

    return _ready;
  }

  // Wait for Firestore Promise helper
  async function waitForFirestore(timeoutMs = 6000) {
    if (firestoreDb) return firestoreDb;
    initFirebase();
    if (firestoreDb) return firestoreDb;
    const start = Date.now();
    return new Promise(function(resolve) {
      const iv = setInterval(function() {
        initFirebase();
        if (firestoreDb || (Date.now() - start >= timeoutMs)) {
          clearInterval(iv);
          resolve(firestoreDb || null);
        }
      }, 100);
    });
  }

  // Auto-init with retries for async CDN loading
  (function boot() {
    initFirebase();
    document.addEventListener("DOMContentLoaded", function() { if (!firestoreDb) initFirebase(); });
    window.addEventListener("load", function() { if (!firestoreDb) initFirebase(); });
    [200, 600, 1500, 3000].forEach(function(ms) {
      setTimeout(function() { if (!firestoreDb) initFirebase(); }, ms);
    });
  })();

  // Supabase Upload
  async function uploadToSupabase(file, folderName, customFileName) {
    folderName = folderName || "attachments";
    if (!file) throw new Error("No file provided");
    var ext   = (file.name.split(".").pop() || "bin").toLowerCase();
    var base  = (customFileName || file.name.replace(/\.[^/.]+$/, ""))
                  .replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
    var fname = base + "_" + Date.now() + "_" + Math.random().toString(36).slice(2,7) + "." + ext;
    var path  = folderName.replace(/[^a-zA-Z0-9_-]/g, "_") + "/" + fname;
    var mime  = file.type || "application/octet-stream";
    if (ext === "pdf")                        mime = "application/pdf";
    else if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
    else if (ext === "png")                   mime = "image/png";

    var uploadUrl = SUPABASE_CONFIG.url + "/storage/v1/object/" +
      encodeURIComponent(SUPABASE_CONFIG.bucket) + "/" + encodeURIComponent(path);
    var res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        apikey: SUPABASE_CONFIG.secretKey,
        Authorization: "Bearer " + SUPABASE_CONFIG.secretKey,
        "Content-Type": mime
      },
      body: file
    });
    if (!res.ok) throw new Error("Supabase upload failed (" + res.status + "): " + await res.text());
    var publicUrl = SUPABASE_CONFIG.url + "/storage/v1/object/public/" +
      encodeURIComponent(SUPABASE_CONFIG.bucket) + "/" + encodeURIComponent(path);
    return { success: true, name: file.name, storagePath: path, url: publicUrl,
             size: file.size, type: mime, uploadedAt: Date.now() };
  }

  // Supabase Delete
  async function deleteFromSupabase(storagePath) {
    if (!storagePath) return;
    await fetch(SUPABASE_CONFIG.url + "/storage/v1/object/" +
      encodeURIComponent(SUPABASE_CONFIG.bucket), {
      method: "DELETE",
      headers: {
        apikey: SUPABASE_CONFIG.secretKey,
        Authorization: "Bearer " + SUPABASE_CONFIG.secretKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prefixes: [storagePath] })
    }).catch(function(e) { console.warn("[DevkaCloud] Supabase delete warning:", e); });
  }

  // Admin Sign-In
  async function adminSignIn(usernameOrEmail, password) {
    if (!firebaseAuth) {
      await new Promise(function(resolve) {
        var t = 0;
        var iv = setInterval(function() {
          initFirebase();
          t += 100;
          if (firebaseAuth || t >= 6000) { clearInterval(iv); resolve(); }
        }, 100);
      });
    }
    if (!firebaseAuth) throw new Error("Firebase Authentication not loaded. Please refresh the page.");

    var cleanUser = (usernameOrEmail || "").trim().toLowerCase();
    var email = ADMIN_EMAIL_MAP[cleanUser] || (usernameOrEmail || "").trim();

    try {
      var cred = await firebaseAuth.signInWithEmailAndPassword(email, password);
      return {
        success: true,
        user: {
          uid:         cred.user.uid,
          email:       cred.user.email,
          displayName: cred.user.displayName || "Admin Officer"
        }
      };
    } catch (err) {
      var code = err.code || "";
      var msg  = "Invalid credentials. Please check your username and password.";
      if (code.indexOf("user-not-found") > -1 || code.indexOf("wrong-password") > -1 || code.indexOf("invalid-credential") > -1)
        msg = "Incorrect Admin ID or Password. Please try again.";
      else if (code.indexOf("too-many-requests") > -1)
        msg = "Too many failed attempts. Please wait a moment and try again.";
      else if (err.message)
        msg = err.message;
      throw new Error(msg);
    }
  }

  // Admin Sign-Out
  async function adminSignOut() {
    if (firebaseAuth) await firebaseAuth.signOut().catch(function() {});
  }

  // Auth State Listener
  function onAuthStateChanged(cb) {
    if (firebaseAuth) return firebaseAuth.onAuthStateChanged(cb);
    var iv = setInterval(function() {
      initFirebase();
      if (firebaseAuth) { clearInterval(iv); firebaseAuth.onAuthStateChanged(cb); }
    }, 200);
    return function() { clearInterval(iv); };
  }

  // Public API
  window.DevkaCloud = Object.freeze({
    init:               initFirebase,
    waitForFirestore:   waitForFirestore,
    uploadDocument:     uploadToSupabase,
    deleteDocument:     deleteFromSupabase,
    adminSignIn:        adminSignIn,
    adminSignOut:       adminSignOut,
    onAuthStateChanged: onAuthStateChanged,
    getFirestore: function() { if (!firestoreDb) initFirebase(); return firestoreDb  || null; },
    getAuth:      function() { if (!firebaseAuth) initFirebase(); return firebaseAuth || null; },
    isReady:      function() { return _ready && !!firestoreDb; }
  });

})(typeof window !== "undefined" ? window : globalThis);