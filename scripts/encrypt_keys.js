/**
 * Devka Beach Resort — Supabase Key Obfuscation Utility
 * Usage: node scripts/encrypt_keys.js
 * Run this whenever you rotate Supabase API keys to generate new encrypted ciphertext strings.
 */

const SALT = "DevkaBeachResort_Supabase_2026_SecuredKeyVault";

function encrypt(text, salt) {
  const enc = Buffer.from(text, "utf8");
  const key = Buffer.from(salt, "utf8");
  const out = Buffer.alloc(enc.length);
  for (let i = 0; i < enc.length; i++) {
    const k = key[i % key.length] ^ ((i * 37) & 0xFF);
    out[i] = ((enc[i] ^ k) + 137) & 0xFF;
  }
  return out.toString("hex");
}

function decrypt(hex, salt) {
  const enc = Buffer.from(hex, "hex");
  const key = Buffer.from(salt, "utf8");
  const out = Buffer.alloc(enc.length);
  for (let i = 0; i < enc.length; i++) {
    const k = key[i % key.length] ^ ((i * 37) & 0xFF);
    out[i] = ((enc[i] - 137 + 256) & 0xFF) ^ k;
  }
  return out.toString("utf8");
}

// Replace with new keys if rotated:
const URL       = "https://ikxrmrurtgwycagkrlxd.supabase.co";
const ANON_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlreHJtcnVydGd3eWNhZ2tybHhkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NTUwMDQsImV4cCI6MjEwNDAzMTAwNH0.8-KMTAfbhc0Z7JnPwcxY4LozM1rz62CQjoiwTa_7sLc";
const SECRET_KEY= "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlreHJtcnVydGd3eWNhZ2tybHhkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODQ1NTAwNCwiZXhwIjoyMTA0MDMxMDA0fQ.uML4awjapn4BLl7d4BuAIdYS8EHzDuPHqEoejDCXG_c";

console.log("=== ENCRYPTED CIPHERTEXT PAYLOAD ===");
console.log("u (URL):       ", encrypt(URL, SALT));
console.log("a (Anon Key):  ", encrypt(ANON_KEY, SALT));
console.log("s (Secret Key):", encrypt(SECRET_KEY, SALT));
console.log("=====================================");
