.PHONY: refresh build news fx serve check

# Full refresh: FX -> news -> build. This is what CI runs.
refresh: fx news build

fx:
	python3 scripts/fetch_fx.py

news:
	python3 scripts/collect_news.py

build:
	python3 scripts/build.py

# Open the dashboard locally. docs/data.js means file:// works too,
# but a server is closer to how Pages will serve it.
serve: build
	@echo "http://localhost:8000"
	@cd docs && python3 -m http.server 8000

# Validate the curated data layer before committing.
check:
	@python3 -c "import json,glob,sys; \
	[json.load(open(f)) for f in glob.glob('data/*.json')+glob.glob('data/products/*.json')]; \
	print('JSON OK')"
	@python3 scripts/build.py
