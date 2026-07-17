import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RATE_TIERS } from "@/lib/rates";
import { buildEmployeeSummary, publicUser } from "@/lib/stats";

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  if (user.role === "admin") {
    return NextResponse.json({ user: publicUser(user), rateTiers: RATE_TIERS });
  }

  const employee = await prisma.user.findUnique({
    where: { id: user.id },
    include: { shifts: true }
  });

  if (!employee) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  return NextResponse.json({ user: buildEmployeeSummary(employee), rateTiers: RATE_TIERS });
}
