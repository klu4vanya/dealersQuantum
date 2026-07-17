import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const ROOT = resolve(process.cwd());
const PUBLIC_DIR = join(ROOT, "public");
const DB_FILE = join(ROOT, "data", "db.json");

const RATE_TIERS = [
  { shifts: 200, rate: 1000 },
  { shifts: 150, rate: 950 },
  { shifts: 100, rate: 900 },
  { shifts: 60, rate: 800 },
  { shifts: 20, rate: 700 },
  { shifts: 0, rate: 600 }
];

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

async function readDb() {
  return JSON.parse(await readFile(DB_FILE, "utf8"));
}

async function writeDb(db) {
  await writeFile(DB_FILE, `${JSON.stringify(db, null, 2)}\n`);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        return [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
      })
  );
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function publicUser(user) {
  const { password, ...safeUser } = user;
  return safeUser;
}

function completedShiftsFor(db, employeeId) {
  return db.shifts.filter((shift) => shift.employeeId === employeeId && shift.status === "completed");
}

function activeShiftFor(db, employeeId) {
  return db.shifts.find((shift) => shift.employeeId === employeeId && shift.status === "active") || null;
}

function getCurrentRate(db, employeeId) {
  const completedCount = completedShiftsFor(db, employeeId).length;
  const tier = RATE_TIERS.find((item) => completedCount >= item.shifts);
  const nextTier = [...RATE_TIERS]
    .reverse()
    .find((item) => item.shifts > completedCount);

  return {
    rate: tier.rate,
    completedCount,
    tierStart: tier.shifts,
    nextTier: nextTier ? { shifts: nextTier.shifts, rate: nextTier.rate } : null,
    shiftsToNextTier: nextTier ? nextTier.shifts - completedCount : 0
  };
}

