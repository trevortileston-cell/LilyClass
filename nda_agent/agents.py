"""Agent orchestration for the NDA Reviewer workflow."""
from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from openai import OpenAI

from . import prompts
from .tools import fill_pdf_or_docx

logger = logging.getLogger(__name__)


JSON_BLOCK_PATTERN = re.compile(r"```json\s*(.*?)\s*```", re.DOTALL)


@dataclass
class AnalysisResult:
    """Normalized structure returned by the review agent."""

    raw_text: str
    report_markdown: str
    analysis: Dict[str, Any]


class ReviewAgent:
    """Wrapper around the OpenAI Responses API for legal risk analysis."""

    def __init__(self, client: Optional[OpenAI] = None, model: Optional[str] = None) -> None:
        self.client = client or OpenAI()
        self.model = model or os.getenv("OPENAI_MODEL", "gpt-4.1")
        self.system_prompt = prompts.RISK_ANALYSIS_SYSTEM_PROMPT

    def analyze_document(self, file_path: Path) -> AnalysisResult:
        """Upload the file, run file_search enhanced analysis, and parse the output."""
        file_path = Path(file_path)
        logger.info("Starting analysis for %s", file_path)

        vector_store = self.client.beta.vector_stores.create(name=f"nda-review::{file_path.stem}")
        with file_path.open("rb") as fh:
            self.client.beta.vector_stores.file_batches.upload_and_poll(
                vector_store_id=vector_store.id,
                files=[fh],
            )

        # Phase-two: enable computer_use for web-based buyer portals.
        # tools = ["file_search", "computer_use"]
        tools = [{"type": "file_search"}]

        response = self.client.responses.create(
            model=self.model,
            input=[
                {"role": "system", "content": self.system_prompt},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": (
                                "You are reviewing the attached document. "
                                "Return the JSON schema followed by the markdown summary."
                            ),
                        }
                    ],
                },
            ],
            tools=tools,
            tool_resources={
                "file_search": {"vector_store_ids": [vector_store.id]},
            },
        )

        output_text = getattr(response, "output_text", None)
        if not output_text:
            output_chunks = getattr(response, "output", [])
            if output_chunks and getattr(output_chunks[0], "content", None):
                output_text = output_chunks[0].content[0].text
        if not output_text:
            raise ValueError("Empty response from review agent")
        logger.debug("Raw agent response: %s", output_text)

        json_payload = self._extract_json(output_text)
        markdown = output_text.replace(json_payload["_raw_block"], "").strip()

        analysis = json.loads(json_payload["json_text"])
        analysis.setdefault("summary", "")
        analysis.setdefault("red_flags", [])
        analysis.setdefault("missing", [])
        analysis.setdefault("levers", [])
        analysis.setdefault("score", None)

        return AnalysisResult(raw_text=output_text, report_markdown=markdown, analysis=analysis)

    @staticmethod
    def _extract_json(response_text: str) -> Dict[str, str]:
        match = JSON_BLOCK_PATTERN.search(response_text)
        if not match:
            raise ValueError("Agent response did not contain a JSON block")
        json_text = match.group(1)
        return {"json_text": json_text, "_raw_block": match.group(0)}


class ReviewCoordinator:
    """Coordinates the review, approval, and fill phases with guardrails."""

    def __init__(self, client: Optional[OpenAI] = None, model: Optional[str] = None) -> None:
        self.client = client or OpenAI()
        self.agent = ReviewAgent(self.client, model=model)

    def review_document(self, file_path: Path) -> AnalysisResult:
        return self.agent.analyze_document(file_path)

    def fill_if_approved(
        self,
        original_file: Path,
        profile: Dict[str, Any],
        analysis: Dict[str, Any],
        approved: bool,
    ) -> Path:
        if not approved:
            raise PermissionError("Approval required before filling the document")
        logger.info("Filling document %s", original_file)
        return fill_pdf_or_docx(original_file, profile, analysis)
