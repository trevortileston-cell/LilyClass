.PHONY: setup run-cli run-web

setup:
python -m venv .venv
. .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt

run-cli:
. .venv/bin/activate && python -m nda_agent.app --file nda_agent/examples/sample_nda.pdf

run-web:
. .venv/bin/activate && uvicorn nda_agent.app:create_app --reload --host 0.0.0.0 --port 8000
