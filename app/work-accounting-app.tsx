"use client";

import { FormEvent, useEffect, useState } from "react";

type Shift = {
  id: string;
  date: string;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  hourlyRate: number;
  amount: number | null;
  status: "active" | "completed";
};

type User = {
  id: string;
  fullName: string;
  phone: string | null;
  login: string;
  role: "admin" | "employee";
  schedule: string;
  stats?: EmployeeStats;
};

type EmployeeStats = {
  activeShift: Shift | null;
  totalCompletedShifts: number;
  monthlyShiftCount: number;
  monthlyAmount: number;
  currentRate: {
    rate: number;
    completedCount: number;
    tierStart: number;
    nextTier: { shifts: number; rate: number } | null;
    shiftsToNextTier: number;
  };
  shifts: Shift[];
};

type Employee = User & { stats: EmployeeStats };
type RateTier = { shifts: number; rate: number };

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0
});

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

function formatDate(value: string | null) {
  return value ? dateTime.format(new Date(value)) : "—";
}

function formatDuration(minutes: number | null) {
  if (minutes == null) return "идет сейчас";
  return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

export function WorkAccountingApp() {
  const [me, setMe] = useState<User | Employee | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rateTiers, setRateTiers] = useState<RateTier[]>([]);
  const [error, setError] = useState("");
  const [openCards, setOpenCards] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  async function refresh() {
    const meData = await api<{ user: User | Employee; rateTiers: RateTier[] }>("/api/me");
    setMe(meData.user);
    setRateTiers(meData.rateTiers);

    if (meData.user.role === "admin") {
      const employeesData = await api<{ employees: Employee[]; rateTiers: RateTier[] }>("/api/employees");
      setEmployees(employeesData.employees);
      setRateTiers(employeesData.rateTiers);
    }
  }

  useEffect(() => {
    refresh()
      .catch(() => setMe(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function run(action: () => Promise<void>) {
    try {
      setError("");
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Ошибка запроса");
    }
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const data = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          login: form.get("login"),
          password: form.get("password")
        })
      });
      setMe(data.user);
      await refresh();
    });
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST" });
    setMe(null);
    setEmployees([]);
  }

  async function addEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    await run(async () => {
      await api("/api/employees", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      form.reset();
      await refresh();
    });
  }

  async function editEmployee(event: FormEvent<HTMLFormElement>, employeeId: string) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!payload.password) delete payload.password;

    await run(async () => {
      await api(`/api/employees/${employeeId}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      await refresh();
    });
  }

  async function addManualShift(event: FormEvent<HTMLFormElement>, employeeId: string) {
    event.preventDefault();
    const form = event.currentTarget;

    await run(async () => {
      await api(`/api/employees/${employeeId}/manual-shift`, {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      form.reset();
      await refresh();
    });
  }

  async function actionAndRefresh(path: string, method = "POST") {
    await run(async () => {
      await api(path, { method });
      await refresh();
    });
  }

  if (isLoading) {
    return (
      <main className="login">
        <div className="login-panel">Загрузка...</div>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="login">
        <form className="login-panel form-grid" onSubmit={login}>
          <div className="brand">
            <h1>Учет смен</h1>
            <p>Вход для администратора и сотрудников</p>
          </div>
          <div className="form-row">
            <label htmlFor="login">Логин или телефон</label>
            <input id="login" name="login" autoComplete="username" required />
          </div>
          <div className="form-row">
            <label htmlFor="password">Пароль или код</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>
          <button type="submit">Войти</button>
          <div className="error">{error}</div>
        </form>
      </main>
    );
  }

  const isAdmin = me.role === "admin";

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <h1>{isAdmin ? "Админ-панель" : "Личный кабинет"}</h1>
          <p>{me.fullName}</p>
        </div>
        <button className="secondary" onClick={logout}>Выйти</button>
      </header>

      {isAdmin ? (
        <>
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Новый сотрудник</h2>
                <div className="hint">Ставка назначается автоматически по количеству завершенных смен.</div>
              </div>
            </div>
            <form className="form-grid" onSubmit={addEmployee}>
              <div className="edit-grid">
                <input name="fullName" placeholder="ФИО" required />
                <input name="phone" placeholder="Телефон" />
                <input name="login" placeholder="Логин" required />
                <input name="password" placeholder="Пароль / код" required />
              </div>
              <textarea name="schedule" rows={2} placeholder="График работы" />
              <button type="submit">Добавить сотрудника</button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Сотрудники</h2>
              <div className="hint">{rateTiers.map((tier) => `${tier.shifts}+ смен: ${tier.rate} ₽/ч`).join(" · ")}</div>
            </div>
            <div className="employees">
              {employees.length ? employees.map((employee) => (
                <EmployeeCard
                  key={employee.id}
                  employee={employee}
                  isOpen={Boolean(openCards[employee.id])}
                  onToggle={() => setOpenCards((current) => ({ ...current, [employee.id]: !current[employee.id] }))}
                  onStart={() => actionAndRefresh(`/api/employees/${employee.id}/start-shift`)}
                  onFinish={() => actionAndRefresh(`/api/employees/${employee.id}/finish-shift`)}
                  onDelete={() => {
                    if (confirm("Удалить сотрудника? История смен удалится при удалении из базы позже, сейчас сотрудник станет неактивным.")) {
                      actionAndRefresh(`/api/employees/${employee.id}`, "DELETE");
                    }
                  }}
                  onReset={() => {
                    if (confirm("Сбросить всю статистику смен сотрудника? Это действие нельзя отменить.")) {
                      actionAndRefresh(`/api/employees/${employee.id}/reset`);
                    }
                  }}
                  onEdit={editEmployee}
                  onManualShift={addManualShift}
                />
              )) : <div className="hint">Сотрудников пока нет</div>}
            </div>
          </section>
        </>
      ) : (
        <EmployeeProfile
          employee={me as Employee}
          ownProfile
          onReset={() => {
            if (confirm("Сбросить всю статистику смен? Это действие нельзя отменить.")) {
              actionAndRefresh(`/api/employees/${me.id}/reset`);
            }
          }}
        />
      )}

      <div className="error">{error}</div>
    </main>
  );
}

function EmployeeCard({
  employee,
  isOpen,
  onToggle,
  onStart,
  onFinish,
  onDelete,
  onReset,
  onEdit,
  onManualShift
}: {
  employee: Employee;
  isOpen: boolean;
  onToggle: () => void;
  onStart: () => void;
  onFinish: () => void;
  onDelete: () => void;
  onReset: () => void;
  onEdit: (event: FormEvent<HTMLFormElement>, employeeId: string) => void;
  onManualShift: (event: FormEvent<HTMLFormElement>, employeeId: string) => void;
}) {
  const active = Boolean(employee.stats.activeShift);
  const rate = employee.stats.currentRate;
  const next = rate.nextTier ? `до ${rate.nextTier.rate} ₽/ч осталось ${rate.shiftsToNextTier} смен` : "максимальная ставка";

  return (
    <article className="employee-card">
      <div className="employee-head">
        <div>
          <h3>{employee.fullName}</h3>
          <div className="employee-meta">
            <span className="pill">{employee.phone || "телефон не указан"}</span>
            <span className={`pill ${active ? "active" : ""}`}>{active ? "работает" : "не работает"}</span>
            <span className="pill">{employee.stats.monthlyShiftCount} смен за месяц</span>
            <span className="pill">{money.format(employee.stats.monthlyAmount)}</span>
            <span className="pill warning">{rate.rate} ₽/ч, {next}</span>
          </div>
        </div>
      </div>
      <div className="actions">
        <button onClick={onStart} disabled={active}>Пришел</button>
        <button onClick={onFinish} disabled={!active}>Закончил</button>
        <button className="secondary" onClick={onToggle}>Карточка</button>
        <button className="danger" onClick={onDelete}>Удалить</button>
      </div>
      {isOpen && (
        <div className="details">
          <EmployeeProfile
            employee={employee}
            onReset={onReset}
            onEdit={(event) => onEdit(event, employee.id)}
            onManualShift={(event) => onManualShift(event, employee.id)}
          />
        </div>
      )}
    </article>
  );
}

function EmployeeProfile({
  employee,
  ownProfile = false,
  onReset,
  onEdit,
  onManualShift
}: {
  employee: Employee;
  ownProfile?: boolean;
  onReset: () => void;
  onEdit?: (event: FormEvent<HTMLFormElement>) => void;
  onManualShift?: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const stats = employee.stats;
  const active = stats.activeShift;

  return (
    <section className={ownProfile ? "panel" : undefined}>
      <div className="panel-header">
        <div>
          <h2>{employee.fullName}</h2>
          <div className="hint">{employee.schedule || "График не указан"}</div>
        </div>
        <button className="danger" onClick={onReset}>Сбросить статистику</button>
      </div>
      <div className="stats">
        <div className="stat"><span>Всего смен</span><strong>{stats.totalCompletedShifts}</strong></div>
        <div className="stat"><span>Смен за месяц</span><strong>{stats.monthlyShiftCount}</strong></div>
        <div className="stat"><span>Заработок за месяц</span><strong>{money.format(stats.monthlyAmount)}</strong></div>
        <div className="stat"><span>Текущая ставка</span><strong>{stats.currentRate.rate} ₽/ч</strong></div>
      </div>
      {active && <p className="hint">Активная смена началась: {formatDate(active.startedAt)}, ставка {active.hourlyRate} ₽/ч</p>}
      {!ownProfile && onEdit && <EditEmployeeForm employee={employee} onEdit={onEdit} />}
      {!ownProfile && onManualShift && <ManualShiftForm employee={employee} onManualShift={onManualShift} />}
      <ShiftTable shifts={stats.shifts} />
    </section>
  );
}

function EditEmployeeForm({ employee, onEdit }: { employee: Employee; onEdit: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form className="details form-grid" onSubmit={onEdit}>
      <div className="edit-grid">
        <input name="fullName" defaultValue={employee.fullName} placeholder="ФИО" required />
        <input name="phone" defaultValue={employee.phone || ""} placeholder="Телефон" />
        <input name="login" defaultValue={employee.login} placeholder="Логин" required />
        <input name="password" placeholder="Новый пароль / оставить пустым" />
      </div>
      <textarea name="schedule" rows={2} defaultValue={employee.schedule || ""} placeholder="График работы" />
      <button type="submit">Сохранить данные</button>
    </form>
  );
}

function ManualShiftForm({
  employee,
  onManualShift
}: {
  employee: Employee;
  onManualShift: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="details form-grid" onSubmit={onManualShift}>
      <div>
        <h3>Добавить смену вручную</h3>
        <div className="hint">Сумму можно указать вручную. Если оставить пустой, система рассчитает ее по ставке и времени.</div>
      </div>
      <div className="manual-grid">
        <input name="startedAt" type="datetime-local" aria-label="Начало смены" required />
        <input name="endedAt" type="datetime-local" aria-label="Конец смены" required />
        <input name="hourlyRate" type="number" min="1" step="1" defaultValue={employee.stats.currentRate.rate} placeholder="Ставка ₽/час" required />
        <input name="amount" type="number" min="0" step="1" placeholder="Сумма зарплаты ₽" />
      </div>
      <button type="submit">Добавить смену</button>
    </form>
  );
}

function ShiftTable({ shifts }: { shifts: Shift[] }) {
  return (
    <div className="details table-wrap">
      <table>
        <thead>
          <tr>
            <th>Дата</th>
            <th>Начало</th>
            <th>Конец</th>
            <th>Длительность</th>
            <th>Ставка</th>
            <th>Сумма</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {shifts.length ? shifts.map((shift) => (
            <tr key={shift.id}>
              <td>{new Date(shift.startedAt).toISOString().slice(0, 10)}</td>
              <td>{formatDate(shift.startedAt)}</td>
              <td>{formatDate(shift.endedAt)}</td>
              <td>{formatDuration(shift.durationMinutes)}</td>
              <td>{shift.hourlyRate} ₽/ч</td>
              <td>{shift.amount == null ? "—" : money.format(shift.amount)}</td>
              <td>{shift.status === "active" ? "активная" : "завершена"}</td>
            </tr>
          )) : (
            <tr><td colSpan={7}>Истории смен пока нет</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
