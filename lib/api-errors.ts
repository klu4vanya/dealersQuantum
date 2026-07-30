import { NextResponse } from "next/server";
import { hasDatabaseUrl } from "./prisma";

export function databaseNotConfiguredResponse() {
  if (hasDatabaseUrl()) return null;

  return NextResponse.json(
    {
      error: "На Vercel не настроена переменная DATABASE_URL. Подключите PostgreSQL-базу и redeploy проекта."
    },
    { status: 500 }
  );
}
