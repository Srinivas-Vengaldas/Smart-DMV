// lib/agentic-document-verifier.ts

export type AgentDecision = "AUTO_APPROVE" | "STAFF_REVIEW" | "FLAG_EXCEPTION";

export interface ResidentVerificationContext {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export interface ExtractedVerificationFields {
  documentType?: string;
  tenantName?: string;
  landlordName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
}

export interface FieldComparisonResult {
  field: string;
  residentValue: string;
  documentValue: string;
  matched: boolean;
  weight: number;
  reason: string;
}

export interface AgentVerificationResult {
  decision: AgentDecision;
  confidence: number;
  explanation: string;
  mismatchSummary: FieldComparisonResult[];
  requiresStaffReview: boolean;
  isException: boolean;
  aiStatus:
    | "APPROVED_BY_AI"
    | "PENDING"
    | "TIMED_OUT"
    | "APPROVED_BY_STAFF"
    | "REJECTED_BY_STAFF";
}

function normalizeText(value?: string): string {
  return (value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(value?: string): string {
  return normalizeText(value);
}

function normalizeAddress(value?: string): string {
  return normalizeText(value)
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\blane\b/g, "ln")
    .replace(/\bapartment\b/g, "apt");
}

function valuesLooselyMatch(a?: string, b?: string): boolean {
  const first = normalizeText(a);
  const second = normalizeText(b);

  if (!first || !second) return false;
  return first === second || first.includes(second) || second.includes(first);
}

function buildResidentFullName(context: ResidentVerificationContext): string {
  if (context.fullName?.trim()) return context.fullName.trim();

  return [context.firstName, context.lastName].filter(Boolean).join(" ").trim();
}

function compareField(
  field: string,
  residentValue: string,
  documentValue: string,
  weight: number,
  matcher: (a?: string, b?: string) => boolean,
  missingReason: string,
  mismatchReason: string
): FieldComparisonResult {
  if (!residentValue || !documentValue) {
    return {
      field,
      residentValue,
      documentValue,
      matched: false,
      weight,
      reason: missingReason,
    };
  }

  const matched = matcher(residentValue, documentValue);

  return {
    field,
    residentValue,
    documentValue,
    matched,
    weight,
    reason: matched ? `${field} matched successfully.` : mismatchReason,
  };
}

function isLikelyExpired(leaseEndDate?: string): boolean {
  if (!leaseEndDate) return false;

  const parsed = new Date(leaseEndDate);
  if (Number.isNaN(parsed.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return parsed < today;
}

function scoreComparisons(comparisons: FieldComparisonResult[]): number {
  const totalWeight = comparisons.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;

  const earnedWeight = comparisons.reduce(
    (sum, item) => sum + (item.matched ? item.weight : 0),
    0
  );

  return Number((earnedWeight / totalWeight).toFixed(2));
}

function buildExplanation(
  decision: AgentDecision,
  comparisons: FieldComparisonResult[],
  leaseEndDate?: string
): string {
  const failed = comparisons.filter((item) => !item.matched).map((item) => item.reason);

  if (isLikelyExpired(leaseEndDate)) {
    failed.push("The lease end date appears to be expired.");
  }

  if (decision === "AUTO_APPROVE") {
    return "Document passed automated verification because key identity and address fields matched the resident's submitted information with high confidence.";
  }

  if (decision === "FLAG_EXCEPTION") {
    return failed.length
      ? `Document was flagged as an exception because: ${failed.join(" ")}`
      : "Document was flagged as an exception due to major inconsistencies detected during automated verification.";
  }

  return failed.length
    ? `Document requires staff review because: ${failed.join(" ")}`
    : "Document requires staff review due to moderate confidence and one or more fields needing manual verification.";
}

export function runAgenticDocumentVerification(input: {
  resident: ResidentVerificationContext;
  extracted: ExtractedVerificationFields;
  ocrConfidence?: number | null;
}): AgentVerificationResult {
  const { resident, extracted, ocrConfidence } = input;

  const residentFullName = buildResidentFullName(resident);
  const residentAddress = resident.address || "";
  const residentZip = resident.zipCode || "";

  const tenantName = extracted.tenantName || "";
  const documentAddress = extracted.address || "";
  const documentZip = extracted.zipCode || "";

  const comparisons: FieldComparisonResult[] = [
    compareField(
      "Full Name",
      residentFullName,
      tenantName,
      0.4,
      (a, b) => valuesLooselyMatch(normalizeName(a), normalizeName(b)),
      "Resident name or tenant name is missing.",
      "Resident name does not match the tenant name on the document."
    ),
    compareField(
      "Address",
      residentAddress,
      documentAddress,
      0.4,
      (a, b) => valuesLooselyMatch(normalizeAddress(a), normalizeAddress(b)),
      "Resident address or document address is missing.",
      "Resident address does not match the address on the document."
    ),
    compareField(
      "ZIP Code",
      residentZip,
      documentZip,
      0.2,
      (a, b) => normalizeText(a) === normalizeText(b),
      "Resident ZIP code or document ZIP code is missing.",
      "Resident ZIP code does not match the document ZIP code."
    ),
  ];

  const comparisonScore = scoreComparisons(comparisons);
  const ocrScore = typeof ocrConfidence === "number" ? ocrConfidence : 0.5;

  // Blend OCR score and comparison score
  const combinedConfidence = Number(((comparisonScore * 0.75) + (ocrScore * 0.25)).toFixed(2));

  const mismatchCount = comparisons.filter((item) => !item.matched).length;
  const expired = isLikelyExpired(extracted.leaseEndDate);

  let decision: AgentDecision = "STAFF_REVIEW";

  if (expired || mismatchCount >= 2 || combinedConfidence < 0.45) {
    decision = "FLAG_EXCEPTION";
  } else if (mismatchCount === 0 && combinedConfidence >= 0.85) {
    decision = "AUTO_APPROVE";
  } else {
    decision = "STAFF_REVIEW";
  }

  return {
    decision,
    confidence: combinedConfidence,
    explanation: buildExplanation(decision, comparisons, extracted.leaseEndDate),
    mismatchSummary: comparisons,
    requiresStaffReview: decision === "STAFF_REVIEW",
    isException: decision === "FLAG_EXCEPTION",
    aiStatus: decision === "AUTO_APPROVE" ? "APPROVED_BY_AI" : "PENDING",
  };
}