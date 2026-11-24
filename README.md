# Sunday Showdown

**NO PAY • NO PLAY • NO OT**

A private, invite-only Sunday Night Football squares board for 12 players.
React + TypeScript + Vite on Firebase Hosting, with Firebase (Auth, Firestore,
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
5. They wait for the admin to approve them on the **Players** page.

## Managing players (Phase 3)

The admin's **Players** page lists everyone who redeemed an invite, grouped as
waiting for approval, on the board, and removed, with a live seat count.

- **Approve** a pending player once they've accepted the house rules.
- **Remove** a player (two taps) to free their seat. Their account stays, so
  the history is kept.
- **Reinstate** a removed player back into the approval queue, if a seat is free.
- **Rename** the name shown on a player's square.

Only approved players see the board. Every action is written to `auditLog`.

## Season squares (Phase 4)

The board has 12 permanent squares, numbered **1–12** left to right, top to
bottom (the white 2×2 blocks). The season record lives at `seasons/2027`
([`shared/season.ts`](shared/season.ts) has the rules).

On the **Players** page the admin can:

- **Pick a player for a square.** If they already have a square, the two
  squares swap. Swaps are allowed any time, including mid-season.
- **Clear** a square. An open square that comes up rolls the pot over.
- **Random draw:** seats every approved player without a square into open
  squares at random (server-side `crypto.randomInt`), leaving filled ones alone.

Removing a player opens their square; renaming updates the board. Players see
the season board with their own square outlined, plus a "Your square" card.

## Weekly boards (Phase 5)

Admin → **Weeks**. Each regular-season week (1–18) has one board at
`seasons/2027/weeks/wNN`:

1. **Get the Sunday night matchup** pulls the game from ESPN's public NFL
   scoreboard ([`shared/schedule.ts`](shared/schedule.ts)): the Sunday game
   kicking off at 7 PM Eastern or later, NBC preferred. The **home team goes
   across the top**. Until the 2027 schedule is out, tick the testing box to
   use the 2026 schedule, or enter the teams by hand.
2. **Publish** shows the board to players, numbers still hidden.
3. **Lock & draw numbers** shuffles 0–9 for each axis on the server
   (`crypto.randomInt`) and freezes who sits in each square at that moment.
   Locked boards can't change or be deleted. (Phase 6 locks boards
   automatically once payments are in.)

Players see the latest published week on the Board tab and can flip back to
earlier weeks. Drafts are hidden from players by the Firestore rules.

## Invite requests, join alerts and emailed invites

- Sign-up asks for the name on their square, email and password, then shows
  **Verify your email** until they tap the link Firebase emails them (it
  checks on its own every few seconds; Resend is there too). Nothing else
  opens until they're verified, and the server refuses invite requests and
  invite codes from unverified accounts.
- Once verified, the join screen asks the admin for an invite automatically
  (unless they arrived with a code). That creates `inviteRequests/{uid}` and
  emails the admin.
- Every admin page shows a banner while someone is waiting: an invite request
  (→ Invites) or a player who joined and needs approval (→ Players). Joining
  also emails the admin.
- Admin → Invites lists requests with **Send invite**, which creates a
  one-time code locked to their verified email and emails it with the join
  link. The create form can email
  an invite too, and optionally lock it to that address.

Email goes out through a Gmail account with an app password. Set it up once:

```sh
firebase functions:secrets:set GMAIL_USER          # the Gmail address
firebase functions:secrets:set GMAIL_APP_PASSWORD  # 16-letter app password
```

Admin alerts go to `GMAIL_USER`. If Gmail refuses, the site still works; the
email is just skipped and logged.

## Season balances and "fully paid"

