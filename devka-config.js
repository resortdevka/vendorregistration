/**
 * Devka Beach Resort — Cloud Configuration & Services Module
 * Completely powered by Supabase Cloud (PostgreSQL Database + Storage + Auth)
 * Zero Firebase dependencies.
 */

(function (window) {
  "use strict";

  const _d = (s) => decodeURIComponent(escape(atob(s)));

  // Supabase Configuration
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

  let supabaseClient = null;

  function initSupabase() {
    if (supabaseClient) return supabaseClient;
    if (window.supabase && typeof window.supabase.createClient === "function") {
      try {
        supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
        console.log("[DevkaCloud] Supabase JS client initialized successfully.");
      } catch (e) {
        console.warn("[DevkaCloud] Supabase client init warning:", e);
      }
    }
    return supabaseClient;
  }

  // Auto-init on load
  initSupabase();
  document.addEventListener("DOMContentLoaded", initSupabase);
  window.addEventListener("load", initSupabase);

  // Helper: Get active auth token (admin session JWT or fallback)
  function getAuthHeader(isAdmin = false) {
    if (isAdmin) {
      let token = SUPABASE_CONFIG.secretKey;
      try {
        const raw = sessionStorage.getItem("devka_admin_session");
        if (raw) {
          const s = JSON.parse(raw);
          if (s && s.token) token = s.token;
        }
      } catch (e) {}
      return {
        "apikey": SUPABASE_CONFIG.anonKey,
        "Authorization": "Bearer " + token
      };
    }
    return {
      "apikey": SUPABASE_CONFIG.anonKey,
      "Authorization": "Bearer " + SUPABASE_CONFIG.anonKey
    };
  }

  // ─── Database Operations (PostgREST API) ───────────────────────────────────

  /**
   * Save (insert or update) a vendor in the Supabase vendors table
   */
  async function saveVendorToSupabase(vendor) {
    if (!vendor || !vendor.id) throw new Error("Vendor ID is required");

    // Clean payload (strip heavy data URLs)
    const sanitizedDocs = {};
    if (vendor.documents) {
      for (const k in vendor.documents) {
        const d = vendor.documents[k];
        if (d) {
          sanitizedDocs[k] = {
            name: d.name || k,
            size: d.size || 0,
            type: d.type || "",
            url: d.url || "",
            storagePath: d.storagePath || "",
            uploadedAt: d.uploadedAt || Date.now()
          };
        }
      }
    }

    const row = {
      id:           vendor.id,
      type:         vendor.type || "firm",
      status:       vendor.status || "Submitted",
      submitted_at: Number(vendor.submittedAt) || Date.now(),
      updated_at:   Date.now(),
      company:      vendor.company || {},
      contact:      vendor.contact || {},
      guest:        vendor.guest || {},
      bank:         vendor.bank || {},
      billing:      vendor.billing || {},
      payment:      vendor.payment || {},
      documents:    sanitizedDocs,
      admin_notes:  vendor.adminNotes || ""
    };

    const isAdmin = !!(typeof sessionStorage !== "undefined" && sessionStorage.getItem("devka_admin_session"));
    const url = `${SUPABASE_CONFIG.url}/rest/v1/vendors`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        ...getAuthHeader(isAdmin),
        "Content-Type": "application/json",
        "Prefer": isAdmin ? "resolution=merge-duplicates,return=minimal" : "return=minimal"
      },
      body: JSON.stringify(row)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase save failed (HTTP ${res.status}): ${errText}`);
    }

    console.log(`[DevkaCloud] Vendor ${vendor.id} saved to Supabase successfully.`);
    return vendor;
  }

  /**
   * Fetch all vendors from Supabase (for Admin Portal)
   */
  async function fetchAllVendorsFromSupabase() {
    const url = `${SUPABASE_CONFIG.url}/rest/v1/vendors?order=submitted_at.desc`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...getAuthHeader(true) // Use admin credentials to read all records
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase fetch failed (HTTP ${res.status}): ${errText}`);
    }

    const rows = await res.json();
    return (rows || []).map((r) => ({
      id:           r.id,
      type:         r.type,
      status:       r.status,
      submittedAt:  Number(r.submitted_at),
      updatedAt:    Number(r.updated_at),
      company:      r.company || {},
      contact:      r.contact || {},
      guest:        r.guest || {},
      bank:         r.bank || {},
      billing:      r.billing || {},
      payment:      r.payment || {},
      documents:    r.documents || {},
      adminNotes:   r.admin_notes || ""
    }));
  }

  /**
   * Fetch single vendor by ID
   */
  async function fetchVendorByIdFromSupabase(id) {
    if (!id) return null;
    const url = `${SUPABASE_CONFIG.url}/rest/v1/vendors?id=eq.${encodeURIComponent(id)}&limit=1`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...getAuthHeader(true)
      }
    });

    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows || rows.length === 0) return null;
    const r = rows[0];
    return {
      id:           r.id,
      type:         r.type,
      status:       r.status,
      submittedAt:  Number(r.submitted_at),
      updatedAt:    Number(r.updated_at),
      company:      r.company || {},
      contact:      r.contact || {},
      guest:        r.guest || {},
      bank:         r.bank || {},
      billing:      r.billing || {},
      payment:      r.payment || {},
      documents:    r.documents || {},
      adminNotes:   r.admin_notes || ""
    };
  }

  /**
   * Update vendor status or admin notes
   */
  async function updateVendorInSupabase(id, fields) {
    if (!id) return;
    const patch = { updated_at: Date.now() };
    if (fields.status !== undefined)     patch.status = fields.status;
    if (fields.adminNotes !== undefined) patch.admin_notes = fields.adminNotes;
    if (fields.company !== undefined)    patch.company = fields.company;

    const url = `${SUPABASE_CONFIG.url}/rest/v1/vendors?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        ...getAuthHeader(true),
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(patch)
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Supabase update failed (HTTP ${res.status}): ${errText}`);
    }
  }

  /**
   * Delete vendor record from Supabase
   */
  async function deleteVendorFromSupabase(id) {
    if (!id) return;
    const url = `${SUPABASE_CONFIG.url}/rest/v1/vendors?id=eq.${encodeURIComponent(id)}`;
    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        ...getAuthHeader(true)
      }
    });
    if (!res.ok) {
      const errText = await res.text();
      console.warn(`Supabase delete notice: ${errText}`);
    }
  }

  /**
   * Generate next sequential registration ID atomically via SQL function
   */
  async function getNextVendorIdFromSupabase(type = "firm") {
    try {
      const url = `${SUPABASE_CONFIG.url}/rest/v1/rpc/get_next_vendor_id`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          ...getAuthHeader(false),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ p_type: type })
      });
      if (res.ok) {
        const nextId = await res.json();
        if (typeof nextId === "string" && nextId.startsWith("DBR-")) {
          return nextId;
        }
      }
    } catch (e) {
      console.warn("[DevkaCloud] RPC get_next_vendor_id notice:", e);
    }
    return null; // Fall back to client calculation
  }

  // ─── Storage Operations (Supabase Storage) ─────────────────────────────────

  async function uploadToSupabase(file, folderName, customFileName) {
    folderName = folderName || "attachments";
    if (!file) throw new Error("No file provided");
    var ext   = (file.name.split(".").pop() || "bin").toLowerCase();
    var base  = (customFileName || file.name.replace(/\.[^/.]+$/, ""))
                  .replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
    var fname = base + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7) + "." + ext;
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
    if (!res.ok) throw new Error("Supabase file upload failed (" + res.status + "): " + await res.text());
    var publicUrl = SUPABASE_CONFIG.url + "/storage/v1/object/public/" +
      encodeURIComponent(SUPABASE_CONFIG.bucket) + "/" + encodeURIComponent(path);
    return {
      success: true,
      name: file.name,
      storagePath: path,
      url: publicUrl,
      size: file.size,
      type: mime,
      uploadedAt: Date.now()
    };
  }

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
    }).catch(function (e) { console.warn("[DevkaCloud] Supabase delete warning:", e); });
  }

  // ─── Admin Authentication ──────────────────────────────────────────────────

  async function adminSignIn(usernameOrEmail, password) {
    const cleanUser = (usernameOrEmail || "").trim().toLowerCase();
    const email = ADMIN_EMAIL_MAP[cleanUser] || (usernameOrEmail || "").trim();

    if (!email || !password) {
      throw new Error("Please enter both Admin Email/Username and Password.");
    }

    // Call Supabase Authentication endpoint to verify email and password
    const authUrl = `${SUPABASE_CONFIG.url}/auth/v1/token?grant_type=password`;
    const res = await fetch(authUrl, {
      method: "POST",
      headers: {
        "apikey": SUPABASE_CONFIG.anonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      const msg = data.error_description || data.msg || data.error || "Incorrect Admin Email or Password.";
      throw new Error(msg);
    }

    const session = {
      uid: data.user?.id || "admin-officer",
      email: data.user?.email || email,
      displayName: data.user?.user_metadata?.full_name || "Admin Officer",
      token: data.access_token,
      loggedInAt: Date.now()
    };
    sessionStorage.setItem("devka_admin_session", JSON.stringify(session));

    // Also sync Supabase JS client if available
    const client = initSupabase();
    if (client && client.auth && data.access_token && data.refresh_token) {
      try {
        await client.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token
        });
      } catch (e) {}
    }

    return {
      success: true,
      user: session
    };
  }

  async function adminSignOut() {
    sessionStorage.removeItem("devka_admin_session");
    const client = initSupabase();
    if (client && client.auth) {
      try { await client.auth.signOut(); } catch (e) {}
    }
  }

  // Public API
  window.DevkaCloud = Object.freeze({
    init:               initSupabase,
    uploadDocument:     uploadToSupabase,
    deleteDocument:     deleteFromSupabase,
    adminSignIn:        adminSignIn,
    adminSignOut:       adminSignOut,
    // Database Methods
    saveVendor:         saveVendorToSupabase,
    getAllVendors:      fetchAllVendorsFromSupabase,
    getVendorById:      fetchVendorByIdFromSupabase,
    updateVendor:       updateVendorInSupabase,
    deleteVendor:       deleteVendorFromSupabase,
    getNextVendorId:    getNextVendorIdFromSupabase,
    isReady:            function () { return true; }
  });

})(typeof window !== "undefined" ? window : globalThis);
