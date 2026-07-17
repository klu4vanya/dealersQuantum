import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Учет смен сотрудников",
  description: "Учет рабочих смен, ставок и заработка сотрудников"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
