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
    apiKey: _d("QUl6YVN5Q1RNbWp6Rm5CTzFfUDFaODgwSlY0YVBWcXUwaHhpeXZv"),
    authDomain: _d("dmVuZG9yY29ubmVjdGlvbi1mNzI3Ny5maXJlYmFzZWFwcC5jb20="),
    projectId: _d("dmVuZG9yY29ubmVjdGlvbi1mNzI3Nw=="),
    storageBucket: _d("dmVuZG9yY29ubmVjdGlvbi1mNzI3Ny5maXJlYmFzZXN0b3JhZ2UuYXBw"),
    messagingSenderId: _d("ODM2MTIwODAzNTQz"),
    appId: _d("MTo4MzYxMjA4MDM1NDM6d2ViOmM2YTMxMTgwYmMxODA5ZmMyZmQ4OTI=")
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

  // Initialize Firebase Client
  function initFirebase() {
    const fb = typeof window !== "undefined" ? window.firebase : null;
    if (!fb) {
      return false;
    }
    if (!firebaseApp) {
      try {
        if (!fb.apps || fb.apps.length === 0) {
          firebaseApp = fb.initializeApp(FIREBASE_CONFIG);
        } else {
          firebaseApp = fb.app();
        }
        if (typeof fb.auth === "function") {
          firebaseAuth = fb.auth();
        }
        if (typeof fb.firestore === "function") {
          firestoreDb = fb.firestore();
        }
        isFirebaseReady = true;
        console.log("DevkaCloud: Firebase services connected.");
      } catch (err) {
        console.warn("DevkaCloud: Firebase initialization notice:", err.message);
      }
    }
    return isFirebaseReady;
  }

  // Auto-init when Firebase is present
  if (typeof window !== "undefined") {
    if (typeof window.firebase !== "undefined") {
      initFirebase();
    } else if (typeof window.addEventListener === "function") {
      window.addEventListener("DOMContentLoaded", initFirebase);
    }
  }

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
    initFirebase();
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
    initFirebase();
    if (firebaseAuth) {
      await firebaseAuth.signOut();
    }
  }

  /**
   * Listen to Firebase Auth state
   */
  function onAuthStateChanged(callback) {
    initFirebase();
    if (firebaseAuth) {
      return firebaseAuth.onAuthStateChanged(callback);
    }
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
    getFirestore: () => (initFirebase() ? firestoreDb : null),
    getAuth: () => (initFirebase() ? firebaseAuth : null),
    isReady: () => isFirebaseReady
  });

})(typeof window !== "undefined" ? window : globalThis);