The season is 18 weeks × $100 = $1,800 per player. Admin → **Players** shows
each approved player's **paid in** and **left to pay** (players see their own
on the Your square card). **Mark fully paid** credits every remaining week:
the open week if they haven't paid it (else the week after) through week 18,
including weeks not posted yet. It's stored as `seasons/2027.prepaid[uid] =
firstWeek`; boards count those players as paid, and locking writes the credit
into the week's payments so locked weeks stand on their own. **Undo fully
paid** only affects weeks that haven't locked.

## Share image

A locked week on Admin → **Weeks** has **Share image**: a 1080×1080 "game
ticket" JPG of the board, drawn in the browser
([`src/shareImage.ts`](src/shareImage.ts)) with both teams' colors and their
official logos from the NFL schedule feed. Phones get the share sheet;
computers download the file.

## Simulator

Admin → **Simulator** runs any week end to end in the browser with 12 dummy
players: it pulls the real Sunday night game from the schedule (2026 or
2027), draws numbers, and applies the same rules as real boards. For a
finished game it uses the real end-of-regulation score (overtime ignored);
for a future game, type a score or tap **Random score**. Toggle who paid,
leave squares open, set a rollover, and chain weeks with **Next week** to
watch rollovers carry. Nothing is saved.

## Payments and auto-lock (Phase 6)

Payments are collected outside the site; the admin records them. On Admin →
**Weeks**, each board has a **Payments** list: tap **Mark paid** per player.
Payments are keyed by player, so a square swap keeps who paid.

Every 5 minutes the `autoLockBoards` scheduled function locks any board whose
kickoff is **30 minutes away or less** (`LOCK_LEAD_MINUTES` in
[`shared/week.ts`](shared/week.ts)), drafts included. Locking (automatic or
by hand) draws the numbers and freezes the squares, **who paid** and the
**prize** (5/6 of what was paid, plus any rollover). Payments can't change
after that: NO PAY • NO PLAY. Unpaid squares show **NOT PAID** on the locked
board, and players see their own paid status on the "Your square" card.

All writes go through Cloud Functions in [`functions/src`](functions/src/index.ts);
Firestore rules let a player read only their own record, and the admin read
players, invitations and the audit log. Every action is written to `auditLog`.

## Develop

Requires Node 22.6+.

```sh
npm install
npm test        # game rules tests
npm run dev     # local site at http://localhost:5173/
npm run build

# Against local emulators (needs the Firebase CLI: npm i -g firebase-tools)
npm --prefix functions install
npm run emulators         # terminal 1
npm run dev:emulators     # terminal 2
```

## Deploy

The site is served by **Firebase Hosting** at https://sunday-showdown-fe8ec.web.app
(plus the custom domain once it's connected). Every push to `main` runs the
tests, builds, and deploys to Hosting via `.github/workflows/deploy.yml`.

One-time setup for automatic deploys (creates the
`FIREBASE_SERVICE_ACCOUNT_SUNDAY_SHOWDOWN_FE8EC` repo secret; answer **No**
when asked to overwrite the workflow):

```sh
npx firebase-tools init hosting:github --project sunday-showdown-fe8ec
```

Deploy by hand (builds first):

```sh
npx firebase-tools deploy --only hosting --project sunday-showdown-fe8ec
```

Cloud Functions and Firestore rules are deployed from your machine:

```sh
npm --prefix functions install
npx firebase-tools deploy --only functions,firestore --project sunday-showdown-fe8ec
```

### Custom domain

Firebase console → **Hosting → Add custom domain**, then add the TXT and A
records it shows at the domain registrar. HTTPS is set up automatically. Add
the domain under **Authentication → Settings → Authorized domains** so sign-in
works there.

### One-time Firebase setup (Phase 2)

1. **Plan:** Cloud Functions need the Blaze (pay-as-you-go) plan. Usage for 12
   players stays inside the free allowance; set a budget alert anyway.
2. **Authentication → Sign-in method:** enable **Email/Password** (the first
   toggle only; leave "Email link" off). Google sign-in isn't used.
3. **Authentication → Settings → Authorized domains:** `sunday-showdown-fe8ec.web.app` is there by default; add your custom domain.
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
3. ✅ Admin approval and player management
4. ✅ Permanent season squares
5. ✅ Weekly board generation and publication
6. ✅ Payments and automatic board lock
7. Prize calculations and rollovers
8. Winner announcements and results history
9. Mobile and visual polish
10. Testing, security review, launch
