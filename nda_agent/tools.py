"""Utility tools invoked by the NDA Reviewer agent and coordinator."""
from __future__ import annotations

import json
import logging
import os
import time
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

import gspread
import requests
from google.oauth2.service_account import Credentials
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import LETTER
from reportlab.pdfgen import canvas
from docx import Document

logger = logging.getLogger(__name__)

PROFILE_COLUMNS: Iterable[str] = (
    "legal_name",
    "address",
    "signer_name",
    "title",
    "email",
    "phone",
    "effective_date",
)

PDF_FIELD_MAP = {
    "CompanyName": "legal_name",
    "Address": "address",
    "SignerName": "signer_name",
    "Title": "title",
    "Email": "email",
    "Phone": "phone",
    "EffectiveDate": "effective_date",
}


def _load_service_account_credentials() -> Credentials:
    sa_json = os.getenv("GOOGLE_SHEETS_SA_JSON")
    if not sa_json:
        raise EnvironmentError("GOOGLE_SHEETS_SA_JSON is required")
    if sa_json.strip().startswith("{"):
        info = json.loads(sa_json)
        return Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    path = Path(sa_json)
    if not path.exists():
        raise FileNotFoundError(f"Service account file not found: {path}")
    return Credentials.from_service_account_file(str(path), scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])


def fetch_profile_from_sheets(sheet_id: str | None = None, worksheet_name: str | None = None) -> Dict[str, Any]:
    """Load the first row of the configured Google Sheet as a profile dict."""
    sheet_id = sheet_id or os.getenv("GOOGLE_SHEET_ID")
    if not sheet_id:
        raise EnvironmentError("GOOGLE_SHEET_ID is required")

    credentials = _load_service_account_credentials()
    client = gspread.authorize(credentials)
    client.session = requests.Session()

    spreadsheet = client.open_by_key(sheet_id)
    worksheet = spreadsheet.worksheet(worksheet_name) if worksheet_name else spreadsheet.sheet1

    records = worksheet.get_all_records(head=1)
    if not records:
        raise ValueError("No profile rows found in the Google Sheet")
    row = records[0]

    profile = {column: row.get(column, "") for column in PROFILE_COLUMNS}
    return profile


def fill_pdf_or_docx(original_file: Path, profile: Dict[str, Any], analysis: Dict[str, Any] | None = None) -> Path:
    """Fill a PDF (preferred) or DOCX file with the provided profile data."""
    original_file = Path(original_file)
    suffix = original_file.suffix.lower()
    if suffix == ".pdf":
        return _fill_pdf(original_file, profile, analysis)
    if suffix == ".docx":
        return _fill_docx(original_file, profile)
    raise ValueError(f"Unsupported file type: {suffix}")


def _fill_pdf(original_file: Path, profile: Dict[str, Any], analysis: Dict[str, Any] | None) -> Path:
    reader = PdfReader(str(original_file))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    form_fields = reader.get_fields() if hasattr(reader, "get_fields") else None

    if form_fields:
        field_values = {pdf_field: profile.get(profile_key, "") for pdf_field, profile_key in PDF_FIELD_MAP.items()}
        try:
            writer.update_page_form_field_values(writer.pages[0], field_values)
        except Exception:  # pragma: no cover - pypdf raises on missing fields
            logger.warning("Could not update all form fields; continuing with available ones")
        writer.need_appearances = True
    else:
        cover = _build_cover_page(profile, analysis)
        cover_reader = PdfReader(cover)
        merged_writer = PdfWriter()
        for page in cover_reader.pages:
            merged_writer.add_page(page)
        for page in writer.pages:
            merged_writer.add_page(page)
        writer = merged_writer

    output_path = original_file.with_name(f"{original_file.stem}.filled.pdf")
    with output_path.open("wb") as fh:
        writer.write(fh)
    return output_path


def _build_cover_page(profile: Dict[str, Any], analysis: Dict[str, Any] | None) -> BytesIO:
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=LETTER)
    width, height = LETTER
    margin = 72
    y = height - margin

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(margin, y, "Buyer Profile Cover")
    y -= 32

    pdf.setFont("Helvetica", 11)
    for column in PROFILE_COLUMNS:
        label = column.replace("_", " ").title()
        value = profile.get(column, "") or "(not provided)"
        pdf.drawString(margin, y, f"{label}: {value}")
        y -= 16

    if analysis:
        y -= 12
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(margin, y, "Analysis Summary")
        y -= 18
        pdf.setFont("Helvetica", 10)
        summary = analysis.get("summary", "")
        for line in summary.splitlines() or [summary]:
            pdf.drawString(margin, y, line[:90])
            y -= 14

    pdf.showPage()
    pdf.save()
    buffer.seek(0)
    return buffer


def _fill_docx(original_file: Path, profile: Dict[str, Any]) -> Path:
    document = Document(str(original_file))
    placeholder_map = {f"{{{{{key}}}}}": value for key, value in profile.items()}

    for paragraph in document.paragraphs:
        for placeholder, value in placeholder_map.items():
            if placeholder in paragraph.text:
                paragraph.text = paragraph.text.replace(placeholder, value)

    for table in document.tables:
        for row in table.rows:
            for cell in row.cells:
                for placeholder, value in placeholder_map.items():
                    if placeholder in cell.text:
                        cell.text = cell.text.replace(placeholder, value)

    output_path = original_file.with_name(f"{original_file.stem}.filled.docx")
    document.save(str(output_path))
    return output_path


def send_webhook(url: str, payload: Dict[str, Any], timeout: int = 10, retries: int = 3) -> Tuple[bool, str]:
    """POST to the provided webhook endpoint with retries."""
    session = requests.Session()
    last_error = "unknown error"
    for attempt in range(1, retries + 1):
        try:
            response = session.post(url, json=payload, timeout=timeout)
            response.raise_for_status()
            return True, f"Webhook delivered (status {response.status_code})"
        except requests.RequestException as exc:  # pragma: no cover - network dependent
            logger.warning("Webhook attempt %s failed: %s", attempt, exc)
            time.sleep(min(2 ** attempt, 5))
            last_error = str(exc)
    return False, last_error
