import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  const { id } = await params;

  if (!user || (user.role !== "admin" && user.id !== id)) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const activeShift = await prisma.shift.findFirst({
    where: { employeeId: id, status: "active" }
  });

  if (activeShift) {
    return NextResponse.json({ error: "Нельзя сбросить статистику во время активной смены" }, { status: 409 });
  }

  await prisma.shift.deleteMany({ where: { employeeId: id } });
  return NextResponse.json({ ok: true });
}
