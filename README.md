# Smart DMV

A digital portal for DC DMV residency-document verification. Applicants fill in their application
online and upload a lease as proof of residency. OCR extracts the lease fields and checks them
against the application, and DMV staff work a review queue with an AI assistant instead of
checking paper documents at the counter.

**Live demo:** [v0-smart-dmv.vercel.app](https://v0-smart-dmv.vercel.app)

Built as a team project at George Washington University.

## Team

| Member | Built |
|---|---|
| [Srinivas Vengaldas](https://github.com/Srinivas-Vengaldas) | Synthetic applicant and lease dataset generator (`tools/synthetic-data`), PaddleOCR lease-extraction API (`services/ocr`), and, with Enoch, the AI verification agent and Gemini staff assistant in the portal |
| [Enoch Eugene Saka](https://github.com/EnochSakaEugene) | Web portal (`apps/web`): auth, application forms, document upload, staff and admin dashboards, appointments, Google Vision OCR, AI verification agent and Gemini staff assistant (with Srinivas) |
| [Akshit Reddy Palle](https://github.com/AkshitReddyPalle) | Streamlit image-quality checker (`tools/quality-check`) |

The team developed the web portal together and deployed it from
[EnochSakaEugene/smart-dmv](https://github.com/EnochSakaEugene/smart-dmv). Its full commit history
is preserved in this repository under `apps/web`.

## How it fits together

```
tools/synthetic-data      fake applicants + degraded lease images (no real personal data)
        │
        ▼
tools/quality-check       resolution and blur gate (Streamlit prototype)
        │
        ▼
services/ocr              FastAPI + PaddleOCR: quality gate, then field extraction from lease pages 1 and 11
apps/web  /api/ocr        Google Cloud Vision extraction used by the deployed portal
        │
        ▼
apps/web                  Next.js portal: applicant flow, staff review queue, admin, audit log
                          AI agent: compares lease fields to the application, then
                          auto-approves, sends to staff review or flags an exception
                          Prisma + Postgres, Supabase storage, Gemini case assistant
```

The deployed portal uses Google Cloud Vision for OCR. `services/ocr` is a self-hosted PaddleOCR
alternative with the same goal (extract lease fields after a quality check), deployable on Render.

## Repository layout

| Path | What | Stack |
|---|---|---|
| [`apps/web`](apps/web) | Applicant, staff and admin portal | Next.js, TypeScript, Prisma, PostgreSQL, Supabase, Tailwind |
| [`services/ocr`](services/ocr) | Lease field-extraction API | Python, FastAPI, PaddleOCR, OpenCV |
| [`tools/synthetic-data`](tools/synthetic-data) | Synthetic applicants and lease images | Python, Faker, OpenCV, Pillow |
| [`tools/quality-check`](tools/quality-check) | Image-quality checker | Python, Streamlit, OpenCV |

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

See each folder's README for details.
