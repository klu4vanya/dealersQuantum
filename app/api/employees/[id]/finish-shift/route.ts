import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateShift } from "@/lib/rates";
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
  const activeShift = await prisma.shift.findFirst({
    where: { employeeId: id, status: "active" }
  });

  if (!activeShift) {
    return NextResponse.json({ error: "Активной смены нет" }, { status: 409 });
  }

  const endedAt = new Date();
  const result = calculateShift(activeShift.startedAt, endedAt, activeShift.hourlyRate);

  await prisma.shift.update({
    where: { id: activeShift.id },
    data: {
      endedAt,
      durationMinutes: result.durationMinutes,
      amount: result.amount,
      status: "completed"
    }
  });

  const employee = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { shifts: true }
  });

  return NextResponse.json({ employee: buildEmployeeSummary(employee) });
}
