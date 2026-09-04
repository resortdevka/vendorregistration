/**
 * Devka Beach Resort — Vendor Database Engine (IndexedDB + LocalStorage)
 * Handles persistent storage of vendor records and base64 document attachments.
 * Provides real-time synchronization between devka-vendor-portal.html and admin-vendor.html.
 */

const VENDOR_DB_NAME = "DevkaVendorDB";
const VENDOR_DB_VERSION = 1;
const VENDOR_STORE_NAME = "vendors";

class VendorDatabase {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
    this.firestoreListenerAttached = false;
    this.unsubscribeFirestore = null;
    this.cloudOnly = !!(typeof window !== "undefined" && window.DEVKA_CLOUD_ONLY);
    this.setupCloudSync();
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        console.warn("IndexedDB not supported, using LocalStorage fallback.");
        resolve(null);
        return;
      }
      const request = indexedDB.open(VENDOR_DB_NAME, VENDOR_DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(VENDOR_STORE_NAME)) {
          const store = db.createObjectStore(VENDOR_STORE_NAME, { keyPath: "id" });
          store.createIndex("type", "type", { unique: false });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("submittedAt", "submittedAt", { unique: false });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        this.purgeLegacyDemoData();
        resolve(this.db);
      };
      request.onerror = (e) => {
        console.warn("IndexedDB open error:", e);
        this.purgeLegacyDemoData();
        resolve(null);
      };
    });
  }

  /**
   * Set up real-time bidirectional listener with Firebase Firestore
   */
  setupCloudSync() {
    const tryConnect = () => this.connectCloudSync();

    if (window.DevkaCloud?.getFirestore()) {
      tryConnect();
    } else {
      window.addEventListener("DOMContentLoaded", tryConnect);
      window.addEventListener("load", tryConnect);
    }
    window.addEventListener("devka_firebase_ready", tryConnect);
    [500, 1500, 3500, 6000].forEach((ms) => setTimeout(tryConnect, ms));
    setTimeout(() => this.processSyncQueue && this.processSyncQueue(), 3000);
  }

  /**
   * Connect or reconnect the real-time Firestore listener
   */
  connectCloudSync() {
    const db = window.DevkaCloud?.getFirestore();
    if (!db) return;
    if (this.firestoreListenerAttached && this.unsubscribeFirestore) return;

    try {
      if (this.unsubscribeFirestore) {
        try { this.unsubscribeFirestore(); } catch(e) {}
        this.unsubscribeFirestore = null;
      }
      this.unsubscribeFirestore = db.collection("vendors").onSnapshot(
        (snapshot) => {
          this.firestoreListenerAttached = true;
          let hasChanges = false;
          snapshot.docChanges().forEach((change) => {
            const vendorData = change.doc.data();
            if (change.type === "added" || change.type === "modified") {
              this.cacheVendorLocally(vendorData);
              hasChanges = true;
            } else if (change.type === "removed") {
              this.deleteVendorLocally(change.doc.id);
              hasChanges = true;
            }
          });
          if (hasChanges) {
            window.dispatchEvent(new CustomEvent("devka_vendor_updated", { detail: { realtime: true } }));
          }
        },
        (err) => {
          console.warn("[DevkaCloud] Firestore real-time listener notice:", err.message);
          this.firestoreListenerAttached = false;
        }
      );
      this.firestoreListenerAttached = true;
      console.log("[DevkaCloud] Firestore real-time listener active.");
    } catch (e) {
      console.warn("[DevkaCloud] Firestore listener setup error:", e.message);
    }
  }

  async enqueueFailedSync(vendorId, payload) {
    try {
      const sanitized = JSON.parse(JSON.stringify(payload));
      if (sanitized.documents) {
        for (const k in sanitized.documents) {
          if (sanitized.documents[k]?.data) delete sanitized.documents[k].data;
        }
      }
      const raw = localStorage.getItem("devka_sync_queue") || "[]";
      const queue = JSON.parse(raw);
      queue.push({ id: vendorId, payload: sanitized, ts: Date.now() });
      localStorage.setItem("devka_sync_queue", JSON.stringify(queue.slice(-50)));
    } catch (e) {
      console.warn("Sync queue enqueue notice:", e);
    }
  }

  async processSyncQueue() {
    const db = window.DevkaCloud?.getFirestore();
    if (!db) return;
    try {
      const raw = localStorage.getItem("devka_sync_queue");
      if (!raw) return;
      const queue = JSON.parse(raw || "[]");
      if (!Array.isArray(queue) || queue.length === 0) return;
      const remaining = [];
      for (const item of queue) {
        try {
          await db.collection("vendors").doc(item.id).set(item.payload, { merge: true });
          console.log(`[DevkaCloud] Synced queued vendor ${item.id} to Firestore.`);
        } catch (e) {
          console.warn(`[DevkaCloud] Retry sync pending for ${item.id}:`, e.message || e);
          remaining.push(item);
        }
      }
      localStorage.setItem("devka_sync_queue", JSON.stringify(remaining));
    } catch (e) {
      console.warn("[DevkaCloud] processSyncQueue notice:", e);
    }
  }

  async cacheVendorLocally(vendor) {
    if (!vendor || !vendor.id) return;
    if (this.cloudOnly) return;
    await this.initPromise;
    if (this.db) {
      try {
        const tx = this.db.transaction(VENDOR_STORE_NAME, "readwrite");
        tx.objectStore(VENDOR_STORE_NAME).put(vendor);
      } catch (e) {}
    }
    try {
      const all = await this.getAllLocalVendors();
      const idx = all.findIndex((v) => v.id === vendor.id);
      if (idx >= 0) all[idx] = vendor;
      else all.unshift(vendor);
      localStorage.setItem("devka_vendors_registry", JSON.stringify(all));
      localStorage.setItem("devka_vendors_last_sync", String(Date.now()));
    } catch (e) {}
  }

  async deleteVendorLocally(id) {
    if (this.cloudOnly) return;
    await this.initPromise;
    if (this.db) {
      try {
        const tx = this.db.transaction(VENDOR_STORE_NAME, "readwrite");
        tx.objectStore(VENDOR_STORE_NAME).delete(id);
      } catch (e) {}
    }
    try {
      const all = (await this.getAllLocalVendors()).filter((v) => v.id !== id);
      localStorage.setItem("devka_vendors_registry", JSON.stringify(all));
      localStorage.setItem("devka_vendors_last_sync", String(Date.now()));
    } catch (e) {}
  }

  async getAllLocalVendors() {
    if (this.cloudOnly) return [];
    await this.initPromise;
    let list = [];
    if (this.db) {
      try {
        list = await new Promise((resolve) => {
          const tx = this.db.transaction(VENDOR_STORE_NAME, "readonly");
          const store = tx.objectStore(VENDOR_STORE_NAME);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      } catch (err) {
        console.warn("IndexedDB getAll notice:", err);
      }
    }

    if (!list || list.length === 0) {
      try {
        const raw = localStorage.getItem("devka_vendors_registry");
        if (raw) list = JSON.parse(raw);
      } catch (e) {}
    }
    return list || [];
  }

  async getAllVendors() {
    // 1. Wait for Firestore to ensure cold-start connections have time to establish
    let db = window.DevkaCloud?.getFirestore();
    if (!db && window.DevkaCloud?.waitForFirestore) {
      db = await window.DevkaCloud.waitForFirestore(5000);
    }

    if (db) {
      try {
        const fetchPromise = db.collection("vendors").get();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Firestore getAll timeout (10s)")), 10000)
        );
        const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
        if (snapshot) {
          const cloudList = [];
          snapshot.forEach((doc) => {
            const data = doc.data();
            cloudList.push(data);
            this.cacheVendorLocally(data);
          });
          cloudList.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
          if (cloudList.length > 0) {
            return cloudList;
          }
        }
      } catch (err) {
        console.warn("[DevkaCloud] Firestore query notice (using local cache):", err.message);
      }
    }

    // 2. Fast local IndexedDB / localStorage cache fallback
    const list = await this.getAllLocalVendors();
    list.sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    return list;
  }

  async getVendorById(id) {
    if (!id) return null;
    let db = window.DevkaCloud?.getFirestore();
    if (!db && window.DevkaCloud?.waitForFirestore) {
      db = await window.DevkaCloud.waitForFirestore(3000);
    }
    if (db) {
      try {
        const fetchPromise = db.collection("vendors").doc(id).get();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Firestore getById timeout")), 8000)
        );
        const doc = await Promise.race([fetchPromise, timeoutPromise]);
        if (doc && doc.exists) {
          const v = doc.data();
          this.cacheVendorLocally(v);
          return v;
        }
      } catch (e) {}
    }

    await this.initPromise;
    if (this.db) {
      try {
        const item = await new Promise((resolve) => {
          const tx = this.db.transaction(VENDOR_STORE_NAME, "readonly");
          const store = tx.objectStore(VENDOR_STORE_NAME);
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        });
        if (item) return item;
      } catch (e) {}
    }
    const all = await this.getAllVendors();
    return all.find((v) => v.id === id) || null;
  }

  async saveVendor(vendor) {
    await this.initPromise;
    if (!vendor.id) throw new Error("Vendor ID is required");
    vendor.updatedAt = Date.now();

    // 1. Save in local cache first for instant UI response and offline safety
    if (!this.cloudOnly) await this.cacheVendorLocally(vendor);

    // 2. Persist to Firebase Firestore
    let db = window.DevkaCloud?.getFirestore();
    if (!db && window.DevkaCloud?.waitForFirestore) {
      db = await window.DevkaCloud.waitForFirestore(5000);
    }

    if (db) {
      let payload;
      try {
        payload = JSON.parse(JSON.stringify(vendor));
        // Strip out large base64 data strings if Supabase URL exists or if > 60KB to keep document safe under 1MB Firestore limit
        if (payload.documents) {
          for (const key in payload.documents) {
            const d = payload.documents[key];
            if (d) {
              if (d.url && d.data) {
                delete d.data;
              } else if (d.data && d.data.length > 60000) {
                delete d.data;
              }
            }
          }
        }

        await Promise.race([
          db.collection("vendors").doc(vendor.id).set(payload, { merge: true }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Firestore write timeout (10s)")), 10000))
        ]);

        console.log(`[DevkaCloud] Vendor ${vendor.id} saved to Firestore successfully!`);
        try { this.processSyncQueue(); } catch (e) {}
      } catch (err) {
        console.error("[DevkaCloud] Firestore save error:", err.message || err);
        if (payload) {
          try { this.enqueueFailedSync(vendor.id, payload); } catch (e) {}
        }
      }
    } else {
      console.warn("[DevkaCloud] Firestore not available at save time; stored in local sync queue.");
      try {
        const payload = JSON.parse(JSON.stringify(vendor));
        this.enqueueFailedSync(vendor.id, payload);
      } catch (e) {}
    }

    // Trigger local custom event for tabs
    window.dispatchEvent(new CustomEvent("devka_vendor_updated", { detail: { id: vendor.id } }));
    return vendor;
  }

  /**
   * Purge legacy demo seed vendors
   */
  async purgeLegacyDemoData() {
    try {
      const all = await this.getAllLocalVendors();
      const demoIds = ["dbr-ven-2026-00001", "dbr-gst-2026-00002"];
      const cleaned = all.filter((v) => {
        const id = (v.id || "").toLowerCase();
        const firm = (v.company?.legalName || v.company?.companyName || "").toLowerCase();
        const guest = (v.guest?.fullName || "").toLowerCase();
        if (demoIds.includes(id) || firm.includes("smit") || guest.includes("rahul")) {
          return false;
        }
        return true;
      });
      if (cleaned.length !== all.length) {
        localStorage.setItem("devka_vendors_registry", JSON.stringify(cleaned));
        if (this.db) {
          try {
            const tx = this.db.transaction(VENDOR_STORE_NAME, "readwrite");
            const store = tx.objectStore(VENDOR_STORE_NAME);
            all.forEach((v) => {
              const id = (v.id || "").toLowerCase();
              const firm = (v.company?.legalName || v.company?.companyName || "").toLowerCase();
              const guest = (v.guest?.fullName || "").toLowerCase();
              if (demoIds.includes(id) || firm.includes("smit") || guest.includes("rahul")) {
                store.delete(v.id);
              }
            });
          } catch(e) {}
        }
      }
    } catch(e) {}
  }

  async deleteVendor(id) {
    if (!id) return;
    const vendor = await this.getVendorById(id);

    // 1. Clean up attached documents from Supabase Storage
    if (vendor && vendor.documents && window.DevkaCloud) {
      for (const key in vendor.documents) {
        const doc = vendor.documents[key];
        if (doc && doc.storagePath) {
          window.DevkaCloud.deleteDocument(doc.storagePath).catch(() => {});
        }
      }
    }

    // 2. Delete from Firestore
    const db = window.DevkaCloud?.getFirestore();
    if (db) {
      try {
        await db.collection("vendors").doc(id).delete();
        console.log(`[DevkaCloud] Deleted vendor ${id} from Firestore.`);
      } catch (e) {
        console.warn("[DevkaCloud] Firestore delete notice:", e.message);
      }
    }

    // 3. Delete from local stores
    await this.deleteVendorLocally(id);
    window.dispatchEvent(new CustomEvent("devka_vendor_updated", { detail: { id, deleted: true } }));
  }

  async generateNextId(type = "firm") {
    const list = await this.getAllVendors();
    const year = new Date().getFullYear();
    const prefix = type === "guest" ? `DBR-GST-${year}-` : `DBR-VEN-${year}-`;
    const count = list.filter((v) => (v.id || "").startsWith(prefix)).length + 1;
    let seq = String(count).padStart(5, "0");
    let candidate = `${prefix}${seq}`;
    let attempt = count;
    while (list.some((v) => v.id === candidate)) {
      attempt++;
      seq = String(attempt).padStart(5, "0");
      candidate = `${prefix}${seq}`;
    }
    return candidate;
  }
}

