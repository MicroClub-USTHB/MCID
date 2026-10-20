/**
 * The meta description of each generated reference page, by slug below `api-reference`. The API's
 * own tag descriptions are too short for a search snippet, so these are written by hand. A group
 * that is missing here falls back to its tag description.
 */
export const API_PAGE_DESCRIPTIONS: Record<string, string> = {
  'project/overview':
    'How a project calls MCID: how to authenticate and every endpoint at a glance, grouped by area.',
  'project/authentication':
    "Start a login, exchange the code for a session token, validate or end a session, and manage a member's own sessions.",
  'project/authentication-sso':
    'The single sign-on entry point and the browser session endpoints. The recommended way to log members in.',
  'project/channels':
    "List a server's channels, read recent messages and send a message to a channel, with a project API key.",
  'project/inbound-webhooks-ingest':
    'The endpoint a project calls to send a signed payload to an inbound webhook, with every response it can return.',
  'project/members':
    "Search members, fetch one by Discord ID, and get a member's effective permissions on a server.",
  'project/permissions':
    "Check one permission or many at once for a member, and get the member's full resolved permissions.",
  'project/webhooks':
    'Create, update, execute and delete the Discord webhooks a project owns, with a project API key.',
  'admin/overview':
    'How the admin dashboard talks to MCID: the admin session it needs and every endpoint at a glance, grouped by area.',
  'admin/admin-access':
    'Root-only management of who may do what in the admin API: list the resources and levels, grant a level to a role, and override it for one member.',
  'admin/admin-settings':
    "The admin's own profile and the editable system settings: read them, change them, or reset them to the environment values.",
  'admin/audit': 'Read the audit log of administrative actions and export it as CSV.',
  'admin/authentication':
    "Admin login with Discord, the signed-in admin's profile, logout, and the session cleanup job.",
  'admin/channels':
    "List a server's channels, see a channel's details and read its recent messages, with an admin session.",
  'admin/inbound-webhooks-admin':
    'Create and manage inbound webhooks: schemas and previews, reader roles, settings, signing secrets, docs and deletion.',
  'admin/inbound-webhooks-read':
    'List the inbound webhooks you may read and fetch their submissions, one at a time or in pages.',
  'admin/members':
    'List members by server, role or search, see one across servers, and export a members report.',
  'admin/monitoring':
    'Recent authentication failures, the system health check and API usage statistics.',
  'admin/permissions':
    "Preview and change a role's permissions and manage the inheritance rules, with an admin session.",
  'admin/projects':
    'Register projects, manage their API keys and redirect URIs, and grant or review their access to servers.',
  'admin/servers':
    'Register, update, disable, enable and remove the Discord servers MCID knows about.',
  'admin/statistics':
    'Member statistics: totals, growth over time, role distribution and overlap across servers, with CSV and JSON export.',
  'admin/sync':
    'Trigger a full sync of a server, follow its status and read the logs and change details of past syncs.',
  'admin/webhooks':
    'List, inspect and delete the Discord webhooks of any project, with an admin session.',
};
