# Security & Abuse Audit

> Conducted against commit state at time of review. Group findings by severity before triaging.

---

## [CRITICAL]

---

### C1 — CobaltSession auth token transmitted as URL query parameter

**Location:** `packages/backend/src/handlers/dndbeyond.ts` L30 · `packages/frontend/src/lib/api.ts` L204 · `packages/frontend/src/pages/ddb/DdbCallbackPage.tsx` (search params read)

**Vector:** The DnD Beyond `CobaltSession` value — equivalent in sensitivity to a password; it grants long-lived access to a user's full D&D Beyond account — is sent as a URL query parameter (`?accessToken=…`). Query strings are written verbatim to:
- API Gateway access logs
- CloudFront access logs
- Any WAF, proxy, or load balancer in the path
- The browser's own history and session restore
- The `Referer` header on any subsequent navigation away from that page

An attacker with read access to any of those log sources can replay the token against D&D Beyond directly.

**Exact Fix:**

*Backend — change route to POST, read token from request body:*
```typescript
// packages/backend/src/handlers/dndbeyond.ts

// router — was: 'GET /dndbeyond/characters'
case 'POST /dndbeyond/characters': return listCharacters(event);

// handler — replace query-string read with body parse
async function listCharacters(event: APIGatewayProxyEventV2) {
  let body: { accessToken?: string };
  try { body = JSON.parse(event.body ?? '{}'); }
  catch { return badRequest('Invalid JSON body'); }

  const accessToken = body.accessToken?.trim();
  if (!accessToken) return badRequest('accessToken required');
  // ... rest unchanged
}
```

*Frontend — change GET with query param to POST with JSON body:*
```typescript
// packages/frontend/src/lib/api.ts  listCharacters()
const res = await authFetch(`${API_URL}/dndbeyond/characters`, {
  method: 'POST',
  body: JSON.stringify({ accessToken: cobaltToken }),
});
```

*CDK — update route verb:*
```typescript
// infra/lib/constructs/api.ts
httpApi.addRoutes({
  path: '/dndbeyond/characters',
  methods: [apigw.HttpMethod.POST],      // was GET
  integration: dndBeyondIntegration,
  authorizer,
});
```

---

### C2 — No throttling on any API Gateway endpoint

**Location:** `infra/lib/constructs/api.ts` — no stage-level or route-level `throttle` config present anywhere

**Vector:** Every endpoint — including the D&D Beyond proxy (which makes outbound HTTP calls and can trigger 3rd-party rate-limit bans), the Cognito admin operations (`listUsers`, `disableUser`, `deleteUser`), and the CloudWatch log queries — is unbounded. An authenticated attacker can:
- Loop `POST /dndbeyond/characters` to get the application's IP range banned from D&D Beyond
- Loop `GET /admin/users` / `GET /admin/logs` to exhaust CloudWatch read quotas and rack up cost
- Loop `POST /characters/{id}/macros/{macroId}/reorder` (up to 25-item TransactWrite per call) to push DynamoDB to its on-demand cost ceiling

**Exact Fix:**
```typescript
// infra/lib/constructs/api.ts

import * as apigw from 'aws-cdk-lib/aws-apigatewayv2';

// Replace createDefaultStage (implicit) with an explicit stage so throttle can be set
const httpApi = new apigw.HttpApi(this, 'Api', {
  corsPreflight: { /* existing config */ },
  createDefaultStage: false,             // <-- add this
});

new apigw.HttpStage(this, 'DefaultStage', {
  httpApi,
  stageName: '$default',
  autoDeploy: true,
  throttle: {
    burstLimit: 200,   // max concurrent in-flight
    rateLimit:  100,   // sustained req/s across all routes
  },
});

// Tighter limits on expensive/sensitive routes via a usage plan isn't
// available on HTTP API v2; consider moving admin routes to a separate
// REST API (v1) if per-route throttling is needed.
```

---

## [HIGH]

---

### H1 — Internal exception details returned verbatim to API clients