// Global instance
window.VendorDB = new VendorDatabase();

/**
 * Universal PDF Generator & Downloader for Vendor Registration Forms
 * Used by both devka-vendor-portal.html (confirmation) and admin-vendor.html (folder dossier)
 */
window.downloadVendorPdf = function(vendor) {
  if (!vendor) return;
  const isGuest = vendor.type === "guest";
  const firmName = isGuest ? (vendor.guest?.fullName || "Guest Vendor") : (vendor.company?.legalName || vendor.company?.companyName || "Vendor");
  const dateStr = new Date(vendor.submittedAt || Date.now()).toLocaleDateString("en-IN", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
  });

  // Check for jsPDF
  const { jsPDF } = window.jspdf || {};
  if (jsPDF && typeof window.jspdf.jsPDF === "function") {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();

      // Top Header Banner (Navy)
      doc.setFillColor(11, 31, 58); // #0B1F3A
      doc.rect(0, 0, pageWidth, 28, "F");

      // Gold Accent Strip
      doc.setFillColor(198, 161, 91); // #C6A15B
      doc.rect(0, 28, pageWidth, 2.5, "F");

      // Header Text
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("DEVKA BEACH RESORT", 14, 12);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(228, 211, 166);
      doc.text("OFFICIAL VENDOR REGISTRATION DOSSIER · PROCUREMENT DEPARTMENT", 14, 19);

      // Meta Block
      doc.setTextColor(23, 34, 46);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`Registration ID: ${vendor.id}`, 14, 38);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(91, 107, 124);
      doc.text(`Submitted On: ${dateStr} | Status: ${vendor.status || "Submitted"} | Type: ${isGuest ? "Guest Vendor" : "Firm / Company"}`, 14, 44);

      let tableBody = [];

      if (!isGuest) {
        const c = vendor.company || {};
        const ct = vendor.contact || {};
        const b = vendor.bank || {};
        const bl = vendor.billing || {};
        const p = vendor.payment || {};

        tableBody = [
          [{ content: "1. COMPANY & REGISTRATION DETAILS", colSpan: 2, styles: { fillColor: [248, 245, 238], fontStyle: "bold", textColor: [11, 31, 58] } }],
          ["Company Registered Name", c.legalName || c.companyName || "—"],
          ["GST Number (GSTIN)", c.gst || "—"],
          ["PAN Card Number", c.pan || "—"],
          ["Company Registered Address", `${c.address || "—"}, ${c.city || ""}, ${c.state || ""} - ${c.pincode || ""}`],

          [{ content: "2. CONTACT PERSON DETAILS", colSpan: 2, styles: { fillColor: [248, 245, 238], fontStyle: "bold", textColor: [11, 31, 58] } }],
          ["Contact Person Name", `${ct.personName || "—"} (${ct.designation || "Representative"})`],
          ["Mobile Number", ct.mobile || "—"],
          ["Email Address", ct.email || "—"],
          ["Accounts Contact", ct.accPersonName ? `${ct.accPersonName} | ${ct.accMobile || ""} | ${ct.accEmail || ""}` : "Not provided"],

          [{ content: "3. BANK SETTLEMENT DETAILS", colSpan: 2, styles: { fillColor: [248, 245, 238], fontStyle: "bold", textColor: [11, 31, 58] } }],
          ["Account Holder Name", b.holderName || "—"],
          ["Bank Name", b.bankName || "—"],
          ["Bank Account Number", b.accNumber || "—"],
          ["IFSC Code", b.ifsc || "—"],

          [{ content: "4. BILLING PREFERENCES", colSpan: 2, styles: { fillColor: [248, 245, 238], fontStyle: "bold", textColor: [11, 31, 58] } }],
          ["Require GST on Invoices?", bl.gstOnInvoice === "yes" ? "Yes" : "No"],
          ["Require Separate GST Invoice for Liquor?", bl.liquorGstRequired === "yes" ? "Yes" : "No"],
          ["Want GST Invoice for Bill on Liquor?", bl.liquorBillGst === "yes" ? "Yes" : "No"],

          [{ content: "5. VENDOR CATEGORY & TERMS", colSpan: 2, styles: { fillColor: [248, 245, 238], fontStyle: "bold", textColor: [11, 31, 58] } }],
          ["Vendor Category / Scope of Supply", vendor.categoryText || (vendor.categories ? vendor.categories.join(", ") : "—")],
          ["Payment Mode & Credit Period", `${p.method || "RTGS / Bank Transfer"} | ${p.creditPeriod || "30 Days"}`],

          [{ content: "6. COMPLIANCE DOCUMENTS ATTACHED", colSpan: 2, styles: { fillColor: [248, 245, 238], fontStyle: "bold", textColor: [11, 31, 58] } }],
          ["Attached Files", Object.keys(vendor.documents || {}).map(k => vendor.documents[k]?.name || k).join(", ") || "None"]
        ];
      } else {
        const g = vendor.guest || {};
        const b = vendor.bank || {};

        tableBody = [
          [{ content: "1. GUEST / INDIVIDUAL DETAILS", colSpan: 2, styles: { fillColor: [248, 245, 238], fontStyle: "bold", textColor: [11, 31, 58] } }],
          ["Full Name", g.fullName || "—"],
          ["Mobile Number", g.mobile || "—"],
          ["Email Address", g.email || "—"],
          ["Residential Address", `${g.address || "—"}, ${g.city || ""}, ${g.state || ""} - ${g.pincode || ""}`],
          ["Role / Service Provided", g.serviceType || "—"],
          ["Aadhaar Card Number", g.aadhaar || "—"],

          [{ content: "2. BANK PAYOUT DETAILS", colSpan: 2, styles: { fillColor: [248, 245, 238], fontStyle: "bold", textColor: [11, 31, 58] } }],
          ["Account Holder Name", b.holderName || "—"],
          ["Bank Name", b.bankName || "—"],
          ["Account Number", b.accNumber || "—"],
          ["IFSC Code", b.ifsc || "—"],

          [{ content: "3. IDENTITY FILES ATTACHED", colSpan: 2, styles: { fillColor: [248, 245, 238], fontStyle: "bold", textColor: [11, 31, 58] } }],
          ["Attached Documents", Object.keys(vendor.documents || {}).map(k => vendor.documents[k]?.name || k).join(", ") || "Aadhaar Card & Photo"]
        ];
      }

      doc.autoTable({
        startY: 50,
        head: [["Information Field", "Submitted Value"]],
        body: tableBody,
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 3, textColor: [23, 34, 46], lineColor: [226, 218, 197] },
        headStyles: { fillColor: [11, 31, 58], textColor: [255, 255, 255], fontStyle: "bold" },
        columnStyles: {
          0: { cellWidth: 70, fontStyle: "bold", textColor: [11, 31, 58] },
          1: { cellWidth: "auto" }
        },
        margin: { left: 14, right: 14, bottom: 20 }
      });

      // Footer undertaking on final page
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7.5);
        doc.setTextColor(130, 140, 150);
        doc.text(`Devka Beach Resort · Vendor Registration Record · Page ${i} of ${pageCount}`, 14, 290);
        doc.text("Official electronic document verified upon submission.", pageWidth - 14, 290, { align: "right" });
      }

      doc.save(`Devka_Vendor_${vendor.id}_${firmName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`);
      return;
    } catch (e) {
      console.warn("jsPDF error, falling back to printable receipt window:", e);
    }
  }

  // Fallback: Printable / Save as PDF popup window
  openPrintablePdf(vendor, firmName, isGuest, dateStr);
};

