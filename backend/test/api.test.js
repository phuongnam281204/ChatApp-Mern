import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";

import { createApp } from "../src/app.js";
import Conversation from "../src/models/conversation.model.js";
import Message from "../src/models/message.model.js";
import { createAndBroadcastMessage } from "../src/lib/realtime.js";

let mongo;
let app;
const emitted = [];

// Records socket events and room changes instead of sending them.
const fakeIO = {
  to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }),
  in: (room) => ({
    socketsLeave: (left) => emitted.push({ room, event: "socketsLeave", payload: String(left) }),
    disconnectSockets: () => emitted.push({ room, event: "disconnectSockets" }),
  }),
};

const ORIGIN = "http://localhost:5173";

beforeAll(async () => {
  process.env.JWT_SECRET = "test-secret";
  process.env.NODE_ENV = "test";
  process.env.CLIENT_ORIGIN = ORIGIN;
  process.env.DISABLE_RATE_LIMIT = "1"; // the rate-limit tests switch it back on
  delete process.env.SMTP_HOST;
  delete process.env.CLOUDINARY_URL;
  delete process.env.CLOUDINARY_CLOUD_NAME;
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  // Build unique indexes (email) so duplicate handling is tested for real.
  await Promise.all(mongoose.modelNames().map((name) => mongoose.model(name).init()));
  app = createApp();
  app.set("io", fakeIO);
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  emitted.length = 0;
  // Clear documents but keep indexes (dropDatabase would remove them).
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

let seq = 0;
async function signup(name) {
  const agent = request.agent(app);
  seq += 1;
  const res = await agent
    .post("/api/auth/signup")
    .send({ username: name, email: `u${seq}@example.test`, password: "secret123" });
  expect(res.status).toBe(201);
  return { agent, id: String(res.body.user.id), email: `u${seq}@example.test` };
}

async function direct(a, b) {
  const res = await a.agent.post("/api/conversations/direct").send({ userId: b.id });
  return Conversation.findById(res.body.conversation.id);
}

async function say(convo, user, text) {
  return createAndBroadcastMessage(fakeIO, convo, user.id, { type: "text", text });
}

describe("messages", () => {
  it("lets the sender edit, marks it edited and broadcasts the change", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    const msg = await say(convo, a, "chao");

    const res = await a.agent.patch(`/api/messages/${msg.id}`).send({ text: "chào" });
    expect(res.status).toBe(200);
    expect(res.body.message.text).toBe("chào");
    expect(res.body.message.editedAt).toBeTruthy();
    expect(emitted.some((e) => e.event === "message:updated")).toBe(true);

    const fresh = await Conversation.findById(convo._id);
    expect(fresh.lastMessagePreview).toBe("chào");
  });

  it("refuses to edit someone else's message", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    const msg = await say(convo, a, "hello");

    const res = await b.agent.patch(`/api/messages/${msg.id}`).send({ text: "hacked" });
    expect(res.status).toBe(403);
  });

  it("revokes for everyone within 24h and hides the content", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    const msg = await say(convo, a, "bí mật");

    expect((await b.agent.delete(`/api/messages/${msg.id}?scope=all`)).status).toBe(403);

    const res = await a.agent.delete(`/api/messages/${msg.id}?scope=all`);
    expect(res.status).toBe(200);
    expect(res.body.message.revoked).toBe(true);
    expect(res.body.message.text).toBe("");

    const list = await b.agent.get(`/api/conversations/${convo._id}/messages`);
    expect(list.body.messages[0].revoked).toBe(true);
    expect(list.body.messages[0].text).toBe("");
    expect((await Conversation.findById(convo._id)).lastMessagePreview).toBe(
      "Tin nhắn đã bị thu hồi",
    );
  });

  it("does not revoke messages older than 24h", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    const msg = await say(convo, a, "cũ");
    // Raw collection write: Mongoose treats createdAt as immutable.
    await Message.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(String(msg.id)) },
      { $set: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } },
    );

    const res = await a.agent.delete(`/api/messages/${msg.id}?scope=all`);
    expect(res.status).toBe(400);
  });

  it("deletes for me only", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    const msg = await say(convo, a, "xin chào");

    expect((await b.agent.delete(`/api/messages/${msg.id}?scope=me`)).status).toBe(200);
    const bList = await b.agent.get(`/api/conversations/${convo._id}/messages`);
    const aList = await a.agent.get(`/api/conversations/${convo._id}/messages`);
    expect(bList.body.messages).toHaveLength(0);
    expect(aList.body.messages).toHaveLength(1);
  });

  it("pages older messages with a cursor", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    for (let i = 0; i < 5; i += 1) await say(convo, a, `tin ${i}`);

    const first = await a.agent.get(`/api/conversations/${convo._id}/messages?limit=3`);
    expect(first.body.messages.map((m) => m.text)).toEqual(["tin 2", "tin 3", "tin 4"]);
    expect(first.body.hasMore).toBe(true);

    const cursor = encodeURIComponent(first.body.nextCursor);
    const second = await a.agent.get(
      `/api/conversations/${convo._id}/messages?limit=3&cursor=${cursor}`,
    );
    expect(second.body.messages.map((m) => m.text)).toEqual(["tin 0", "tin 1"]);
    expect(second.body.hasMore).toBe(false);
  });

  it("searches text and skips revoked messages", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    await say(convo, a, "họp lúc 9h");
    const revoked = await say(convo, a, "họp hủy");
    await a.agent.delete(`/api/messages/${revoked.id}?scope=all`);

    const res = await b.agent.get(`/api/conversations/${convo._id}/messages/search?q=họp`);
    expect(res.body.messages.map((m) => m.text)).toEqual(["họp lúc 9h"]);
  });

  it("counts unread messages per viewer", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    await say(convo, a, "1");
    await say(convo, a, "2");

    const bRes = await b.agent.get("/api/conversations");
    const aRes = await a.agent.get("/api/conversations");
    expect(bRes.body.conversations[0].unreadCount).toBe(2);
    expect(aRes.body.conversations[0].unreadCount).toBe(0);
  });

  it("rejects attachments when storage is missing or the file type is blocked", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);

    const blocked = await a.agent
      .post(`/api/conversations/${convo._id}/attachments`)
      .attach("file", Buffer.from("MZ"), "setup.exe");
    expect(blocked.status).toBe(400);

    const noStorage = await a.agent
      .post(`/api/conversations/${convo._id}/attachments`)
      .attach("file", Buffer.from("hello"), "note.txt");
    expect(noStorage.status).toBe(503);
  });

  it("validates voice clips before touching storage", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    const url = `/api/conversations/${convo._id}/attachments`;
    const clip = { filename: "voice.webm", contentType: "audio/webm" };

    const notAudio = await a.agent.post(url).field("kind", "audio").field("duration", "3")
      .attach("file", Buffer.from("x"), { filename: "x.txt", contentType: "text/plain" });
    expect(notAudio.status).toBe(400);

    const noDuration = await a.agent.post(url).field("kind", "audio")
      .attach("file", Buffer.from("x"), clip);
    expect(noDuration.status).toBe(400);

    const tooLong = await a.agent.post(url).field("kind", "audio").field("duration", "300")
      .attach("file", Buffer.from("x"), clip);
    expect(tooLong.status).toBe(400);

    const ok = await a.agent.post(url).field("kind", "audio").field("duration", "4.2")
      .attach("file", Buffer.from("x"), clip);
    expect(ok.status).toBe(503); // valid clip; storage is off in tests
  });

  it("shows voice messages as [Tin nhắn thoại] and refuses to edit them", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    const msg = await createAndBroadcastMessage(fakeIO, convo, a.id, {
      type: "audio",
      fileUrl: "https://res.cloudinary.com/x/video/upload/v1/memo-chat/voice/a.mp3",
      duration: 4.2,
    });
    expect(msg.duration).toBe(4.2);
    expect((await Conversation.findById(convo._id)).lastMessagePreview).toBe("[Tin nhắn thoại]");
    expect((await a.agent.patch(`/api/messages/${msg.id}`).send({ text: "x" })).status).toBe(400);
    expect((await a.agent.delete(`/api/messages/${msg.id}?scope=all`)).body.message.duration).toBeUndefined();
  });

  it("delivers voice as mp3", async () => {
    const { asMp3Url } = await import("../src/lib/uploads.js");
    expect(asMp3Url("https://res.cloudinary.com/c/video/upload/v1/memo-chat/voice/a_x1.webm"))
      .toBe("https://res.cloudinary.com/c/video/upload/v1/memo-chat/voice/a_x1.mp3");
  });
});

