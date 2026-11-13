import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "firebase/functions";

// Firebase web config. These values identify the project; they are not
// secrets. Access is controlled by Firestore security rules, admin custom
// claims and server-side Cloud Functions.
const firebaseConfig = {
  apiKey: "AIzaSyAT2eWu8i2juMGNujrniiET_A-TWI1Gc9Q",
  authDomain: "sunday-showdown-fe8ec.firebaseapp.com",
  projectId: "sunday-showdown-fe8ec",
  storageBucket: "sunday-showdown-fe8ec.firebasestorage.app",
  messagingSenderId: "687372190996",
  appId: "1:687372190996:web:5801050140f79f45ebae01",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "us-central1");

// `VITE_USE_EMULATORS=true npm run dev` talks to `npm run emulators` instead of production.
if (import.meta.env.VITE_USE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}

// ---- Typed wrappers for the Cloud Functions in functions/src/index.ts ----

function callable<Req, Res>(name: string) {
  const fn = httpsCallable<Req, Res>(functions, name);
  return async (data: Req): Promise<Res> => (await fn(data)).data;
}

export const api = {
  createInvitation: callable<
    { note?: string; email?: string },
    { id: string; code: string; expiresAtMs: number }
  >("createInvitation"),
  revokeInvitation: callable<{ id: string }, { ok: true }>("revokeInvitation"),
  redeemInvitation: callable<{ code: string; displayName: string }, { ok: true }>(
    "redeemInvitation",
  ),
  acceptRules: callable<{ version: string }, { ok: true }>("acceptRules"),
  setPlayerStatus: callable<
    { uid: string; action: "approve" | "remove" | "reinstate" },
    { ok: true }
  >("setPlayerStatus"),
  renamePlayer: callable<{ uid: string; displayName: string }, { ok: true }>("renamePlayer"),
  manageSquares: callable<
    { op: "draw" } | { op: "clear"; squareId: string } | { op: "place"; squareId: string; uid: string },
    { ok: true; summary: string }
  >("manageSquares"),
};

/** Human-readable message from a Firebase or other error. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.replace(/^Firebase:\s*/, "");
  return "Something went wrong. Try again.";
}
