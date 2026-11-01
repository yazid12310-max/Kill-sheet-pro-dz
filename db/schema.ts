import { pgTable, serial, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

// Saved kill sheets (archive)
export const killSheets = pgTable(
  "kill_sheets",
  {
    id: serial().primaryKey(),
    deviceId: text("device_id").notNull(),
    name: text().notNull(),
    well: text().notNull().default(""),
    inputs: jsonb().notNull(),
    results: jsonb().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("kill_sheets_device_idx").on(t.deviceId)]
);

// Trip sheets: header settings + stand-by-stand entries
export const tripSheets = pgTable(
  "trip_sheets",
  {
    id: serial().primaryKey(),
    deviceId: text("device_id").notNull(),
    name: text().notNull(),
    settings: jsonb().notNull(),
    entries: jsonb().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("trip_sheets_device_idx").on(t.deviceId)]
);

// Driller / engineer shift log
export const shifts = pgTable(
  "shifts",
  {
    id: serial().primaryKey(),
    deviceId: text("device_id").notNull(),
    data: jsonb().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("shifts_device_idx").on(t.deviceId)]
);
