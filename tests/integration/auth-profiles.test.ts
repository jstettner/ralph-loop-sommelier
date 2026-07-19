import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "../../src/db/client";
import { tastingNotes, user, wines } from "../../src/db/schema";
import { auth } from "../../src/lib/auth";
import { GET as listProfiles, POST as createProfile } from "../../src/app/api/profiles/route";
import { DELETE as deleteProfile, PATCH as renameProfile } from "../../src/app/api/profiles/[id]/route";

type SessionFixture = { householdId: string; cookie: string };
const householdIds: string[] = [];

async function signUp(label: string): Promise<SessionFixture> {
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://localhost:3000" },
    body: JSON.stringify({ email: `${label}-${crypto.randomUUID()}@example.test`, password: "correct-horse", name: label }),
  }));
  expect(response.status).toBe(200);
  const body = await response.json() as { user: { id: string } };
  householdIds.push(body.user.id);
  const setCookie = response.headers.get("set-cookie") ?? "";
  const sessionCookie = setCookie.match(/(?:^|,\s*)([^=;,]*session[^=;,]*)=([^;]+)/i);
  expect(sessionCookie).not.toBeNull();
  return { householdId: body.user.id, cookie: `${sessionCookie?.[1]}=${sessionCookie?.[2]}` };
}

async function postProfile(fixture: SessionFixture, name: string) {
  return createProfile(new Request("http://localhost:3000/api/profiles", {
    method: "POST", headers: { cookie: fixture.cookie, "content-type": "application/json" },
    body: JSON.stringify({ name }),
  }));
}

async function profileId(response: Response): Promise<string> {
  const body = await response.json() as { profile: { id: string } };
  return body.profile.id;
}

afterAll(() => {
  for (const householdId of householdIds) db.delete(user).where(eq(user.id, householdId)).run();
});

describe("authenticated household profile API", () => {
  it("AC-AUTH-3 rejects unauthenticated protected API requests with JSON 401", async () => {
    const response = await listProfiles(new Request("http://localhost:3000/api/profiles"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("AC-PROF-4 enforces duplicate and maximum names, last-profile retention, and tasting-history retention", async () => {
    const household = await signUp("profile-contracts");
    const first = await postProfile(household, "Alex");
    expect(first.status).toBe(201);
    const firstId = await profileId(first);
    const duplicate = await postProfile(household, "alex");
    expect(duplicate.status).toBe(409);
    for (const name of ["Blair", "Casey", "Devon"]) expect((await postProfile(household, name)).status).toBe(201);
    expect((await postProfile(household, "Ellis")).status).toBe(409);

    db.insert(wines).values({ id: crypto.randomUUID(), name: `History ${crypto.randomUUID()}`, grapes: ["Gamay"], style: "red" }).returning().get();
    const wine = db.select().from(wines).orderBy(wines.createdAt).all().at(-1);
    expect(wine).toBeDefined();
    db.insert(tastingNotes).values({
      id: crypto.randomUUID(), householdId: household.householdId, profileId: firstId,
      wineId: wine?.id ?? "", nose: [], palate: { sweetness: null, acidity: null, tannin: null, alcohol: null, body: null, flavors: [] },
      verdict: "mixed",
    }).run();
    const historyDelete = await deleteProfile(new Request(`http://localhost:3000/api/profiles/${firstId}`, {
      method: "DELETE", headers: { cookie: household.cookie },
    }), { params: Promise.resolve({ id: firstId }) });
    expect(historyDelete.status).toBe(409);

    const single = await signUp("single-profile");
    const onlyId = await profileId(await postProfile(single, "Solo"));
    const lastDelete = await deleteProfile(new Request(`http://localhost:3000/api/profiles/${onlyId}`, {
      method: "DELETE", headers: { cookie: single.cookie },
    }), { params: Promise.resolve({ id: onlyId }) });
    expect(lastDelete.status).toBe(409);
  });

  it("AC-PROF-5 and AC-DATA-4 hide another household's profile ids for reads and writes", async () => {
    const owner = await signUp("owner");
    const outsider = await signUp("outsider");
    const ownedId = await profileId(await postProfile(owner, "Owner"));
    await postProfile(outsider, "Outsider");
    const rename = await renameProfile(new Request(`http://localhost:3000/api/profiles/${ownedId}`, {
      method: "PATCH", headers: { cookie: outsider.cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Stolen" }),
    }), { params: Promise.resolve({ id: ownedId }) });
    expect(rename.status).toBe(404);
    const removal = await deleteProfile(new Request(`http://localhost:3000/api/profiles/${ownedId}`, {
      method: "DELETE", headers: { cookie: outsider.cookie },
    }), { params: Promise.resolve({ id: ownedId }) });
    expect(removal.status).toBe(404);
  });
});
