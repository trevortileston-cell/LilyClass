# NDA & Buyer-Profile Reviewer/Filler MVP

This repository contains a minimal CLI (with an optional FastAPI surface) that reviews NDA or buyer-profile agreements using the OpenAI Agents SDK, gathers buyer profile information from Google Sheets, and produces a filled, ready-to-send PDF package after explicit approval.

> **Disclaimers**
>
> - This tool provides an AI-assisted review; it is not legal advice. Always consult counsel for material agreements.
> - No signing or submission occurs without explicit human approval.
> - Documents and profile data are handled locally; rotate credentials and restrict access.

## Features

- Upload or reference agreements via CLI flag or URL.
- Uses a single "NDA Reviewer" agent powered by the Responses API with the built-in `file_search` tool.
- Returns both structured JSON (summary, red flags, missing items, levers, score) and a short markdown recap.
- Explicit approval gate before any filling/signing activity.
- Pulls buyer profile data from a Google Sheet (service account credentials) and fills AcroForm PDFs when available.
- Auto-prepends a generated cover page when PDFs lack form fields.
- Optional webhook callback for integrations with DocuSign, Zapier, or Make.
- Optional FastAPI wrapper exposing `/analyze`, `/fill`, and `/downloads/{id}` endpoints.

## Project Layout

```
nda_agent/
  app.py         # CLI + FastAPI entry points
  agents.py      # Agents SDK orchestration and guardrails
  tools.py       # Google Sheets fetch, PDF/DOCX filling, webhook helper
  prompts.py     # System prompt for the reviewer agent
  examples/      # Placeholder sample agreements
README.md
requirements.txt
Makefile
.env.example
```

## Setup

1. **Create a virtual environment and install dependencies**

   ```bash
   make setup
   ```

   The `requirements.txt` file pins the dependencies required by the CLI and optional web server.

2. **Configure environment variables**

   Copy `.env.example` to `.env` and populate:

   - `OPENAI_API_KEY`: API key with access to the Responses API + File Search.
   - `GOOGLE_SHEETS_SA_JSON`: Path to the Google Cloud service-account JSON file *or* the raw JSON string.
   - `GOOGLE_SHEET_ID`: Spreadsheet ID that stores the buyer profile data.
   - `WEBHOOK_URL` (optional): Default endpoint for webhook callbacks.

3. **Prepare the Google Sheet**

   - Share the sheet with the service-account email.
   - Ensure the first row contains these headers (case-sensitive):
     `legal_name, address, signer_name, title, email, phone, effective_date`.
   - The first data row will be used as the active buyer profile. Rename headers as needed and update `PROFILE_COLUMNS` in `tools.py` to match.

## Running the CLI

```bash
source .venv/bin/activate
python -m nda_agent.app --file ./nda_agent/examples/sample_nda.pdf
```

The CLI will:

1. Display required disclaimers.
2. Print the JSON analysis payload and markdown summary.
3. Prompt `Approve to fill? (y/n)` before continuing.
4. Produce a `{basename}.filled.pdf` file.
5. Optionally invoke a webhook if `--webhook` or `WEBHOOK_URL` is provided.

To analyze a remote file:

```bash
python -m nda_agent.app --url https://example.com/nda.pdf
```

To point at a different Google Sheet or worksheet tab:

```bash
python -m nda_agent.app --file agreement.pdf --sheet-id YOUR_SHEET_ID --worksheet BuyerProfile
```

## Optional Web API

Run the FastAPI variant with Uvicorn:

```bash
make run-web
```

Endpoints:

- `POST /analyze` – multipart form with `file` upload or `url` field (plus optional `sheet_id`, `worksheet`). Returns analysis JSON, markdown, disclaimers, and an `analysis_id`.
- `POST /fill` – form data containing `analysis_id`, `approve=true`, and optional `webhook`. Produces a download URL and webhook status.
- `GET /downloads/{analysis_id}` – retrieve the filled PDF.

## Agents SDK & Traces

The `ReviewAgent` class (see `agents.py`) demonstrates how to:

- Upload a document into a temporary vector store.
- Call the Responses API with the `file_search` tool enabled.
- Parse the JSON + markdown payload.

Enable tracing in the [OpenAI dashboard](https://platform.openai.com/) by visiting the Agents tab. Runs triggered via this CLI will appear under the configured API key.

## Phase-Two Ideas

- Replace the webhook stub with a full DocuSign / Adobe Sign integration.
- Enable the `computer_use` tool (commented in `agents.py`) to navigate buyer portals that require browser automation.
- Add MCP connectors for Google Workspace or Dropbox for managed document retrieval.
- Expand schema validation and add automated tests using `pytest` + `responses` for mocked API calls.
- Add DOCX → PDF conversion (e.g., using LibreOffice in headless mode) to complete the DOCX workflow.

