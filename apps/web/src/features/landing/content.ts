export const DOCS_HREF = '/docs';

export const SIGN_IN_HREF = '/login';

const HEADLINE_LEAD = 'One identity for ';
const HEADLINE_ACCENT = 'every Micro Club project.';

export const LANDING = {
  name: 'MCID',
  headline: `${HEADLINE_LEAD}${HEADLINE_ACCENT}`,
  headlineLead: HEADLINE_LEAD,
  headlineAccent: HEADLINE_ACCENT,
  subtext:
    'Log in with Discord once, sync roles and members, and receive signed data from your project, all through one API.',
  docs: { label: 'Read the docs', href: DOCS_HREF },
  signIn: { label: 'Admin sign in', href: SIGN_IN_HREF },
  command: {
    label: 'mcid-cli',
    bin: 'npx mcid-cli',
    args: 'login',
    flag: '--profile prod',
  },
  stack: ['Discord OAuth', 'SSO', 'Signed webhooks', 'Role sync', 'REST API', 'mcid-cli'],
  screenshot: {
    src: '/landing/admin-panel-light.webp',
    srcDark: '/landing/admin-panel-dark.webp',
    width: 1960,
    height: 1360,
    alt: 'The MCID admin panel showing the submissions of a hackathon registration webhook: a table of teams with their track and email.',
    url: 'mcid.microclub.info/dashboard',
  },
  howItWorks: {
    eyebrow: 'How it works',
    title: 'A login your project never has to build',
    description:
      'MCID runs the Discord OAuth flow, keeps the session and knows every role. Your project redirects, receives a code and asks MCID who the member is.',
    steps: [
      {
        title: 'Your project redirects to MCID',
        description:
          'Send the browser to /auth/sso/authorize with your project id, a registered redirect address and a state.',
      },
      {
        title: 'The member signs in with Discord once',
        description:
          'MCID asks Discord only when there is no SSO session yet. After that, every club project signs the member in without a prompt.',
      },
      {
        title: 'Your backend exchanges the code',
        description:
          'POST /auth/token with your API key returns a session token, the public profile and the server roles, ready to gate your pages.',
      },
    ],
  },
  features: {
    eyebrow: 'What you get',
    title: 'Identity, roles and data in one place',
    description: 'The pieces every club project needs, shared instead of rebuilt each semester.',
    items: [
      {
        icon: 'sso',
        title: 'SSO across projects',
        body: 'One Discord login covers every Micro Club project. Sessions are scoped per project, and a member can log out everywhere at once.',
      },
      {
        icon: 'roles',
        title: 'Role and permission sync',
        body: 'Members and roles follow Discord through gateway events and queued syncs. Check one permission or a batch in a single call.',
      },
      {
        icon: 'admin',
        title: 'Admin panel with access levels',
        body: 'Each role gets none, read, write or manage on every resource, so leads see what they run and nothing else.',
      },
      {
        icon: 'webhooks',
        title: 'Inbound webhooks',
        body: 'Projects send HMAC-signed submissions. MCID validates them against a form schema and keeps them for review.',
      },
      {
        icon: 'cli',
        title: 'mcid-cli',
        body: 'Log in from the terminal, check a form schema before you ship it and manage your webhooks without the panel.',
      },
      {
        icon: 'audit',
        title: 'Audit and monitoring',
        body: 'Every admin change is recorded with who made it and when, next to the health of the API and the Discord bot.',
      },
    ],
  },
  developers: {
    eyebrow: 'For developers',
    title: 'Exchange a code, get a member',
    description:
      'Your backend trades the one-time code for a 30-day session. The response carries the public profile and the member roles, read from Discord.',
    points: [
      'Codes work once and expire after 120 seconds.',
      'Tokens are scoped to your project and never cross projects.',
      'POST /auth/validate returns the live roles of a token.',
    ],
    link: { label: 'Read the SSO guide', href: '/docs/integrate/sso' },
    file: 'exchange-code.sh',
    request: [
      'curl -s -X POST "$MCID_URL/auth/token" \\',
      '  -H "X-API-Key: $MCID_API_KEY" \\',
      '  -H "Content-Type: application/json" \\',
      "  -d '{",
      '    "clientId": "<project id>",',
      '    "code": "<the code from the redirect>",',
      '    "redirectUri": "http://localhost:4000/callback"',
      "  }'",
    ],
    response: [
      '{',
      '  "token": "cfcf51c8987f7028...",',
      '  "refreshToken": "b86ac997ca73309d...",',
      '  "expiresAt": "2026-11-04T18:16:43.479Z",',
      '  "member": { "id": "800000000000000010", "username": "alice", ... },',
      '  "roles": [{ "roleId": "179122419032032858", "roleName": "Dev", ... }]',
      '}',
    ],
  },
  finalCta: {
    title: 'Plug your project into MCID',
    description:
      'Register a project, get an API key and sign members in with Discord in an afternoon.',
  },
  metadata: {
    title: 'Micro Club Identity',
    description:
      'MCID is the identity platform of Micro Club: one Discord login for every club project, synced roles and members, and signed webhooks.',
  },
} as const;

export type LandingFeatureIcon = (typeof LANDING.features.items)[number]['icon'];
