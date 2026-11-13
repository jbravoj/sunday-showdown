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

## Develop

Requires Node 22.6+.

```sh
npm install
npm test        # game rules tests
npm run dev     # local site at http://localhost:5173/sunday-showdown/
npm run build
```

## Deploy

Every push to `main` runs the tests, builds, and publishes to GitHub Pages via
`.github/workflows/deploy.yml`.

One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Build phases

1. ✅ Project setup and deploy pipeline
2. Invite-only registration and rules acceptance
3. Admin approval and player management
4. Permanent season squares
5. Weekly board generation and publication
6. Payments and automatic board lock
7. Prize calculations and rollovers
8. Winner announcements and results history
9. Mobile and visual polish
10. Testing, security review, launch