function openPrintablePdf(vendor, firmName, isGuest, dateStr) {
  const win = window.open("", "_blank");
  if (!win) {
    alert("Please allow popups to download or print your PDF registration form.");
    return;
  }

  const c = vendor.company || {};
  const g = vendor.guest || {};
  const ct = vendor.contact || {};
  const b = vendor.bank || {};
  const bl = vendor.billing || {};
  const p = vendor.payment || {};

  win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Devka Beach Resort - Registration ${vendor.id}</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; margin: 30px; color: #17222E; font-size: 13px; line-height: 1.5; }
        .header { background: #0B1F3A; color: white; padding: 20px 24px; border-bottom: 3px solid #C6A15B; }
        .header h1 { margin: 0; font-size: 20px; font-weight: bold; }
        .header p { margin: 4px 0 0; font-size: 11px; color: #E4D3A6; }
        .meta { display: flex; justify-content: space-between; margin: 18px 0; padding-bottom: 12px; border-bottom: 1px solid #E2DAC5; font-size: 12px; }
        .badge { background: #F8F5EE; padding: 4px 10px; border-radius: 4px; font-weight: bold; border: 1px solid #E2DAC5; }
        h2 { font-size: 13px; margin: 18px 0 8px; color: #0B1F3A; text-transform: uppercase; background: #F8F5EE; padding: 6px 10px; border-left: 3px solid #C6A15B; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
        th, td { padding: 8px 10px; border: 1px solid #E2DAC5; text-align: left; }
        th { width: 35%; background: #FAFAF7; font-weight: 600; color: #0B1F3A; }
        .footer { margin-top: 30px; padding-top: 14px; border-top: 1px solid #E2DAC5; font-size: 11px; color: #777; display: flex; justify-content: space-between; }
        @media print { .no-print { display: none; } }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 16px; background: #EAF3EC; border: 1px solid #c2e2cc; padding: 10px 14px; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
        <span><strong>PDF Proof Ready:</strong> Click Print and choose "Save as PDF" to save your document copy.</span>
        <button onclick="window.print()" style="background: #C6A15B; border: none; padding: 8px 16px; font-weight: bold; cursor: pointer; border-radius: 4px;">Print / Save as PDF</button>
      </div>
      <div class="header">
        <h1>DEVKA BEACH RESORT</h1>
        <p>OFFICIAL VENDOR REGISTRATION DOSSIER · PROCUREMENT DEPARTMENT</p>
      </div>
      <div class="meta">
        <div><strong>Registration ID:</strong> ${vendor.id} | <strong>Submitted:</strong> ${dateStr}</div>
        <div><span class="badge">${isGuest ? "Guest Vendor" : "Firm / Company"} · ${vendor.status || "Submitted"}</span></div>
      </div>
      ${!isGuest ? `
        <h2>1. Company & Registration Details</h2>
        <table>
          <tr><th>Company Registered Name</th><td>${c.legalName || c.companyName || "—"}</td></tr>
          <tr><th>GST Number (GSTIN)</th><td>${c.gst || "—"}</td></tr>
          <tr><th>PAN Card Number</th><td>${c.pan || "—"}</td></tr>
          <tr><th>Company Registered Address</th><td>${c.address || "—"}, ${c.city || ""}, ${c.state || ""} - ${c.pincode || ""}</td></tr>
        </table>
        <h2>2. Contact Person Details</h2>
        <table>
          <tr><th>Contact Person Name & Designation</th><td>${ct.personName || "—"} (${ct.designation || "Representative"})</td></tr>
          <tr><th>Mobile & Email</th><td>${ct.mobile || "—"} · ${ct.email || "—"}</td></tr>
          ${ct.accPersonName ? `<tr><th>Accounts Contact</th><td>${ct.accPersonName} | ${ct.accMobile || ""} | ${ct.accEmail || ""}</td></tr>` : ""}
        </table>
        <h2>3. Bank Settlement Details</h2>
        <table>
          <tr><th>Account Holder Name</th><td>${b.holderName || "—"}</td></tr>
          <tr><th>Bank Name</th><td>${b.bankName || "—"}</td></tr>
          <tr><th>Account Number</th><td>${b.accNumber || "—"}</td></tr>
          <tr><th>IFSC Code</th><td>${b.ifsc || "—"}</td></tr>
        </table>
        <h2>4. Billing Preferences</h2>
        <table>
          <tr><th>Require GST on Invoices?</th><td>${bl.gstOnInvoice === "yes" ? "Yes" : "No"}</td></tr>
          <tr><th>Require Separate GST Invoice for Liquor?</th><td>${bl.liquorGstRequired === "yes" ? "Yes" : "No"}</td></tr>
          <tr><th>Want GST Invoice for Bill on Liquor?</th><td>${bl.liquorBillGst === "yes" ? "Yes" : "No"}</td></tr>
        </table>
        <h2>5. Vendor Category & Payment Terms</h2>
        <table>
          <tr><th>Vendor Category</th><td>${vendor.categoryText || (vendor.categories ? vendor.categories.join(", ") : "—")}</td></tr>
          <tr><th>Payment Mode & Credit Period</th><td>${p.method || "RTGS / Bank Transfer"} · ${p.creditPeriod || "30 Days"}</td></tr>
          <tr><th>Documents Uploaded</th><td>${Object.keys(vendor.documents || {}).map(k => vendor.documents[k]?.name || k).join(", ") || "None"}</td></tr>
        </table>
      ` : `
        <h2>1. Guest / Individual Information</h2>
        <table>
          <tr><th>Full Name</th><td>${g.fullName || "—"}</td></tr>
          <tr><th>Mobile & Email</th><td>${g.mobile || "—"} · ${g.email || "—"}</td></tr>
          <tr><th>Residential Address</th><td>${g.address || "—"}, ${g.city || ""}, ${g.state || ""} - ${g.pincode || ""}</td></tr>
          <tr><th>Role / Service</th><td>${g.serviceType || "—"}</td></tr>
          <tr><th>Aadhaar Number</th><td>${g.aadhaar || "—"}</td></tr>
        </table>
        <h2>2. Bank Payout Details</h2>
        <table>
          <tr><th>Account Holder Name</th><td>${b.holderName || "—"}</td></tr>
          <tr><th>Bank Name</th><td>${b.bankName || "—"}</td></tr>
          <tr><th>Account Number</th><td>${b.accNumber || "—"}</td></tr>
          <tr><th>IFSC Code</th><td>${b.ifsc || "—"}</td></tr>
          <tr><th>Documents Uploaded</th><td>${Object.keys(vendor.documents || {}).map(k => vendor.documents[k]?.name || k).join(", ") || "Aadhaar Card & Photo"}</td></tr>
        </table>
      `}
      <div class="footer">
        <div>Devka Beach Resort · Official Procurement Registration Proof</div>
        <div>Timestamp: ${dateStr}</div>
      </div>
      <script>
        window.onload = function() { window.print(); };
      </script>
    </body>
    </html>
  `);
  win.document.close();
}

