import { CheckCircle2, Eye, ListChecks, Settings, ShieldCheck, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell } from "../../components/layout";
import { ProfileCard } from "../../components/ui";
import { api } from "../../lib/api";
import { currentPeriod } from "../../utils/format";
import { AdminMembersPanel } from "./components/AdminMembersPanel";
import { AdminRegisterPanel } from "./components/AdminRegisterPanel";
import { AdminRequestsPanel } from "./components/AdminRequestsPanel";
import { AdminReviewPanel } from "./components/AdminReviewPanel";
import { AdminSettingsPanel } from "./components/AdminSettingsPanel";
import {
  blankManualMember,
  createManualMemberPayload,
  memberFormFromDni,
  onlyDniDigits,
} from "./manualMember";
import { buildAdminNotifications } from "./notifications";

const ADMIN_NAV_ITEMS = [
  { keyName: "solicitudes", icon: ListChecks, label: "Solicitudes", text: "Revisión documentaria" },
  { keyName: "detalle", icon: Eye, label: "Detalle", text: "Aprobar u observar" },
  { keyName: "registro", icon: UserPlus, label: "Registrar", text: "Presencial" },
  { keyName: "padron", icon: ShieldCheck, label: "Padrón", text: "Habilitados y pagos" },
  { keyName: "configuracion", icon: Settings, label: "Configuración", text: "Admins y estados" },
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
  const [applicationFilter, setApplicationFilter] = useState("PENDIENTE");
  const [memberFilter, setMemberFilter] = useState("TODOS");
  const [observations, setObservations] = useState("");
  const [manualPeriod, setManualPeriod] = useState(currentPeriod());
  const [adminForm, setAdminForm] = useState({ name: "", dni: "", email: "", phone: "", role: "Administrador", password: "" });
  const [newAdmin, setNewAdmin] = useState({ name: "", dni: "", email: "", phone: "", role: "Administrador", password: "" });
  const [manualMember, setManualMember] = useState(blankManualMember);
  const [manualFiles, setManualFiles] = useState({ photo: null, degreePdf: null, receipt: null });
  const [registrationPayment, setRegistrationPayment] = useState({ period_month: currentPeriod(), method: "EFECTIVO" });
  const [dniLookupLoading, setDniLookupLoading] = useState(false);
  const [createdMember, setCreatedMember] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: "AUTO", reason: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState("solicitudes");
  const createdCardRef = useRef(null);
  const memberCardRef = useRef(null);

  async function loadAdminProfile() {
    const data = await api("/api/admin/me", { token });
    setAdminInfo(data);
    setAdminForm({
      name: data.name || "",
      dni: data.dni || "",
      email: data.email || "",
      phone: data.phone || "",
      role: data.role || "Administrador",
      password: "",
    });
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
      await Promise.all([
        loadApplications(),
        loadApplicationSummary(),
        loadMembers(),
        loadMemberSummary(),
        loadAdminProfile(),
        loadAdminUsers(),
      ]);
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
    setStatusForm({
      status: member.status_override || "AUTO",
      reason: member.status_reason || "",
    });
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
        phone: adminForm.phone,
        role: adminForm.role,
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
        role: data.role || "Administrador",
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
        body: { ...newAdmin, dni: onlyDniDigits(newAdmin.dni) },
      });
      setNewAdmin({ name: "", dni: "", email: "", phone: "", role: "Administrador", password: "" });
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
      setMessage("Datos del DNI cargados desde la API.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setDniLookupLoading(false);
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
        setMessage(`Colegiado registrado con pago pendiente en Mercado Pago. Clave inicial: ${data.initial_password}`);
      } else {
        setMessage(`Colegiado registrado. Clave inicial: ${data.initial_password}`);
      }
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function updateMemberStatus(event) {
    event.preventDefault();
    if (!selectedMember) return;
    setMessage("");
    try {
      const updated = await api(`/api/admin/members/${selectedMember.id}/status`, {
        method: "PATCH",
        token,
        body: statusForm,
      });
      setSelectedMember(updated);
      await Promise.all([loadMembers(), loadMemberSummary()]);
      setMessage("Estado del colegiado actualizado.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function registerManualPayment(event) {
    event.preventDefault();
    if (!selectedMember) return;
    setMessage("");
    try {
      await api(`/api/admin/members/${selectedMember.id}/payments`, {
        method: "POST",
        token,
        body: { period_month: manualPeriod, amount: 20 },
      });
      await Promise.all([loadMembers(), loadMemberSummary(), openMemberPayments(selectedMember)]);
      setMessage("Pago manual registrado.");
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

  const adminNotifications = useMemo(() => {
    const applicationSource = allApplications.length ? allApplications : applications;
    const memberSource = allMembers.length ? allMembers : members;
    return buildAdminNotifications({
      applications: applicationSource,
      members: memberSource,
      openApplications: (status) => {
        setApplicationFilter(status);
        setActiveModule("solicitudes");
      },
      openMembers: (status) => {
        setMemberFilter(status);
        setActiveModule("padron");
      },
    });
  }, [allApplications, allMembers, applications, members]);

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
          badges={[`${stats.enabled} habilitados`, `${stats.disabled} inhabilitados`]}
        />
      }
      navItems={ADMIN_NAV_ITEMS}
      summary={[
        { icon: ListChecks, label: "Solicitudes visibles", value: applications.length },
        { icon: CheckCircle2, label: "Habilitados", value: stats.enabled },
        { icon: UserPlus, label: "Administradores", value: admins.length },
      ]}
    >
      {message && <div className="banner">{message}</div>}
      {loading && <div className="loading">Cargando panel...</div>}

      <div className={`workspace admin-workspace module-${activeModule}`}>
        <AdminRequestsPanel
          activeModule={activeModule}
          applications={applications}
          applicationFilter={applicationFilter}
          selectedApp={selectedApp}
          onFilterChange={setApplicationFilter}
          onSelectApplication={selectApplication}
        />
        <AdminReviewPanel
          activeModule={activeModule}
          selectedApp={selectedApp}
          observations={observations}
          onObservationsChange={setObservations}
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
        activeModule={activeModule}
        members={members}
        memberFilter={memberFilter}
        selectedMember={selectedMember}
        memberPayments={memberPayments}
        manualPeriod={manualPeriod}
        memberCardRef={memberCardRef}
        onFilterChange={setMemberFilter}
        onRefresh={loadAll}
        onOpenPayments={openMemberPayments}
        onManualPeriodChange={setManualPeriod}
        onRegisterPayment={registerManualPayment}
        onOpenStatus={(member) => {
          openMemberPayments(member);
          setActiveModule("configuracion");
        }}
        onOpenCard={(member) => {
          setSelectedMember(member);
          setCreatedMember(member);
          setActiveModule("registro");
        }}
        onCloseMember={() => {
          setSelectedMember(null);
          setMemberPayments([]);
        }}
      />

      <AdminSettingsPanel
        activeModule={activeModule}
        admins={admins}
        members={members}
        adminForm={adminForm}
        newAdmin={newAdmin}
        selectedMember={selectedMember}
        statusForm={statusForm}
        onRefresh={loadAll}
        onAdminFormChange={setAdminForm}
        onNewAdminChange={setNewAdmin}
        onStatusFormChange={setStatusForm}
        onSaveProfile={saveAdminProfile}
        onCreateAdmin={createAdmin}
        onUpdateMemberStatus={updateMemberStatus}
        onSelectMember={openMemberPayments}
      />
    </DashboardShell>
  );
}
