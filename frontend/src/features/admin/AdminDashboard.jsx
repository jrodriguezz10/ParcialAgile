import { Banknote, Eye, ListChecks, Settings, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "../../components/layout";
import { ProfileCard } from "../../components/ui";
import { isValidEngineeringCareer } from "../../constants/catalogs";
import { api } from "../../lib/api";
import { currentPeriod } from "../../utils/format";
import { AdminRegisterPanel } from "./components/AdminRegisterPanel";
import { AdminRequestsPanel } from "./components/AdminRequestsPanel";
import { AdminReviewPanel } from "./components/AdminReviewPanel";
import { AdminSettingsPanel } from "./components/AdminSettingsPanel";
import { AdminMembersPanel } from "./components/AdminMembersPanel";
import {
  blankManualMember,
  createManualMemberPayload,
  memberFormFromDni,
  onlyDniDigits,
} from "./manualMember";
import { buildAdminNotifications } from "./notifications";

const ADMIN_NAV_ITEMS = [
  { keyName: "solicitudes", icon: ListChecks, label: "Solicitudes", text: "Revision documentaria" },
  { keyName: "detalle", icon: Eye, label: "Detalle", text: "Aprobar u observar" },
  { keyName: "registro", icon: UserPlus, label: "Registrar", text: "Presencial" },
  { keyName: "padron", icon: Banknote, label: "Caja y deudas", text: "Cobros y morosidad" },
  { keyName: "configuracion", icon: Settings, label: "Configuracion", text: "Admins" },
];
const CASHIER_NAV_KEYS = ["padron", "configuracion"];

const MONTHLY_AMOUNT = 2;
const staleLocalKeys = ["cip_local_applications", "cip_local_members", "cip_local_payments"];

function defaultPaymentMethods(total = MONTHLY_AMOUNT) {
  return [{ method: "EFECTIVO", amount: total }];
}

function clearStaleLocalFallback() {
  staleLocalKeys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignora navegadores sin localStorage disponible.
    }
  });
}

