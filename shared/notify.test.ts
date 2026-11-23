import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, inviteLinkFor, inviteMail, inviteRequestMail, playerJoinedMail } from "./notify.ts";

test("invite link matches the site's join route", () => {
  assert.equal(inviteLinkFor("K7QM4-XR9TB"), "https://sunday-showdown-fe8ec.web.app/#/join/K7QM4-XR9TB");
});

test("names are escaped in the HTML but kept plain in the subject", () => {
  const mail = inviteRequestMail("<b>Pelon</b>", "p@example.com");
  assert.equal(mail.subject, "<b>Pelon</b> wants an invite to Sunday Showdown");
  assert.ok(mail.html.includes("&lt;b&gt;Pelon&lt;/b&gt;"));
  assert.ok(!mail.html.includes("<b>Pelon</b>"));
  assert.ok(mail.text.includes("p@example.com"));
  assert.equal(escapeHtml(`"a" & 'b'`), "&quot;a&quot; &amp; &#39;b&#39;");
});

test("invite mail carries the code, the link and the expiry", () => {
  const mail = inviteMail("K7QM4-XR9TB", "Pelon", new Date("2026-12-07T18:00:00Z"));
  assert.ok(mail.text.includes("K7QM4-XR9TB"));
  assert.ok(mail.text.includes("#/join/K7QM4-XR9TB"));
  assert.ok(mail.text.includes("December 7"));
  assert.ok(mail.html.includes("Pelon, you&#39;re in"));
  assert.ok(inviteMail("K7QM4-XR9TB", null, new Date()).text.startsWith("You're invited"));
});

test("joined mail points at Players", () => {
  const mail = playerJoinedMail("Lonzy", "l@example.com");
  assert.equal(mail.subject, "Lonzy joined Sunday Showdown");
  assert.ok(mail.html.includes("#/players"));
});
