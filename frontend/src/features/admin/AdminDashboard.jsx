import { Banknote, Eye, ListChecks, Settings, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "../../components/layout";
import { ProfileCard } from "../../components/ui";
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
  const [adminForm, setAdminForm] = useState({ name: "", dni: "", email: "", phone: "", role: "ADMIN_SEDE", branch: "Consejo Nacional - Lima", password: "" });
  const [newAdmin, setNewAdmin] = useState({ name: "", dni: "", email: "", phone: "", role: "CAJERO", branch: "Consejo Nacional - Lima", password: "" });
  const [manualMember, setManualMember] = useState(blankManualMember);
  const [manualFiles, setManualFiles] = useState({ photo: null, degreePdf: null, receipt: null });
  const [registrationPayment, setRegistrationPayment] = useState({ period_month: currentPeriod(), method: "EFECTIVO" });
  const [dniLookupLoading, setDniLookupLoading] = useState(false);
  const [adminLookupLoading, setAdminLookupLoading] = useState(false);
  const [newAdminLookupLoading, setNewAdminLookupLoading] = useState(false);
  const [createdMember, setCreatedMember] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
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

  async function loadAll() {
    setLoading(true);
    setMessage("");
    try {
      const profile = await loadAdminProfile();
      if (profile?.role === "CAJERO") {
        await Promise.all([loadMembers(), loadMemberSummary()]);
      } else {
        await Promise.all([loadApplications(), loadApplicationSummary(), loadMembers(), loadMemberSummary(), loadAdminUsers()]);
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
    if (adminInfo?.role === "CAJERO") setActiveModule("padron");
  }, [adminInfo?.role]);

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
    const timer = window.setInterval(() => {
      Promise.all([loadApplications(applicationFilter), loadApplicationSummary()]).catch((error) => setMessage(error.message));
    }, 15000);
    return () => window.clearInterval(timer);
  }, [token, applicationFilter]);

  useEffect(() => {
    loadApplications(applicationFilter).catch((error) => setMessage(error.message));
  }, [applicationFilter, token]);

  useEffect(() => {
    loadMembers(memberFilter).catch((error) => setMessage(error.message));
  }, [memberFilter, token]);

  async function actOnApplication(action) {
    if (!selectedApp) return;
    setMessage("");
    try {
      await api(`/api/admin/applications/${selectedApp.id}/${action}`, {
        method: "POST",
        token,
        body: { observations },
      });
      setObservations("");
      await loadAll();
      setMessage("Solicitud actualizada.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function openMemberPayments(member) {
    setSelectedMember(member);
    setManualPeriod(currentPeriod());
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
      await loadAdminUsers();
      setMessage("Configuración del administrador actualizada.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function createAdmin(event) {
    event.preventDefault();
    setMessage("");
    try {
      await api("/api/admin/admins", {
        method: "POST",
        token,
        body: { ...newAdmin, dni: onlyDniDigits(newAdmin.dni), phone: onlyPhoneDigits(newAdmin.phone) },
      });
      setNewAdmin({ name: "", dni: "", email: "", phone: "", role: "CAJERO", branch: adminInfo?.branch || "Consejo Nacional - Lima", password: "" });
      await loadAdminUsers();
      setMessage("Nuevo administrador creado.");
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
      setRegistrationPayment({ period_month: currentPeriod(), method: "EFECTIVO" });
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
    if (!selectedMember) return;
    setMessage("");
    try {
      const periods = Array.from({ length: paymentCount }, (_, index) => {
        const [year, month] = manualPeriod.split("-").map(Number);
        const date = new Date(Date.UTC(year, month - 1 + index, 1));
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      });
      await api(`/api/admin/members/${selectedMember.id}/payments`, {
        method: "POST",
        token,
        body: { periods, amount: 20 },
      });
      await Promise.all([loadMembers(), loadMemberSummary(), openMemberPayments(selectedMember)]);
      setMessage("Pago manual registrado.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function notifyWhatsApp(member) {
    setMessage("");
    try {
      const data = await api(`/api/admin/members/${member.id}/notify-whatsapp`, { method: "POST", token });
      if (data.whatsapp_url) window.open(data.whatsapp_url, "_blank", "noopener,noreferrer");
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
  }, [allApplications, allMembers, applications, members]);

  useEffect(() => {
    const pendingIds = allApplications
      .filter((item) => item.status === "PENDIENTE")
      .map((item) => String(item.id))
      .sort()
      .join(",");
    if (!notificationsReadyRef.current) {
      pendingSignatureRef.current = pendingIds;
      notificationsReadyRef.current = true;
      return;
    }
    const previous = pendingSignatureRef.current ? pendingSignatureRef.current.split(",").filter(Boolean) : [];
    const current = pendingIds ? pendingIds.split(",").filter(Boolean) : [];
    const hasNew = current.some((id) => !previous.includes(id));
    pendingSignatureRef.current = pendingIds;
    if (hasNew) {
      playAdminNotificationSound();
      showAdminBrowserNotification();
    }
  }, [allApplications]);

  function selectApplication(application) {
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
      onSelect={setActiveModule}
      onLogout={onLogout}
      notifications={adminNotifications}
      notificationScope="admin"
      profile={
        <ProfileCard
          compact
          name={adminInfo?.name || "Administrador CIP"}
          subtitle={adminInfo?.email || "Consejo Nacional"}
          detail={`${stats.pending} solicitudes pendientes`}
        />
      }
      navItems={adminInfo?.role === "CAJERO" ? ADMIN_NAV_ITEMS.filter((item) => item.keyName === "padron") : ADMIN_NAV_ITEMS}
      summary={[
        { icon: ListChecks, label: "Solicitudes pendientes", value: pendingApplications.length },
      ]}
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
        memberCardRef={memberCardRef} onFilterChange={setMemberFilter} onRefresh={loadAll}
        onOpenPayments={openMemberPayments} onManualPeriodChange={setManualPeriod} onPaymentCountChange={setPaymentCount}
        onRegisterPayment={registerManualPayment} onOpenCard={openMemberPayments}
        onNotifyWhatsApp={notifyWhatsApp}
        onCloseMember={() => { setSelectedMember(null); setMemberPayments([]); }}
      />

      <AdminSettingsPanel
        activeModule={activeModule}
        admins={admins}
        members={members}
        adminForm={adminForm}
        newAdmin={newAdmin}
        adminLookupLoading={adminLookupLoading}
        newAdminLookupLoading={newAdminLookupLoading}
        onRefresh={loadAll}
        onAdminFormChange={setAdminForm}
        onNewAdminChange={setNewAdmin}
        onLookupAdminDni={lookupAdminDni}
        onSaveProfile={saveAdminProfile}
        onCreateAdmin={createAdmin}
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
