import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { RATE_TIERS } from "@/lib/rates";
import { buildEmployeeSummary } from "@/lib/stats";

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}

export async function GET() {
  const admin = await requireAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const employees = await prisma.user.findMany({
    where: { role: "employee", isActive: true },
    include: { shifts: true },
    orderBy: { createdAt: "asc" }
  });

  return NextResponse.json({
    employees: employees.map(buildEmployeeSummary),
    rateTiers: RATE_TIERS
  });
}

export async function POST(request: Request) {
  const admin = await requireAdmin();

  if (!admin) {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const fullName = String(body.fullName || "").trim();
  const phone = String(body.phone || "").trim() || null;
  const login = String(body.login || body.phone || "").trim();
  const password = String(body.password || "").trim();
  const schedule = String(body.schedule || "По факту выхода").trim();

  if (!fullName || !login || !password) {
    return NextResponse.json({ error: "Заполните ФИО, логин и пароль" }, { status: 400 });
  }

  const duplicate = await prisma.user.findFirst({
    where: {
      OR: [{ login }, ...(phone ? [{ phone }] : [])]
    }
  });

  if (duplicate) {
    return NextResponse.json({ error: "Пользователь с таким логином или телефоном уже есть" }, { status: 409 });
  }

  const employee = await prisma.user.create({
    data: {
      fullName,
      phone,
      login,
      passwordHash: hashPassword(password),
      role: "employee",
      schedule
    },
    include: { shifts: true }
  });

  return NextResponse.json({ employee: buildEmployeeSummary(employee) }, { status: 201 });
}
