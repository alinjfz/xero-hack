export type ContractKind = "customer" | "supplier" | "lease";

export type BillingFrequency = "monthly" | "quarterly" | "annual" | "one_off" | "unknown";

export type ExtractedContractTerms = {
  paymentTermDays: number | null;
  autoRenewal: boolean | null;
  renewalDate: string | null;
  noticePeriodDays: number | null;
  penaltyPercent: number | null;
  priceIncreasePercent: number | null;
  priceIncreaseDate: string | null;
  recurringAmount: number | null;
  currency: string | null;
  billingFrequency: BillingFrequency;
  summary: string;
  confidence: number;
};

export type StoredContract = {
  id: string;
  title: string;
  counterpartyName: string;
  kind: ContractKind;
  sourceText: string;
  extractedAt: string;
  terms: ExtractedContractTerms;
};

export type ContractDocument = {
  id: string;
  number: string;
  counterpartyName: string;
  total: number;
  amountOutstanding: number;
  status: string;
  dueDate: string | null;
  issueDate: string | null;
  currency: string | null;
};

export type ComplianceAlert = {
  id: string;
  severity: "critical" | "watch" | "info";
  contractId: string;
  title: string;
  body: string;
  amountDelta: number | null;
  contractKind: ContractKind;
  counterpartyName: string;
};

function normaliseName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function areNamesRelated(left: string, right: string) {
  const a = normaliseName(left);
  const b = normaliseName(right);

  if (!a || !b) {
    return false;
  }

  return a === b || a.includes(b) || b.includes(a);
}

function parseDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

function expectedAmount(terms: ExtractedContractTerms) {
  if (!terms.recurringAmount || terms.recurringAmount <= 0) {
    return null;
  }

  const today = new Date();
  const upliftDate = parseDate(terms.priceIncreaseDate);
  const upliftActive =
    upliftDate &&
    upliftDate.getTime() <= today.getTime() &&
    terms.priceIncreasePercent &&
    terms.priceIncreasePercent > 0;

  if (upliftActive) {
    return terms.recurringAmount * (1 + terms.priceIncreasePercent! / 100);
  }

  return terms.recurringAmount;
}

function buildAmountAlert(params: {
  contract: StoredContract;
  document: ContractDocument;
  delta: number;
  expected: number;
}): ComplianceAlert {
  const { contract, document, delta, expected } = params;
  const isCustomer = contract.kind === "customer";
  const overThreshold = delta > expected * 0.05;
  const absDelta = Math.abs(delta);

  if (overThreshold) {
    return {
      id: `${contract.id}-${document.id}-over`,
      severity: "critical",
      contractId: contract.id,
      contractKind: contract.kind,
      counterpartyName: contract.counterpartyName,
      amountDelta: absDelta,
      title: isCustomer ? "Invoice exceeds contract amount" : "Possible overcharge against contract",
      body: `${document.counterpartyName} ${isCustomer ? "was invoiced" : "charged"} ${formatMoney(
        document.total,
        document.currency,
      )} against an expected ${formatMoney(expected, document.currency)}.`,
    };
  }

  return {
    id: `${contract.id}-${document.id}-under`,
    severity: isCustomer ? "watch" : "info",
    contractId: contract.id,
    contractKind: contract.kind,
    counterpartyName: contract.counterpartyName,
    amountDelta: absDelta,
    title: isCustomer ? "Likely missed billing uplift" : "Bill sits below the contracted run rate",
    body: `${document.counterpartyName} ${isCustomer ? "was invoiced" : "billed"} ${formatMoney(
      document.total,
      document.currency,
    )}; the contract points to ${formatMoney(expected, document.currency)}.`,
  };
}

export function formatMoney(amount: number, currencyCode: string | null) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode ?? "GBP",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function buildComplianceAlerts(params: {
  contracts: StoredContract[];
  receivables: ContractDocument[];
  payables: ContractDocument[];
}) {
  const alerts: ComplianceAlert[] = [];
  const today = new Date();

  for (const contract of params.contracts) {
    const pool = contract.kind === "customer" ? params.receivables : params.payables;
    const matchingDocuments = pool.filter((document) =>
      areNamesRelated(document.counterpartyName, contract.counterpartyName),
    );
    const expected = expectedAmount(contract.terms);

    if (expected) {
      for (const document of matchingDocuments) {
        const delta = document.total - expected;
        if (Math.abs(delta) >= Math.max(25, expected * 0.05)) {
          alerts.push(
            buildAmountAlert({
              contract,
              document,
              delta,
              expected,
            }),
          );
        }

        const issueDate = parseDate(document.issueDate);
        const dueDate = parseDate(document.dueDate);
        if (issueDate && dueDate && contract.terms.paymentTermDays) {
          const grantedDays = daysBetween(issueDate, dueDate);
          if (grantedDays - contract.terms.paymentTermDays >= 7) {
            alerts.push({
              id: `${contract.id}-${document.id}-terms`,
              severity: "watch",
              contractId: contract.id,
              contractKind: contract.kind,
              counterpartyName: contract.counterpartyName,
              amountDelta: null,
              title: "Payment terms are looser than the contract",
              body: `${document.number} allows ${grantedDays} days, while the contract says ${contract.terms.paymentTermDays} days.`,
            });
          }
        }
      }
    }

    const renewalDate = parseDate(contract.terms.renewalDate);
    if (renewalDate) {
      const daysToRenewal = daysBetween(today, renewalDate);
      if (daysToRenewal >= 0 && daysToRenewal <= 30) {
        alerts.push({
          id: `${contract.id}-renewal`,
          severity: daysToRenewal <= 14 ? "critical" : "watch",
          contractId: contract.id,
          contractKind: contract.kind,
          counterpartyName: contract.counterpartyName,
          amountDelta: null,
          title: "Renewal is approaching",
          body: `${contract.title} renews in ${daysToRenewal} days on ${renewalDate.toLocaleDateString("en-GB")}.`,
        });
      }

      if (contract.terms.autoRenewal && contract.terms.noticePeriodDays) {
        const noticeDeadline = new Date(renewalDate);
        noticeDeadline.setDate(noticeDeadline.getDate() - contract.terms.noticePeriodDays);
        const daysToNoticeDeadline = daysBetween(today, noticeDeadline);

        if (daysToNoticeDeadline >= 0 && daysToNoticeDeadline <= 30) {
          alerts.push({
            id: `${contract.id}-notice`,
            severity: daysToNoticeDeadline <= 14 ? "critical" : "watch",
            contractId: contract.id,
            contractKind: contract.kind,
            counterpartyName: contract.counterpartyName,
            amountDelta: null,
            title: "Notice window is about to close",
            body: `Give notice by ${noticeDeadline.toLocaleDateString("en-GB")} to avoid auto-renewal.`,
          });
        }
      }
    }
  }

  return alerts.sort((left, right) => {
    const severityOrder = { critical: 0, watch: 1, info: 2 };
    return severityOrder[left.severity] - severityOrder[right.severity];
  });
}
