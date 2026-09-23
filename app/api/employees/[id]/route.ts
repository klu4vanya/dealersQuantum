import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { isAllowedRate } from "@/lib/rates";
import { buildEmployeeSummary } from "@/lib/stats";

type Params = {
  params: Promise<{ id: string }>;
};

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

export async function PATCH(request: Request, { params }: Params) {
  const admin = await requireAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const data: Record<string, string | number | null> = {};

  for (const field of ["fullName", "login", "schedule"]) {
    if (body[field] !== undefined) data[field] = String(body[field]).trim();
  }

  if (body.phone !== undefined) {
    data.phone = String(body.phone).trim() || null;
  }

  if (body.password) {
    data.passwordHash = hashPassword(String(body.password));
  }

  if (body.hourlyRateOverride !== undefined) {
    if (body.hourlyRateOverride === "" || body.hourlyRateOverride === null || body.hourlyRateOverride === "auto") {
      data.hourlyRateOverride = null;
    } else {
      const rate = Number(body.hourlyRateOverride);

      if (!Number.isFinite(rate) || !isAllowedRate(rate)) {
        return NextResponse.json({ error: "Выберите ставку из доступного списка" }, { status: 400 });
      }

      data.hourlyRateOverride = Math.round(rate);
    }
  }

  try {
    const employee = await prisma.user.update({
      where: { id, role: "employee", isActive: true },
      data,
      include: { shifts: true }
    });

    return NextResponse.json({ employee: buildEmployeeSummary(employee) });
  } catch {
    return NextResponse.json({ error: "Сотрудник не найден или данные уже заняты" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const admin = await requireAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await params;

  await prisma.user.updateMany({
    where: { id, role: "employee" },
    data: { isActive: false }
  });

  return NextResponse.json({ ok: true });
}