**Location:** `packages/backend/src/lib/response.ts` L37–41 · `internalError()`

**Vector:** DynamoDB `ResourceNotFoundException`, `ProvisionedThroughputExceededException`, and SDK errors include the table ARN, region, and query structure in their `message` strings. These are currently serialised directly into the `500` response body:
```json
{ "error": "Internal error: Requested resource not found: Table: arn:aws:dynamodb:us-east-1:123456789:table/DiceRoller not found" }
```
A recon attacker can force 500s (e.g. by supplying a large payload to a macro notation field) to enumerate your AWS account ID and table name.

**Exact Fix:**
```typescript
// packages/backend/src/lib/response.ts

import { randomUUID } from 'crypto';

export function internalError(err?: unknown): APIGatewayProxyResultV2 {
  const errorId = randomUUID();
  // Full details stay in CloudWatch — never sent to the client
  console.error(`[${errorId}]`, err);
  return {
    statusCode: 500,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error: 'Internal server error', errorId }),
  };
}
```

---

### H2 — Cognito filter expression injection in admin `listUsers`

**Location:** `packages/backend/src/handlers/admin.ts` L88

**Vector:** The `search` query parameter is interpolated directly into the Cognito filter string:
```typescript
Filter: search ? `email ^= "${search}"` : undefined
```
A malicious admin sending `search = '" or username ^= "` produces:
```
email ^= "" or username ^= ""
```
which matches all users — bypassing any intended filter restriction and leaking the full user list in a single paged response. While all admins can already list all users, this becomes meaningful if the `search` field is ever surfaced to a non-admin role, or if a future change introduces scoped admin roles.

**Exact Fix:**
```typescript
// packages/backend/src/handlers/admin.ts

/** Allow only characters valid in an email address — nothing that can break the filter syntax. */
function sanitizeCognitoEmailPrefix(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9@._+\-]/g, '').slice(0, 128);
}

// In listUsers():
const raw    = qs['search'] ?? '';
const search = raw ? sanitizeCognitoEmailPrefix(raw) : '';
const result = await cognitoClient.send(new ListUsersCommand({
  UserPoolId:      USER_POOL_ID,
  Limit:           60,
  Filter:          search ? `email ^= "${search}"` : undefined,
  PaginationToken: paginationToken,
}));
```

---

### H3 — CloudWatch filter pattern from untrusted input passed unvalidated

**Location:** `packages/backend/src/handlers/admin.ts` L139 · `getLogs()`

**Vector:** The `filter` query parameter is forwarded directly to `FilterLogEventsCommand`:
```typescript
filterPattern: filter || undefined
```
CloudWatch filter patterns support `&&`, `||`, `NOT`, `{$.field = "value"}` JSON object matchers, and glob wildcards. A crafted pattern like `{($.a = "*") && ($.b = "*") && ... (x100)}` causes CloudWatch to perform an extremely expensive evaluation against every log event, driving per-query cost and latency. Additionally, overly permissive patterns can leak log events that the UI filter was designed to hide.

**Exact Fix:**
```typescript
// packages/backend/src/handlers/admin.ts  getLogs()

/** Block patterns that contain repeated expensive compound clauses. */
function isValidLogPattern(pattern: string): boolean {
  if (pattern.length > 512) return false;
  // Reject deeply nested compound patterns (abuse vector for expensive scans)
  const compoundCount = (pattern.match(/&&|\|\|/g) ?? []).length;
  if (compoundCount > 5) return false;
  return true;
}

const rawFilter = qs['filter'] ?? 'ERROR';
if (rawFilter && !isValidLogPattern(rawFilter)) {
  return badRequest('Invalid filter pattern');
}
const filter = rawFilter;
```

---

### H4 — No HTTP security response headers

**Location:** `infra/lib/constructs/hosting.ts` — `Distribution` construction has no `responseHeadersPolicy`

