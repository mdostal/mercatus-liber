# @mercatus-liber/admin-auth

The admin authorization contract: roles, sessions, a permission check, and a development adapter for running admin pages without an identity provider.

**Status:** used by the demo stores. The default adapter is for development only and is not a security boundary; use `@mercatus-liber/adapter-clerk` or your own `AdminAuthAdapter` for real access control. Not yet published to npm; use it from this monorepo via `workspace:*`.

## Usage

```ts
import { createDefaultAdminAuthAdapter, hasPermission } from "@mercatus-liber/admin-auth";

const auth = createDefaultAdminAuthAdapter({
  getSessionCookie: () => cookieValue,
});

const session = await auth.getCurrentSession();
const canEdit = session !== null && hasPermission(session.role, "mutate");
```

## Key exports

- `AdminAuthAdapter`: `getCurrentSession`, `listAdminUsers`, `setAdminUserRole`.
- `AdminRole`: `owner`, `admin`, `viewer`.
- `AdminAction`: `view`, `mutate`, `manage_users`, `reset_demo_data`.
- `hasPermission(role, action)`.
- `createDefaultAdminAuthAdapter(deps?)`, `verifyDevPassword`, `verifyDevViewerPassword`, `ADMIN_DEV_SESSION_COOKIE`.

## Environment

- `ADMIN_DEV_PASSWORD`: the shared password for the development admin session.
- `ADMIN_VIEWER_PASSWORD`: optional shared password for a viewer session.

## Implementing an adapter

Implement `AdminAuthAdapter` against your identity provider and keep using `hasPermission` for checks. `packages/adapter-clerk` is a complete example.

See [docs/subsystems/21-admin-auth.md](../../docs/subsystems/21-admin-auth.md).
