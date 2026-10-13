# Smart DMV

**Proof-of-residency verification for the DC DMV, moved from the service counter to a pre-visit
online check.**

**Live demo:** [v0-smart-dmv.vercel.app](https://v0-smart-dmv.vercel.app)

## The business problem

To get a DC driver license or ID card, residents must prove they live in DC, usually with a lease.
Today that check happens at the counter, during the appointment:

- **Wasted visits.** A resident who brings an expired lease, a blurry copy or a document in
  someone else's name only finds out at the counter, and has to book another appointment.
- **Slow, inconsistent review.** Clerks read multi-page leases by hand and compare names and
  addresses by eye. Two clerks can reach different decisions on the same document.
- **No audit trail.** Paper checks leave little record of why a document was accepted or
  rejected, which makes compliance review and fraud investigation hard.
- **Staff time spent on easy cases.** Most leases are clean matches, yet every one gets the same
  manual attention as the suspicious ones.

## Approach

1. **Verify before the visit.** Residents upload their lease online when they apply. A visit can
   only be booked once the document is approved, so nobody travels to the DMV with a document
   that will be rejected.
2. **Automate the routine, escalate the uncertain.** Software handles the clear-cut matches. Staff
   attention goes only to the cases that need human judgment.
3. **Explain every decision.** Each automated outcome comes with a plain-language reason that
   staff, auditors and the resident can read.
4. **Build and test without real personal data.** A synthetic data generator produces realistic
   applicants and lease images, including deliberately poor-quality scans, so the pipeline can be
   developed and evaluated without handling real residents' records.

## Solution

### For residents
- Multi-step online application with autosave.
- Online lease upload, so problems with the document surface days before the visit, not at
  the counter.
- Appointment booking that unlocks once residency is verified.

### Automated verification
1. **Quality gate** (in the OCR service): rejects images below 800×1000 px or below a blur
   threshold before any processing.
2. **OCR extraction:** reads the tenant name, property address, ZIP code and lease dates from the
   lease.
3. **AI verification agent** (see [Agentic AI](#agentic-ai)): compares the lease against the
   application and routes the case:

   | Outcome | When |
   |---|---|
   | **Auto-approve** | Every field matches and combined confidence is at least 85% |
   | **Staff review** | One field doesn't match, or confidence is moderate |
   | **Exception** | Lease has expired, two or more fields don't match, or confidence is below 45% |

### For DMV staff
- A review queue that shows only the cases needing a person, with the agent's explanation and a
  field-by-field comparison.
- A Gemini-powered staff copilot for the case under review (see [Agentic AI](#agentic-ai)).
- Exception handling, case notes, and marking appointments complete or no-show.

### For administrators
- Dashboards for verification volume, outcomes and staff activity.
- A full audit log of who approved, rejected or flagged each document, and when.
- User and role management (resident, staff, admin).

## Agentic AI

Smart DMV uses two AI agents with different jobs: one makes routine decisions on its own, and one
helps people make the hard ones.

### 1. Verification agent: decides and acts on its own

When a resident submits a lease, the agent works through the case without a person in the loop:

| Step | What the agent does |
|---|---|
| **Perceive** | Takes the OCR output (tenant name, address, ZIP, lease dates, OCR confidence) and the resident's application |
| **Reason** | Normalizes names and addresses, compares each field, and scores the match: name 40%, address 40%, ZIP 20%, blended 75/25 with OCR confidence. Checks whether the lease has expired. |
| **Decide** | Picks one of three outcomes: auto-approve, staff review or exception (thresholds in the table above) |
| **Act** | Updates the case status, sets the review and exception flags, places the case in the staff queue when needed, and unlocks appointment booking on approval |
| **Explain** | Writes a plain-language reason and a field-by-field mismatch summary to the case, so every decision is auditable |

Its autonomy is deliberately limited. It can approve only when every field matches with high
confidence; anything ambiguous goes to a person, and anything risky is flagged.

### 2. Staff copilot: Gemini 2.5 Flash, grounded in the case

On the review screen, staff can ask the copilot about the case in plain English, with one-click
prompts such as *"Why was this case sent to staff review?"*, *"What mismatches did you detect?"*
and *"What would you recommend?"*.

- **Grounded:** each question is answered from that case's own data only: the application, the
  extracted fields, the verification agent's confidence and explanation, the mismatch summary and
  the raw OCR text.
- **Guardrails:** the prompt tells the model to use only the case data, not to invent facts, to say
  when information is missing, and to give guidance rather than a binding decision.
- **Access-controlled:** only signed-in staff and admins can use it.

### Human in the loop

The two agents split the work by risk. The verification agent clears the routine cases on its own.
The copilot speeds up the remaining ones, but the final decision on every uncertain case stays
with a DMV employee, and every action is recorded in the audit log.

## Architecture

```
Resident uploads lease
        │
        ▼
Quality gate* ─────────► rejected instantly: "image too blurry / too small"
        │
        ▼
OCR extraction (Google Cloud Vision in production; PaddleOCR service as a self-hosted option)
        │
        ▼
AI verification agent ─► Auto-approve ──► resident can book an appointment
        │
        ├──────────────► Staff review ──► staff queue + Gemini case assistant
        │
        └──────────────► Exception ─────► flagged with reason, logged for audit
```

\* The quality gate runs in the self-hosted OCR service and the Streamlit checker; the deployed
portal sends uploads straight to Google Cloud Vision.

| Layer | Technology |
|---|---|
| Web portal | Next.js, TypeScript, Tailwind CSS |
| Data | PostgreSQL with Prisma, Supabase storage |
| Document AI | Google Cloud Vision OCR, PaddleOCR (FastAPI service), OpenCV |
| Decision support | Rule-based verification agent, Gemini 2.5 Flash case assistant |
| Test data | Python synthetic generator (Faker, OpenCV, Pillow) |

## Insights

- **Most of the value is in triage, not OCR accuracy.** Even imperfect extraction is useful when
  the system knows its confidence and routes accordingly. A clean match needs no human, and an
  uncertain one goes to someone who can decide.
- **Catching bad scans before OCR is the cheapest fix.** A resolution and blur check takes
  milliseconds and prevents the most common reason a document fails later.
- **Explanations build trust.** Staff are far more willing to rely on automated approvals when
  each one says exactly which fields matched and why.
- **Synthetic data unblocks public-sector projects.** Real DMV records can't be shared for
  development. Generated applicants with deliberately degraded scans gave a realistic test bed
  with known correct answers.
- **Gating appointments on verification changes behavior.** When booking depends on an approved
  document, residents fix document problems at home instead of at the counter.

## Value

| For | Value |
|---|---|
| Residents | Fewer wasted trips, and a clear reason when a document is rejected, before the visit |
| DMV staff | Time freed from routine checks for the cases that need judgment, plus an assistant that summarizes each case |
| DMV management | Consistent decisions, a complete audit trail, and visibility into volumes and bottlenecks |
| Compliance and fraud teams | Every decision recorded with its reason, and expired or mismatched documents flagged automatically |

## Repository layout

| Path | What |
|---|---|
| `apps/web` | Resident, staff and admin portal |
| `services/ocr` | Self-hosted lease extraction API (FastAPI, PaddleOCR) |
| `tools/synthetic-data` | Synthetic applicant and lease image generator |
| `tools/quality-check` | Image-quality checker (Streamlit) |

## Running locally

**Web portal**

```bash
cd apps/web
cp .env.example .env   # fill in database, Supabase, Google Vision and Gemini keys
pnpm install
pnpm dev
```

**OCR service**

```bash
cd services/ocr
pip install -r requirements.txt
uvicorn api:app --port 8000
```

**Synthetic data**

```bash
cd tools/synthetic-data
pip install faker opencv-python pillow numpy
python 1_generate_master_data.py
python 2_generate_lease_images.py
```

---

Built at George Washington University.
