// lib/certifications.ts
import "server-only";

export type CertificationLike = {
  name?: string;
  issuer?: string;
  issueDate?: string;
  issueMonth?: string;
  issueYear?: string;
  expiryMonth?: string;
  expiryYear?: string;
  credentialId?: string;
  credentialUrl?: string;
};

export type NormalizedCertification = {
  name: string;
  issuer?: string;
  issueMonth?: string;
  issueYear?: string;
  expiryMonth?: string;
  expiryYear?: string;
  credentialId?: string;
  credentialUrl?: string;
};

function clean(value: unknown, maxLen = 200): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function splitMonthYear(issueDate?: string): {
  issueMonth?: string;
  issueYear?: string;
} {
  const raw = clean(issueDate, 80);
  if (!raw) return {};

  const monthMap: Record<string, string> = {
    jan: "January",
    january: "January",
    feb: "February",
    february: "February",
    mar: "March",
    march: "March",
    apr: "April",
    april: "April",
    may: "May",
    jun: "June",
    june: "June",
    jul: "July",
    july: "July",
    aug: "August",
    august: "August",
    sep: "September",
    sept: "September",
    september: "September",
    oct: "October",
    october: "October",
    nov: "November",
    november: "November",
    dec: "December",
    december: "December",
  };

  const lower = raw.toLowerCase();

  const yearMatch = lower.match(/\b(19|20)\d{2}\b/);
  const monthMatch = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/
  );

  return {
    issueMonth: monthMatch ? monthMap[monthMatch[1]] : undefined,
    issueYear: yearMatch ? yearMatch[0] : undefined,
  };
}

/**
 * Extract issuer only when bracketed text is at the END of the cert name.
 */
function extractBracketIssuer(name: string): string | undefined {
  const normalized = clean(name, 200);
  if (!normalized) return undefined;

  const match = normalized.match(
    /(?:\s*[\(\[]\s*([^\)\]]{2,80})\s*[\)\]])\s*$/
  );

  return match?.[1] ? clean(match[1], 100) : undefined;
}

/**
 * Remove only trailing bracketed issuer text.
 */
function stripBracketIssuer(name: string): string {
  const normalized = clean(name, 200);
  if (!normalized) return "";

  return clean(
    normalized.replace(/\s*[\(\[]\s*[^\)\]]{2,80}\s*[\)\]]\s*$/, ""),
    200
  );
}

function inferIssuerFromName(name: string): string | undefined {
  const lower = clean(name, 200).toLowerCase();

  if (lower.includes("amazon web services")) return "Amazon Web Services";
  if (lower.includes("aws")) return "Amazon Web Services";
  if (lower.includes("google cloud")) return "Google";
  if (lower.includes("google")) return "Google";
  if (lower.includes("ibm")) return "IBM";
  if (lower.includes("microsoft")) return "Microsoft";
  if (lower.includes("oracle")) return "Oracle";
  if (lower.includes("snowflake")) return "Snowflake";
  if (lower.includes("databricks")) return "Databricks";
  if (lower.includes("accenture")) return "Accenture";
  if (lower.includes("pwc")) return "PwC";
  if (lower.includes("kpmg")) return "KPMG";
  if (lower.includes("bcg")) return "BCG";
  if (lower.includes("salesforce")) return "Salesforce";
  if (lower.includes("hubspot")) return "HubSpot";
  if (lower.includes("meta")) return "Meta";
  if (lower.includes("linkedin")) return "LinkedIn";
  if (lower.includes("coursera")) return "Coursera";
  if (lower.includes("udemy")) return "Udemy";

  return undefined;
}

function normalizeOneCertification(
  item: CertificationLike
): NormalizedCertification | null {
  const rawName = clean(item.name, 200);
  const cleanedName = stripBracketIssuer(rawName);
  const finalName = cleanedName || rawName;

  if (!finalName) return null;

  const bracketIssuer = extractBracketIssuer(rawName);
  const directIssuer = clean(item.issuer, 120);
  const inferredIssuer = inferIssuerFromName(finalName);

  const split = splitMonthYear(item.issueDate);

  return {
    name: finalName,
    issuer: directIssuer || bracketIssuer || inferredIssuer || undefined,
    issueMonth: clean(item.issueMonth, 20) || split.issueMonth,
    issueYear: clean(item.issueYear, 10) || split.issueYear,
    expiryMonth: clean(item.expiryMonth, 20) || undefined,
    expiryYear: clean(item.expiryYear, 10) || undefined,
    credentialId: clean(item.credentialId, 100) || undefined,
    credentialUrl: clean(item.credentialUrl, 300) || undefined,
  };
}

export function normalizeCertificationItems(
  items: CertificationLike[]
): NormalizedCertification[] {
  const seen = new Set<string>();
  const out: NormalizedCertification[] = [];

  for (const item of items || []) {
    const normalized = normalizeOneCertification(item);
    if (!normalized) continue;

    const key = `${normalized.name}__${normalized.issuer ?? ""}`
      .toLowerCase()
      .trim();

    if (seen.has(key)) continue;

    seen.add(key);
    out.push(normalized);
  }

  return out;
}

export function recoverCertificationIssuers(
  items: CertificationLike[],
  resumeText: string
): NormalizedCertification[] {
  const text = resumeText || "";

  return normalizeCertificationItems(
    (items || []).map((item) => {
      const normalized = normalizeOneCertification(item);
      if (!normalized) return item;
      if (normalized.issuer) return normalized;

      const certName = clean(normalized.name, 120);
      if (!certName) return normalized;

      const escaped = certName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const patterns = [
        new RegExp(`${escaped}\\s*\\(([^()]{2,80})\\)`, "i"),
        new RegExp(`${escaped}\\s*\\[([^\\[\\]]{2,80})\\]`, "i"),
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match?.[1]) {
          return {
            ...normalized,
            issuer: clean(match[1], 100),
          };
        }
      }

      return normalized;
    })
  );
}