describe("groups", () => {
  async function group() {
    const owner = await signup("Trưởng");
    const b = await signup("Bình");
    const c = await signup("Chi");
    const d = await signup("Dũng");
    const res = await owner.agent
      .post("/api/conversations/group")
      .send({ name: "Nhóm", memberIds: [b.id, c.id, d.id] });
    expect(res.status).toBe(201);
    return { owner, b, c, d, id: res.body.conversation.id };
  }

  it("only the creator removes members or renames", async () => {
    const { owner, b, c, id } = await group();
    expect((await b.agent.delete(`/api/conversations/${id}/members/${c.id}`)).status).toBe(403);
    expect((await b.agent.patch(`/api/conversations/${id}`).send({ name: "X" })).status).toBe(403);

    expect((await owner.agent.delete(`/api/conversations/${id}/members/${c.id}`)).status).toBe(200);
    expect((await owner.agent.patch(`/api/conversations/${id}`).send({ name: "Mới" })).status).toBe(200);

    const convo = await Conversation.findById(id);
    expect(convo.members.map(String)).not.toContain(c.id);
    expect(convo.name).toBe("Mới");
    expect(emitted.some((e) => e.event === "conversation:removed" && e.room === `user:${c.id}`)).toBe(true);
  });

  it("any member can add people and leave; creator leaving hands over the group", async () => {
    const { owner, b, id } = await group();
    const e = await signup("Em");
    expect((await b.agent.post(`/api/conversations/${id}/members`).send({ memberIds: [e.id] })).status).toBe(200);

    expect((await b.agent.delete(`/api/conversations/${id}/members/${b.id}`)).status).toBe(200);
    expect((await owner.agent.delete(`/api/conversations/${id}/members/${owner.id}`)).status).toBe(200);

    const convo = await Conversation.findById(id);
    expect(convo.members.map(String)).not.toContain(owner.id);
    expect(convo.members.map(String)).toContain(String(convo.createdBy));

    const system = await Message.find({ conversationId: id, type: "system" });
    expect(system.map((m) => m.text).join("|")).toMatch(/đã rời nhóm/);
  });

  it("mute is per member and does not reorder the list", async () => {
    const { b, id } = await group();
    const before = (await Conversation.findById(id)).updatedAt;
    const res = await b.agent.post(`/api/conversations/${id}/mute`).send({ muted: true });
    expect(res.body.conversation.mutedByMe).toBe(true);
    expect((await Conversation.findById(id)).updatedAt.getTime()).toBe(before.getTime());
  });
});

