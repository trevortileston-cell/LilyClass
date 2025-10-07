"""CLI and optional FastAPI entry point for the NDA Reviewer MVP."""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4

import requests
from dotenv import load_dotenv

from .agents import ReviewCoordinator
from .tools import fetch_profile_from_sheets, send_webhook

try:  # Optional web server support
    from fastapi import FastAPI, File, Form, HTTPException, UploadFile
    from fastapi.responses import FileResponse, JSONResponse
except ImportError:  # pragma: no cover - FastAPI optional for CLI usage
    FastAPI = None  # type: ignore


DISCLAIMER_LINES = [
    "This tool provides an AI-assisted review; it is not legal advice. Always consult counsel.",
    "No signing or submission occurs without explicit approval.",
    "Documents and profile data are handled locally; rotate keys & restrict access.",
]


logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)


class CLIApplication:
    def __init__(self) -> None:
        load_dotenv()
        self.coordinator = ReviewCoordinator()

    def run(self, args: Optional[list[str]] = None) -> int:
        parser = self._build_parser()
        parsed = parser.parse_args(args=args)

        if not parsed.file and not parsed.url:
            parser.error("Either --file or --url must be provided")

        working_file = self._resolve_input(parsed.file, parsed.url)
        logger.info("Reviewing %s", working_file)

        analysis_result = self.coordinator.review_document(working_file)

        print("\n" + "=" * 60)
        for line in DISCLAIMER_LINES:
            print(f"⚠️ {line}")
        print("=" * 60 + "\n")

        print("Agent analysis JSON:")
        print(json.dumps(analysis_result.analysis, indent=2))
        print("\nMarkdown summary:\n")
        print(analysis_result.report_markdown)

        approval = self._prompt_for_approval()
        if not approval:
            print("Approval not granted. Exiting without filling.")
            return 0

        profile = fetch_profile_from_sheets(
            sheet_id=parsed.sheet_id,
            worksheet_name=parsed.worksheet,
        )
        filled_path = self.coordinator.fill_if_approved(
            working_file,
            profile,
            analysis_result.analysis,
            approved=True,
        )

        print(f"Filled document created at: {filled_path}")

        webhook_url = parsed.webhook or os.getenv("WEBHOOK_URL")
        if webhook_url:
            success, message = send_webhook(
                webhook_url,
                {
                    "file_path": str(filled_path),
                    "profile": profile,
                    "analysis": analysis_result.analysis,
                },
            )
            status = "✅" if success else "❌"
            print(f"{status} Webhook result: {message}")

        return 0

    def _resolve_input(self, file_path: Optional[str], url: Optional[str]) -> Path:
        if file_path:
            return Path(file_path).expanduser().resolve()
        assert url
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        suffix = Path(url).suffix or ".pdf"
        handle, temp_path = tempfile.mkstemp(suffix=suffix)
        with os.fdopen(handle, "wb") as fh:
            fh.write(response.content)
        return Path(temp_path)

    @staticmethod
    def _prompt_for_approval() -> bool:
        answer = input("Approve to fill? (y/n): ").strip().lower()
        return answer in {"y", "yes"}

    @staticmethod
    def _build_parser() -> argparse.ArgumentParser:
        parser = argparse.ArgumentParser(description="NDA & Buyer-Profile Reviewer/Filler")
        parser.add_argument("--file", help="Path to a local PDF/DOCX")
        parser.add_argument("--url", help="URL to download a document")
        parser.add_argument("--webhook", help="Optional webhook URL override")
        parser.add_argument("--sheet-id", help="Override Google Sheet ID")
        parser.add_argument("--worksheet", help="Specific worksheet/tab name")
        return parser


# -------------------------------
# Optional FastAPI implementation
# -------------------------------

def create_app() -> "FastAPI":  # pragma: no cover - convenience wiring
    if FastAPI is None:
        raise RuntimeError("FastAPI is not installed; run `pip install fastapi uvicorn`")

    load_dotenv()
    coordinator = ReviewCoordinator()
    analysis_store: Dict[str, Dict[str, Any]] = {}
    downloads: Dict[str, Path] = {}
    app = FastAPI(title="NDA Reviewer", version="0.1.0")

    @app.get("/health")
    async def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.post("/analyze")
    async def analyze(
        file: UploadFile | None = File(default=None),
        url: str | None = Form(default=None),
        sheet_id: str | None = Form(default=None),
        worksheet: str | None = Form(default=None),
    ):
        if not file and not url:
            raise HTTPException(status_code=400, detail="Provide an uploaded file or URL")
        if file:
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename or "doc").suffix) as tmp:
                tmp.write(await file.read())
                tmp_path = Path(tmp.name)
        else:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            suffix = Path(url).suffix or ".pdf"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
                tmp.write(response.content)
                tmp_path = Path(tmp.name)

        result = coordinator.review_document(tmp_path)
        profile = fetch_profile_from_sheets(sheet_id=sheet_id, worksheet_name=worksheet)

        analysis_id = str(uuid4())
        analysis_store[analysis_id] = {
            "analysis": result.analysis,
            "markdown": result.report_markdown,
            "file": tmp_path,
            "profile": profile,
        }

        return JSONResponse(
            {
                "analysis_id": analysis_id,
                "analysis": result.analysis,
                "markdown": result.report_markdown,
                "disclaimer": DISCLAIMER_LINES,
            }
        )

    @app.post("/fill")
    async def fill(analysis_id: str = Form(...), approve: bool = Form(...), webhook: str | None = Form(default=None)):
        if not approve:
            raise HTTPException(status_code=400, detail="Approval required before filling")
        if analysis_id not in analysis_store:
            raise HTTPException(status_code=404, detail="Unknown analysis ID")
        record = analysis_store[analysis_id]

        filled_path = coordinator.fill_if_approved(
            Path(record["file"]),
            record["profile"],
            record["analysis"],
            approved=True,
        )
        downloads[analysis_id] = filled_path

        webhook_url = webhook or os.getenv("WEBHOOK_URL")
        webhook_status = None
        if webhook_url:
            success, message = send_webhook(
                webhook_url,
                {
                    "file_path": str(filled_path),
                    "profile": record["profile"],
                    "analysis": record["analysis"],
                },
            )
            webhook_status = {"success": success, "message": message}

        return JSONResponse(
            {
                "download_url": f"/downloads/{analysis_id}",
                "webhook": webhook_status,
            }
        )

    @app.get("/downloads/{analysis_id}")
    async def downloads_route(analysis_id: str):
        if analysis_id not in downloads:
            raise HTTPException(status_code=404, detail="File not ready")
        return FileResponse(downloads[analysis_id])

    return app


def main() -> None:
    cli = CLIApplication()
    sys.exit(cli.run())


if __name__ == "__main__":  # pragma: no cover
    main()
