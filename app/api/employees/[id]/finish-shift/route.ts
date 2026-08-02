import { NextResponse } from "next/server";
import { databaseNotConfiguredResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateShift } from "@/lib/rates";
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
  const activeShift = await prisma.shift.findFirst({
    where: { employeeId: id, status: "active" }
  });

  if (!activeShift) {
    return NextResponse.json({ error: "Активной смены нет" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const endedAt = parseDate(body.endedAt) || new Date();

  if (endedAt <= activeShift.startedAt) {
    return NextResponse.json({ error: "Конец смены должен быть позже начала" }, { status: 400 });
  }

  const result = calculateShift(activeShift.startedAt, endedAt, activeShift.hourlyRate);
  const manualAmount = parseMoney(body.amount);

  await prisma.shift.update({
    where: { id: activeShift.id },
    data: {
      endedAt,
      durationMinutes: result.durationMinutes,
      amount: manualAmount ?? result.amount,
      status: "completed"
    }
  });

  const employee = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { shifts: true }
  });

  return NextResponse.json({ employee: buildEmployeeSummary(employee) });
}