function monthKey(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function shiftMonth(shift) {
  return new Date(shift.startedAt).toISOString().slice(0, 7);
}

function calculateShift(startedAt, endedAt, hourlyRate) {
  const durationMinutes = Math.max(0, Math.floor((new Date(endedAt) - new Date(startedAt)) / 60000));
  const amount = Math.round((durationMinutes * hourlyRate) / 60);
  return { durationMinutes, amount };
}

function employeeStats(db, employeeId, targetMonth = monthKey()) {
  const employeeShifts = db.shifts.filter((shift) => shift.employeeId === employeeId);
  const completed = employeeShifts.filter((shift) => shift.status === "completed");
  const monthShifts = completed.filter((shift) => shiftMonth(shift) === targetMonth);
  const monthlyAmount = monthShifts.reduce((sum, shift) => sum + shift.amount, 0);

  return {
    activeShift: activeShiftFor(db, employeeId),
    totalCompletedShifts: completed.length,
    monthlyShiftCount: monthShifts.length,
    monthlyAmount,
    currentRate: getCurrentRate(db, employeeId),
    shifts: employeeShifts
      .slice()
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
  };
}

function employeeSummary(db, user) {
  return {
    ...publicUser(user),
    stats: employeeStats(db, user.id)
  };
}

function requireAuth(db, req) {
  const sessionId = parseCookies(req).sessionId;
  const userId = sessionId ? db.sessions[sessionId] : null;
  return userId ? db.users.find((user) => user.id === userId && user.isActive) : null;
}

function requireAdmin(user, res) {
  if (user?.role === "admin") return true;
  sendJson(res, 403, { error: "Недостаточно прав" });
  return false;
}

async function handleApi(req, res) {
  const db = await readDb();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  if (path === "/api/login" && req.method === "POST") {
    const body = await readBody(req);
    const login = String(body.login || "").trim();
    const password = String(body.password || "");
    const user = db.users.find(
      (item) => item.isActive && (item.login === login || item.phone === login) && item.password === password
    );

    if (!user) return sendJson(res, 401, { error: "Неверный логин или пароль" });

    const sessionId = randomUUID();
    db.sessions[sessionId] = user.id;
    await writeDb(db);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `sessionId=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`
    });
    return res.end(JSON.stringify({ user: publicUser(user) }));
  }

  if (path === "/api/logout" && req.method === "POST") {
    const sessionId = parseCookies(req).sessionId;
    if (sessionId) delete db.sessions[sessionId];
    await writeDb(db);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "sessionId=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0"
    });
    return res.end(JSON.stringify({ ok: true }));
  }

  const user = requireAuth(db, req);
  if (!user) return sendJson(res, 401, { error: "Требуется вход" });

  if (path === "/api/me" && req.method === "GET") {
    const payload = user.role === "admin" ? publicUser(user) : employeeSummary(db, user);
    return sendJson(res, 200, { user: payload, rateTiers: RATE_TIERS.slice().reverse() });
  }

  if (path === "/api/employees" && req.method === "GET") {
    if (!requireAdmin(user, res)) return;
    const employees = db.users
      .filter((item) => item.role === "employee" && item.isActive)
      .map((item) => employeeSummary(db, item));
    return sendJson(res, 200, { employees, rateTiers: RATE_TIERS.slice().reverse() });
  }

  if (path === "/api/employees" && req.method === "POST") {
    if (!requireAdmin(user, res)) return;
    const body = await readBody(req);
    const newUser = {
      id: randomUUID(),
      fullName: String(body.fullName || "").trim(),
      phone: String(body.phone || "").trim(),
      login: String(body.login || body.phone || "").trim(),
      password: String(body.password || "").trim(),
      role: "employee",
      createdAt: new Date().toISOString(),
      isActive: true,
      schedule: String(body.schedule || "По факту выхода").trim()
    };

    if (!newUser.fullName || !newUser.login || !newUser.password) {
      return sendJson(res, 400, { error: "Заполните ФИО, логин и пароль" });
    }

    if (db.users.some((item) => item.login === newUser.login || (newUser.phone && item.phone === newUser.phone))) {
      return sendJson(res, 409, { error: "Пользователь с таким логином или телефоном уже есть" });
    }

    db.users.push(newUser);
    await writeDb(db);
    return sendJson(res, 201, { employee: employeeSummary(db, newUser) });
  }

  const employeeMatch = path.match(/^\/api\/employees\/([^/]+)$/);
  if (employeeMatch && req.method === "PATCH") {
    if (!requireAdmin(user, res)) return;
    const employee = db.users.find((item) => item.id === employeeMatch[1] && item.role === "employee" && item.isActive);
    if (!employee) return sendJson(res, 404, { error: "Сотрудник не найден" });

    const body = await readBody(req);
    for (const field of ["fullName", "phone", "login", "password", "schedule"]) {
      if (body[field] !== undefined) employee[field] = String(body[field]).trim();
    }

    await writeDb(db);
    return sendJson(res, 200, { employee: employeeSummary(db, employee) });
  }

  if (employeeMatch && req.method === "DELETE") {
    if (!requireAdmin(user, res)) return;
    const employee = db.users.find((item) => item.id === employeeMatch[1] && item.role === "employee");
    if (!employee) return sendJson(res, 404, { error: "Сотрудник не найден" });
    employee.isActive = false;
    await writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  const resetMatch = path.match(/^\/api\/employees\/([^/]+)\/reset$/);
  if (resetMatch && req.method === "POST") {
    const employeeId = resetMatch[1];
    if (user.role !== "admin" && user.id !== employeeId) return sendJson(res, 403, { error: "Недостаточно прав" });
    if (activeShiftFor(db, employeeId)) return sendJson(res, 409, { error: "Нельзя сбросить статистику во время активной смены" });
    db.shifts = db.shifts.filter((shift) => shift.employeeId !== employeeId);
    await writeDb(db);
    return sendJson(res, 200, { ok: true });
  }

  const startMatch = path.match(/^\/api\/employees\/([^/]+)\/start-shift$/);
  if (startMatch && req.method === "POST") {
    if (!requireAdmin(user, res)) return;
    const employeeId = startMatch[1];
    const employee = db.users.find((item) => item.id === employeeId && item.role === "employee" && item.isActive);
    if (!employee) return sendJson(res, 404, { error: "Сотрудник не найден" });
    if (activeShiftFor(db, employeeId)) return sendJson(res, 409, { error: "У сотрудника уже есть активная смена" });

    const rateInfo = getCurrentRate(db, employeeId);
    const now = new Date().toISOString();
    const shift = {
      id: randomUUID(),
      employeeId,
      date: now.slice(0, 10),
      startedAt: now,
      endedAt: null,
      durationMinutes: null,
      hourlyRate: rateInfo.rate,
      amount: null,
      status: "active"
    };

    db.shifts.push(shift);
    await writeDb(db);
    return sendJson(res, 201, { shift, employee: employeeSummary(db, employee) });
  }

  const finishMatch = path.match(/^\/api\/employees\/([^/]+)\/finish-shift$/);
  if (finishMatch && req.method === "POST") {
    if (!requireAdmin(user, res)) return;
    const employeeId = finishMatch[1];
    const employee = db.users.find((item) => item.id === employeeId && item.role === "employee" && item.isActive);
    if (!employee) return sendJson(res, 404, { error: "Сотрудник не найден" });

    const shift = activeShiftFor(db, employeeId);
    if (!shift) return sendJson(res, 409, { error: "Активной смены нет" });

    const endedAt = new Date().toISOString();
    const result = calculateShift(shift.startedAt, endedAt, shift.hourlyRate);
    shift.endedAt = endedAt;
    shift.durationMinutes = result.durationMinutes;
    shift.amount = result.amount;
    shift.status = "completed";
    await writeDb(db);
    return sendJson(res, 200, { shift, employee: employeeSummary(db, employee) });
  }

  return sendJson(res, 404, { error: "Метод не найден" });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = join(PUBLIC_DIR, decodeURIComponent(requestPath));

  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }

  const extension = extname(filePath);
  res.writeHead(200, { "Content-Type": contentTypes[extension] || "application/octet-stream" });
  res.end(await readFile(filePath));
}

createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    return await serveStatic(req, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: "Ошибка сервера" });
  }
}).listen(PORT, HOST, () => {
  console.log(`Сайт учета сотрудников запущен: http://${HOST}:${PORT}`);
});
