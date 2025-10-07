"""CLI and optional FastAPI app for the NDA reviewer MVP."""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import Dict, Optional
from uuid import uuid4

import requests
from dotenv import load_dotenv

from nda_agent.agents import ReviewAgentCoordinator
from nda_agent.tools import (
    ToolError,
    fetch_profile_from_sheets,
    fill_pdf_or_docx,
    send_webhook,
)

try:  # FastAPI is optional for CLI use
    from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
    from pydantic import BaseModel, ValidationError
except ImportError:  # pragma: no cover
    FastAPI = None  # type: ignore

load_dotenv()
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
LOGGER = logging.getLogger("nda_agent")

DISCLAIMER_LINES = [
    "This tool provides an AI-assisted review; it is not legal advice. Always consult counsel for material agreements.",
    "No signing or submission occurs without explicit approval.",
    "Documents and profile data are handled locally; rotate keys & restrict access.",
]


def _download_url(url: str) -> Path:
    LOGGER.info("Downloading document from %s", url)
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    suffix = Path(url).suffix or ".pdf"
    temp_path = Path(tempfile.mkstemp(suffix=suffix)[1])
    with open(temp_path, "wb") as handle:
        handle.write(response.content)
    return temp_path


def _resolve_file_path(file_path: Optional[str], url: Optional[str]) -> Path:
    if file_path:
        return Path(file_path)
    if url:
        return _download_url(url)
    raise ValueError("Either --file or --url must be provided.")


def _print_disclaimers() -> None:
    print("\n".join(f"⚠️  {line}" for line in DISCLAIMER_LINES))
    print("\n")


def _prompt_for_approval() -> bool:
    while True:
        answer = input("Approve to fill? (y/n): ").strip().lower()
        if answer in {"y", "yes"}:
            return True
        if answer in {"n", "no"}:
            return False
        print("Please respond with 'y' or 'n'.")


def run_cli(args: argparse.Namespace) -> None:
    _print_disclaimers()

    coordinator = ReviewAgentCoordinator()
    source_path = _resolve_file_path(args.file, args.url)
    analysis, markdown = coordinator.analyze_document(str(source_path))

    print("Analysis (JSON):")
    print(json.dumps(analysis, indent=2))
    print("\nMarkdown summary:\n")
    print(markdown)

    approved = _prompt_for_approval()
    try:
        coordinator.guard_approval(approved)
    except PermissionError as exc:
        print(str(exc))
        return

    sheet_id = args.profile_sheet or os.getenv("GOOGLE_SHEET_ID")
    if not sheet_id:
        raise ToolError("Profile sheet ID must be provided via --profile-sheet or GOOGLE_SHEET_ID")
    worksheet = args.profile_worksheet or os.getenv("GOOGLE_SHEET_WORKSHEET")
    profile = fetch_profile_from_sheets(sheet_id, worksheet=worksheet)

    filled_path = fill_pdf_or_docx(str(source_path), profile)
    print(f"Filled document saved to: {filled_path}")

    webhook_url = args.webhook or os.getenv("WEBHOOK_URL", "")
    payload = {
        "file_path": filled_path,
        "profile": profile,
        "analysis": analysis,
    }
    delivered = send_webhook(webhook_url, payload)
    if webhook_url:
        status = "succeeded" if delivered else "failed"
        print(f"Webhook delivery {status} ({webhook_url})")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="NDA & Buyer Profile Reviewer/Filler")
    group = parser.add_mutually_exclusive_group(required=False)
    group.add_argument("--file", help="Path to a local PDF or DOCX file")
    group.add_argument("--url", help="URL to download a PDF or DOCX file")
    parser.add_argument("--profile-sheet", help="Google Sheet ID to read profile data from")
    parser.add_argument("--profile-worksheet", help="Worksheet name inside the sheet")
    parser.add_argument("--webhook", help="Webhook URL to call after filling", default="")
    parser.add_argument("--web", action="store_true", help="Run the FastAPI server instead of CLI")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    return parser


# ---------------------- FastAPI optional surface ----------------------

analysis_store: Dict[str, Dict[str, object]] = {}


def _origin_list() -> list[str]:
    origins = os.getenv("WEB_ALLOWED_ORIGINS", "*")
    if origins.strip() == "*":
        return ["*"]
    return [origin.strip() for origin in origins.split(",") if origin.strip()]


def _load_index_html() -> str:
    index_path = Path(__file__).resolve().parent / "index.html"
    if index_path.exists():
        return index_path.read_text(encoding="utf-8")
    return "<h1>NDA Reviewer backend running</h1>"


class FillRequest(BaseModel):
    analysis_id: str
    approve: bool
    profile_sheet: Optional[str] = None
    profile_worksheet: Optional[str] = None