export function AdminDashboard({ token, onLogout }) {
  const [applications, setApplications] = useState([]);
  const [allApplications, setAllApplications] = useState([]);
  const [members, setMembers] = useState([]);
  const [allMembers, setAllMembers] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [adminInfo, setAdminInfo] = useState(null);
  const [selectedApp, setSelectedApp] = useState(null);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberPayments, setMemberPayments] = useState([]);
  const [applicationFilter, setApplicationFilter] = useState("OBSERVADO");
  const [memberFilter, setMemberFilter] = useState("TODOS");
  const [observations, setObservations] = useState("");
  const [manualPeriod, setManualPeriod] = useState(currentPeriod());
  const [paymentCount, setPaymentCount] = useState(1);
  const [manualPaymentMethods, setManualPaymentMethods] = useState(defaultPaymentMethods());
  const [adminForm, setAdminForm] = useState({ name: "", dni: "", email: "", phone: "", role: "ADMIN_SEDE", branch: "Consejo Nacional - Lima", password: "" });
  const [newAdmin, setNewAdmin] = useState({ name: "", dni: "", email: "", phone: "", role: "CAJERO", branch: "Consejo Nacional - Lima", password: "" });
  const [editingAdminId, setEditingAdminId] = useState(null);
  const [manualMember, setManualMember] = useState(blankManualMember);
  const [manualFiles, setManualFiles] = useState({ photo: null, degreePdf: null, receipt: null });
  const [registrationPayment, setRegistrationPayment] = useState({ period_month: currentPeriod(), method: "EFECTIVO", methods: defaultPaymentMethods() });
  const [dniLookupLoading, setDniLookupLoading] = useState(false);
  const [adminLookupLoading, setAdminLookupLoading] = useState(false);
  const [newAdminLookupLoading, setNewAdminLookupLoading] = useState(false);
  const [createdMember, setCreatedMember] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [applicationActionLoading, setApplicationActionLoading] = useState(false);
  const [activeModule, setActiveModule] = useState("solicitudes");
  const createdCardRef = useRef(null);
  const memberCardRef = useRef(null);
  const pendingSignatureRef = useRef("");
  const notificationsReadyRef = useRef(false);

  async function loadAdminProfile() {
    const data = await api("/api/admin/me", { token });
    setAdminInfo(data);
    setAdminForm({
      name: data.name || "",
      dni: data.dni || "",
      email: data.email || "",
      phone: data.phone || "",
      role: data.role || "ADMIN_SEDE",
      branch: data.branch || "Consejo Nacional - Lima",
      password: "",
    });
    return data;
  }

  async function loadAdminUsers() {
    const data = await api("/api/admin/admins", { token });
    setAdmins(data);
  }

  async function loadApplications(filter = applicationFilter) {
    const data = await api(`/api/admin/applications?status=${filter}`, { token });
    setApplications(data);
    if (selectedApp) {
      const refreshed = data.find((item) => item.id === selectedApp.id);
      setSelectedApp(refreshed || null);
    }
  }

  async function loadApplicationSummary() {
    const data = await api("/api/admin/applications?status=TODOS", { token });
    setAllApplications(data);
  }

  async function loadMembers(filter = memberFilter) {
    const data = await api(`/api/admin/members?status=${filter}`, { token });
    setMembers(data);
    if (selectedMember) {
      const refreshed = data.find((item) => item.id === selectedMember.id);
      if (refreshed) setSelectedMember(refreshed);
    }
  }

  async function loadMemberSummary() {
    const data = await api("/api/admin/members?status=TODOS", { token });
    setAllMembers(data);
  }

  async function refreshMembersPanel() {
    setMessage("");
    try {
      await Promise.all([loadMembers(memberFilter), loadMemberSummary()]);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function refreshSelectedMember(memberId) {
    const [memberList, payments] = await Promise.all([
      api("/api/admin/members?status=TODOS", { token }),
      api(`/api/admin/members/${memberId}/payments`, { token }),
    ]);
    setAllMembers(memberList);
    const refreshed = memberList.find((item) => String(item.id) === String(memberId));
    if (refreshed) setSelectedMember(refreshed);
    setMemberPayments(payments);
    return refreshed;
  }

  async function loadAll() {
    setLoading(true);
    setMessage("");
    try {
      clearStaleLocalFallback();
      const profile = await loadAdminProfile();
      if (profile?.role === "CAJERO") {
        setMemberFilter("INHABILITADO");
        setActiveModule((current) => (CASHIER_NAV_KEYS.includes(current) ? current : "padron"));
        await Promise.all([loadApplications(applicationFilter), loadApplicationSummary(), loadMembers("INHABILITADO"), loadMemberSummary()]);
      } else {
        await Promise.all([loadApplications(applicationFilter), loadApplicationSummary(), loadMembers(memberFilter), loadMemberSummary(), loadAdminUsers()]);
      }
    } catch (error) {
      if (/sesion vencida|token requerido|no autorizado/i.test(error.message)) {
        onLogout();
        return;
      }
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, [token]);

  useEffect(() => {
    if (adminInfo?.role === "CAJERO" && !CASHIER_NAV_KEYS.includes(activeModule)) {
      setActiveModule("padron");
      setMemberFilter("INHABILITADO");
    }
  }, [adminInfo?.role, activeModule]);

  useEffect(() => {
    const unlock = () => {
      unlockAdminNotificationSound();
      if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!adminInfo) return undefined;
    const timer = window.setInterval(() => {
      const refreshes = [
        loadApplications(applicationFilter),
        loadApplicationSummary(),
        loadMembers(memberFilter),
        loadMemberSummary(),
      ];
      if (selectedMember?.id) refreshes.push(refreshSelectedMember(selectedMember.id));
      Promise.all(refreshes).catch((error) => setMessage(error.message));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [token, applicationFilter, memberFilter, selectedMember?.id, adminInfo?.role]);

  useEffect(() => {
    if (!adminInfo) return;
    loadApplications(applicationFilter).catch((error) => setMessage(error.message));
  }, [applicationFilter, token, adminInfo?.role]);

  useEffect(() => {
    loadMembers(memberFilter).catch((error) => setMessage(error.message));
  }, [memberFilter, token]);

  async function actOnApplication(action) {
    if (!selectedApp || applicationActionLoading) return;
    setMessage("");
    setApplicationActionLoading(true);
    try {
      const result = await api(`/api/admin/applications/${selectedApp.id}/${action}`, {
        method: "POST",
        token,
        body: { observations },
      });
      setObservations("");
      setSelectedApp(null);
      await loadAll();
      setMessage(result?.message || applicationActionMessage(action));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setApplicationActionLoading(false);
    }
  }

  async function openMemberPayments(member) {
    setSelectedMember(member);
    setManualPeriod(currentPeriod());
    setPaymentCount(1);
    setManualPaymentMethods(defaultPaymentMethods());
    try {
      const data = await api(`/api/admin/members/${member.id}/payments`, { token });
      setMemberPayments(data);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveAdminProfile(event) {
    event.preventDefault();
    setMessage("");
    try {
      const bodyPayload = {
        name: adminForm.name,
        dni: onlyDniDigits(adminForm.dni),
        email: adminForm.email,
        phone: onlyPhoneDigits(adminForm.phone),
        role: adminForm.role,
        branch: adminForm.branch,
      };
      if (adminForm.password) bodyPayload.password = adminForm.password;

      const data = await api("/api/admin/profile", {
        method: "PUT",
        token,
        body: bodyPayload,
      });
      setAdminInfo(data);
      setAdminForm({
        name: data.name,
        dni: data.dni || "",
        email: data.email,
        phone: data.phone || "",
        role: data.role || "ADMIN_SEDE",
        branch: data.branch || "Consejo Nacional - Lima",
        password: "",
      });
      if (adminInfo?.role !== "CAJERO") await loadAdminUsers();
      setMessage("Configuración del administrador actualizada.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function saveAdminAccess(event) {
    event.preventDefault();
    setMessage("");
    try {
      await api(editingAdminId ? `/api/admin/admins/${editingAdminId}` : "/api/admin/admins", {
        method: editingAdminId ? "PUT" : "POST",
        token,
        body: {
          ...newAdmin,
          dni: onlyDniDigits(newAdmin.dni),
          phone: onlyPhoneDigits(newAdmin.phone),
          branch: adminInfo?.branch === "Consejo Nacional - Lima" ? newAdmin.branch : adminInfo?.branch,
        },
      });
      const wasEditing = Boolean(editingAdminId);
      setEditingAdminId(null);
      setNewAdmin({ name: "", dni: "", email: "", phone: "", role: "CAJERO", branch: adminInfo?.branch || "Consejo Nacional - Lima", password: "" });
      await loadAdminUsers();
      setMessage(wasEditing ? "Usuario administrativo actualizado." : "Nuevo administrador creado.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function startEditAdmin(admin) {
    setEditingAdminId(admin.id);
    setNewAdmin({
      name: admin.name || "",
      dni: admin.dni || "",
      email: admin.email || "",
      phone: admin.phone || "",
      role: admin.role || "ADMIN_SEDE",
      branch: admin.branch || adminInfo?.branch || "Consejo Nacional - Lima",
      password: "",
    });
    setMessage("Editando acceso administrativo.");
  }

  function cancelEditAdmin() {
    setEditingAdminId(null);
    setNewAdmin({ name: "", dni: "", email: "", phone: "", role: "CAJERO", branch: adminInfo?.branch || "Consejo Nacional - Lima", password: "" });
  }

  async function toggleAdminDisabled(admin) {
    if (Number(admin.id) === Number(adminInfo?.id)) {
      setMessage("No puedes deshabilitar tu propia cuenta.");
      return;
    }
    setMessage("");
    try {
      await api(`/api/admin/admins/${admin.id}/disabled`, {
        method: "PATCH",
        token,
        body: { disabled: !admin.disabled_at },
      });
      await loadAdminUsers();
      setMessage(admin.disabled_at ? "Usuario habilitado nuevamente." : "Usuario deshabilitado.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function deleteAdminAccess(admin) {
    const confirmText = admin.disabled_at
      ? `Eliminar definitivamente el acceso de ${admin.name}?`
      : `${admin.name} aun esta habilitado. Se eliminara definitivamente el acceso. Continuar?`;
    if (!window.confirm(confirmText)) return;
    setMessage("");
    try {
      await api(`/api/admin/admins/${admin.id}`, { method: "DELETE", token, body: { confirmed_disabled: true } });
      if (Number(editingAdminId) === Number(admin.id)) cancelEditAdmin();
      await loadAdminUsers();
      setMessage("Usuario eliminado.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function lookupManualDni() {
    const dni = onlyDniDigits(manualMember.dni);
    setManualMember((current) => ({ ...current, dni }));
    if (dni.length !== 8) {
      setMessage("Ingresa un DNI de 8 digitos para consultar.");
      return;
    }

    setDniLookupLoading(true);
    setMessage("");
    try {
      const data = await api(`/api/dni/${dni}`);
      setManualMember((current) => memberFormFromDni(current, dni, data));
      setMessage("Datos del DNI cargados exitosamente.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDniLookupLoading(false);
    }
  }

  async function lookupAdminDni(target) {
    const isNewAdmin = target === "new";
    const form = isNewAdmin ? newAdmin : adminForm;
    const setForm = isNewAdmin ? setNewAdmin : setAdminForm;
    const setLookupLoading = isNewAdmin ? setNewAdminLookupLoading : setAdminLookupLoading;
    const dni = onlyDniDigits(form.dni);

    setForm((current) => ({ ...current, dni }));
    if (dni.length !== 8) {
      setMessage("Ingresa un DNI de 8 digitos para consultar.");
      return;
    }

    setLookupLoading(true);
    setMessage("");
    try {
      const data = await api(`/api/dni/${dni}`);
      setForm((current) => ({ ...current, dni, name: data.full_name || current.name }));
      setMessage("Datos del DNI cargados exitosamente.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLookupLoading(false);
    }
  }

  async function createManualMember(event) {
    event.preventDefault();
    setMessage("");
    if (!isValidEngineeringCareer(manualMember.profession)) {
      setMessage("Selecciona una profesion valida de la lista.");
      return;
    }
    const payload = createManualMemberPayload(
      { ...manualMember, dni: onlyDniDigits(manualMember.dni) },
      manualFiles,
      registrationPayment
    );

    try {
      const data = await api("/api/admin/manual-members", {
        method: "POST",
        token,
        body: payload,
        form: true,
      });
      setCreatedMember(data);
      setSelectedMember(data);
      setManualFiles({ photo: null, degreePdf: null, receipt: null });
      setManualMember(blankManualMember);
      setRegistrationPayment({ period_month: currentPeriod(), method: "EFECTIVO", methods: defaultPaymentMethods() });
      await Promise.all([loadMembers(), loadMemberSummary(), loadApplicationSummary()]);
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank", "noopener,noreferrer");
        setMessage("Colegiado registrado con pago pendiente en Mercado Pago.");
      } else {
        setMessage("Colegiado registrado.");
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function registerManualPayment(event) {
    event.preventDefault();
    await registerManualPaymentFor(manualPeriod, paymentCount);
  }

  async function registerManualPaymentFor(startPeriod, count = 1, methods = manualPaymentMethods) {
    if (!selectedMember) return;
    setMessage("");
    try {
      const periods = Array.from({ length: count }, (_, index) => {
        const [year, month] = startPeriod.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1 + index, 1));
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      });
      await api(`/api/admin/members/${selectedMember.id}/payments`, {
        method: "POST",
        token,
        body: { periods, amount: MONTHLY_AMOUNT, payment_methods: methods },
      });
      const paidMemberId = selectedMember.id;
      const refreshedMember = await refreshSelectedMember(paidMemberId);
      const nextFilter =
        memberFilter !== "TODOS" && refreshedMember?.status && refreshedMember.status !== memberFilter
          ? "TODOS"
          : memberFilter;
      if (nextFilter !== memberFilter) setMemberFilter(nextFilter);
      await loadMembers(nextFilter);
      setMessage("Pago manual registrado.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  function updatePaymentCount(value) {
    const nextCount = Math.max(1, Number(value) || 1);
    setPaymentCount(nextCount);
    setManualPaymentMethods((current) =>
      current.length === 1 ? [{ ...current[0], amount: nextCount * MONTHLY_AMOUNT }] : current
    );
  }

  async function notifyEmail(member) {
    setMessage("");
    try {
      const data = await api(`/api/admin/members/${member.id}/notify-email`, { method: "POST", token });
      setMessage(data.message || "Notificacion de deuda procesada.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  const stats = useMemo(() => {
    const applicationSource = allApplications.length ? allApplications : applications;
    const memberSource = allMembers.length ? allMembers : members;
    const pending = applicationSource.filter((item) => item.status === "PENDIENTE").length;
    const enabled = memberSource.filter((item) => item.status === "HABILITADO").length;
    const disabled = memberSource.filter((item) => item.status === "INHABILITADO").length;
    return { pending, enabled, disabled };
  }, [allApplications, allMembers, applications, members]);

  const pendingApplications = useMemo(() => {
    const source = allApplications.length ? allApplications : applications;
    return source.filter((item) => item.status === "PENDIENTE").sort(compareApplicationsByDate);
  }, [allApplications, applications]);

  const adminNotifications = useMemo(() => {
    const applicationSource = allApplications.length ? allApplications : applications;
    const memberSource = allMembers.length ? allMembers : members;
    return buildAdminNotifications({
      applications: applicationSource,
      members: memberSource,
      openApplications: (status) => {
        if (adminInfo?.role === "CAJERO") return;
        if (status === "PENDIENTE") {
          setActiveModule("solicitudes");
        } else {
          setApplicationFilter(status);
          setActiveModule("detalle");
        }
      },
      openMembers: (status) => {
        setMemberFilter(status);
        setActiveModule("padron");
        setMessage("Los inhabilitados se calculan automaticamente por mensualidades vencidas.");
      },
    });
  }, [adminInfo?.role, allApplications, allMembers, applications, members]);

  useEffect(() => {
    if (!adminInfo?.id) return;
    const pendingIds = allApplications
      .filter((item) => item.status === "PENDIENTE")
      .map((item) => `${item.id}:${item.submitted_at || item.updated_at || ""}`)
      .sort()
      .filter(Boolean);
    const notifiedKey = `cip_admin_pending_notified:${adminInfo.id}`;
    if (!notificationsReadyRef.current) {
      pendingSignatureRef.current = pendingIds.join(",");
      writeStoredPendingNotifications(notifiedKey, [
        ...readStoredPendingNotifications(notifiedKey),
        ...pendingIds,
      ]);
      notificationsReadyRef.current = true;
      return;
    }
    const alreadyNotified = readStoredPendingNotifications(notifiedKey);
    const newPending = pendingIds.filter((id) => !alreadyNotified.includes(id));
    pendingSignatureRef.current = pendingIds.join(",");
    if (newPending.length) {
      writeStoredPendingNotifications(notifiedKey, [...alreadyNotified, ...newPending]);
      playAdminNotificationSound();
      showAdminBrowserNotification();
    }
  }, [allApplications, adminInfo?.id]);

  function selectApplication(application) {
    if (adminInfo?.role === "CAJERO") return;
    setSelectedApp(application);
    setObservations(application.observations || "");
    setActiveModule("detalle");
  }

  return (
    <DashboardShell
      label="Panel administrador"
      title="Control de colegiación"
      subtitle="Revise expedientes, apruebe solicitudes y controle pagos mensuales desde un solo tablero."
      activeKey={activeModule}
      onSelect={(key) => {
        if (adminInfo?.role === "CAJERO" && !CASHIER_NAV_KEYS.includes(key)) return;
        setActiveModule(key);
      }}
      onLogout={onLogout}
      notifications={adminNotifications}
      notificationScope="admin"
      profile={
        <ProfileCard
          compact
          name={adminInfo?.name || "Administrador CIP"}
          subtitle={adminInfo?.email || "Consejo Nacional"}
          detail={adminInfo?.role === "CAJERO" ? `${stats.disabled} colegiados inhabilitados` : `${stats.pending} solicitudes pendientes`}
        />
      }
      navItems={adminInfo?.role === "CAJERO" ? ADMIN_NAV_ITEMS.filter((item) => CASHIER_NAV_KEYS.includes(item.keyName)) : ADMIN_NAV_ITEMS}
      summary={adminInfo?.role === "CAJERO"
        ? [{ icon: Banknote, label: "Colegiaturas vencidas", value: stats.disabled }]
        : [{ icon: ListChecks, label: "Solicitudes pendientes", value: pendingApplications.length }]}
    >
      {message && <div className="banner">{message}</div>}
      {loading && <div className="loading">Cargando panel...</div>}

      <div className={`workspace admin-workspace module-${activeModule}`}>
        <AdminRequestsPanel
          activeModule={activeModule}
          applications={pendingApplications}
          selectedApp={selectedApp}
          onSelectApplication={selectApplication}
        />
        <AdminReviewPanel
          activeModule={activeModule}
          applications={applications}
          applicationFilter={applicationFilter}
          selectedApp={selectedApp}
          observations={observations}
          onFilterChange={setApplicationFilter}
          onObservationsChange={setObservations}
          onSelectApplication={selectApplication}
          onCloseSelection={() => {
            setSelectedApp(null);
            setObservations("");
          }}
          onAction={actOnApplication}
          canReview={adminInfo?.role !== "CAJERO"}
          actionLoading={applicationActionLoading}
        />
      </div>

      <AdminRegisterPanel
        activeModule={activeModule}
        createdMember={createdMember}
        createdCardRef={createdCardRef}
        manualMember={manualMember}
        registrationPayment={registrationPayment}
        dniLookupLoading={dniLookupLoading}
        onManualMemberChange={setManualMember}
        onManualFileChange={setManualFiles}
        onRegistrationPaymentChange={setRegistrationPayment}
        onLookupDni={lookupManualDni}
        onSubmit={createManualMember}
        onlyDniDigits={onlyDniDigits}
      />

      <AdminMembersPanel
        activeModule={activeModule} members={members} memberFilter={memberFilter}
        selectedMember={selectedMember} memberPayments={memberPayments} manualPeriod={manualPeriod} paymentCount={paymentCount}
        manualPaymentMethods={manualPaymentMethods}
        memberCardRef={memberCardRef} onFilterChange={setMemberFilter} onRefresh={refreshMembersPanel}
        onOpenPayments={openMemberPayments} onManualPeriodChange={setManualPeriod} onPaymentCountChange={updatePaymentCount}
        onManualPaymentMethodsChange={setManualPaymentMethods}
        onRegisterPayment={registerManualPayment} onOpenCard={openMemberPayments}
        onRegisterSinglePeriod={(period) => {
          setManualPeriod(period);
          setPaymentCount(1);
          setManualPaymentMethods(defaultPaymentMethods());
          return registerManualPaymentFor(period, 1, defaultPaymentMethods());
        }}
        onNotifyEmail={notifyEmail}
        onCloseMember={() => { setSelectedMember(null); setMemberPayments([]); }}
      />

      <AdminSettingsPanel
        activeModule={activeModule}
        admins={admins}
        adminInfo={adminInfo}
        members={members}
        adminForm={adminForm}
        newAdmin={newAdmin}
        editingAdminId={editingAdminId}
        adminLookupLoading={adminLookupLoading}
        newAdminLookupLoading={newAdminLookupLoading}
        onRefresh={loadAll}
        onAdminFormChange={setAdminForm}
        onNewAdminChange={setNewAdmin}
        onLookupAdminDni={lookupAdminDni}
        onSaveProfile={saveAdminProfile}
        onSaveAdminAccess={saveAdminAccess}
        onEditAdmin={startEditAdmin}
        onCancelEditAdmin={cancelEditAdmin}
        onToggleAdminDisabled={toggleAdminDisabled}
        onDeleteAdmin={deleteAdminAccess}
      />
    </DashboardShell>
  );
}

function compareApplicationsByDate(left, right) {
  return applicationTimestamp(right) - applicationTimestamp(left);
}

function applicationTimestamp(application) {
  const rawDate = application.updated_at || application.updatedAt || application.created_at || application.createdAt || application.date;
  const timestamp = rawDate ? Date.parse(rawDate) : Number.NaN;
  if (Number.isFinite(timestamp)) return timestamp;
  return Number(application.id) || 0;
}

function applicationActionMessage(action) {
  if (action === "approve") return "Solicitud aprobada y carnet generado.";
  if (action === "observe") return "Solicitud observada. El colegiado podra corregir sus datos sin pagar otra vez.";
  if (action === "reject") return "Solicitud rechazada.";
  return "Solicitud actualizada.";
}

function readStoredPendingNotifications(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeStoredPendingNotifications(key, values) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(new Set(values)).slice(-200)));
  } catch {
    // Si el navegador bloquea storage, solo se evita persistir la marca sonora.
  }
}

function onlyPhoneDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 9);
}

let adminAudioContext = null;

function unlockAdminNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!adminAudioContext) adminAudioContext = new AudioContext();
    if (adminAudioContext.state === "suspended") adminAudioContext.resume();
  } catch {
    // El navegador puede bloquear audio si no hubo interaccion previa.
  }
}

function playAdminNotificationSound() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = adminAudioContext || new AudioContext();
    adminAudioContext = context;
    if (context.state === "suspended") context.resume();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.45);

    [880, 1174].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.16);
      oscillator.stop(context.currentTime + index * 0.16 + 0.14);
    });
  } catch {
    // El navegador puede bloquear audio si no hubo interaccion previa.
  }
}

function showAdminBrowserNotification() {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    new Notification("Nueva solicitud CIP", {
      body: "Hay una solicitud pendiente de revision.",
      icon: "/assets/cip-logo-CFVHS1pE.png",
    });
  } catch {
    // Algunas plataformas moviles limitan las notificaciones del navegador.
  }
}
