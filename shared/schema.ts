import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const pingChecks = sqliteTable("ping_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull(),          // e.g. "www.b35jtlxp.com"
  timestamp: integer("timestamp").notNull(), // Unix ms
  status: text("status", { enum: ["up", "down"] }).notNull(),
  responseTime: integer("response_time"),
  statusCode: integer("status_code"),
  errorMessage: text("error_message"),
});

export const insertPingCheckSchema = createInsertSchema(pingChecks).omit({ id: true });
export type InsertPingCheck = z.infer<typeof insertPingCheckSchema>;
export type PingCheck = typeof pingChecks.$inferSelect;
