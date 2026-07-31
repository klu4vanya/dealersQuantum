import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hashPassword } from "../lib/password";

function loadEnvFile() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    process.env[key] ||= value;
  }
}

async function main() {
  loadEnvFile();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL не найден. Создайте файл .env в корне проекта и добавьте строку подключения Neon/PostgreSQL.");
  }

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();

  try {
    await prisma.user.upsert({
      where: { login: "admin" },
      update: {},
      create: {
        fullName: "Администратор",
        phone: "+70000000000",
        login: "admin",
        passwordHash: hashPassword("admin123"),
        role: "admin",
        schedule: "Пн-Вс, по факту выхода"
      }
    });

    await prisma.user.upsert({
      where: { login: "ivan" },
      update: {},
      create: {
        fullName: "Иван Петров",
        phone: "+79990000001",
        login: "ivan",
        passwordHash: hashPassword("1234"),
        role: "employee",
        schedule: "Пн-Пт, 10:00-19:00"
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
