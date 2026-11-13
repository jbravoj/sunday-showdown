// One-time setup: make an account an admin.
//
//   1. Sign in on the site once with the account you want to make admin.
//   2. gcloud auth application-default login
//   3. cd functions && npm run grant-admin -- you@example.com
//   4. Sign out and back in on the site.

import { applicationDefault, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const email = process.argv[2];
if (!email) {
  console.error("Usage: npm run grant-admin -- you@example.com");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: "sunday-showdown-fe8ec" });
const auth = getAuth();
const user = await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid, { ...(user.customClaims ?? {}), admin: true });
console.log(`${email} (${user.uid}) is now an admin. Sign out and back in on the site.`);