**Vector:** Without CSP, any XSS vector (injected macro `notation` or `description` rendered as `innerHTML`, rogue browser extensions, future template bugs) can exfiltrate auth tokens from `localStorage`/memory. Without `Strict-Transport-Security`, the initial HTTP connection is downgradeable. Without `X-Frame-Options: DENY` the app can be embedded in an iframe for clickjacking.

**Exact Fix:**
```typescript
// infra/lib/constructs/hosting.ts

import { Duration } from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';

const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
  securityHeadersBehavior: {
    strictTransportSecurity: {
      accessControlMaxAge: Duration.seconds(63_072_000), // 2 years
      includeSubdomains: true,
      preload: true,
      override: true,
    },
    contentTypeOptions:  { override: true },
    frameOptions: {
      frameOption: cloudfront.HeadersFrameOption.DENY,
      override: true,
    },
    xssProtection: { protection: true, modeBlock: true, override: true },
    referrerPolicy: {
      referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
      override: true,
    },
    contentSecurityPolicy: {
      // Tighten 'connect-src' to exactly your API GW URL and Cognito endpoint
      contentSecurityPolicy: [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",       // shadcn injects inline styles
        "img-src 'self' data: https:",
        `connect-src 'self' https://${props.apiDomain} https://cognito-idp.${props.region}.amazonaws.com`,
        "frame-ancestors 'none'",
      ].join('; '),
      override: true,
    },
  },
});

new cloudfront.Distribution(this, 'Distribution', {
  // ... existing props
  defaultBehavior: {
    // ... existing behavior
    responseHeadersPolicy,     // <-- add this
  },
});
```

---

## [MEDIUM]

---

### M1 — DnD Beyond userId (PII) written to CloudWatch Logs

**Location:** `packages/backend/src/handlers/dndbeyond.ts` L198 and L210

**Vector:** Two `console.log` calls write the D&D Beyond `userId` (a stable identifier tied to a real person's account) to CloudWatch:
```typescript
console.log('JWT payload keys:', Object.keys(payload), '| sub:', payload['sub'], '| userId:', payload['userId']);
console.log('Cobalt JWT obtained, userId:', userId);
```
Under GDPR/CCPA, storing a third-party platform's user identifier in application logs constitutes personal data processing that requires disclosure. It also means anyone with CloudWatch read access (including the overly-broad admin read policy in C2) can enumerate which D&D Beyond accounts your users have.

**Exact Fix:**
```typescript
// packages/backend/src/handlers/dndbeyond.ts  cobaltSessionToJwt()

// Replace both console.log calls with:
console.log('Cobalt JWT obtained successfully');        // no userId, no payload keys
```

---

### M2 — Share tokens have no expiry and no public-endpoint rate limit

**Location:** `packages/backend/src/handlers/sharing.ts` · `GET /shared/{token}` route (no authorizer, no throttle)

**Vector:** Two separate abuse paths:
1. **No expiry:** A shared link is valid indefinitely until the owner manually unshares it. If a share link leaks (e.g. via browser history on a shared computer) it remains permanently valid.
2. **Public endpoint enumeration:** `GET /shared/{token}` has no authorizer and is not throttled. Tokens are 32 hex chars (128-bit), so brute force is infeasible, but the endpoint can be hammered to consume DynamoDB read capacity with no authentication overhead.

**Exact Fix:**
```typescript
// packages/backend/src/handlers/sharing.ts  shareMacro()

// Add a TTL field when creating the share record
const SHARE_TTL_DAYS = 90;
const ttl = Math.floor(Date.now() / 1000) + SHARE_TTL_DAYS * 86_400;

await docClient.send(new PutCommand({
  TableName: TABLE_NAME,
  Item: {
    pk: `SHARE#${token}`,
    sk: 'META',
    userId, charId, macroId,
    shareToken: token,
    createdAt: new Date().toISOString(),
    ttl,                              // <-- DynamoDB TTL attribute
  },
}));
```

```typescript
// infra/lib/constructs/table.ts — enable TTL on the table
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

