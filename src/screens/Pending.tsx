import { RulesList } from "./Rules.tsx";

/** Registered and agreed to the rules; waiting on the admin (Phase 3). */
export default function Pending({ name }: { name: string }) {
  return (
    <>
      <section className="card panel">
        <h2>You're on the list, {name}</h2>
        <p>
          The admin will approve your seat and assign your square. This page updates on its own
          when that happens.
        </p>
      </section>
      <details className="card panel">
        <summary>House rules you agreed to</summary>
        <RulesList />
      </details>
    </>
  );
}
