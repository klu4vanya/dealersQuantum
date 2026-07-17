import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();

async function main() {
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
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