this.table = new dynamodb.Table(this, 'Table', {
  // ... existing props
  timeToLiveAttribute: 'ttl',         // <-- add this
});
```

---

### M3 — Admin CloudWatch IAM policy uses overly broad resource wildcard

**Location:** `infra/lib/constructs/api.ts` — CloudWatch Logs IAM policy block

**Vector:** The IAM policy grants `FilterLogEvents` on:
```
arn:aws:logs:us-east-1:ACCOUNT:log-group:/aws/lambda/DiceRoller*:*
```
Any Lambda function in your AWS account whose name starts with `DiceRoller` — including functions from other projects or future experiments — will have its logs readable through the admin panel. If a future function processes sensitive data (e.g. payment webhooks), its logs become accessible through this panel.

**Exact Fix:**
```typescript
// infra/lib/constructs/api.ts — replace the wildcard policy with explicit ARNs

const logGroupArns = [
  `arn:aws:logs:${stack.region}:${stack.account}:log-group:${meFunction.logGroup.logGroupName}:*`,
  `arn:aws:logs:${stack.region}:${stack.account}:log-group:${charactersFunction.logGroup.logGroupName}:*`,
  `arn:aws:logs:${stack.region}:${stack.account}:log-group:${macrosFunction.logGroup.logGroupName}:*`,
  `arn:aws:logs:${stack.region}:${stack.account}:log-group:${sharingFunction.logGroup.logGroupName}:*`,
  `arn:aws:logs:${stack.region}:${stack.account}:log-group:${adminFunction.logGroup.logGroupName}:*`,
  `arn:aws:logs:${stack.region}:${stack.account}:log-group:${dndBeyondFunction.logGroup.logGroupName}:*`,
];

adminFn.addToRolePolicy(new iam.PolicyStatement({
  effect:    iam.Effect.ALLOW,
  actions:   ['logs:FilterLogEvents'],
  resources: logGroupArns,
}));
```

---

### M4 — Shared macro `notation` field executed without validation in recipient's browser

**Location:** `packages/frontend/src/pages/shared/SharedMacroPage.tsx` L69 · `packages/frontend/src/pages/macros/MacroCard.tsx` `handleRollCombo`

**Vector:** When a user imports a shared macro, the `notation` string is stored as-is and later passed to `roll(macro.notation, ...)` in the dice engine. If the dice engine's parser contains a ReDoS (catastrophic backtracking) vulnerability, a crafted `notation` in a shared macro can lock the recipient's browser tab. If the parser ever uses `eval()` or `Function()` internally (verify against `packages/dice-engine/src`), this escalates to XSS.

**Exact Fix:**

Run `validate()` server-side before persisting the import, not just client-side:
```typescript
// packages/backend/src/handlers/sharing.ts  importFromShare()

import { validate } from '@dnd-dice-roller/dice-engine';   // if it can be used in Node

