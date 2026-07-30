import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { databaseNotConfiguredResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { calculateShift, getCurrentRate } from "@/lib/rates";
import { buildEmployeeSummary } from "@/lib/stats";

type Params = {
  params: Promise<{ id: string }>;
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

export async function POST(request: Request, { params }: Params) {
  const databaseError = databaseNotConfiguredResponse();
  if (databaseError) return databaseError;

  const admin = await getCurrentUser();

  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const startedAt = parseDate(body.startedAt);
  const endedAt = parseDate(body.endedAt);

  if (!startedAt || !endedAt) {
    return NextResponse.json({ error: "Укажите начало и конец смены" }, { status: 400 });
  }

  if (endedAt <= startedAt) {
    return NextResponse.json({ error: "Конец смены должен быть позже начала" }, { status: 400 });
  }

  const employee = await prisma.user.findFirst({
    where: { id, role: "employee", isActive: true },
    include: { shifts: true }
  });

  if (!employee) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  const completedCount = employee.shifts.filter((shift) => shift.status === "completed").length;
  const fallbackRate = getCurrentRate(completedCount).rate;
  const hourlyRate = Math.round(Number(body.hourlyRate || fallbackRate));

  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    return NextResponse.json({ error: "Укажите корректную ставку" }, { status: 400 });
  }

  const calculated = calculateShift(startedAt, endedAt, hourlyRate);
  const manualAmount = parseMoney(body.amount);
  const amount = manualAmount ?? calculated.amount;

  await prisma.shift.create({
    data: {
      employeeId: id,
      date: new Date(Date.UTC(startedAt.getUTCFullYear(), startedAt.getUTCMonth(), startedAt.getUTCDate())),
      startedAt,
      endedAt,
      durationMinutes: calculated.durationMinutes,
      hourlyRate,
      amount,
      status: "completed"
    }
  });

  const updatedEmployee = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { shifts: true }
  });

  return NextResponse.json({ employee: buildEmployeeSummary(updatedEmployee) }, { status: 201 });
}
