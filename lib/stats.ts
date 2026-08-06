import { Shift, User } from "@prisma/client";
import { getCurrentRate } from "./rates";

export function publicUser(user: User) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

export function currentMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

export function buildEmployeeSummary(user: User & { shifts: Shift[] }) {
  const sortedShifts = [...user.shifts].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const completedShifts = sortedShifts.filter((shift) => shift.status === "completed");
  const unpaidCompletedShifts = completedShifts.filter((shift) => !shift.paidAt);
  const activeShift = sortedShifts.find((shift) => shift.status === "active") || null;
  const currentMonth = currentMonthKey();
  const monthlyShifts = completedShifts.filter((shift) => monthKey(shift.startedAt) === currentMonth);
  const monthlyUnpaidShifts = unpaidCompletedShifts.filter((shift) => monthKey(shift.startedAt) === currentMonth);

  return {
    ...publicUser(user),
    stats: {
      activeShift,
      totalCompletedShifts: completedShifts.length,
      monthlyShiftCount: monthlyShifts.length,
      monthlyAmount: monthlyShifts.reduce((sum, shift) => sum + (shift.amount || 0), 0),
      unpaidAmount: unpaidCompletedShifts.reduce((sum, shift) => sum + (shift.amount || 0), 0),
      monthlyUnpaidAmount: monthlyUnpaidShifts.reduce((sum, shift) => sum + (shift.amount || 0), 0),
      currentRate: getCurrentRate(completedShifts.length),
      shifts: sortedShifts
    }
  };
}
