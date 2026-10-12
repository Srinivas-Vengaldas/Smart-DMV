import { NextResponse } from "next/server";
import vision from "@google-cloud/vision";

const credentials = process.env.GOOGLE_CREDENTIALS_JSON
  ? JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON)
  : undefined;

const client = new vision.ImageAnnotatorClient(
  credentials ? { credentials } : undefined
);

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

function normalizeAll(text: string) {
  return text.replace(/\r/g, "\n").replace(/\s+/g, " ").trim();
}

function cleanExtractedValue(value: string) {
  return normalizeWhitespace(value)
    .replace(/^[:\-\s]+/, "")
    .replace(/\s+\(.*$/, "")
    .replace(/^"+|"+$/g, "")
    .replace(/^"+|"+$/g, "")
    .trim();
}

function extractByLabel(text: string, label: string) {
  const pattern = new RegExp(`${label}\\s*:\\s*([^\\n]+)`, "i");
  const match = text.match(pattern);
  return match?.[1] ? cleanExtractedValue(match[1]) : "";
}

function extractCityStateZip(text: string) {
  // Expanded state list to match more documents
  const match = text.match(
    /([A-Z][A-Za-z .'-]+),?\s+(DC|MD|VA|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|WA|WI|WV)\s+(\d{5}(?:-\d{4})?)/i
  );
  return {
    city: match?.[1] ? cleanExtractedValue(match[1]) : "",
    state: match?.[2] ? match[2].toUpperCase() : "",
    zip_code: match?.[3] ? cleanExtractedValue(match[3]) : "",
  };
}

// Last resort: bare 5-digit ZIP scan
function extractZipOnly(text: string): string {
  const match = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match?.[1] || "";
}

function calculateConfidence(fields: {
  tenant_name: string;
  address: string;
  zip_code: string;
  lease_start_date: string;
}) {
  let score = 0.4;
  if (fields.tenant_name) score += 0.2;
  if (fields.address) score += 0.2;
  if (fields.zip_code) score += 0.1;
  if (fields.lease_start_date) score += 0.1;
  return Math.min(score, 0.98);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { imageDataUrl } = body;

    if (!imageDataUrl) {
      return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    const base64 = imageDataUrl.split(",")[1];

    const [result] = await client.textDetection({
      image: { content: base64 },
    });

    const rawText = result.textAnnotations?.[0]?.description || "";

    if (!rawText) {
      return NextResponse.json({ error: "No text found" }, { status: 400 });
    }

    const normalizedText = normalizeAll(rawText);

    // Primary extraction — label-based
    let tenant_name = extractByLabel(rawText, "TENANT_FULL_NAME");
    let landlord_name = extractByLabel(rawText, "LANDLORD_NAME");
    let address = extractByLabel(rawText, "PROPERTY_ADDRESS");
    let city = extractByLabel(rawText, "PROPERTY_CITY");
    let state = extractByLabel(rawText, "PROPERTY_STATE");
    let zip_code = extractByLabel(rawText, "PROPERTY_ZIP");
    let lease_start_date = extractByLabel(rawText, "LEASE_START_DATE");
    let lease_end_date = extractByLabel(rawText, "LEASE_END_DATE");

    // ✅ Always run fallback for any missing city/state/zip independently.
    // The old code only ran this when address was missing — so if the address
    // label was found but PROPERTY_ZIP wasn't, zip stayed empty, confidence
    // dropped, and the agent skipped the 1-minute AI pending window entirely.
    if (!city || !state || !zip_code) {
      const fallback = extractCityStateZip(normalizedText);
      city = city || fallback.city;
      state = state || fallback.state;
      zip_code = zip_code || fallback.zip_code;
    }

    // Last resort bare ZIP scan if still missing
    if (!zip_code) {
      zip_code = extractZipOnly(rawText);
    }

    const parsed = {
      document_type: /lease/i.test(normalizedText)
        ? "Lease Document"
        : "Unknown",
      tenant_name,
      landlord_name,
      address,
      city,
      state,
      zip_code,
      lease_start_date,
      lease_end_date,
      raw_text: rawText,
      confidence: calculateConfidence({
        tenant_name,
        address,
        zip_code,
        lease_start_date,
      }),
    };

    console.log("✅ OCR RESULT:", parsed);

    return NextResponse.json({ ok: true, result: parsed });
  } catch (error) {
    console.error("OCR error:", error);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}