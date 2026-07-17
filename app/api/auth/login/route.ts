import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { publicUser } from "@/lib/stats";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const login = String(body.login || "").trim();
  const password = String(body.password || "");

  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      OR: [{ login }, { phone: login }]
    }
  });

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ user: publicUser(user) });
}
