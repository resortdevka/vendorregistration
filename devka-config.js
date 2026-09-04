/**
 * Devka Beach Resort — Cloud Configuration & Services Module
 * Completely powered by Supabase Cloud (PostgreSQL Database + Storage + Auth)
 * Zero Firebase dependencies.
 */

(function (window) {
  "use strict";

  // Private In-Memory Key Vault (Keystream rotating cipher)
  const _VAULT_SALT = "DevkaBeachResort_Supabase_2026_SecuredKeyVault";
  function _unlock(hex) {
    if (!hex || typeof hex !== "string") return "";
    let out = "";
    const len = hex.length / 2;
    for (let i = 0; i < len; i++) {
      const byte = parseInt(hex.substr(i * 2, 2), 16);
      const k = _VAULT_SALT.charCodeAt(i % _VAULT_SALT.length) ^ ((i * 37) & 0xFF);
      out += String.fromCharCode(((byte - 137 + 256) & 0xFF) ^ k);
    }
    try {
      return decodeURIComponent(escape(out));
    } catch (e) {
      return out;
    }
  }

  // Obfuscated Ciphertext Payload (Zero plaintext API keys exposed in source code)
  const _VAULT = Object.freeze({
    u: "b5bdd1fd0f4a1dd6abd7e1092b858ab604ca213f6f93b1d4f837113c99fd05e12d4d8797bd9cdf32",
    a: "aac2fff5204561948dd5f344237dc6f7cad82f45558ea69e070a426a00f502f91c6e5ecd08e1d5154a61c998e243146d85a38ce8121a4966b98bcb2a3675508be2d80b0d0c4c9ff9b1615134609ad6e7252c8188e5d2c9143a7be5b0faff31417397afe2071b0a4891a1fcd37e6487c6addeb261518308d2a39b2e4e69c6b2f55f174e76e6aaf42c3c7d7bacc2cc13480a80c3a7892a408286b0e2fe0c156c61bf01d069315a6ae7e3f33f3b54a4a9a8ea501270beb4ca080e75618cc0e7ab116244f392ff050c674993af01b3397484"
  });

  // Dynamic In-Memory Supabase Configuration (Public Portal only requires url and anonKey)
  const SUPABASE_CONFIG = {
    get url()     { return _unlock(_VAULT.u); },
    get anonKey() { return _unlock(_VAULT.a); },
    bucket: "vendor Data files"
  };

  const ADMIN_EMAIL_MAP = {
    "admin": "admin@devkabeachresort.com",
    "admin@devka.com": "admin@devkabeachresort.com",
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

  // Helper: Get active auth token (admin session JWT or anon fallback)
  function getAuthHeader(isAdmin = false) {
    let token = SUPABASE_CONFIG.anonKey;
    if (isAdmin) {
      try {
        const raw = sessionStorage.getItem("devka_admin_session");
        if (raw) {
          const s = JSON.parse(raw);
          if (s && s.token && typeof s.token === "string" && s.token.split(".").length === 3) {
            token = s.token;
          }
        }
      } catch (e) { }
    }
    return {
      "apikey": SUPABASE_CONFIG.anonKey,
      "Authorization": "Bearer " + token
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

    const comp = vendor.company || {};
    const cont = vendor.contact || {};
    const gst  = vendor.guest || {};
    const bnk  = vendor.bank || {};
    const bill = vendor.billing || {};
    const pay  = vendor.payment || {};

    const row = {
      id: vendor.id,
      type: vendor.type || "firm",
      status: vendor.status || "Submitted",
      submitted_at: Number(vendor.submittedAt) || Date.now(),
      updated_at: Date.now(),

      // Dedicated relational columns for Supabase Table Editor & SQL queries
      legal_name: comp.legalName || comp.companyName || "",
      company_name: comp.companyName || comp.legalName || "",
      gst_number: comp.gst || "",
      pan_number: comp.pan || "",
      address: comp.address || gst.address || "",
      city: comp.city || gst.city || "",
      state: comp.state || gst.state || "",
      pincode: comp.pincode || gst.pincode || "",
      country: comp.country || "India",

      contact_person: cont.personName || "",
      designation: cont.designation || "",
      mobile: cont.mobile || gst.mobile || "",
      alt_mobile: cont.altMobile || "",
      email: cont.email || gst.email || "",
      accounts_person: cont.accPersonName || "",
      accounts_mobile: cont.accMobile || "",
      accounts_email: cont.accEmail || "",

      guest_name: gst.fullName || "",
      guest_mobile: gst.mobile || "",
      guest_email: gst.email || "",
      guest_address: gst.address || "",
      guest_city: gst.city || "",
      guest_state: gst.state || "",
      guest_pincode: gst.pincode || "",
      guest_aadhaar: gst.aadhaar || "",
      guest_service_type: gst.serviceType || "",
      guest_notes: gst.notes || "",

      bank_holder_name: bnk.holderName || "",
      bank_name: bnk.bankName || "",
      bank_account_number: bnk.accNumber || "",
      bank_ifsc: bnk.ifsc || "",

      gst_on_invoice: bill.gstOnInvoice || "",
      liquor_gst_required: bill.liquorGstRequired || "",
      liquor_gst_number: bill.liquorGstNumber || "",
      liquor_bill_gst: bill.liquorBillGst || "",

      payment_method: pay.method || "",
      credit_period: pay.creditPeriod || "",
      declaration_accepted: !!(vendor.declarationAccepted || comp.declarationAccepted || gst.declarationAccepted),
      terms_accepted: !!(vendor.termsAccepted || comp.termsAccepted),

      // Structured JSONB objects preserved for deep nested properties
      company: comp,
      contact: cont,
      guest: gst,
      bank: bnk,
      billing: bill,
      payment: pay,
      documents: sanitizedDocs,
      admin_notes: vendor.adminNotes || ""
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

  function transformVendorRow(r) {
    if (!r) return null;
    const comp = r.company || {};
    const cont = r.contact || {};
    const gst  = r.guest || {};
    const bnk  = r.bank || {};
    const bill = r.billing || {};
    const pay  = r.payment || {};

    return {
      id: r.id,
      type: r.type,
      status: r.status,
      submittedAt: Number(r.submitted_at),
      updatedAt: Number(r.updated_at),
      company: {
        companyName: comp.companyName || r.company_name || r.legal_name || "",
        legalName: comp.legalName || r.legal_name || r.company_name || "",
        gst: comp.gst || r.gst_number || "",
        pan: comp.pan || r.pan_number || "",
        address: comp.address || r.address || "",
        city: comp.city || r.city || "",
        state: comp.state || r.state || "",
        pincode: comp.pincode || r.pincode || "",
        country: comp.country || r.country || "India"
      },
      contact: {
        personName: cont.personName || r.contact_person || "",
        designation: cont.designation || r.designation || "",
        mobile: cont.mobile || r.mobile || "",
        altMobile: cont.altMobile || r.alt_mobile || "",
        email: cont.email || r.email || "",
        accPersonName: cont.accPersonName || r.accounts_person || "",
        accMobile: cont.accMobile || r.accounts_mobile || "",
        accEmail: cont.accEmail || r.accounts_email || ""
      },
      guest: {
        fullName: gst.fullName || r.guest_name || "",
        mobile: gst.mobile || r.guest_mobile || r.mobile || "",
        email: gst.email || r.guest_email || r.email || "",
        address: gst.address || r.guest_address || r.address || "",
        city: gst.city || r.guest_city || r.city || "",
        state: gst.state || r.guest_state || r.state || "",
        pincode: gst.pincode || r.guest_pincode || r.pincode || "",
        aadhaar: gst.aadhaar || r.guest_aadhaar || "",
        serviceType: gst.serviceType || r.guest_service_type || "",
        notes: gst.notes || r.guest_notes || ""
      },
      bank: {
        holderName: bnk.holderName || r.bank_holder_name || "",
        bankName: bnk.bankName || r.bank_name || "",
        accNumber: bnk.accNumber || r.bank_account_number || "",
        ifsc: bnk.ifsc || r.bank_ifsc || ""
      },
      billing: {
        gstOnInvoice: bill.gstOnInvoice || r.gst_on_invoice || "",
        liquorGstRequired: bill.liquorGstRequired || r.liquor_gst_required || "",
        liquorGstNumber: bill.liquorGstNumber || r.liquor_gst_number || "",
        liquorBillGst: bill.liquorBillGst || r.liquor_bill_gst || ""
      },
      payment: {
        method: pay.method || r.payment_method || "",
        creditPeriod: pay.creditPeriod || r.credit_period || ""
      },
      documents: r.documents || {},
      adminNotes: r.admin_notes || "",
      gstVerified: r.gst_verified || false,
      panVerified: r.pan_verified || false
    };
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
    return (rows || []).map(transformVendorRow);
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
    return transformVendorRow(rows[0]);
  }

  /**
   * Update vendor status or admin notes
   */
  async function updateVendorInSupabase(id, fields) {
    if (!id) return;
    const patch = { updated_at: Date.now() };
    if (fields.status !== undefined) patch.status = fields.status;
    if (fields.adminNotes !== undefined) patch.admin_notes = fields.adminNotes;
    if (fields.company !== undefined) patch.company = fields.company;

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
    var ext = (file.name.split(".").pop() || "bin").toLowerCase();
    var base = (customFileName || file.name.replace(/\.[^/.]+$/, ""))
      .replace(/[^a-zA-Z0-9_-]/g, "_").substring(0, 40);
    var fname = base + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7) + "." + ext;
    var path = folderName.replace(/[^a-zA-Z0-9_-]/g, "_") + "/" + fname;
    var mime = file.type || "application/octet-stream";
    if (ext === "pdf") mime = "application/pdf";
    else if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg";
    else if (ext === "png") mime = "image/png";

    var uploadUrl = SUPABASE_CONFIG.url + "/storage/v1/object/" +
      encodeURIComponent(SUPABASE_CONFIG.bucket) + "/" + encodeURIComponent(path);
    var res = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        apikey: SUPABASE_CONFIG.anonKey,
        Authorization: "Bearer " + SUPABASE_CONFIG.anonKey,
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
        ...getAuthHeader(true),
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
      } catch (e) { }
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
      try { await client.auth.signOut(); } catch (e) { }
    }
  }

  // Public API
  window.DevkaCloud = Object.freeze({
    init: initSupabase,
    uploadDocument: uploadToSupabase,
    deleteDocument: deleteFromSupabase,
    adminSignIn: adminSignIn,
    adminSignOut: adminSignOut,
    // Database Methods
    saveVendor: saveVendorToSupabase,
    getAllVendors: fetchAllVendorsFromSupabase,
    getVendorById: fetchVendorByIdFromSupabase,
    updateVendor: updateVendorInSupabase,
    deleteVendor: deleteVendorFromSupabase,
    getNextVendorId: getNextVendorIdFromSupabase,
    isReady: function () { return true; }
  });

})(typeof window !== "undefined" ? window : globalThis);
