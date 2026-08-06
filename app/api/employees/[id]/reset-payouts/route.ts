import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { databaseNotConfiguredResponse } from "@/lib/api-errors";
import { prisma } from "@/lib/prisma";
import { buildEmployeeSummary } from "@/lib/stats";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const databaseError = databaseNotConfiguredResponse();
  if (databaseError) return databaseError;

  const admin = await getCurrentUser();

  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await params;
  const employee = await prisma.user.findFirst({
    where: { id, role: "employee", isActive: true }
  });

  if (!employee) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  const activeShift = await prisma.shift.findFirst({
    where: { employeeId: id, status: "active" }
  });

  if (activeShift) {
    return NextResponse.json({ error: "Нельзя сбросить выплаты во время активной смены" }, { status: 409 });
  }

  await prisma.shift.updateMany({
    where: { employeeId: id, status: "completed", paidAt: null },
    data: { paidAt: new Date() }
  });

  const updatedEmployee = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { shifts: true }
  });

  return NextResponse.json({ employee: buildEmployeeSummary(updatedEmployee) });
}