def _coerce_fill_request(data: Dict[str, object]) -> FillRequest:
    try:
        if "approve" in data and not isinstance(data["approve"], bool):
            # Accept string representations from forms
            value = str(data["approve"]).lower()
            data["approve"] = value in {"true", "1", "yes", "y", "on"}
        return FillRequest(**data)
    except ValidationError as exc:  # pragma: no cover - handled by FastAPI
        raise HTTPException(status_code=400, detail=exc.errors()) from exc


def _ensure_fastapi_app() -> Optional[FastAPI]:
    if FastAPI is None:
        return None

    app = FastAPI(title="NDA Reviewer MVP")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origin_list(),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    index_html = _load_index_html()

    @app.get("/", response_class=HTMLResponse)
    async def index() -> HTMLResponse:  # pragma: no cover - HTML response
        return HTMLResponse(content=index_html)

    @app.get("/healthz", response_class=JSONResponse)
    async def healthcheck() -> JSONResponse:
        return JSONResponse({"name": "nda-reviewer-backend", "status": "ok"})

    @app.post("/analyze")
    async def analyze_endpoint(
        file: UploadFile | None = File(default=None),
        url: str | None = Form(default=None),
    ) -> Dict[str, object]:
        if not file and not url:
            raise HTTPException(status_code=400, detail="Provide either a file upload or a URL")
        coordinator = ReviewAgentCoordinator()
        if file is not None:
            suffix = Path(file.filename or "document.pdf").suffix or ".pdf"
            temp_path = Path(tempfile.mkstemp(suffix=suffix)[1])
            with open(temp_path, "wb") as handle:
                handle.write(await file.read())
        else:
            temp_path = _download_url(url)  # type: ignore[arg-type]

        analysis, markdown = coordinator.analyze_document(str(temp_path))
        identifier = str(uuid4())
        analysis_store[identifier] = {
            "source_path": str(temp_path),
            "analysis": analysis,
            "markdown": markdown,
            "filled_path": None,
            "profile": None,
        }
        return {"analysis_id": identifier, "analysis": analysis, "markdown": markdown}

    @app.post("/fill")
    async def fill_endpoint(request: Request) -> Dict[str, object]:
        if request.headers.get("content-type", "").startswith("application/json"):
            payload_dict = await request.json()
        else:
            form = await request.form()
            payload_dict = {
                "analysis_id": form.get("analysis_id"),
                "approve": form.get("approve", ""),
                "profile_sheet": form.get("profile_sheet"),
                "profile_worksheet": form.get("profile_worksheet"),
            }

        fill_request = _coerce_fill_request(payload_dict)

        if fill_request.analysis_id not in analysis_store:
            raise HTTPException(status_code=404, detail="analysis_id not found")
        if not fill_request.approve:
            raise HTTPException(status_code=403, detail="Approval required before filling")
        item = analysis_store[fill_request.analysis_id]
        coordinator = ReviewAgentCoordinator()
        coordinator.guard_approval(True)
        sheet_id = fill_request.profile_sheet or os.getenv("GOOGLE_SHEET_ID")
        if not sheet_id:
            raise HTTPException(status_code=400, detail="Google Sheet ID not provided")
        worksheet = fill_request.profile_worksheet or os.getenv("GOOGLE_SHEET_WORKSHEET")
        profile = fetch_profile_from_sheets(sheet_id, worksheet=worksheet)
        filled_path = fill_pdf_or_docx(item["source_path"], profile)  # type: ignore[arg-type]
        item.update({"filled_path": filled_path, "profile": profile})

        webhook_url = os.getenv("WEBHOOK_URL", "")
        payload = {
            "file_path": filled_path,
            "profile": profile,
            "analysis": item["analysis"],
        }
        send_webhook(webhook_url, payload)
        return {
            "download_url": f"/downloads/{fill_request.analysis_id}",
            "filled_path": filled_path,
        }

    @app.get("/downloads/{analysis_id}")
    async def download_endpoint(analysis_id: str):
        if analysis_id not in analysis_store:
            raise HTTPException(status_code=404, detail="analysis_id not found")
        filled_path = analysis_store[analysis_id].get("filled_path")
        if not filled_path:
            raise HTTPException(status_code=400, detail="Document has not been filled yet")
        return FileResponse(path=filled_path, filename=Path(filled_path).name)

    return app


app = _ensure_fastapi_app()


def main(argv: Optional[list[str]] = None) -> None:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    if args.web:
        if FastAPI is None:
            raise RuntimeError("FastAPI is not installed. Run `pip install -r requirements.txt` to enable the web server.")
        import uvicorn

        uvicorn.run("app:app", host=args.host, port=args.port, reload=False, factory=False)
        return

    if not args.file and not args.url:
        parser.error("Either --file or --url must be provided for CLI mode")
    run_cli(args)


if __name__ == "__main__":
    try:
        main()
    except ToolError as exc:
        LOGGER.error("Tool error: %s", exc)
        sys.exit(2)
    except Exception as exc:  # pragma: no cover
        LOGGER.exception("Unhandled error: %s", exc)
        sys.exit(1)
