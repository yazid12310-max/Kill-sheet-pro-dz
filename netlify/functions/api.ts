import type { Config } from "@netlify/functions";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { killSheets, shifts, tripSheets } from "../../db/schema.js";

// Records are scoped to an anonymous per-browser device id (like the
// Android app's local Room database).
const DEVICE_RE = /^[a-zA-Z0-9-]{16,64}$/;

const json = (data: unknown, status = 200) => Response.json(data, { status });

export default async (req: Request) => {
  const deviceId = req.headers.get("x-device-id") ?? "";
  if (!DEVICE_RE.test(deviceId)) return json({ error: "Missing device id" }, 400);

  const url = new URL(req.url);
  const [, , resource, rawId] = url.pathname.split("/"); // /api/:resource/:id
  const id = rawId ? Number(rawId) : undefined;
  if (rawId && !Number.isInteger(id)) return json({ error: "Invalid id" }, 400);

  const body = req.method === "POST" || req.method === "PUT" ? await req.json().catch(() => null) : null;
  if ((req.method === "POST" || req.method === "PUT") && (!body || typeof body !== "object")) {
    return json({ error: "Invalid body" }, 400);
  }

  try {
    if (resource === "sheets") {
      const owned = (rid: number) => and(eq(killSheets.id, rid), eq(killSheets.deviceId, deviceId));
      if (req.method === "GET") {
        if (id) {
          const [row] = await db.select().from(killSheets).where(owned(id));
          return row ? json(row) : json({ error: "Not found" }, 404);
        }
        return json(await db.select().from(killSheets).where(eq(killSheets.deviceId, deviceId)).orderBy(desc(killSheets.createdAt)));
      }
      if (req.method === "POST") {
        const [row] = await db
          .insert(killSheets)
          .values({
            deviceId,
            name: String(body.name || "Kill Sheet").slice(0, 120),
            well: String(body.well || "").slice(0, 120),
            inputs: body.inputs ?? {},
            results: body.results ?? {},
          })
          .returning();
        return json(row, 201);
      }
      if (req.method === "DELETE" && id) {
        await db.delete(killSheets).where(owned(id));
        return json({ ok: true });
      }
    }

    if (resource === "trips") {
      const owned = (rid: number) => and(eq(tripSheets.id, rid), eq(tripSheets.deviceId, deviceId));
      if (req.method === "GET") {
        return json(await db.select().from(tripSheets).where(eq(tripSheets.deviceId, deviceId)).orderBy(desc(tripSheets.updatedAt)));
      }
      if (req.method === "POST") {
        const [row] = await db
          .insert(tripSheets)
          .values({
            deviceId,
            name: String(body.name || "Trip").slice(0, 120),
            settings: body.settings ?? {},
            entries: Array.isArray(body.entries) ? body.entries : [],
          })
          .returning();
        return json(row, 201);
      }
      if (req.method === "PUT" && id) {
        const [row] = await db
          .update(tripSheets)
          .set({
            name: String(body.name || "Trip").slice(0, 120),
            settings: body.settings ?? {},
            entries: Array.isArray(body.entries) ? body.entries : [],
            updatedAt: new Date(),
          })
          .where(owned(id))
          .returning();
        return row ? json(row) : json({ error: "Not found" }, 404);
      }
      if (req.method === "DELETE" && id) {
        await db.delete(tripSheets).where(owned(id));
        return json({ ok: true });
      }
    }

    if (resource === "shifts") {
      if (req.method === "GET") {
        return json(await db.select().from(shifts).where(eq(shifts.deviceId, deviceId)).orderBy(desc(shifts.createdAt)));
      }
      if (req.method === "POST") {
        const [row] = await db.insert(shifts).values({ deviceId, data: body }).returning();
        return json(row, 201);
      }
      if (req.method === "DELETE" && id) {
        await db.delete(shifts).where(and(eq(shifts.id, id), eq(shifts.deviceId, deviceId)));
        return json({ ok: true });
      }
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: "Server error" }, 500);
  }
};

export const config: Config = {
  path: ["/api/sheets", "/api/sheets/:id", "/api/trips", "/api/trips/:id", "/api/shifts", "/api/shifts/:id"],
};
