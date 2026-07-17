const app = document.querySelector("#app");

const state = {
  me: null,
  employees: [],
  rateTiers: [],
  error: ""
};

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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatDuration(minutes) {
  if (minutes == null) return "идет сейчас";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours} ч ${rest} мин`;
}

function formatDate(value) {
  return value ? dateTime.format(new Date(value)) : "—";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

function setError(error) {
  state.error = error?.message || String(error || "");
  render();
}

async function bootstrap() {
  try {
    const data = await api("/api/me");
    state.me = data.user;
    state.rateTiers = data.rateTiers;
    if (state.me.role === "admin") await loadEmployees();
    render();
  } catch {
    renderLogin();
  }
}

async function loadEmployees() {
  const data = await api("/api/employees");
  state.employees = data.employees;
  state.rateTiers = data.rateTiers;
}

function renderLogin() {
  app.innerHTML = `
    <section class="login">
      <form class="login-panel form-grid" data-login-form>
        <div class="brand">
          <h1>Учет смен</h1>
          <p>Вход для администратора и сотрудников</p>
        </div>
        <div class="form-row">
          <label for="login">Логин или телефон</label>
          <input id="login" name="login" autocomplete="username" value="admin" required />
        </div>
        <div class="form-row">
          <label for="password">Пароль или код</label>
          <input id="password" name="password" type="password" autocomplete="current-password" value="admin123" required />
        </div>
        <button type="submit">Войти</button>
        <div class="hint">Тестовый администратор: admin / admin123</div>
        <div class="error">${escapeHtml(state.error)}</div>
      </form>
    </section>
  `;

  document.querySelector("[data-login-form]").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.error = "";
    const form = new FormData(event.currentTarget);
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          login: form.get("login"),
          password: form.get("password")
        })
      });
      state.me = data.user;
      if (state.me.role === "admin") await loadEmployees();
      render();
    } catch (error) {
      setError(error);
    }
  });
}

function render() {
  if (!state.me) return renderLogin();
  app.innerHTML = `
    <section class="shell">
      <header class="topbar">
        <div class="brand">
          <h1>${state.me.role === "admin" ? "Админ-панель" : "Личный кабинет"}</h1>
          <p>${escapeHtml(state.me.fullName)}</p>
        </div>
        <button class="secondary" data-logout>Выйти</button>
      </header>
      ${state.me.role === "admin" ? renderAdmin() : renderEmployeeProfile(state.me, true)}
      <div class="error">${escapeHtml(state.error)}</div>
    </section>
  `;

  bindCommon();
  if (state.me.role === "admin") bindAdmin();
  else bindEmployeeActions(state.me.id);
}

function renderAdmin() {
  return `
    <section class="panel">
      <div class="panel-header">
        <div>
          <h2>Новый сотрудник</h2>
          <div class="hint">Ставка назначается автоматически по количеству завершенных смен.</div>
        </div>
      </div>
      <form class="form-grid" data-add-employee>
        <div class="edit-grid">
          <input name="fullName" placeholder="ФИО" required />
          <input name="phone" placeholder="Телефон" />
          <input name="login" placeholder="Логин" required />
          <input name="password" placeholder="Пароль / код" required />
        </div>
        <textarea name="schedule" rows="2" placeholder="График работы"></textarea>
        <button type="submit">Добавить сотрудника</button>
      </form>
    </section>
    <section class="panel">
      <div class="panel-header">
        <h2>Сотрудники</h2>
        <div class="hint">${renderRateHint()}</div>
      </div>
      <div class="employees">
        ${state.employees.map(renderEmployeeCard).join("") || "<div class='hint'>Сотрудников пока нет</div>"}
      </div>
    </section>
  `;
}

function renderRateHint() {
  return state.rateTiers.map((tier) => `${tier.shifts}+ смен: ${tier.rate} ₽/ч`).join(" · ");
}

function renderEmployeeCard(employee) {
  const active = Boolean(employee.stats.activeShift);
  const rate = employee.stats.currentRate;
  const next = rate.nextTier
    ? `до ${rate.nextTier.rate} ₽/ч осталось ${rate.shiftsToNextTier} смен`
    : "максимальная ставка";

  return `
    <article class="employee-card" data-card="${employee.id}">
      <div class="employee-head">
        <div>
          <h3>${escapeHtml(employee.fullName)}</h3>
          <div class="employee-meta">
            <span class="pill">${escapeHtml(employee.phone || "телефон не указан")}</span>
            <span class="pill ${active ? "active" : ""}">${active ? "работает" : "не работает"}</span>
            <span class="pill">${employee.stats.monthlyShiftCount} смен за месяц</span>
            <span class="pill">${money.format(employee.stats.monthlyAmount)}</span>
            <span class="pill warning">${rate.rate} ₽/ч, ${next}</span>
          </div>
        </div>
      </div>
      <div class="actions">
        <button data-start="${employee.id}" ${active ? "disabled" : ""}>Пришел</button>
        <button data-finish="${employee.id}" ${active ? "" : "disabled"}>Закончил</button>
        <button class="secondary" data-toggle="${employee.id}">Карточка</button>
        <button class="danger" data-delete="${employee.id}">Удалить</button>
      </div>
      <div class="details" id="details-${employee.id}" hidden>
        ${renderEmployeeProfile(employee, false)}
      </div>
    </article>
  `;
}

function renderEmployeeProfile(employee, isOwnProfile) {
  const stats = employee.stats;
  const active = stats.activeShift;
  const rate = stats.currentRate;
  return `
    <section class="${isOwnProfile ? "panel" : ""}">
      <div class="panel-header">
        <div>
          <h2>${escapeHtml(employee.fullName)}</h2>
          <div class="hint">${escapeHtml(employee.schedule || "График не указан")}</div>
        </div>
        <button class="danger" data-reset="${employee.id}">Сбросить статистику</button>
      </div>
      <div class="stats">
        <div class="stat"><span>Всего смен</span><strong>${stats.totalCompletedShifts}</strong></div>
        <div class="stat"><span>Смен за месяц</span><strong>${stats.monthlyShiftCount}</strong></div>
        <div class="stat"><span>Заработок за месяц</span><strong>${money.format(stats.monthlyAmount)}</strong></div>
        <div class="stat"><span>Текущая ставка</span><strong>${rate.rate} ₽/ч</strong></div>
      </div>
      ${active ? `<p class="hint">Активная смена началась: ${formatDate(active.startedAt)}, ставка ${active.hourlyRate} ₽/ч</p>` : ""}
      ${isOwnProfile ? "" : renderEditForm(employee)}
      ${renderShiftTable(stats.shifts)}
    </section>
  `;
}

function renderEditForm(employee) {
  return `
    <form class="details form-grid" data-edit="${employee.id}">
      <div class="edit-grid">
        <input name="fullName" value="${escapeAttr(employee.fullName)}" placeholder="ФИО" required />
        <input name="phone" value="${escapeAttr(employee.phone || "")}" placeholder="Телефон" />
        <input name="login" value="${escapeAttr(employee.login)}" placeholder="Логин" required />
        <input name="password" placeholder="Новый пароль / оставить пустым" />
      </div>
      <textarea name="schedule" rows="2" placeholder="График работы">${escapeHtml(employee.schedule || "")}</textarea>
      <button type="submit">Сохранить данные</button>
    </form>
  `;
}

function renderShiftTable(shifts) {
  return `
    <div class="details table-wrap">
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
          ${
            shifts
              .map(
                (shift) => `
                  <tr>
                    <td>${shift.date}</td>
                    <td>${formatDate(shift.startedAt)}</td>
                    <td>${formatDate(shift.endedAt)}</td>
                    <td>${formatDuration(shift.durationMinutes)}</td>
                    <td>${shift.hourlyRate} ₽/ч</td>
                    <td>${shift.amount == null ? "—" : money.format(shift.amount)}</td>
                    <td>${shift.status === "active" ? "активная" : "завершена"}</td>
                  </tr>
                `
              )
              .join("") || "<tr><td colspan='7'>Истории смен пока нет</td></tr>"
          }
        </tbody>
      </table>
    </div>
  `;
}

function bindCommon() {
  document.querySelector("[data-logout]")?.addEventListener("click", async () => {
    await api("/api/logout", { method: "POST" });
    state.me = null;
    state.employees = [];
    renderLogin();
  });
}

function bindAdmin() {
  document.querySelector("[data-add-employee]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/employees", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form.entries()))
      });
      await loadEmployees();
      state.error = "";
      render();
    } catch (error) {
      setError(error);
    }
  });

  document.querySelectorAll("[data-start]").forEach((button) => {
    button.addEventListener("click", () => actionAndReload(`/api/employees/${button.dataset.start}/start-shift`, "POST"));
  });

  document.querySelectorAll("[data-finish]").forEach((button) => {
    button.addEventListener("click", () => actionAndReload(`/api/employees/${button.dataset.finish}/finish-shift`, "POST"));
  });

  document.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Удалить сотрудника? История смен сохранится в базе, но сотрудник пропадет из списка.")) return;
      await actionAndReload(`/api/employees/${button.dataset.delete}`, "DELETE");
    });
  });

  document.querySelectorAll("[data-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const details = document.querySelector(`#details-${button.dataset.toggle}`);
      details.hidden = !details.hidden;
    });
  });

  document.querySelectorAll("[data-edit]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(form).entries());
      if (!payload.password) delete payload.password;
      try {
        await api(`/api/employees/${form.dataset.edit}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        await loadEmployees();
        state.error = "";
        render();
      } catch (error) {
        setError(error);
      }
    });
  });

  state.employees.forEach((employee) => bindEmployeeActions(employee.id));
}

function bindEmployeeActions(employeeId) {
  document.querySelectorAll(`[data-reset="${employeeId}"]`).forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Сбросить всю статистику смен сотрудника? Это действие нельзя отменить.")) return;
      await actionAndReload(`/api/employees/${employeeId}/reset`, "POST");
    });
  });
}

async function actionAndReload(path, method) {
  try {
    await api(path, { method });
    const me = await api("/api/me");
    state.me = me.user;
    if (state.me.role === "admin") await loadEmployees();
    state.error = "";
    render();
  } catch (error) {
    setError(error);
  }
}

bootstrap();