describe("account", () => {
  it("changes password only with the current one", async () => {
    const a = await signup("An");
    const wrong = await a.agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "nope", newPassword: "newpass1" });
    expect(wrong.status).toBe(400);

    const ok = await a.agent
      .post("/api/auth/change-password")
      .send({ currentPassword: "secret123", newPassword: "newpass1" });
    expect(ok.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: a.email, password: "newpass1" });
    expect(login.status).toBe(200);
  });

  it("renaming keeps the avatar", async () => {
    const a = await signup("An");
    await a.agent.put("/api/users/me").send({ avatarUrl: "https://example.test/a.png" });
    const res = await a.agent.put("/api/users/me").send({ username: "An Nguyễn" });
    expect(res.body.user.username).toBe("An Nguyễn");
    expect(res.body.user.avatarUrl).toBe("https://example.test/a.png");
  });

  it("forgot password without SMTP returns a dev token and resets", async () => {
    const a = await signup("An");
    const res = await request(app).post("/api/auth/forgot-password").send({ email: a.email });
    expect(res.body.emailSent).toBe(false);
    expect(res.body.resetToken).toBeTruthy();

    const reset = await request(app)
      .post("/api/auth/reset-password")
      .send({ token: res.body.resetToken, password: "another1" });
    expect(reset.status).toBe(200);

    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "nobody@example.test" });
    expect(unknown.status).toBe(200);
    expect(unknown.body.resetToken).toBeUndefined();
  });

  it("escapes regex characters in user search", async () => {
    const a = await signup("An");
    const res = await a.agent.get("/api/users/search?q=(.*");
    expect(res.status).toBe(200);
  });
});

