// Ways to pay the weekly buy-in, shown as buttons to players who haven't paid
// for an open week. Add another entry to show another button.
// Payments are still confirmed by the admin on Admin → Weeks.

export interface PaymentLink {
  label: string;
  href: string;
  /** Short line under the buttons, e.g. where the link works. */
  hint?: string;
}

export const PAYMENT_LINKS: readonly PaymentLink[] = [
  {
    label: "Pay $100 with Venmo",
    href: "venmo://paycharge?txn=pay&recipients=Jesus-Bravo-78&amount=100.00",
    hint: "Opens the Venmo app on your phone.",
  },
];
