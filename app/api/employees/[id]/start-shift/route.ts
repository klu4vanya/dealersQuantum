import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCurrentRate } from "@/lib/rates";
import { buildEmployeeSummary } from "@/lib/stats";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const admin = await getCurrentUser();

  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await params;
  const employee = await prisma.user.findFirst({
    where: { id, role: "employee", isActive: true },
    include: { shifts: true }
  });

  if (!employee) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  if (employee.shifts.some((shift) => shift.status === "active")) {
    return NextResponse.json({ error: "У сотрудника уже есть активная смена" }, { status: 409 });
  }

  const completedCount = employee.shifts.filter((shift) => shift.status === "completed").length;
  const rateInfo = getCurrentRate(completedCount);
  const now = new Date();

  await prisma.shift.create({
    data: {
      employeeId: id,
      date: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      startedAt: now,
      hourlyRate: rateInfo.rate,
      status: "active"
    }
  });

  const updatedEmployee = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { shifts: true }
  });

  return NextResponse.json({ employee: buildEmployeeSummary(updatedEmployee) }, { status: 201 });
}
