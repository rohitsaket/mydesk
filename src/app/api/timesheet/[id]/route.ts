import { db } from "@/lib/db";
import { getAuth, ok, unauthorized, badRequest, serverError, audit } from "@/lib/hrms/auth";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  project: z.string().trim().min(1).max(100).optional(),
  taskName: z.string().trim().max(150).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  startMinutes: z.number().int().min(0).max(1440).optional(),
  endMinutes: z.number().int().min(0).max(1440).optional(),
  billable: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const { id } = await params;

    const entry = await db.timesheetEntry.findFirst({ where: { id, employeeId: auth.employee.id } });
    if (!entry) return badRequest("NOT_FOUND", "Timesheet entry not found.");
    if (entry.status !== "DRAFT") {
      return badRequest("NOT_EDITABLE", "Only draft entries can be edited. This entry has already been submitted.");
    }

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid timesheet payload.");
    }
    const data = parsed.data;

    const startMinutes = data.startMinutes ?? entry.startMinutes;
    const endMinutes = data.endMinutes ?? entry.endMinutes;
    if (endMinutes <= startMinutes) {
      return badRequest("VALIDATION_ERROR", "End time must be after start time.");
    }

    const updated = await db.timesheetEntry.update({
      where: { id: entry.id },
      data: {
        ...(data.project !== undefined ? { project: data.project } : {}),
        ...(data.taskName !== undefined ? { taskName: data.taskName?.trim() ? data.taskName : null } : {}),
        ...(data.description !== undefined ? { description: data.description?.trim() ? data.description : null } : {}),
        ...(data.startMinutes !== undefined ? { startMinutes } : {}),
        ...(data.endMinutes !== undefined ? { endMinutes } : {}),
        ...(data.billable !== undefined ? { billable: data.billable } : {}),
        minutes: endMinutes - startMinutes,
      },
    });

    await audit(auth.employee, "TIMESHEET_ENTRY_UPDATED", "TimesheetEntry", updated.id, `${updated.project} · ${Math.round(updated.minutes / 6) / 10}h`);
    return ok({
      id: updated.id,
      date: updated.date.toISOString().slice(0, 10),
      project: updated.project,
      taskName: updated.taskName,
      description: updated.description,
      startMinutes: updated.startMinutes,
      endMinutes: updated.endMinutes,
      minutes: updated.minutes,
      billable: updated.billable,
      status: updated.status,
    });
  } catch (err) {
    return serverError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuth();
    if (!auth) return unauthorized();
    const { id } = await params;

    const entry = await db.timesheetEntry.findFirst({ where: { id, employeeId: auth.employee.id } });
    if (!entry) return badRequest("NOT_FOUND", "Timesheet entry not found.");
    if (entry.status !== "DRAFT") {
      return badRequest("NOT_DELETABLE", "Only draft entries can be deleted. This entry has already been submitted.");
    }

    await db.timesheetEntry.delete({ where: { id: entry.id } });
    await audit(auth.employee, "TIMESHEET_ENTRY_DELETED", "TimesheetEntry", entry.id, `${entry.project} · ${Math.round(entry.minutes / 6) / 10}h`);
    return ok({ deleted: true });
  } catch (err) {
    return serverError(err);
  }
}
