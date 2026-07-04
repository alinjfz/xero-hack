export type WorldId = "home" | "biz";

export function isDemoTagged(text: string | null | undefined) {
  if (!text) {
    return false;
  }

  return (
    text.includes("[HOME]") ||
    text.includes("[BIZ]") ||
    text.startsWith("KISH_DEMO")
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

  return "shared";
}
