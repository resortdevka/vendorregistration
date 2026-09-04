/**
 * Devka Beach Resort — Secure Cloud Configuration & Services Module
 * Completely decouples API keys and backend logic from HTML pages.
 * Handles Firebase Auth, Firestore Real-time synchronization, and Supabase Cloud Storage.
 */

(function (window) {
  "use strict";

  // Obfuscated credential vault to prevent plain-text static scraping
  const _d = (s) => decodeURIComponent(escape(atob(s)));

  // Firebase Web App Credentials
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCTMmjzFnBO1_P1Z880JV4aPVqu0hxiyvo",
    authDomain: "vendorconnection-f7277.firebaseapp.com",
    projectId: "vendorconnection-f7277",
    storageBucket: "vendorconnection-f7277.firebasestorage.app",
    messagingSenderId: "836120803543",
    appId: "1:836120803543:web:c6a31180bc1809fc2fd892"
  };

  // Supabase Cloud Storage Credentials
  const SUPABASE_CONFIG = {
    url: _d("aHR0cHM6Ly9pa3hybXJ1cnRnd3ljYWdrcmx4ZC5zdXBhYmFzZS5jbw=="),
    anonKey: _d("c2JfcHVibGlzaGFibGVfSkt1VzZWVVRFcXVtMHdYYWplbEFoZ184NjBJTFVnVw=="),
    secretKey: _d("c2Jfc2VjcmV0X1gza002a2ZiVHE3c3JZT01HbXMyQ2dfRmJpc2szZUs="),
    bucket: "vendor Data files"
  };

  const ADMIN_EMAIL_MAP = {
    admin: "admin@devkabeachresort.com",
    "admin@devka.com": "admin@devkabeachresort.com",
    "admin@devkabeachresort.com": "admin@devkabeachresort.com"
  };

  let firebaseApp = null;
  let firestoreDb = null;
  let firebaseAuth = null;
  let isFirebaseReady = false;
  let initAttempts = 0;
  let anonymousSignInDone = false;

  // Initialize Firebase Client
  function initFirebase() {
    const fb = typeof window !== "undefined" ? window.firebase : null;
    if (!fb) {
      return false;
    }
    if (isFirebaseReady && firestoreDb && firebaseAuth) {
      return true;
    }
    initAttempts++;
    try {
      if (!fb.apps || fb.apps.length === 0) {
        firebaseApp = fb.initializeApp(FIREBASE_CONFIG);
      } else {
        firebaseApp = fb.app();
      }

      if (typeof fb.auth === "function" && !firebaseAuth) {
        firebaseAuth = fb.auth();
      }

      if (typeof fb.firestore === "function" && !firestoreDb) {
        firestoreDb = fb.firestore();
        // Critical: use long polling for cross-domain Vercel deployments
        // This prevents WebChannel transport issues across different hostnames
        try {
          firestoreDb.settings({
            experimentalForceLongPolling: true,
            merge: true
          });
        } catch (settingsErr) {
          // Settings may already be applied — safe to ignore
        }
      }

      if (!firebaseAuth) console.warn("DevkaCloud: Firebase Auth not detected.");
      if (!firestoreDb) console.warn("DevkaCloud: Firestore service not detected in SDK.");

      isFirebaseReady = !!(firebaseAuth && firestoreDb);

      if (isFirebaseReady) {
        console.log("DevkaCloud: Firebase services connected (attempt " + initAttempts + ").");
        // Sign in anonymously on the public portal so Firestore rules allow writes
        // The admin portal will sign in with real credentials via adminSignIn()
        _tryAnonymousSignIn();
        // Dispatch event so VendorDB can attach its real-time listener
        window.dispatchEvent(new CustomEvent("devka_firebase_ready"));
      }
    } catch (err) {
      console.warn("DevkaCloud: Firebase initialization notice:", err.message);
    }
    return isFirebaseReady;
  }

  // Anonymous sign-in for public portal so writes are authenticated
  function _tryAnonymousSignIn() {
    if (anonymousSignInDone || !firebaseAuth) return;
    firebaseAuth.onAuthStateChanged((user) => {
      if (!user) {
        // Sign in anonymously so Firestore rules (require auth) allow public writes
        firebaseAuth.signInAnonymously().then(() => {
          anonymousSignInDone = true;
          console.log("DevkaCloud: Anonymous auth established for public portal writes.");
          // Retry any pending sync queue after auth
          if (window.VendorDB && window.VendorDB.processSyncQueue) {
            setTimeout(() => window.VendorDB.processSyncQueue(), 500);
          }
        }).catch((err) => {
          // Anonymous auth disabled — Firestore rules must allow unauthenticated writes
          console.warn("DevkaCloud: Anonymous auth not available:", err.message, "— Firestore rules must allow unauthenticated writes.");
        });
      } else {
        anonymousSignInDone = true;
        console.log("DevkaCloud: Auth user ready:", user.isAnonymous ? "anonymous" : user.email);
        if (window.VendorDB && window.VendorDB.processSyncQueue) {
          setTimeout(() => window.VendorDB.processSyncQueue(), 500);
        }
      }
    });
  }

  // Auto-init with multiple retry attempts to handle async script loading
  function _scheduleInit() {
    if (typeof window !== "undefined") {
      if (typeof window.firebase !== "undefined") {
        initFirebase();
      }
      // Retry on DOMContentLoaded
      window.addEventListener("DOMContentLoaded", () => {
        if (!isFirebaseReady) initFirebase();
      });
      // Retry after scripts fully load
      window.addEventListener("load", () => {
        if (!isFirebaseReady) initFirebase();
      });
      // Staggered retries for async CDN script loads
      setTimeout(() => { if (!isFirebaseReady) initFirebase(); }, 300);
      setTimeout(() => { if (!isFirebaseReady) initFirebase(); }, 800);
      setTimeout(() => { if (!isFirebaseReady) initFirebase(); }, 2000);
      setTimeout(() => { if (!isFirebaseReady) initFirebase(); }, 4000);
    }
  }
  _scheduleInit();

  /**
   * Upload file to Supabase Cloud Storage
   * Supports PNG, JPG, JPEG, and PDF documents
   * Returns metadata including cloud public URL
   */
  async function uploadToSupabase(file, folderName = "attachments", customFileName = null) {
    if (!file) throw new Error("No file provided for upload");

    // Clean filename
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    const sanitizedBase = (customFileName || file.name.replace(/\.[^/.]+$/, ""))
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .substring(0, 40);
    const finalFileName = `${sanitizedBase}_${timestamp}_${randomSuffix}.${ext}`;
    const storagePath = `${folderName.replace(/[^a-zA-Z0-9_-]/g, "_")}/${finalFileName}`;

    // Normalize mime type for Supabase bucket acceptance
    let mimeType = file.type || "application/octet-stream";
    if (ext === "pdf" && !mimeType.includes("pdf")) {
      mimeType = "application/pdf";
    } else if ((ext === "jpg" || ext === "jpeg") && !mimeType.includes("jpeg") && !mimeType.includes("jpg")) {
      mimeType = "image/jpeg";
    } else if (ext === "png" && !mimeType.includes("png")) {
      mimeType = "image/png";
    }

    const uploadUrl = `${SUPABASE_CONFIG.url}/storage/v1/object/${encodeURIComponent(SUPABASE_CONFIG.bucket)}/${encodeURIComponent(storagePath)}`;

    try {
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          apikey: SUPABASE_CONFIG.secretKey,
          Authorization: `Bearer ${SUPABASE_CONFIG.secretKey}`,
          "Content-Type": mimeType
        },
        body: file
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Supabase upload failed (${response.status}): ${errText}`);
      }

      // Public / Direct access URL
      const publicUrl = `${SUPABASE_CONFIG.url}/storage/v1/object/public/${encodeURIComponent(SUPABASE_CONFIG.bucket)}/${encodeURIComponent(storagePath)}`;

      return {
        success: true,
        name: file.name,
        storagePath: storagePath,
        url: publicUrl,
        size: file.size,
        type: mimeType,
        uploadedAt: Date.now()
      };
    } catch (err) {
      console.error("DevkaCloud: Supabase upload error:", err);
      throw err;
    }
  }

  /**
   * Delete file from Supabase Storage
   */
  async function deleteFromSupabase(storagePath) {
    if (!storagePath) return;
    const url = `${SUPABASE_CONFIG.url}/storage/v1/object/${encodeURIComponent(SUPABASE_CONFIG.bucket)}`;
    try {
      await fetch(url, {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_CONFIG.secretKey,
          Authorization: `Bearer ${SUPABASE_CONFIG.secretKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ prefixes: [storagePath] })
      });
    } catch (e) {
      console.warn("DevkaCloud: Delete from Supabase warning:", e);
    }
  }

  /**
   * Firebase Admin Authentication
   * Validates username/email and password with Firebase Auth
   */
  async function adminSignIn(usernameOrEmail, password) {
    // Ensure Firebase is initialized before trying to sign in
    if (!isFirebaseReady) initFirebase();

    // Wait up to 5 seconds for Firebase to become ready
    if (!firebaseAuth) {
      await new Promise((resolve) => {
        let waited = 0;
        const check = setInterval(() => {
          waited += 100;
          if (firebaseAuth || waited >= 5000) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }

    if (!firebaseAuth) {
      throw new Error("Firebase Authentication service is currently loading. Please retry in a moment.");
    }
    const cleanUser = (usernameOrEmail || "").trim().toLowerCase();
    const emailToUse = ADMIN_EMAIL_MAP[cleanUser] || cleanUser;

    try {
      const userCredential = await firebaseAuth.signInWithEmailAndPassword(emailToUse, password);
      return {
        success: true,
        user: {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          displayName: userCredential.user.displayName || "Admin Officer"
        }
      };
    } catch (err) {
      let friendlyMessage = "Invalid credentials. Please check your username and password.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        friendlyMessage = "Incorrect Admin ID or Password. Please try again.";
      } else if (err.code === "auth/too-many-requests") {
        friendlyMessage = "Access temporarily disabled due to multiple failed attempts. Please wait a moment.";
      } else if (err.message) {
        friendlyMessage = err.message;
      }
      throw new Error(friendlyMessage);
    }
  }

  /**
   * Firebase Admin Sign Out
   */
  async function adminSignOut() {
    if (!isFirebaseReady) initFirebase();
    if (firebaseAuth) {
      await firebaseAuth.signOut();
    }
  }

  /**
   * Listen to Firebase Auth state
   */
  function onAuthStateChanged(callback) {
    if (!isFirebaseReady) initFirebase();
    if (firebaseAuth) {
      return firebaseAuth.onAuthStateChanged(callback);
    }
    // Poll until auth is ready
    const interval = setInterval(() => {
      if (initFirebase() && firebaseAuth) {
        clearInterval(interval);
        firebaseAuth.onAuthStateChanged(callback);
      }
    }, 200);
    return () => clearInterval(interval);
  }

  /**
   * Expose frozen security API to window
   */
  window.DevkaCloud = Object.freeze({
    init: initFirebase,
    uploadDocument: uploadToSupabase,
    deleteDocument: deleteFromSupabase,
    adminSignIn: adminSignIn,
    adminSignOut: adminSignOut,
    onAuthStateChanged: onAuthStateChanged,
    getFirestore: () => {
      if (!isFirebaseReady) initFirebase();
      return firestoreDb || null;
    },
    getAuth: () => {
      if (!isFirebaseReady) initFirebase();
      return firebaseAuth || null;
    },
    isReady: () => isFirebaseReady
  });

})(typeof window !== "undefined" ? window : globalThis);
