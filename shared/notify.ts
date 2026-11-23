// Emails the site sends: the admin's "someone wants in / someone joined"
// alerts, and the invite itself. Pure so they can be tested; the Cloud
// Functions do the sending.

export const SITE_URL = "https://sunday-showdown-fe8ec.web.app";

export interface Mail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function inviteLinkFor(code: string, base: string = SITE_URL): string {
  return `${base}/#/join/${code}`;
}

/** Dark card with a headline, a few lines and one button. */
function card(headline: string, lines: string[], button: { label: string; href: string }, footer: string): string {
  const body = lines.map((l) => `<p style="margin:0 0 12px;color:#C9D0F0;font-size:15px;line-height:1.5">${l}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0B0B2B;font-family:Inter,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#16153D;border:1px solid #2E2C66;border-radius:18px">
<tr><td style="padding:28px">
<p style="margin:0 0 6px;color:#FFB27A;font-size:12px;font-weight:800;letter-spacing:3px">SUNDAY SHOWDOWN</p>
<h1 style="margin:0 0 16px;color:#FFFFFF;font-size:24px;font-style:italic">${headline}</h1>
${body}
<p style="margin:20px 0 0"><a href="${button.href}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#FF7A1A;color:#0E0D2A;font-weight:800;text-decoration:none">${button.label}</a></p>
<p style="margin:20px 0 0;color:#7F86B5;font-size:12px">${footer}</p>
</td></tr></table></td></tr></table></body></html>`;
}

/** To the admin: someone signed up without a code and asked for one. */
export function inviteRequestMail(name: string, email: string, base: string = SITE_URL): Mail {
  const link = `${base}/#/invites`;
  return {
    subject: `${name} wants an invite to Sunday Showdown`,
    text: `${name} (${email}) signed up and asked for an invite code.\n\nSend one from Admin → Invites: ${link}`,
    html: card(
      `${escapeHtml(name)} wants in`,
      [`<b style="color:#fff">${escapeHtml(name)}</b> (${escapeHtml(email)}) signed up and asked for an invite code.`],
      { label: "Send an invite", href: link },
      "You get this because you're the Sunday Showdown admin.",
    ),
  };
}

/** To the admin: someone used an invite and is waiting on approval. */
export function playerJoinedMail(name: string, email: string, base: string = SITE_URL): Mail {
  const link = `${base}/#/players`;
  return {
    subject: `${name} joined Sunday Showdown`,
    text: `${name} (${email}) used an invite and joined. Once they accept the house rules, approve them in Admin → Players: ${link}`,
    html: card(
      `${escapeHtml(name)} joined`,
      [
        `<b style="color:#fff">${escapeHtml(name)}</b> (${escapeHtml(email)}) used an invite and is waiting on you.`,
        "Once they accept the house rules, approve them and give them a square.",
      ],
      { label: "Open Players", href: link },
      "You get this because you're the Sunday Showdown admin.",
    ),
  };
}

/** To the player: their invite code and link. */
export function inviteMail(code: string, name: string | null, expiresAt: Date, base: string = SITE_URL): Mail {
  const link = inviteLinkFor(code, base);
  const hi = name ? `${name}, you're in` : "You're invited";
  const until = expiresAt.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" });
  return {
    subject: "Your Sunday Showdown invite",
    text: `${hi}! Your invite code is ${code}.\n\nJoin here: ${link}\n\nThe code works once and expires ${until}. NO PAY • NO PLAY • NO OT`,
    html: card(
      escapeHtml(hi) + "!",
      [
        "Your invite code:",
        `<span style="display:inline-block;padding:10px 16px;border-radius:10px;background:#0B0B2B;color:#FFFFFF;font-size:24px;font-weight:800;letter-spacing:3px;font-family:Menlo,Consolas,monospace">${escapeHtml(code)}</span>`,
        `Tap the button, sign in (or create your account), and the code fills in for you. It works once and expires ${escapeHtml(until)}.`,
      ],
      { label: "Claim your seat", href: link },
      "NO PAY • NO PLAY • NO OT",
    ),
  };
}
