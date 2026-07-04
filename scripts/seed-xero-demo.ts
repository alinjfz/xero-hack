#!/usr/bin/env node
import { config } from "dotenv";
import { resetDemoData, seedDemoData } from "../lib/xero-seed";

config({ path: ".env.local" });
config();

async function main() {
  const reset = process.argv.includes("--reset");

  if (reset) {
    const removed = await resetDemoData();
    console.log(`Voided ${removed} existing KISH demo invoice(s).`);
  }

  const created = await seedDemoData();
  console.log(`Seeded ${created.length} demo invoice(s):`);
  created.forEach((reference) => console.log(`  - ${reference}`));
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("XERO_REFRESH_TOKEN")) {
    console.error(message);
    console.error("\nTo fix this:");
    console.error("1. Open http://localhost:3000 and connect Xero");
    console.error("2. Click 'Get CLI credentials' on the dashboard (or visit /api/xero/export-token)");
    console.error("3. Paste XERO_REFRESH_TOKEN and XERO_TENANT_ID into .env.local");
    console.error("4. Run again: npm run seed:xero -- --reset");
    process.exit(1);
  }

  console.error(message);
  process.exit(1);
});
