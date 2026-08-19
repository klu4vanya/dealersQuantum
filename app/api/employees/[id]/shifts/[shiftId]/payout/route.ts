import { NextResponse } from "next/server";
import { databaseNotConfiguredResponse } from "@/lib/api-errors";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildEmployeeSummary } from "@/lib/stats";

type Params = {
  params: Promise<{ id: string; shiftId: string }>;
};

export async function PATCH(request: Request, { params }: Params) {
  const databaseError = databaseNotConfiguredResponse();
  if (databaseError) return databaseError;

  const admin = await getCurrentUser();

  if (admin?.role !== "admin") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id, shiftId } = await params;
  const body = await request.json().catch(() => ({}));
  const isPaid = Boolean(body.isPaid);

  const shift = await prisma.shift.findFirst({
    where: { id: shiftId, employeeId: id, status: "completed" }
  });

  if (!shift) {
    return NextResponse.json({ error: "Завершенная смена не найдена" }, { status: 404 });
  }

  await prisma.shift.update({
    where: { id: shiftId },
    data: {
      paidAt: isPaid ? new Date() : null
    }
  });

  const employee = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { shifts: true }
  });

  return NextResponse.json({ employee: buildEmployeeSummary(employee) });
}
