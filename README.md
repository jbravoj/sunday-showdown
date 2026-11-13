# Sunday Showdown

**NO PAY • NO PLAY • NO OT**

A private, invite-only Sunday Night Football squares board for 12 players.
React + TypeScript + Vite on GitHub Pages, with Firebase (Auth, Firestore,
Cloud Functions) for everything that touches money or fairness.

## How the game works

- 10×10 board, 5×5 checkerboard of 2×2 blocks. Each of the 12 players owns one
  white block (4 cells) for the whole season; the other 52 cells are black.
- Each week the 0–9 digits on the top and left axes are shuffled on the server.
- The winner is where the last digit of each team's **end-of-regulation** score
  crosses. Overtime never counts.
- A paid square wins the whole pot. A black or unpaid square means the pot rolls over.
- Prize = 5/6 of the week's contributions ($1,000 when all 12 pay $100);
  rollovers are added in full.

The rules live in [`shared/game.ts`](shared/game.ts) and are tested against the
group's real 2026 boards in [`shared/game.test.ts`](shared/game.test.ts).

## Joining (Phase 2)

1. The admin creates an invite on the **Invites** page and shares the link
   (`…/#/join/K7QM4-XR9TB`). Each invite works once, expires after 14 days, and
   can be locked to one email address. Only a hash of the code is stored.
2. The player opens the link and creates an account with email and password
   (or signs in). Forgotten passwords are reset by email. A verification email
   is sent on sign-up; it's only required for email-locked invites.
3. They pick the name for their square and redeem the invite. That creates
   their player record as **pending**. Registration closes at 12 seats.
4. They read and accept the house rules ([`shared/rules.ts`](shared/rules.ts)).
   Changing `RULES_VERSION` sends everyone back to re-accept.
5. They wait for the admin to approve them (Phase 3).

All writes go through Cloud Functions in [`functions/src`](functions/src/index.ts);
Firestore rules let a player read only their own record, and the admin read
players, invitations and the audit log. Every action is written to `auditLog`.

## Develop

Requires Node 22.6+.

```sh
npm install
npm test        # game rules tests
npm run dev     # local site at http://localhost:5173/sunday-showdown/
npm run build

# Against local emulators (needs the Firebase CLI: npm i -g firebase-tools)
npm --prefix functions install
npm run emulators         # terminal 1
npm run dev:emulators     # terminal 2
```

## Deploy

Every push to `main` runs the tests, builds, and publishes to GitHub Pages via
`.github/workflows/deploy.yml`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

Cloud Functions and Firestore rules are deployed from your machine:

```sh
npm --prefix functions install
firebase deploy --only functions,firestore
```

### One-time Firebase setup (Phase 2)

1. **Plan:** Cloud Functions need the Blaze (pay-as-you-go) plan. Usage for 12
   players stays inside the free allowance; set a budget alert anyway.
2. **Authentication → Sign-in method:** enable **Email/Password** (the first
   toggle only; leave "Email link" off). Google sign-in isn't used.
3. **Authentication → Settings → Authorized domains:** add `jbravoj.github.io`.
4. **Firestore:** create the database (production mode), then deploy as above.
5. **Make yourself admin:** sign in on the site once, then
   ```sh
   gcloud auth application-default login
   cd functions && npm run grant-admin -- you@example.com
   ```
   Sign out and back in; an **Invites** link appears.

## Build phases

1. ✅ Project setup and deploy pipeline
2. ✅ Invite-only registration and rules acceptance
3. Admin approval and player management
4. Permanent season squares
5. Weekly board generation and publication
6. Payments and automatic board lock
7. Prize calculations and rollovers
8. Winner announcements and results history
9. Mobile and visual polish
10. Testing, security review, launch
