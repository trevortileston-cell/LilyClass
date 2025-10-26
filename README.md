# NDA & Buyer-Profile Reviewer/Filler MVP

This repository contains a Python CLI **and** a browser-based control center (backed by FastAPI) that review NDAs, prompt for human approval, fill in buyer profile details, and emit ready-to-send PDFs along with optional webhook notifications.

> ⚠️ **Disclaimers**
>
> * This tool provides an AI-assisted review; it is not legal advice. Always consult counsel for material agreements.
> * No signing or submission occurs without explicit approval.
> * Documents and profile data are handled locally; rotate keys & restrict access.

## Features

- Upload or fetch a PDF/DOCX agreement for analysis using the OpenAI Agents SDK with the Responses API and the built-in `file_search` tool.
- Receive a structured legal-risk summary along with a markdown briefing suitable for quick human review.
- Explicit approval gate enforced before any document filling occurs.
- Pull the latest buyer-profile details from Google Sheets (service-account credentials) and merge them into PDF form fields or prepend a generated cover page when forms are absent. DOCX placeholders like `{{CompanyName}}` are also replaced (DOCX→PDF conversion is a noted phase-two enhancement).
- Emit a filled PDF/DOCX plus an optional webhook payload that can be wired to DocuSign, Zapier, or Make for downstream automation.
- Optional FastAPI endpoints for web integrations plus a bundled control-center UI so you can operate the desktop deployment from a browser.
- Agents SDK traces enabled automatically in the OpenAI dashboard (set `OPENAI_TRACE` env var to `1`).

## Project layout

```
.
├── app.py                  # CLI entry point (also exposes FastAPI app)
├── nda_agent/
│   ├── agents.py           # Agent/coordinator wrapper with guardrail
│   ├── prompts.py          # System prompt for risk analysis schema
│   └── tools.py            # Google Sheets, PDF/DOCX filling, webhook helpers
├── examples/
│   ├── sample_nda.pdf      # Placeholder NDA
│   └── buyer_profile.pdf   # Placeholder buyer profile
├── requirements.txt
├── Makefile
├── .env.example
└── README.md
```

## Prerequisites

- Python 3.11+
- Google Cloud service account JSON with access to the target Google Sheet.
- OpenAI API key with access to the Agents SDK and Responses API.

## Setup

```bash
cp .env.example .env
# Edit .env with your secrets and configuration
make setup
```

The setup target creates a virtual environment and installs the required dependencies. Ensure your Google Sheet is shared with the service-account email from your JSON credentials.

### Google Sheet preparation

1. Create or open the Google Sheet that will hold buyer-profile information.
2. Add a header row containing at least the following columns (order does not matter):
   - `legal_name`
   - `address`
   - `signer_name`
   - `title`
   - `email`
   - `phone`
   - `effective_date`
3. Share the sheet with the service-account email listed in your JSON credentials.
4. Update `.env` with `GOOGLE_SHEET_ID` and (optionally) `GOOGLE_SHEET_WORKSHEET`.

You can rename columns later; just edit `PDF_FIELD_MAP` and `REQUIRED_COLUMNS` in `nda_agent/tools.py` to reflect the changes.

## Running the CLI

```bash
source .venv/bin/activate
python app.py --file ./examples/sample_nda.pdf --profile-sheet "$GOOGLE_SHEET_ID"
```

Optional flags:

- `--url https://example.com/nda.pdf` – download the file before analysis.
- `--profile-worksheet Sheet1` – target a specific worksheet tab.
- `--webhook https://hooks.zapier.com/...` – override the webhook URL.

During execution the CLI prints the JSON analysis, renders the markdown summary, and prompts `Approve to fill? (y/n)`. Declining stops the workflow; approving fetches the Google Sheet data, fills the PDF/DOCX, saves `{original_basename}.filled.pdf`, and calls the webhook (if configured).

## Web control center & FastAPI surface

Launch the API with:

```bash
source .venv/bin/activate
python app.py --web --host 0.0.0.0 --port 8000
```

Then open <http://localhost:8000/> to load the control center. Enter the API base (defaults to `http://localhost:8000`), upload or link an NDA, review the AI-generated summary, and click **Approve & fill** to merge Google Sheet data and retrieve the filled PDF. The UI keeps the mandatory disclaimers visible, enforces the approval gate, and surfaces download links once ready.

### REST endpoints

- `GET /healthz` – simple connectivity probe used by the UI.
- `POST /analyze` – multipart file upload (`file`) or form field (`url`). Returns `analysis_id`, the JSON schema, and markdown.
- `POST /fill` – accepts JSON or form submissions with `analysis_id`, `approve=true`, and optional `profile_sheet` / `profile_worksheet`. Returns a download link once filled.
- `GET /downloads/{analysis_id}` – download the filled document.

> **Tip:** If you host the frontend (e.g., on Vercel) and run the backend elsewhere, update the API base URL in the control center or set `WEB_ALLOWED_ORIGINS` to restrict CORS as needed.

## Webhook integration

The webhook payload is a JSON object containing:

```json
{
  "file_path": "/absolute/path/to/file.pdf",
  "profile": {"legal_name": "...", ...},
  "analysis": {"summary": "...", "red_flags": [...], "missing": [...], "levers": [...], "score": 4}
}
```

Use Zapier/Make/DocuSign to ingest this payload. In v1 the webhook call is best-effort with simple retries. No signing is performed automatically.

## Phase-two roadmap

- **DocuSign/Adobe Sign integration** – replace the webhook stub with direct API calls to create signature envelopes.
- **Computer Use tool (Agents SDK)** – uncomment and wire the `computer_use` tool once available to automate buyer-profile websites. Expect brittle selectors; guard heavily.
- **Managed Connectors (MCP)** – replace the bespoke Google Sheets tool with OpenAI-managed connectors for Google Workspace/Dropbox.
- **DOCX to PDF conversion** – automatically convert filled DOCX templates to PDF (e.g., via LibreOffice or cloud service).
- **Vector store reuse** – persist uploaded files between runs for faster re-analysis.

## Testing notes

Manual acceptance criteria validated via CLI or web control center:

1. Uploading a PDF yields JSON + markdown with multiple red flags and a score.
2. Approving fills the document, resulting in `*.filled.pdf` with either AcroForm data or a prepended cover page if no fields exist.
3. URLs are downloaded to temp files and processed identically.
4. Renaming sheet columns only requires updating `PDF_FIELD_MAP` in code.
5. When `WEBHOOK_URL` is set, webhook POST attempts are logged with success/failure indicators.
6. Agent traces surface in the OpenAI dashboard under the configured workspace.

Happy shipping!
