"""Agent orchestration for the NDA reviewer workflow."""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

from openai import OpenAI

from . import prompts

LOGGER = logging.getLogger(__name__)


def _load_json_and_markdown(response: Any) -> Tuple[Dict[str, Any], str]:
    """Parse the Responses API payload into structured JSON + markdown text."""
    content_blocks = getattr(response, "output", None) or []
    json_payload: Optional[Dict[str, Any]] = None
    markdown_payload: Optional[str] = None

    for block in content_blocks:
        for item in getattr(block, "content", []):
            if item.get("type") == "output_text":
                text = item["text"].strip()
                if text.startswith("{") and json_payload is None:
                    try:
                        json_payload = json.loads(text)
                        continue
                    except json.JSONDecodeError:
                        LOGGER.debug("Could not decode JSON from text block: %s", text[:120])
                if markdown_payload is None:
                    markdown_payload = text

    if json_payload is None:
        raise ValueError("Agent response did not include the required JSON object.")
    if markdown_payload is None:
        markdown_payload = "## NDA Review\n\n_No markdown summary returned by the agent._"

    return json_payload, markdown_payload


@dataclass
class ReviewAgentConfig:
    """Configuration for the NDA reviewer agent."""

    model: str
    vector_store_id: Optional[str] = None


class ReviewAgentCoordinator:
    """Coordinates calls to the OpenAI Agents SDK and enforces guardrails."""

    def __init__(self, *, client: Optional[OpenAI] = None, config: Optional[ReviewAgentConfig] = None) -> None:
        self.client = client or OpenAI()
        model = os.getenv("OPENAI_REVIEW_MODEL", "gpt-4.1-mini")
        self.config = config or ReviewAgentConfig(model=model)
        self._agent = None

    def _ensure_agent(self) -> Any:
        if self._agent is None:
            LOGGER.debug("Creating NDA Reviewer agent with model %s", self.config.model)
            self._agent = self.client.agents.create(
                name="NDA Reviewer",
                model=self.config.model,
                instructions=prompts.REVIEW_SYSTEM_PROMPT,
                tools=[{"type": "file_search"}],
                metadata={"trace": "nda-agent"},
            )
            # Phase two: enable the computer_use tool once the workflow is ready for autonomous UI steps.
            # self._agent.tools.append({"type": "computer_use"})
        return self._agent

    def analyze_document(self, file_path: str) -> Tuple[Dict[str, Any], str]:
        """Upload the file, run the Review Agent, and return JSON + markdown."""
        agent = self._ensure_agent()
        LOGGER.info("Uploading %s for analysis", file_path)
        with open(file_path, "rb") as handle:
            uploaded = self.client.files.create(purpose="agents", file=handle)

        LOGGER.info("Invoking Responses API with file_search enabled")
        response = self.client.responses.create(
            agent_id=agent.id,
            model=self.config.model,
            input=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_text",
                            "text": "Review the attached agreement. Provide the JSON schema and markdown summary described in your system prompt.",
                        }
                    ],
                }
            ],
            tools=[{"type": "file_search"}],
            attachments=[{"file_id": uploaded.id}],
        )

        return _load_json_and_markdown(response)

    @staticmethod
    def guard_approval(approved: bool) -> None:
        """Enforce a minimal guardrail that blocks filling unless approved."""
        if not approved:
            raise PermissionError("Filling or submission is blocked without explicit human approval.")


__all__ = ["ReviewAgentCoordinator", "ReviewAgentConfig"]
