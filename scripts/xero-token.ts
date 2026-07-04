#!/usr/bin/env node

async function main() {
  console.log("Export Xero CLI credentials:\n");
  console.log("1. Start the app and connect Xero at http://localhost:3000");
  console.log("2. Visit http://localhost:3000/api/xero/export-token while logged in");
  console.log("3. Copy refreshToken and tenantId into .env.local");
  console.log("\nThen run: npm run seed:xero -- --reset");
}

main();