// After loading the source macro:
const validationError = validate(sourceMacro.notation);
if (validationError) {
  return badRequest(`Shared macro has invalid notation: ${validationError}`);
}
```

If the dice engine cannot run in Node, add a `maxLength` guard at minimum:
```typescript
if ((sourceMacro.notation?.length ?? 0) > 512) {
  return badRequest('Shared macro notation exceeds length limit');
}
```

---

## [LOW]

---

### L1 — Cognito password policy does not require symbols

**Location:** `infra/lib/constructs/user-pool.ts` — `passwordPolicy` block

**Vector:** `requireSymbols: false` allows passwords like `Password1` (8 chars, upper, lower, digit). While Cognito SRP flow prevents offline cracking, an attacker who can reach the auth endpoint can attempt low-and-slow credential stuffing with common breached passwords that happen to satisfy the current policy.

**Exact Fix:**
```typescript
// infra/lib/constructs/user-pool.ts
passwordPolicy: {
  minLength:        12,          // was 8
  requireUppercase: true,
  requireLowercase: true,
  requireDigits:    true,
  requireSymbols:   true,        // was false
  tempPasswordValidity: Duration.days(3),
},
```

---

### L2 — Real AWS resource identifiers committed in `.env.local`

**Location:** `packages/frontend/.env.local`

**Vector:** The file contains real production values for `VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`, `VITE_API_URL`, and `AWS_PROFILE`. While `VITE_*` values are inherently public (bundled into the SPA output), committing them means:
- They appear in git history permanently (even after deletion)
- CI/CD build logs may echo env vars
- `AWS_PROFILE=oldforest` belongs in `infra/.env.local`, not in the frontend package — a contributor who runs `npm run dev` from the repo root cannot be expected to have that profile

**Exact Fix:**
```bash
# Add to .gitignore (root level):
.env.local
.env.*.local
packages/**/.env.local
infra/.env.local
```

```bash
# Remove from git history:
git rm --cached packages/frontend/.env.local
git commit -m "chore: untrack .env.local"
# Rotate Cognito client IDs and API URL if this repo is or has ever been public
```

---

### L3 — Bookmarklet sends CobaltSession via browser redirect URL

**Location:** `packages/frontend/src/pages/ddb/DndBeyondImportSection.tsx` `BOOKMARKLET_HREF`

**Vector:** The bookmarklet redirects to:
```
https://diceroller.oldforest.net/ddb-callback?cobalt=<CobaltSessionValue>
```
Even after C1 is fixed (server-to-server transmission moves to POST body), this initial client-side redirect still puts the token in:
- The browser's address bar (visible on screen)
- Browser history on the D&D Beyond domain (the redirect happens from their page)

**Exact Fix:** Use `postMessage` instead of a redirect to avoid the token appearing in a URL at any point:

```javascript
// Bookmarklet (minified in DndBeyondImportSection.tsx):
javascript:(function(){
  var t = document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('CobaltSession='));
  if(!t){alert('CobaltSession cookie not found. Are you logged in to D&D Beyond?');return;}
  var val = t.split('=').slice(1).join('=');
  // Open the callback page first, then postMessage — no token in URL
  var w = window.open('https://diceroller.oldforest.net/ddb-callback','_blank');
  var attempts = 0;
  var send = setInterval(function(){
    if(++attempts > 20){clearInterval(send);return;}
    w.postMessage({type:'COBALT_TOKEN',token:val},'https://diceroller.oldforest.net');
  }, 250);
})();
```

```typescript
// DdbCallbackPage.tsx — replace useSearchParams() with postMessage listener
useEffect(() => {
  function onMessage(e: MessageEvent) {
    if (e.origin !== window.location.origin) return;
    if (e.data?.type !== 'COBALT_TOKEN') return;
    setCobaltToken(e.data.token as string);
  }
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}, []);
```

---

## Checklist

### Critical
- [x] **C1** Move CobaltSession from query param to POST body (backend + frontend + CDK route)
- [x] **C2** Add API Gateway stage-level throttling (200 burst / 100 rps via CfnStage escape hatch)

### High
- [x] **H1** Remove exception details from 500 response bodies — log with correlation ID only
- [x] **H2** Sanitize Cognito `email ^= "..."` filter input in admin `listUsers`
- [x] **H3** Validate CloudWatch filter pattern (length + complexity) before forwarding
- [x] **H4** Add CloudFront `ResponseHeadersPolicy` (CSP, HSTS, X-Frame-Options, referrer)

### Medium
- [x] **M1** Remove `console.log` lines that write D&D Beyond userId to CloudWatch
- [x] **M2** Add DynamoDB TTL to share records (90-day expiry) + enable TTL on table
- [x] **M3** Replace log-group wildcard ARN with explicit per-function log group ARNs
- [x] **M4** Add server-side notation length guard (and ideally `validate()`) on shared macro import

### Low
- [x] **L1** Strengthen Cognito password policy: minLength 12, requireSymbols true
- [x] **L2** Add `.env.local` to `.gitignore`, remove from git history, audit for exposure
- [x] **L3** Replace bookmarklet URL-redirect pattern with `postMessage` to keep token out of URLs
