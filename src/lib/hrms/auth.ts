import { cookies, headers } from "next/headers";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import type { Employee, User } from "@prisma/client";

export const SESSION_COOKIE = "mydesk_session";
const SESSION_TTL_MS = 7 * 24 * 3600 * 1000; // 7 days

// ── password hashing ─────────────────────────────────────────
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

// ── session lifecycle ────────────────────────────────────────
export async function createSession(userId: string): Promise<string> {
  const id = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { id, userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return id;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) {
    await db.session.deleteMany({ where: { id } });
  }
  jar.delete(SESSION_COOKIE);
}

export interface AuthContext {
  user: User;
  employee: Employee;
}

export async function getAuth(): Promise<AuthContext | null> {
  const jar = await cookies();
  const sessionId = jar.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const session = await db.session.findUnique({
    where: { id: sessionId },
    include: { user: { include: { employee: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.employee) return null;

  return { user: session.user, employee: session.user.employee };
}

// ── API response helpers ─────────────────────────────────────
export function unauthorized(message = "Authentication required") {
  return Response.json({ success: false, error: { code: "UNAUTHORIZED", message } }, { status: 401 });
}

export function forbidden(message = "You do not have permission to perform this action") {
  return Response.json({ success: false, error: { code: "FORBIDDEN", message } }, { status: 403 });
}

export function badRequest(code: string, message: string) {
  return Response.json({ success: false, error: { code, message } }, { status: 400 });
}

export function ok<T>(data: T) {
  return Response.json({ success: true, data });
}

export function serverError(err: unknown) {
  const message = err instanceof Error ? err.message : "Unexpected server error";
  return Response.json(
    { success: false, error: { code: "INTERNAL_ERROR", message } },
    { status: 500 }
  );
}

// ── RBAC ─────────────────────────────────────────────────────
export type Permission =
  | "desk.view"
  | "attendance.view_self"
  | "attendance.punch"
  | "attendance.regularize"
  | "leave.view_self"
  | "leave.apply"
  | "timesheet.create"
  | "expense.create"
  | "team.view"
  | "attendance.view_team"
  | "leave.approve"
  | "payroll.view_self"
  | "directory.view"
  | "admin.manage";

export function hasPermission(role: string, permission: Permission): boolean {
  const rolePerms: Record<string, Permission[]> = {
    EMPLOYEE: [
      "desk.view", "attendance.view_self", "attendance.punch", "attendance.regularize",
      "leave.view_self", "leave.apply", "timesheet.create", "expense.create",
      "payroll.view_self", "directory.view",
    ],
    MANAGER: [
      "desk.view", "attendance.view_self", "attendance.punch", "attendance.regularize",
      "leave.view_self", "leave.apply", "timesheet.create", "expense.create",
      "payroll.view_self", "directory.view", "team.view", "attendance.view_team", "leave.approve",
    ],
    HR: [
      "desk.view", "attendance.view_self", "attendance.punch", "attendance.regularize",
      "leave.view_self", "leave.apply", "timesheet.create", "expense.create",
      "payroll.view_self", "directory.view", "team.view", "attendance.view_team", "leave.approve",
    ],
    ADMIN: [
      "desk.view", "attendance.view_self", "attendance.punch", "attendance.regularize",
      "leave.view_self", "leave.apply", "timesheet.create", "expense.create",
      "payroll.view_self", "directory.view", "team.view", "attendance.view_team", "leave.approve",
      "admin.manage",
    ],
  };
  return (rolePerms[role] ?? rolePerms.EMPLOYEE).includes(permission);
}

export function isManagerOrAbove(role: string): boolean {
  return role === "MANAGER" || role === "HR" || role === "ADMIN";
}

// ── request metadata (device / audit) ────────────────────────
export async function requestDeviceInfo(): Promise<string> {
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  let browser = "Browser";
  if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Safari")) browser = "Safari";
  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";
  return `${browser} · ${os}`;
}

// ── audit logging ────────────────────────────────────────────
export async function audit(
  actor: { id: string; firstName: string; lastName: string },
  action: string,
  entity: string,
  entityId?: string,
  details?: string
) {
  await db.auditLog.create({
    data: {
      actorId: actor.id,
      actorName: `${actor.firstName} ${actor.lastName}`,
      action, entity, entityId: entityId ?? null, details: details ?? null,
    },
  });
}
