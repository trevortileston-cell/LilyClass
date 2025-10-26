.PHONY: setup run-cli run-web

setup:
python -m venv .venv
. .venv/bin/activate && pip install --upgrade pip && pip install -r requirements.txt

run-cli:
. .venv/bin/activate && python app.py --file examples/sample_nda.pdf --profile-sheet "$(GOOGLE_SHEET_ID)"

run-web:
. .venv/bin/activate && uvicorn app:app --reload
