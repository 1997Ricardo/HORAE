(() => {
  "use strict";

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];

  const STORE_KEY = "horae.v1";

  const DEFAULT_SCRIPT_URL =
    "https://script.google.com/macros/s/AKfycbwL1iR1tK3dEkIUH6EBEGUf8UvvghDi4J0TUpxRKgRTXZtN6iIyU6oIzRhSNWfdCVra/exec";

  const DEFAULT_SERVICES = [
    {
      id: "svc-responsable",
      name: "Responsable",
      rate: 12,
      color: "green",
      active: true
    },
    {
      id: "svc-manana",
      name: "Mañana",
      rate: 12,
      color: "blue",
      active: true
    }
  ];

  const now = new Date();

  const isoDate = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const monthKey = d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  const fmtMoney = n =>
    new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR"
    }).format(Number(n) || 0);

  const fmtHours = mins => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;

    return m
      ? `${h} h ${String(m).padStart(2, "0")} min`
      : `${h} h`;
  };

  const fmtDate = s => {
    if (!s) return "—";

    const d = new Date(`${s}T12:00:00`);

    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(d).replace(".", "");
  };

  const monthName = key => {
    const [y, m] = key.split("-").map(Number);

    return new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric"
    }).format(new Date(y, m - 1, 1));
  };

  const uid = prefix =>
    `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  let state = loadState();
  let activeMonth = monthKey(now);
  let deferredInstallPrompt = null;
  let toastTimer = null;
  let timerTick = null;
  let syncTimeout = null;

  // --------------------------------------------------
  // DATOS LOCALES
  // --------------------------------------------------

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);

      if (raw) {
        const parsed = JSON.parse(raw);

        return {
          records: Array.isArray(parsed.records) ? parsed.records : [],
          services:
            Array.isArray(parsed.services) && parsed.services.length
              ? parsed.services
              : DEFAULT_SERVICES.map(s => ({ ...s })),
          profile: parsed.profile || { name: "", company: "" },
          scriptUrl: parsed.scriptUrl || DEFAULT_SCRIPT_URL,
          timer: parsed.timer || null,
          connected: false
        };
      }
    } catch (e) {
      console.warn("No se pudieron leer los datos locales", e);
    }

    return {
      records: [],
      services: DEFAULT_SERVICES.map(s => ({ ...s })),
      profile: { name: "", company: "" },
      scriptUrl: DEFAULT_SCRIPT_URL,
      timer: null,
      connected: false
    };
  }

  function persist() {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        records: state.records,
        services: state.services,
        profile: state.profile,
        scriptUrl: state.scriptUrl,
        timer: state.timer || null
      })
    );
  }

  function serviceFor(id) {
    return (
      state.services.find(s => s.id === id) || {
        name: "Servicio eliminado",
        rate: 0,
        color: "green"
      }
    );
  }

  function durationMinutes(start, end) {
    if (!start || !end) return 0;

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);

    let diff = eh * 60 + em - (sh * 60 + sm);

    if (diff <= 0) diff += 1440;

    return diff;
  }

  function recordMinutes(record) {
    return Number.isFinite(record.minutes)
      ? record.minutes
      : durationMinutes(record.start, record.end);
  }

  function recordAmount(record) {
    return recordMinutes(record) / 60 * Number(record.rate || 0);
  }

  function recordsForMonth(key = activeMonth) {
    return state.records
      .filter(record => record.date && record.date.startsWith(key))
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) ||
          (b.start || "").localeCompare(a.start || "")
      );
  }

  function sumMinutes(records) {
    return records.reduce((total, record) => total + recordMinutes(record), 0);
  }

  function sumAmount(records) {
    return records.reduce((total, record) => total + recordAmount(record), 0);
  }

  // --------------------------------------------------
  // SELECTOR DE MES Y AÑO DEL INFORME
  // Requiere #reportMonth y #reportYear en index.html.
  // --------------------------------------------------

  function initReportPeriodControls() {
    const yearSelect = $("#reportYear");
    const currentYear = new Date().getFullYear();
    const years = new Set();

    for (let year = currentYear - 5; year <= currentYear + 5; year++) {
      years.add(year);
    }

    // Añade también los años de las jornadas existentes.
    state.records.forEach(record => {
      if (record.date) {
        const year = Number(record.date.slice(0, 4));

        if (Number.isInteger(year)) {
          years.add(year);
        }
      }
    });

    yearSelect.innerHTML = [...years]
      .sort((a, b) => b - a)
      .map(year => `<option value="${year}">${year}</option>`)
      .join("");
  }

  function getReportMonthKey() {
    const month = $("#reportMonth").value;
    const year = $("#reportYear").value;

    return month && year ? `${year}-${month}` : activeMonth;
  }

  function setReportMonthKey(key) {
    const [year, month] = key.split("-");

    $("#reportMonth").value = month;

    const yearSelect = $("#reportYear");

    const yearExists = [...yearSelect.options].some(
      option => option.value === year
    );

    if (!yearExists) {
      const option = document.createElement("option");

      option.value = year;
      option.textContent = year;

      yearSelect.appendChild(option);
    }

    yearSelect.value = year;
  }

  // --------------------------------------------------
  // MENSAJES Y CONEXIÓN
  // --------------------------------------------------

  function toast(message) {
    const el = $("#toast");

    if (!el) {
      console.log(message);
      return;
    }

    el.textContent = message;
    el.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
      el.classList.remove("show");
    }, 2800);
  }

  function updateConnectionUI(connected = state.connected) {
    state.connected = connected;

    $("#syncDot").classList.toggle("connected", connected);

    $("#syncTitle").textContent = connected
      ? "Google Sheets conectado"
      : "Modo local";

    $("#syncText").textContent = connected
      ? "Sincronización disponible"
      : "Pendiente de conectar Sheets";

    $("#connectionBadge").textContent = connected
      ? "Conectado"
      : "No conectado";

    $("#connectionBadge").classList.toggle("connected", connected);
  }

  // --------------------------------------------------
  // NAVEGACIÓN
  // --------------------------------------------------

  function setView(view) {
    $$(".view").forEach(section => {
      section.classList.toggle("active", section.id === `view-${view}`);
    });

    $$("[data-view]").forEach(button => {
      button.classList.toggle("active", button.dataset.view === view);
    });

    $("#pageName").textContent = ({
      dashboard: "Resumen",
      records: "Jornadas",
      services: "Servicios y tarifas",
      reports: "Informes",
      settings: "Configuración"
    })[view] || "Resumen";

    if (view === "reports") {
      if (!$("#reportMonth").value || !$("#reportYear").value) {
        setReportMonthKey(activeMonth);
      }
    }

    if (view === "records") renderRecords();
    if (view === "services") renderServices();

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  // --------------------------------------------------
  // ACTUALIZACIÓN GENERAL
  // --------------------------------------------------

  function renderAll() {
    renderDashboard();
    renderRecords();
    renderServices();
    renderServiceOptions();
    renderFilters();
    renderTimer();

    updateConnectionUI(state.connected);

    $("#monthTitle").textContent = monthName(activeMonth);

    $("#todayLabel").textContent = new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short"
    }).format(now);

    setReportMonthKey(activeMonth);

    $("#settingsName").value = state.profile.name || "";
    $("#settingsCompany").value = state.profile.company || "";

    $("#reportName").value = state.profile.name || "";
    $("#reportBoss").value = state.profile.company || "";

    $("#scriptUrl").value = state.scriptUrl || "";
  }

  // --------------------------------------------------
  // PANEL PRINCIPAL
  // --------------------------------------------------

  function renderDashboard() {
    const list = recordsForMonth();
    const mins = sumMinutes(list);
    const total = sumAmount(list);
    const days = new Set(list.map(record => record.date)).size;

    $("#statHours").textContent =
      (mins / 60).toLocaleString("es-ES", {
        maximumFractionDigits: 1
      }) + " h";

    $("#statTotal").textContent = fmtMoney(total);
    $("#statDays").textContent = days;

    $("#statDaysFoot").textContent =
      `${days} ${days === 1 ? "día" : "días"} con actividad este mes`;

    $("#statAverage").textContent = fmtMoney(days ? total / days : 0);

    const recent = $("#recentRecords");

    recent.innerHTML = "";

    if (!list.length) {
      recent.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">◷</div>
          <h3>Todo empieza aquí</h3>
          <p>Registra tu primera jornada del mes.</p>
          <button class="btn btn-primary" id="dashboardEmptyAdd">
            ＋ Añadir jornada
          </button>
        </div>
      `;

      $("#dashboardEmptyAdd").addEventListener("click", () => openRecord());
    } else {
      list.slice(0, 5).forEach(record => {
        const date = new Date(`${record.date}T12:00:00`);
        const service = serviceFor(record.serviceId);
        const row = document.createElement("div");

        row.className = "record-row";

        row.innerHTML = `
          <div class="record-date">
            <b>${date.getDate()}</b>
            <small>${new Intl.DateTimeFormat("es-ES", {
              month: "short"
            }).format(date).replace(".", "")}</small>
          </div>

          <div class="record-main">
            <strong>${esc(service.name)}</strong>
            <small>
              ${esc(record.start)} – ${esc(record.end)}
              · ${fmtHours(recordMinutes(record))}
            </small>
          </div>

          <div class="record-amount">
            ${fmtMoney(recordAmount(record))}
            <small>${fmtMoney(record.rate)}/h</small>
          </div>
        `;

        recent.appendChild(row);
      });
    }

    const breakdown = $("#serviceBreakdown");

    breakdown.innerHTML = "";

    const byService = new Map();

    list.forEach(record => {
      const service = serviceFor(record.serviceId);

      const item = byService.get(record.serviceId) || {
        name: service.name,
        total: 0,
        minutes: 0,
        color: service.color
      };

      item.total += recordAmount(record);
      item.minutes += recordMinutes(record);

      byService.set(record.serviceId, item);
    });

    const services = [...byService.values()].sort(
      (a, b) => b.total - a.total
    );

    if (!services.length) {
      breakdown.innerHTML =
        '<p class="settings-help">Todavía no hay servicios registrados este mes.</p>';
    } else {
      services.forEach(service => {
        const el = document.createElement("div");

        el.innerHTML = `
          <div class="breakdown-top">
            <span>${esc(service.name)}</span>
            <span>
              ${fmtMoney(service.total)} ·
              ${(service.minutes / 60).toLocaleString("es-ES", {
                maximumFractionDigits: 1
              })} h
            </span>
          </div>

          <div class="progress-track">
            <div
              class="progress-fill"
              style="width:${total ? Math.max(2, service.total / total * 100) : 0}%;
              opacity:${service.color === "green" ? 1 : 0.72}">
            </div>
          </div>
        `;

        breakdown.appendChild(el);
      });
    }

    $("#breakdownPeriod").textContent = monthName(activeMonth);
  }

  // --------------------------------------------------
  // LISTADO DE JORNADAS
  // --------------------------------------------------

  function renderRecords() {
    const query = ($("#recordSearch")?.value || "").trim().toLowerCase();
    const filter = $("#serviceFilter")?.value || "";

    const list = recordsForMonth().filter(record => {
      const service = serviceFor(record.serviceId);

      return (
        (!filter || record.serviceId === filter) &&
        (
          !query ||
          service.name.toLowerCase().includes(query) ||
          (record.notes || "").toLowerCase().includes(query)
        )
      );
    });

    $("#recordsTable").innerHTML = "";
    $("#recordsEmpty").hidden = list.length > 0;

    $("#recordCount").textContent =
      `${list.length} ${list.length === 1 ? "registro" : "registros"}`;

    list.forEach(record => {
      const service = serviceFor(record.serviceId);
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${fmtDate(record.date)}</td>

        <td>
          <span class="service-tag">
            <i class="service-dot ${esc(service.color)}"></i>
            ${esc(service.name)}
          </span>
          ${record.notes
            ? `<div class="td-muted" style="margin-top:5px;font-size:10px">${esc(record.notes)}</div>`
            : ""}
        </td>

        <td>${esc(record.start)} – ${esc(record.end)}</td>
        <td>${fmtHours(recordMinutes(record))}</td>
        <td>${fmtMoney(record.rate)}/h</td>
        <td><strong>${fmtMoney(recordAmount(record))}</strong></td>

        <td>
          <div class="row-actions">
            <button class="small-icon-btn" data-edit="${esc(record.id)}" title="Editar">✎</button>
            <button class="small-icon-btn delete" data-delete="${esc(record.id)}" title="Eliminar">×</button>
          </div>
        </td>
      `;

      $("#recordsTable").appendChild(tr);
    });

    $$("[data-edit]").forEach(button => {
      button.addEventListener("click", () => openRecord(button.dataset.edit));
    });

    $$("[data-delete]").forEach(button => {
      button.addEventListener("click", () => deleteRecord(button.dataset.delete));
    });
  }

  // --------------------------------------------------
  // SELECTORES DE SERVICIOS
  // --------------------------------------------------

  function renderServiceOptions() {
    const options = state.services
      .filter(service => service.active !== false)
      .map(service =>
        `<option value="${esc(service.id)}">${esc(service.name)}</option>`
      )
      .join("");

    $("#recordService").innerHTML =
      options || '<option value="">Crea primero un servicio</option>';

    const timerSelect = $("#timerService");
    const previous = timerSelect.value;

    timerSelect.innerHTML =
      options || '<option value="">Crea primero un servicio</option>';

    if (state.timer) {
      timerSelect.value = state.timer.serviceId;
    } else if (previous && state.services.some(service => service.id === previous)) {
      timerSelect.value = previous;
    }
  }

  function renderFilters() {
    const old = $("#serviceFilter").value;

    $("#serviceFilter").innerHTML =
      '<option value="">Todos los servicios</option>' +
      state.services.map(service =>
        `<option value="${esc(service.id)}">${esc(service.name)}</option>`
      ).join("");

    $("#serviceFilter").value = old;
  }

  // --------------------------------------------------
  // SERVICIOS Y TARIFAS
  // --------------------------------------------------

  function renderServices() {
    const root = $("#serviceCards");

    root.innerHTML = "";

    state.services.forEach(service => {
      const count = state.records.filter(
        record => record.serviceId === service.id
      ).length;

      const card = document.createElement("article");

      card.className = "service-card";

      card.innerHTML = `
        <div class="service-card-top">
          <div class="service-emblem ${esc(service.color)}">
            ${service.color === "blue" ? "◈" :
              service.color === "purple" ? "◇" :
              service.color === "orange" ? "◉" : "✳"}
          </div>

          <span class="period-pill">
            ${count} ${count === 1 ? "registro" : "registros"}
          </span>
        </div>

        <h3>${esc(service.name)}</h3>

        <div class="service-rate">
          ${fmtMoney(service.rate)}
          <small>/ hora</small>
        </div>

        <div class="service-meta">
          Tarifa aplicada a los nuevos registros
        </div>

        <div class="service-card-actions">
          <button class="btn btn-secondary" data-service-edit="${esc(service.id)}">
            Editar
          </button>

          <button class="btn btn-secondary" data-service-delete="${esc(service.id)}">
            Eliminar
          </button>
        </div>
      `;

      root.appendChild(card);
    });

    if (!state.services.length) {
      root.innerHTML = `
        <div class="empty-state">
          <h3>No hay servicios</h3>
          <p>Añade un servicio para empezar.</p>
        </div>
      `;
    }

    $$("[data-service-edit]").forEach(button => {
      button.addEventListener("click", () => openService(button.dataset.serviceEdit));
    });

    $$("[data-service-delete]").forEach(button => {
      button.addEventListener("click", () => deleteService(button.dataset.serviceDelete));
    });
  }

  // --------------------------------------------------
  // FORMULARIO DE JORNADAS
  // --------------------------------------------------

  function openRecord(id = null) {
    $("#recordForm").reset();
    $("#recordError").textContent = "";
    $("#recordId").value = id || "";

    renderServiceOptions();

    const record = id
      ? state.records.find(item => item.id === id)
      : null;

    $("#recordDialogTitle").textContent =
      record ? "Editar registro" : "Nueva jornada";

    $("#recordDate").value = record?.date || isoDate();
    $("#recordNotes").value = record?.notes || "";

    if (record) {
      $("#recordService").value = record.serviceId;
      $("#recordRate").value = Number(record.rate || 0);
      $("#recordStart").value = record.start || "";
      $("#recordEnd").value = record.end || "";
    } else {
      const service =
        state.services.find(item => item.active !== false) ||
        state.services[0];

      $("#recordService").value = service?.id || "";
      $("#recordRate").value = service?.rate ?? 12;
      $("#recordStart").value = "19:00";
      $("#recordEnd").value = "22:00";
    }

    updateDurationPreview();
    $("#recordDialog").showModal();
  }

  function updateDurationPreview() {
    const minutes = durationMinutes(
      $("#recordStart").value,
      $("#recordEnd").value
    );

    const rate = Number($("#recordRate").value) || 0;

    $("#durationPreview").textContent = fmtHours(minutes);
    $("#amountPreview").textContent = fmtMoney(minutes / 60 * rate);
  }

  function deleteRecord(id) {
    const record = state.records.find(item => item.id === id);

    if (!record) return;

    if (!confirm(`¿Eliminar la jornada del ${fmtDate(record.date)}?`)) {
      return;
    }

    state.records = state.records.filter(item => item.id !== id);

    persist();
    renderAll();
    queueSync();

    toast("Jornada eliminada");
  }

  // --------------------------------------------------
  // FORMULARIO DE SERVICIOS
  // --------------------------------------------------

  function openService(id = null) {
    $("#serviceForm").reset();
    $("#serviceError").textContent = "";

    const service = id
      ? state.services.find(item => item.id === id)
      : null;

    $("#serviceId").value = id || "";
    $("#serviceDialogTitle").textContent =
      service ? "Editar servicio" : "Nuevo servicio";

    $("#serviceName").value = service?.name || "";
    $("#serviceRate").value = service?.rate ?? 12;
    $("#serviceColor").value = service?.color || "green";

    $("#serviceDialog").showModal();
  }

  function deleteService(id) {
    const service = serviceFor(id);

    const used = state.records.some(
      record => record.serviceId === id
    );

    if (used) {
      if (!confirm(
        `Hay jornadas asociadas a "${service.name}". ` +
        "Si eliminas el servicio, las jornadas anteriores seguirán guardadas, " +
        "pero mostrarán 'Servicio eliminado'. ¿Continuar?"
      )) {
        return;
      }
    } else if (!confirm(`¿Eliminar el servicio "${service.name}"?`)) {
      return;
    }

    state.services = state.services.filter(item => item.id !== id);

    persist();
    renderAll();
    queueSync();

    toast("Servicio eliminado");
  }

  // --------------------------------------------------
  // SEGURIDAD Y ESCAPADO DE TEXTO
  // --------------------------------------------------

  function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

  // --------------------------------------------------
  // GOOGLE APPS SCRIPT
  // --------------------------------------------------

  async function api(action, payload = {}) {
    if (!state.scriptUrl) {
      throw new Error("Añade primero la URL de Apps Script en Configuración.");
    }

    const response = await fetch(state.scriptUrl.trim(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({ action, ...payload })
    });

    if (!response.ok) {
      throw new Error(`Error de conexión (${response.status}).`);
    }

    const data = await response.json();

    if (!data.ok) {
      throw new Error(data.error || "Apps Script ha devuelto un error.");
    }

    return data;
  }

  function queueSync() {
    if (!state.scriptUrl) return;

    clearTimeout(syncTimeout);

    syncTimeout = setTimeout(() => syncToCloud(false), 900);
  }

  async function syncToCloud(showMessage = true) {
    if (!state.scriptUrl) {
      if (showMessage) toast("Configura la URL de Apps Script primero.");
      return;
    }

    const btn = $("#connectBtn");

    btn.disabled = true;
    btn.textContent = "Sincronizando…";

    try {
      const result = await api("sync", {
        data: {
          records: state.records,
          services: state.services,
          profile: state.profile
        }
      });

      if (result.data) {
        state.records = Array.isArray(result.data.records)
          ? result.data.records
          : state.records;

        state.services =
          Array.isArray(result.data.services) && result.data.services.length
            ? result.data.services
            : state.services;

        state.profile = result.data.profile || state.profile;

        persist();
      }

      state.connected = true;

      renderAll();

      if (showMessage) {
        toast("Google Sheets sincronizado correctamente.");
      }
    } catch (error) {
      state.connected = false;

      updateConnectionUI(false);

      if (showMessage) {
        toast(error.message || "No se pudo conectar.");
      }

      console.error(error);
    } finally {
      btn.disabled = false;
      btn.textContent = "Conectar y sincronizar";
    }
  }

  // --------------------------------------------------
  // INFORMES MENSUALES
  // --------------------------------------------------

  function makeReport(key, name, company) {
    const list = recordsForMonth(key).slice().sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.start || "").localeCompare(b.start || "")
    );

    const minutes = sumMinutes(list);
    const total = sumAmount(list);
    const days = new Set(list.map(record => record.date)).size;

    const rows = list.map(record => `
      <tr>
        <td>${fmtDate(record.date)}</td>
        <td>${esc(serviceFor(record.serviceId).name)}</td>
        <td>${esc(record.start)} – ${esc(record.end)}</td>
        <td>${fmtHours(recordMinutes(record))}</td>
        <td>${fmtMoney(record.rate)}/h</td>
        <td>${fmtMoney(recordAmount(record))}</td>
      </tr>
    `).join("");

    const serviceTotals = new Map();

    list.forEach(record => {
      const service = serviceFor(record.serviceId);

      const old = serviceTotals.get(record.serviceId) || {
        name: service.name,
        minutes: 0,
        total: 0
      };

      old.minutes += recordMinutes(record);
      old.total += recordAmount(record);

      serviceTotals.set(record.serviceId, old);
    });

    const summary = [...serviceTotals.values()].map(service => `
      <tr>
        <td>${esc(service.name)}</td>
        <td>${fmtHours(service.minutes)}</td>
        <td>${fmtMoney(service.total)}</td>
      </tr>
    `).join("");

    return `
      <div class="report-document">
        <div class="report-brand">
          <div>
            <strong>HORAE</strong>
            <small>CONTROL HORARIO · INFORME MENSUAL</small>
          </div>

          <div class="report-month">
            <strong>${esc(monthName(key))}</strong>
            <p>Generado el ${fmtDate(isoDate())}</p>
          </div>
        </div>

        <h2>Informe de jornadas</h2>

        <p>
          Trabajador: <strong>${esc(name || "No especificado")}</strong><br>
          ${company
            ? `Responsable / empresa: <strong>${esc(company)}</strong><br>`
            : ""}
          Periodo: ${esc(monthName(key))}
        </p>

        <div class="report-summary">
          <div>
            <small>Horas registradas</small>
            <strong>${(minutes / 60).toLocaleString("es-ES", {
              maximumFractionDigits: 2
            })} h</strong>
          </div>

          <div>
            <small>Jornadas</small>
            <strong>${days}</strong>
          </div>

          <div>
            <small>Importe estimado</small>
            <strong>${fmtMoney(total)}</strong>
          </div>
        </div>

        <h3 style="font-size:14px;margin:28px 0 10px">
          Detalle de jornadas
        </h3>

        <table>
          <thead>
            <tr>
              <th>FECHA</th>
              <th>SERVICIO</th>
              <th>HORARIO</th>
              <th>DURACIÓN</th>
              <th>TARIFA</th>
              <th>IMPORTE</th>
            </tr>
          </thead>

          <tbody>
            ${rows || '<tr><td colspan="6">No hay jornadas registradas en este periodo.</td></tr>'}
          </tbody>
        </table>

        <h3 style="font-size:14px;margin:28px 0 10px">
          Resumen por servicio
        </h3>

        <table>
          <thead>
            <tr>
              <th>SERVICIO</th>
              <th>HORAS</th>
              <th>IMPORTE</th>
            </tr>
          </thead>

          <tbody>
            ${summary || '<tr><td colspan="3">Sin actividad</td></tr>'}
          </tbody>
        </table>

        <div class="report-total">
          TOTAL DEL MES: ${fmtMoney(total)}
        </div>

        <div class="report-signature">
          <div>Firma del trabajador</div>
          <div>Conformidad del responsable</div>
        </div>

        <p style="font-size:9px;margin-top:35px">
          Documento generado con HORAE. Los importes son estimaciones
          calculadas a partir de las tarifas configuradas y deben revisarse
          antes de su validación.
        </p>
      </div>
    `;
  }

  function showReport() {
    const key = getReportMonthKey();

    $("#reportPreview").innerHTML =
      '<div class="report-actions">' +
      '<button class="btn btn-primary" id="printReport">Imprimir / Guardar como PDF ↗</button>' +
      "</div>" +
      makeReport(
        key,
        $("#reportName").value.trim() || state.profile.name,
        $("#reportBoss").value.trim() || state.profile.company
      );

    $("#printReport")?.addEventListener("click", () => window.print());

    $("#reportPreview").scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  // --------------------------------------------------
  // COPIAS DE SEGURIDAD
  // --------------------------------------------------

  function exportJSON() {
    const blob = new Blob([
      JSON.stringify({
        version: 1,
        exportedAt: new Date().toISOString(),
        records: state.records,
        services: state.services,
        profile: state.profile,
        timer: state.timer || null
      }, null, 2)
    ], {
      type: "application/json"
    });

    downloadBlob(blob, `horae-copia-${isoDate()}.json`);
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = name;

    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
  }

  function exportCSV() {
    const list = recordsForMonth().slice().sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        (a.start || "").localeCompare(b.start || "")
    );

    const headers = [
      "Fecha",
      "Servicio",
      "Hora inicio",
      "Hora fin",
      "Duración (minutos)",
      "Tarifa €/h",
      "Importe €",
      "Notas"
    ];

    const rows = list.map(record => [
      record.date,
      serviceFor(record.serviceId).name,
      record.start,
      record.end,
      recordMinutes(record),
      Number(record.rate || 0).toFixed(2),
      recordAmount(record).toFixed(2),
      record.notes || ""
    ]);

    const csv = [headers, ...rows]
      .map(row =>
        row.map(value =>
          `"${String(value ?? "").replace(/"/g, '""')}"`
        ).join(";")
      )
      .join("\r\n");

    downloadBlob(
      new Blob(["\ufeff" + csv], {
        type: "text/csv;charset=utf-8"
      }),
      `horae-jornadas-${activeMonth}.csv`
    );

    toast("CSV mensual exportado");
  }

  // --------------------------------------------------
  // CRONÓMETRO
  // --------------------------------------------------

  function elapsedTimerMs() {
    return state.timer
      ? Math.max(0, Date.now() - Number(state.timer.startedAt))
      : 0;
  }

  function renderTimer() {
    const running = !!state.timer;

    $("#timerService").disabled = running;
    $("#timerStart").hidden = running;
    $("#timerStop").hidden = !running;

    $("#timerClock").textContent = running
      ? new Date(elapsedTimerMs()).toISOString().slice(11, 19)
      : "00:00:00";

    $("#timerTitle").textContent = running
      ? "Jornada en curso"
      : "¿Empezamos una jornada?";

    $("#timerDescription").textContent = running
      ? `${serviceFor(state.timer.serviceId).name} · Inicio ${state.timer.start} · ${fmtDate(state.timer.date)}`
      : "Inicia el cronómetro y guarda la jornada al terminar.";

    $(".timer-panel").classList.toggle("running", running);

    if (timerTick) clearInterval(timerTick);

    if (running) {
      timerTick = setInterval(() => {
        $("#timerClock").textContent =
          new Date(elapsedTimerMs()).toISOString().slice(11, 19);
      }, 1000);
    }
  }

  function startTimer() {
    if (state.timer) {
      toast("Ya hay una jornada en curso.");
      return;
    }

    const serviceId = $("#timerService").value;
    const service = serviceFor(serviceId);

    if (!serviceId) {
      toast("Crea o selecciona un servicio primero.");
      return;
    }

    const d = new Date();

    state.timer = {
      serviceId,
      startedAt: d.getTime(),
      date: isoDate(d),
      start: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
      rate: Number(service.rate) || 0
    };

    persist();
    renderTimer();

    toast("Cronómetro iniciado");
  }

  function stopTimer() {
    if (!state.timer) return;

    const timer = state.timer;

    const elapsed = Math.max(
      1,
      Math.round((Date.now() - Number(timer.startedAt)) / 60000)
    );

    if (elapsed > 24 * 60) {
      toast("La jornada supera 24 horas. Revisa el registro manualmente.");
      return;
    }

    const startMinutes =
      Number(timer.start.slice(0, 2)) * 60 +
      Number(timer.start.slice(3, 5));

    const endMinutes = (startMinutes + elapsed) % 1440;

    const end =
      `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:` +
      `${String(endMinutes % 60).padStart(2, "0")}`;

    const item = {
      id: uid("rec"),
      date: timer.date,
      start: timer.start,
      end,
      rate: Number(timer.rate) || 0,
      serviceId: timer.serviceId,
      minutes: elapsed,
      notes: "Registrado con cronómetro"
    };

    state.records.push(item);
    state.timer = null;

    activeMonth = monthKey(new Date(`${item.date}T12:00:00`));

    persist();
    renderAll();
    renderTimer();
    queueSync();

    toast(`Jornada guardada · ${fmtHours(elapsed)}`);
  }

  // --------------------------------------------------
  // SINCRONIZACIÓN AUTOMÁTICA
  // --------------------------------------------------

  function queueSync() {
    if (!state.scriptUrl) return;

    clearTimeout(syncTimeout);

    syncTimeout = setTimeout(() => syncToCloud(false), 900);
  }

  // --------------------------------------------------
  // EVENTOS
  // --------------------------------------------------

  function bind() {
    $$("[data-view]").forEach(button => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });

    $$("[data-goto]").forEach(button => {
      button.addEventListener("click", () => setView(button.dataset.goto));
    });

    $("#prevMonth").addEventListener("click", () => {
      const [year, month] = activeMonth.split("-").map(Number);

      activeMonth = monthKey(new Date(year, month - 2, 1));

      renderAll();
    });

    $("#nextMonth").addEventListener("click", () => {
      const [year, month] = activeMonth.split("-").map(Number);

      activeMonth = monthKey(new Date(year, month, 1));

      renderAll();
    });

    ["newRecordTop", "newRecordRecords", "quickAdd", "emptyAdd"].forEach(id => {
      $("#" + id)?.addEventListener("click", () => openRecord());
    });

    $("#newServiceBtn").addEventListener("click", () => openService());

    $("#timerStart").addEventListener("click", startTimer);
    $("#timerStop").addEventListener("click", stopTimer);

    $("#csvBackupBtn").addEventListener("click", exportCSV);

    ["recordStart", "recordEnd", "recordRate"].forEach(id => {
      $("#" + id).addEventListener("input", updateDurationPreview);
    });

    $("#recordService").addEventListener("change", () => {
      const service = serviceFor($("#recordService").value);

      $("#recordRate").value = service.rate;
      updateDurationPreview();
    });

    $("#recordForm").addEventListener("submit", event => {
      event.preventDefault();

      const id = $("#recordId").value;
      const date = $("#recordDate").value;
      const start = $("#recordStart").value;
      const end = $("#recordEnd").value;
      const rate = Number($("#recordRate").value);
      const serviceId = $("#recordService").value;

      if (
        !date ||
        !start ||
        !end ||
        !serviceId ||
        !Number.isFinite(rate) ||
        rate < 0
      ) {
        $("#recordError").textContent =
          "Revisa los campos obligatorios y la tarifa.";
        return;
      }

      if (start === end) {
        $("#recordError").textContent =
          "La hora de inicio y fin no pueden ser iguales.";
        return;
      }

      const minutes = durationMinutes(start, end);

      if (minutes <= 0 || minutes > 1440) {
        $("#recordError").textContent =
          "No se ha podido calcular la duración.";
        return;
      }

      const item = {
        id: id || uid("rec"),
        date,
        start,
        end,
        rate,
        serviceId,
        minutes,
        notes: $("#recordNotes").value.trim()
      };

      if (id) {
        state.records = state.records.map(record =>
          record.id === id ? item : record
        );
      } else {
        state.records.push(item);
      }

      activeMonth = monthKey(new Date(`${date}T12:00:00`));

      persist();
      $("#recordDialog").close();

      renderAll();
      queueSync();

      toast(id ? "Jornada actualizada" : "Jornada guardada correctamente");
    });

    $("#serviceForm").addEventListener("submit", event => {
      event.preventDefault();

      const id = $("#serviceId").value;
      const name = $("#serviceName").value.trim();
      const rate = Number($("#serviceRate").value);

      if (!name || !Number.isFinite(rate) || rate < 0) {
        $("#serviceError").textContent =
          "Introduce un nombre y una tarifa válida.";
        return;
      }

      if (state.services.some(service =>
        service.name.toLowerCase() === name.toLowerCase() &&
        service.id !== id
      )) {
        $("#serviceError").textContent =
          "Ya existe un servicio con ese nombre.";
        return;
      }

      const item = {
        id: id || uid("svc"),
        name,
        rate,
        color: $("#serviceColor").value,
        active: true
      };

      if (id) {
        state.services = state.services.map(service =>
          service.id === id ? item : service
        );
      } else {
        state.services.push(item);
      }

      persist();
      $("#serviceDialog").close();

      renderAll();
      queueSync();

      toast("Servicio guardado");
    });

    $$("[data-close]").forEach(button => {
      button.addEventListener("click", () => {
        $("#" + button.dataset.close).close();
      });
    });

    $("#recordSearch").addEventListener("input", renderRecords);
    $("#serviceFilter").addEventListener("change", renderRecords);

    $("#exportMonth").addEventListener("click", () => {
      setReportMonthKey(activeMonth);
      setView("reports");
      showReport();
    });

    $("#generateReport").addEventListener("click", showReport);

    // Actualiza el informe cuando cambia el mes o el año.
    $("#reportMonth").addEventListener("change", showReport);
    $("#reportYear").addEventListener("change", showReport);

    $("#saveProfile").addEventListener("click", () => {
      state.profile = {
        name: $("#settingsName").value.trim(),
        company: $("#settingsCompany").value.trim()
      };

      persist();

      $("#reportName").value = state.profile.name;
      $("#reportBoss").value = state.profile.company;

      queueSync();

      toast("Perfil guardado");
    });

    $("#connectBtn").addEventListener("click", async () => {
      state.scriptUrl = $("#scriptUrl").value.trim();

      persist();

      if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(state.scriptUrl)) {
        toast("Pega una URL válida de una aplicación web de Apps Script.");
        return;
      }

      if (
        !state.records.length &&
        !confirm(
          "La sincronización inicial enviará los datos locales a la hoja HORAE. " +
          "Si ya tienes registros en la hoja, no se importarán automáticamente. ¿Continuar?"
        )
      ) {
        return;
      }

      await syncToCloud(true);
    });

    $("#disconnectBtn").addEventListener("click", () => {
      state.connected = false;
      updateConnectionUI(false);

      toast("Sincronización pausada. Tus datos locales siguen guardados.");
    });

    $("#backupBtn").addEventListener("click", exportJSON);

    $("#restoreInput").addEventListener("change", async event => {
      const file = event.target.files?.[0];

      if (!file) return;

      try {
        const data = JSON.parse(await file.text());

        if (!Array.isArray(data.records) || !Array.isArray(data.services)) {
          throw new Error("Formato no válido");
        }

        if (!confirm(
          "Importar la copia reemplazará los registros, servicios y perfil locales actuales. ¿Continuar?"
        )) {
          return;
        }

        state.records = data.records;
        state.services = data.services;
        state.profile = data.profile || { name: "", company: "" };
        state.timer = data.timer || null;

        initReportPeriodControls();
        persist();
        renderAll();
        queueSync();

        toast("Copia importada correctamente");
      } catch (error) {
        toast("No se ha podido importar la copia JSON.");
        console.error(error);
      } finally {
        event.target.value = "";
      }
    });

    $("#clearLocalBtn").addEventListener("click", () => {
      if (!confirm(
        "Esto eliminará los datos guardados en este dispositivo. ¿Has descargado una copia de seguridad?"
      )) {
        return;
      }

      localStorage.removeItem(STORE_KEY);

      state = {
        records: [],
        services: DEFAULT_SERVICES.map(service => ({ ...service })),
        profile: { name: "", company: "" },
        scriptUrl: "",
        connected: false,
        timer: null
      };

      initReportPeriodControls();
      persist();
      renderAll();

      toast("Datos locales eliminados");
    });

    $("#installBtn").addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;

      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;

      deferredInstallPrompt = null;
      $("#installBtn").hidden = true;
    });

    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();

      deferredInstallPrompt = event;
      $("#installBtn").hidden = false;
    });

    window.addEventListener("online", () => {
      if (state.scriptUrl) syncToCloud(false);
    });

    window.addEventListener("offline", () => {
      toast("Sin conexión. Los datos locales siguen disponibles.");
    });
  }

  // --------------------------------------------------
  // INICIO DE LA APLICACIÓN
  // --------------------------------------------------

  initReportPeriodControls();
  bind();
  renderAll();

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(error => console.warn("Service worker no disponible", error));
  }
})();