describe("security fixes", () => {
  it("validates sign-up input and answers 409 for a duplicate email race", async () => {
    const send = (body) => request(app).post("/api/auth/signup").send(body);
    expect((await send({ username: "a", email: "x@example.test", password: "secret1" })).status).toBe(400);
    expect((await send({ username: "An", email: "not-an-email", password: "secret1" })).status).toBe(400);
    expect((await send({ username: "An", email: "x@example.test", password: "123" })).status).toBe(400);

    const both = await Promise.all([1, 2].map(() =>
      send({ username: "Dup", email: "dup@example.test", password: "secret1" })));
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it("answers 400 for malformed JSON", async () => {
    const res = await request(app).post("/api/auth/login")
      .set("Content-Type", "application/json").send("{bad json");
    expect(res.status).toBe(400);
  });

  it("sets cookies that work over http, are Secure over https, and match the token lifetime", async () => {
    const cookieFor = async (remember) => {
      const res = await request(app).post("/api/auth/signup")
        .send({ username: "Cookie", email: `c${remember}${Date.now()}@example.test`, password: "secret1", remember });
      return res.headers["set-cookie"][0];
    };
    const exp = (cookie) => {
      const token = cookie.split(";")[0].split("=")[1];
      const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      return Math.round((p.exp - p.iat) / 86400);
    };

    const http = await cookieFor(true);
    expect(http).toMatch(/SameSite=Lax/);
    expect(http).not.toMatch(/Secure/);
    expect(http).toMatch(/Max-Age=2592000/);
    expect(exp(http)).toBe(30);
    expect(exp(await cookieFor(false))).toBe(1);

    process.env.CLIENT_ORIGIN = "https://chat.example.test";
    try {
      expect(await cookieFor(false)).toMatch(/Secure/);
    } finally {
      process.env.CLIENT_ORIGIN = ORIGIN;
    }
  });

  it("signs out other devices after a password change, keeps this one", async () => {
    const a = await signup("An");
    const other = request.agent(app);
    await other.post("/api/auth/login").send({ email: a.email, password: "secret123" });
    expect((await other.get("/api/users/me")).status).toBe(200);

    const res = await a.agent.post("/api/auth/change-password")
      .send({ currentPassword: "secret123", newPassword: "newpass1" });
    expect(res.status).toBe(200);
    expect(emitted.some((e) => e.event === "disconnectSockets" && e.room === `user:${a.id}`)).toBe(true);

    expect((await other.get("/api/users/me")).status).toBe(401);
    expect((await a.agent.get("/api/users/me")).status).toBe(200);
  });

  it("signs out every device after a password reset", async () => {
    const a = await signup("An");
    const forgot = await request(app).post("/api/auth/forgot-password").send({ email: a.email });
    await request(app).post("/api/auth/reset-password").send({ token: forgot.body.resetToken, password: "another1" });
    expect((await a.agent.get("/api/users/me")).status).toBe(401);
  });

  it("rate-limits login attempts and reset emails", async () => {
    delete process.env.DISABLE_RATE_LIMIT;
    const { resetRateLimits } = await import("../src/lib/rateLimit.js");
    resetRateLimits();
    try {
      const a = await signup("An");
      const tries = [];
      for (let i = 0; i < 11; i += 1) {
        tries.push((await request(app).post("/api/auth/login").send({ email: a.email, password: "wrong" })).status);
      }
      expect(tries.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(tries[10]).toBe(429);

      const resets = [];
      for (let i = 0; i < 4; i += 1) {
        resets.push((await request(app).post("/api/auth/forgot-password").send({ email: a.email })).status);
      }
      expect(resets).toEqual([200, 200, 200, 429]);
    } finally {
      process.env.DISABLE_RATE_LIMIT = "1";
      resetRateLimits();
    }
  });

  it("blocks state-changing requests from another site", async () => {
    const evil = await request(app).post("/api/auth/login")
      .set("Origin", "https://evil.example").send({ email: "x@example.test", password: "x" });
    expect(evil.status).toBe(403);
    const ours = await request(app).post("/api/auth/login")
      .set("Origin", ORIGIN).send({ email: "x@example.test", password: "x" });
    expect(ours.status).toBe(401);
  });

  it("creates one direct chat even when asked twice at once", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const both = await Promise.all([1, 2].map(() =>
      a.agent.post("/api/conversations/direct").send({ userId: b.id })));
    expect(new Set(both.map((r) => r.body.conversation.id)).size).toBe(1);
    expect(await Conversation.countDocuments({ type: "direct" })).toBe(1);
  });

  it("takes removed members out of the group's socket room", async () => {
    const owner = await signup("Trưởng");
    const b = await signup("Bình");
    const c = await signup("Chi");
    const g = await owner.agent.post("/api/conversations/group").send({ name: "N", memberIds: [b.id, c.id] });
    await owner.agent.delete(`/api/conversations/${g.body.conversation.id}/members/${c.id}`);
    expect(emitted.some((e) => e.event === "socketsLeave" && e.room === `user:${c.id}`)).toBe(true);
  });

  it("search needs 2+ characters, matches emails only in full, and masks the rest", async () => {
    const a = await signup("An");
    const b = await signup("Bình Minh");
    expect((await a.agent.get("/api/users/search?q=B")).body.users).toHaveLength(0);

    const byName = await a.agent.get(`/api/users/search?q=${encodeURIComponent("Bình")}`);
    expect(byName.body.users[0].email).toMatch(/^u\d\*\*\*@example\.test$/);

    expect((await a.agent.get("/api/users/search?q=example")).body.users).toHaveLength(0);
    const byEmail = await a.agent.get(`/api/users/search?q=${encodeURIComponent(b.email)}`);
    expect(byEmail.body.users[0].email).toBe(b.email);
  });

  it("revoking a file message removes its link", async () => {
    const a = await signup("An");
    const b = await signup("Bình");
    const convo = await direct(a, b);
    const msg = await createAndBroadcastMessage(fakeIO, convo, a.id, {
      type: "image",
      fileUrl: "https://res.cloudinary.com/c/image/upload/v1/memo-chat/attachments/x.png",
      fileName: "x.png",
    });
    await a.agent.delete(`/api/messages/${msg.id}?scope=all`);
    expect((await Message.findById(msg.id)).fileUrl).toBeUndefined();

    const { parseCloudinaryUrl } = await import("../src/lib/uploads.js");
    expect(parseCloudinaryUrl("https://res.cloudinary.com/c/image/upload/v12/memo-chat/a/x.png"))
      .toEqual({ resourceType: "image", publicId: "memo-chat/a/x" });
    expect(parseCloudinaryUrl("https://res.cloudinary.com/c/raw/upload/v12/memo-chat/a/doc_ab.txt"))
      .toEqual({ resourceType: "raw", publicId: "memo-chat/a/doc_ab.txt" });
    expect(parseCloudinaryUrl("https://res.cloudinary.com/c/video/upload/v12/memo-chat/voice/v1.mp3"))
      .toEqual({ resourceType: "video", publicId: "memo-chat/voice/v1" });
  });
});
