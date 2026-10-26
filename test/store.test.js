/**
 * Unit tests for store.js — pure logic, no network, no credentials.
 *   npm run test:store
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Point the store at a throwaway file before requiring it.
const TMP = path.join(os.tmpdir(), `routes-test-${process.pid}.json`);
process.env.STORE_FILE = TMP;
// Short staleness window so the "steal a stale claim" test doesn't need to
// actually wait 10 minutes.
process.env.STALE_CLAIM_MS = "50";

const store = require("../store");

test.beforeEach(() => {
  try {
    fs.unlinkSync(TMP);
  } catch {}
});

test.after(() => {
  try {
    fs.unlinkSync(TMP);
  } catch {}
});

test("toChatId normalises a 10-digit number to India chat_id form", () => {
  assert.equal(store.toChatId("9876543210"), "919876543210@c.us");
});

test("toChatId strips spaces, plus signs and punctuation", () => {
  assert.equal(store.toChatId("+91 98765-43210"), "919876543210@c.us");
});

test("toChatId leaves an already country-coded number alone", () => {
  assert.equal(store.toChatId("919876543210"), "919876543210@c.us");
});

test("toChatId throws on an empty / non-numeric phone", () => {
  assert.throws(() => store.toChatId("abc"), /empty phone/);
});

test("addRoute inserts a new route and it is findable both ways", async () => {
  const route = await store.addRoute({
    customerName: "Ramesh Patidar",
    customerPhone: "919876543210",
    spaceName: "spaces/AAA",
    department: "solar",
  });

  assert.equal(route.chatId, "919876543210@c.us");
  assert.equal(route.customerName, "Ramesh Patidar");
  assert.ok(route.createdAt, "createdAt is stamped");

  assert.deepEqual(await store.bySpace("spaces/AAA"), route);
  assert.deepEqual(await store.byChatId("919876543210@c.us"), route);
  assert.equal((await store.all()).length, 1);
});

test("addRoute updates in place when the same number is provisioned again", async () => {
  await store.addRoute({
    customerName: "Old Name",
    customerPhone: "919876543210",
    spaceName: "spaces/OLD",
    department: "solar",
  });

  const updated = await store.addRoute({
    customerName: "New Name",
    customerPhone: "919876543210",
    spaceName: "spaces/NEW",
    department: "agri",
  });

  assert.equal((await store.all()).length, 1, "no duplicate row");
  assert.equal(updated.customerName, "New Name");
  assert.equal(updated.spaceName, "spaces/NEW");
  assert.equal(updated.department, "agri");
  assert.equal(await store.bySpace("spaces/OLD"), null, "old space no longer maps");
});

test("lookups return null when nothing matches", async () => {
  assert.equal(await store.bySpace("spaces/nope"), null);
  assert.equal(await store.byChatId("910000000000@c.us"), null);
});

// ---- claimPhone / finalizeRoute (duplicate-space race prevention) --------

test("claimPhone wins a brand-new phone and finalizeRoute attaches the real space", async () => {
  const claim = await store.claimPhone({
    customerName: "Ramesh Patidar",
    customerPhone: "919876543210",
  });
  assert.equal(claim.claimed, true);
  assert.equal(claim.chatId, "919876543210@c.us");

  // A pending claim already blocks lookups like a real route would, so the
  // sheet-sync "does this phone already have a route" check skips it too.
  const pending = await store.byChatId(claim.chatId);
  assert.match(pending.spaceName, /^_pending_/);

  const route = await store.finalizeRoute(claim.chatId, {
    spaceName: "spaces/AAA",
    department: "solar",
  });
  assert.equal(route.spaceName, "spaces/AAA");
  assert.equal((await store.byChatId(claim.chatId)).spaceName, "spaces/AAA");
});

test("a second claimPhone for the same phone is refused while the first is still pending", async () => {
  const first = await store.claimPhone({
    customerName: "Ramesh Patidar",
    customerPhone: "919876543210",
  });
  assert.equal(first.claimed, true);

  // Simulates a second, overlapping provision() attempt for the same
  // customer (e.g. two racing /sync runs) before the first has finished.
  const second = await store.claimPhone({
    customerName: "Ramesh Patidar",
    customerPhone: "919876543210",
  });
  assert.equal(second.claimed, false);
  assert.match(second.existing.spaceName, /^_pending_/);
  assert.equal((await store.all()).length, 1, "only one row, no duplicate");
});

test("claimPhone is refused once a route is already finalized", async () => {
  const claim = await store.claimPhone({
    customerName: "Ramesh Patidar",
    customerPhone: "919876543210",
  });
  await store.finalizeRoute(claim.chatId, { spaceName: "spaces/AAA" });

  const again = await store.claimPhone({
    customerName: "Ramesh Patidar",
    customerPhone: "919876543210",
  });
  assert.equal(again.claimed, false);
  assert.equal(again.existing.spaceName, "spaces/AAA");
});

test("a stale pending claim (crashed attempt) can be reclaimed and retried", async () => {
  const first = await store.claimPhone({
    customerName: "Ramesh Patidar",
    customerPhone: "919876543210",
  });
  assert.equal(first.claimed, true);

  // Still fresh — a second attempt right away is refused.
  const tooSoon = await store.claimPhone({
    customerName: "Ramesh Patidar",
    customerPhone: "919876543210",
  });
  assert.equal(tooSoon.claimed, false);

  // Wait past STALE_CLAIM_MS (50ms in this test file) — the original
  // attempt is assumed crashed, so a fresh one may take over.
  await new Promise((r) => setTimeout(r, 80));
  const retry = await store.claimPhone({
    customerName: "Ramesh Patidar",
    customerPhone: "919876543210",
  });
  assert.equal(retry.claimed, true);
  assert.equal((await store.all()).length, 1, "reclaimed in place, no duplicate row");
});
