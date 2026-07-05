export type WorldId = "home" | "biz";

const HOME_CONTACTS = new Set([
  "Alex Mercer",
  "City Council",
  "Greenstone Maintenance",
  "Oakwater Insurance",
  "Willow & Finch Lettings",
]);

const BIZ_CONTACTS = new Set([
  "Copper Kettle Cafe",
  "Northline Studio",
  "PrintCo Ltd",
  "Harbour Retail Group",
  "Maple Market",
  "Granite Logistics",
  "Bright Ideas Agency",
]);

export function isDemoTagged(text: string | null | undefined) {
  if (!text) {
    return false;
  }

  return (
    text.includes("[HOME]") ||
    text.includes("[BIZ]") ||
    text.startsWith("KISH_DEMO") ||
    HOME_CONTACTS.has(text) ||
    BIZ_CONTACTS.has(text)
  );
}

export function getWorldForRecord(params: {
  contactName: string;
  reference?: string | null;
}): WorldId | "shared" {
  const haystack = `${params.contactName} ${params.reference ?? ""}`;

  if (haystack.includes("[HOME]")) {
    return "home";
  }

  if (haystack.includes("[BIZ]")) {
    return "biz";
  }

  if (HOME_CONTACTS.has(params.contactName)) {
    return "home";
  }

  if (BIZ_CONTACTS.has(params.contactName)) {
    return "biz";
  }

  // Default unclassified real Xero records to the "biz" (small business) world so real data is never lost or excluded from `/world`!
  return "biz";
}
