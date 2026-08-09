# @gocell/contracts

This package temporarily retains only the historical types consumed by the
preserved authentication, authorization, audit, configuration, and request
code. It is frozen migration input, not the RSS contract source of truth.

There is deliberately no generator or drift workflow. Issue #4 replaces this
baseline with adapters for explicitly selected RSS contracts; until then, do
not add types copied from the former GoCell backend.
