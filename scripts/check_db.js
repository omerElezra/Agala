const https = require("https");

const SUPABASE_URL = "aynippaxcwmqufrnthti.supabase.co";
const API_KEY = "sb_publishable_HbRfP_yUvJ8G4ditV0I24g_AsnN4HYD";

function query(table, params = "") {
  return new Promise((resolve, reject) => {
    const path = `/rest/v1/${table}?select=*${params}`;
    const req = https.request(
      {
        hostname: SUPABASE_URL,
        path: path,
        method: "GET",
        headers: {
          apikey: API_KEY,
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
          Prefer: "count=exact",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const count = res.headers["content-range"];
            resolve({ data: JSON.parse(data), count, status: res.statusCode });
          } catch (e) {
            resolve({ data: data, count: null, status: res.statusCode });
          }
        });
      },
    );
    req.on("error", reject);
    req.end();
  });
}

(async () => {
  console.log("=== QUERYING SUPABASE (anon key - RLS applies) ===\n");

  const tables = [
    "shopping_list",
    "purchase_history",
    "household_inventory_rules",
    "products",
    "users",
    "households",
  ];

  for (const t of tables) {
    const { data, count, status } = await query(t, "&limit=5");
    const rows = Array.isArray(data) ? data.length : 0;
    console.log(`${t}: status=${status} rows=${rows} range=${count || "N/A"}`);
    if (rows > 0 && rows <= 3) {
      console.log("  Sample:", JSON.stringify(data[0]).substring(0, 200));
    }
    if (!Array.isArray(data)) {
      console.log("  Response:", String(data).substring(0, 200));
    }
  }

  // Also try to query with a count header
  console.log("\n=== DETAILED: shopping_list (all statuses) ===");
  const sl = await query("shopping_list", "&limit=50");
  console.log(
    "Status:",
    sl.status,
    "Rows:",
    Array.isArray(sl.data) ? sl.data.length : "N/A",
    "Range:",
    sl.count,
  );
  if (Array.isArray(sl.data)) {
    sl.data.forEach((r) =>
      console.log(
        `  ${r.status} | qty=${r.quantity} | purchased_at=${r.purchased_at} | added_at=${r.added_at} | product_id=${r.product_id}`,
      ),
    );
  }

  console.log("\n=== DETAILED: household_inventory_rules ===");
  const hir = await query("household_inventory_rules", "&limit=50");
  console.log(
    "Status:",
    hir.status,
    "Rows:",
    Array.isArray(hir.data) ? hir.data.length : "N/A",
  );
  if (Array.isArray(hir.data)) {
    hir.data.forEach((r) =>
      console.log(
        `  ema=${r.ema_days} | conf=${r.confidence_score} | status=${r.auto_add_status} | last=${r.last_purchased_at}`,
      ),
    );
  }

  console.log("\n=== DETAILED: purchase_history ===");
  const ph = await query("purchase_history", "&limit=50");
  console.log(
    "Status:",
    ph.status,
    "Rows:",
    Array.isArray(ph.data) ? ph.data.length : "N/A",
  );
  if (Array.isArray(ph.data)) {
    ph.data.forEach((r) =>
      console.log(
        `  qty=${r.quantity} | purchased_at=${r.purchased_at} | product_id=${r.product_id}`,
      ),
    );
  }

  process.exit(0);
})();
