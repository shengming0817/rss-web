.PHONY: ci
ci:
	@logs=$$(mktemp -d "$${TMPDIR:-/tmp}/rss-web-ci.XXXXXX"); failed=0; index=0; \
	for check in 'pnpm typecheck' 'pnpm lint' 'pnpm format:check' 'pnpm test:coverage' 'pnpm test:boundary' 'pnpm build:identity' 'pnpm build:mdm' 'pnpm build:ui-preview'; do \
		index=$$((index + 1)); printf '\n[%s] %s\n' "$$index" "$$check"; \
		if sh -c "$$check" >"$$logs/$$index.log" 2>&1; then printf 'PASS\n'; \
		else failed=1; printf 'FAIL — %s/%s.log\n' "$$logs" "$$index"; tail -n 40 "$$logs/$$index.log"; fi; \
	done; printf '\nComplete check logs: %s\n' "$$logs"; exit $$failed
