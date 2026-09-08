# @mercatus-liber/core

Shared core schema types and adapter/event-bus interfaces. Types and interfaces only — no
storage, no business logic, no framework code. Every other subsystem package imports from here
and nowhere else in core.

`@osc` is a placeholder scope for the project's working name — see
[`docs/NAMING-CANDIDATES.md`](../../docs/NAMING-CANDIDATES.md). Rename once the real name is
picked (a straightforward find/replace across `package.json` names and imports).

See [`docs/subsystems/00-core-schema.md`](../../docs/subsystems/00-core-schema.md) for the full
design rationale.
