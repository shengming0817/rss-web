# @gocell/config

Retained migration package for configuration entries and their edit workflow.
It exports the config store and config view through `package.json#exports`.

Feature-flag APIs, stores, composables, components, and routes are intentionally
absent. HTTP calls use `@gocell/request`; migration types remain frozen until
the RSS contract adapter work in issue #4.
