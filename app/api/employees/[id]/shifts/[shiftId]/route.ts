import { NextResponse } from "next/server";
import { databaseNotConfiguredResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateShift } from "@/lib/rates";
import { buildEmployeeSummary } from "@/lib/stats";

type Params = {
  params: Promise<{ id: string; shiftId: string }>;
};

function parseDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseMoney(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const amount = Math.round(Number(value));
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

async function requireAdmin() {
  const databaseError = databaseNotConfiguredResponse();
  if (databaseError) return { error: databaseError };

  const admin = await getCurrentUser();

  if (admin?.role !== "admin") {
    return { error: NextResponse.json({ error: "Недостаточно прав" }, { status: 403 }) };
  }

  return { admin };
}

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id, shiftId } = await params;
  const body = await request.json().catch(() => ({}));
  const startedAt = parseDate(body.startedAt);
  const endedAt = parseDate(body.endedAt);

  if (!startedAt || !endedAt) {
    return NextResponse.json({ error: "Укажите начало и конец смены" }, { status: 400 });
  }

  if (endedAt <= startedAt) {
    return NextResponse.json({ error: "Конец смены должен быть позже начала" }, { status: 400 });
  }

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, employeeId: id, status: "completed" }
  });

  if (!shift) {
    return NextResponse.json({ error: "Завершенная смена не найдена" }, { status: 404 });
  }

  const hourlyRate = Math.round(Number(body.hourlyRate || shift.hourlyRate));

  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    return NextResponse.json({ error: "Укажите корректную ставку" }, { status: 400 });
  }

  const calculated = calculateShift(startedAt, endedAt, hourlyRate);
  const manualAmount = parseMoney(body.amount);

  await prisma.shift.update({
    where: { id: shiftId },
    data: {
      date: new Date(Date.UTC(startedAt.getUTCFullYear(), startedAt.getUTCMonth(), startedAt.getUTCDate())),
      startedAt,
      endedAt,
      durationMinutes: calculated.durationMinutes,
      hourlyRate,
      amount: manualAmount ?? calculated.amount
    }
  });

  const employee = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { shifts: true }
  });

  return NextResponse.json({ employee: buildEmployeeSummary(employee) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id, shiftId } = await params;
  const result = await prisma.shift.deleteMany({
    where: {
      id: shiftId,
      employeeId: id
    }
  });

  if (result.count === 0) {
    return NextResponse.json({ error: "Смена не найдена" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
