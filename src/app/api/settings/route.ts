import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  getAuth, ok, unauthorized, badRequest, serverError, audit,
  requestDeviceInfo, SESSION_COOKIE,
} from "@/lib/hrms/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

interface NotifPrefs {
  notifEmail: boolean;
  notifAnnouncement: boolean;
  notifWeekly: boolean;
}

const DEFAULT_PREFS: NotifPrefs = { notifEmail: true, notifAnnouncement: true, notifWeekly: false };

const patchSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  timeFormat: z.enum(["12h", "24h"]).optional(),
  dateOfBirthPublic: z.boolean().optional(),
  notifPrefs: z.object({
    notifEmail: z.boolean().optional(),
    notifAnnouncement: z.boolean().optional(),
    notifWeekly: z.boolean().optional(),
  }).optional(),
});

// ── widget prefs storage ─────────────────────────────────────
// Notification / widget preferences live in a `widgetPrefs` JSON column that is
// managed with raw SQL alongside the Prisma-managed Employee columns (Prisma
// ignores extra columns, so this needs no schema change).
async function ensurePrefsColumn(): Promise<void> {
  try {
    await db.$executeRawUnsafe(`ALTER TABLE Employee ADD COLUMN widgetPrefs TEXT`);
  } catch {
    // column already exists (or table altered concurrently) — safe to ignore
  }
}

async function readPrefs(employeeId: string): Promise<NotifPrefs> {
  try {
    const rows = await db.$queryRaw<{ widgetPrefs: string | null }[]>(
      Prisma.sql`SELECT widgetPrefs FROM Employee WHERE id = ${employeeId}`
    );
    const raw = rows[0]?.widgetPrefs;
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        const p = parsed as Record<string, unknown>;
        return {
          notifEmail: typeof p.notifEmail === "boolean" ? p.notifEmail : DEFAULT_PREFS.notifEmail,
          notifAnnouncement: typeof p.notifAnnouncement === "boolean" ? p.notifAnnouncement : DEFAULT_PREFS.notifAnnouncement,
          notifWeekly: typeof p.notifWeekly === "boolean" ? p.notifWeekly : DEFAULT_PREFS.notifWeekly,
        };
      }
    }
  } catch {
    // column missing yet — defaults
  }
  return { ...DEFAULT_PREFS };
}

async function writePrefs(employeeId: string, prefs: NotifPrefs): Promise<void> {
  await ensurePrefsColumn();
  await db.$executeRaw(
    Prisma.sql`UPDATE Employee SET widgetPrefs = ${JSON.stringify(prefs)} WHERE id = ${employeeId}`
  );
}

async function buildSettings(employeeId: string, userId: string) {
  const [emp, prefs] = await Promise.all([
    db.employee.findUnique({ where: { id: employeeId } }),
    readPrefs(employeeId),
  ]);
  const now = new Date();
  const sessions = await db.session.findMany({
    where: { userId, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const jar = await cookies();
  const currentSessionId = jar.get(SESSION_COOKIE)?.value ?? null;
  const currentDevice = await requestDeviceInfo();

  return {
    theme: emp?.theme ?? "system",
    timeFormat: emp?.timeFormat ?? "12h",
    dateOfBirthPublic: emp?.dateOfBirthPublic ?? true,
    notifPrefs: prefs,
    sessions: sessions.map((s) => ({
      id: s.id.slice(0, 8),
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      current: s.id === currentSessionId,
      device: s.id === currentSessionId ? currentDevice : "Earlier sign-in",
    })),
  };
}

export async function GET() {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const settings = await buildSettings(auth.employee.id, auth.user.id);
    return ok(settings);
  } catch (err) {
    return serverError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const emp = auth.employee;

    const body: unknown = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return badRequest("VALIDATION_ERROR", issue?.message ?? "Invalid settings payload.");
    }

    const { theme, timeFormat, dateOfBirthPublic, notifPrefs } = parsed.data;
    const data: { theme?: string; timeFormat?: string; dateOfBirthPublic?: boolean } = {};
    if (theme !== undefined) data.theme = theme;
    if (timeFormat !== undefined) data.timeFormat = timeFormat;
    if (dateOfBirthPublic !== undefined) data.dateOfBirthPublic = dateOfBirthPublic;
    if (Object.keys(data).length > 0) {
      await db.employee.update({ where: { id: emp.id }, data });
    }

    if (notifPrefs) {
      const existing = await readPrefs(emp.id);
      await writePrefs(emp.id, { ...existing, ...notifPrefs });
    }

    const changed = [
      theme !== undefined ? `theme=${theme}` : null,
      timeFormat !== undefined ? `timeFormat=${timeFormat}` : null,
      dateOfBirthPublic !== undefined ? `dateOfBirthPublic=${dateOfBirthPublic}` : null,
      notifPrefs !== undefined ? `notifPrefs=${JSON.stringify(notifPrefs)}` : null,
    ].filter(Boolean).join(", ");
    if (changed) {
      await audit(emp, "SETTINGS_UPDATED", "Employee", emp.id, changed);
    }

    const settings = await buildSettings(emp.id, auth.user.id);
    return ok(settings);
  } catch (err) {
    return serverError(err);
  }
}
