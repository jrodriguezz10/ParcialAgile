import { BadgeCheck, ClipboardCheck, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardShell, TopBar } from "../../components/layout";
import { ProfileCard } from "../../components/ui";
import { isValidEngineeringCareer } from "../../constants/catalogs";
import { APP_STATUS, MEMBER_STATUS, blankProfile } from "../../constants/status";
import { api } from "../../lib/api";
import { currentPeriod } from "../../utils/format";
import { UserApplicationPanel } from "./components/UserApplicationPanel";
import { UserCardPanel } from "./components/UserCardPanel";
import { UserPaymentsPanel } from "./components/UserPaymentsPanel";
import { buildUserNotifications } from "./notifications";

const emailPattern = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$";
const legacyDraftKey = "cip_application_draft";
const draftTtlMs = 2 * 60 * 60 * 1000;
const staleLocalKeys = ["cip_local_applications", "cip_local_members", "cip_local_payments"];

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(String(email || "").trim());
}

function onlyDniDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
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

const USER_NAV_ITEMS = [
  { keyName: "solicitud", icon: ClipboardCheck, label: "Solicitud", text: "Datos y documentos" },
  { keyName: "carnet", icon: BadgeCheck, label: "Carnet", text: "Virtual" },
  { keyName: "pagos", icon: WalletCards, label: "Pagos", text: "Mercado Pago" },
];

// Dashboard del interesado: coordina datos, pagos, solicitud y perfil.
export function UserDashboard({ token, onLogout }) {
  const [bundle, setBundle] = useState(null);
  const [payments, setPayments] = useState([]);
  const [pendingPeriods, setPendingPeriods] = useState([]);
  const [debtAmount, setDebtAmount] = useState(0);
  const [form, setForm] = useState(blankProfile);
  const [files, setFiles] = useState({ photo: null, degreePdf: null, receipt: null });
  const [applicationUnlocked, setApplicationUnlocked] = useState(false);
  const [applicationLookupMessage, setApplicationLookupMessage] = useState("");
  const [period, setPeriod] = useState(currentPeriod());
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState("solicitud");
  const cardRef = useRef(null);

  const application = bundle?.application;
  const member = bundle?.member;
  const user = bundle?.user;

  async function load() {
    setLoading(true);
    try {
      clearStaleLocalFallback();
      const [me, paymentData] = await Promise.all([
        api("/api/me", { token }),
        api("/api/me/payments", { token }),
      ]);
      setBundle(me);
      setPayments(paymentData.payments || []);
      setPendingPeriods(paymentData.pending_periods || []);
      setDebtAmount(Number(paymentData.debt_amount || 0));
      const loadedUser = { ...blankProfile, ...me.user };
      if (/^pendiente$/i.test(String(loadedUser.profession || "").trim())) loadedUser.profession = "";
      if (/^[0-9]{8}@pendiente\.cip\.local$/i.test(String(loadedUser.email || ""))) loadedUser.email = "";
      clearLegacyApplicationDraft();
      const savedDraft = readApplicationDraft(token, loadedUser.dni);
      setForm(!me.application && savedDraft ? { ...loadedUser, ...savedDraft, dni: savedDraft.dni || loadedUser.dni } : loadedUser);
      setApplicationUnlocked(!me.application);
      setApplicationLookupMessage("");
      setPeriod(me.current_period || currentPeriod());
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
    load();
  }, [token]);

  const updateForm = (field, value) => {
    if (field === "full_name") return;
    if (field === "dni" && !application) {
      setApplicationUnlocked(false);
      setApplicationLookupMessage("");
    }
    setForm((current) => ({ ...current, [field]: value }));
  };

  async function submitApplication(event) {
    event.preventDefault();
    setMessage("");
    const dni = onlyDniDigits(form.dni);
    if (dni.length !== 8) {
      setMessage("Ingresa un DNI valido de 8 digitos antes de enviar la solicitud.");
      return;
    }
    if (!String(form.full_name || "").trim() || !String(form.profession || "").trim()) {
      setMessage("Completa nombres y profesion antes de enviar.");
      return;
    }
    if (!isValidEngineeringCareer(form.profession)) {
      setMessage("Selecciona una profesion valida de la lista.");
      return;
    }
    if (!isValidEmail(form.email)) {
      setMessage("Usa un correo valido.");
      return;
    }
    if (!files.photo && !application?.photo_url) {
      setMessage("Adjunta la foto tipo carnet.");
      return;
    }
    if (!files.degreePdf && !application?.degree_pdf_url) {
      setMessage("Adjunta el titulo profesional en PDF.");
      return;
    }
    if (!files.receipt && !application?.receipt_url) {
      setMessage("Adjunta el comprobante de pago.");
      return;
    }

    const payload = new FormData();
    payload.append("dni", dni);
    ["full_name", "email", "profession", "phone", "branch"].forEach((field) => {
      payload.append(field, field === "email" ? String(form[field] || "").trim().toLowerCase() : form[field] || "");
    });
    if (files.photo) payload.append("photo", files.photo);
    if (files.degreePdf) payload.append("degreePdf", files.degreePdf);
    if (files.receipt) payload.append("receipt", files.receipt);

    try {
      const data = await api("/api/applications", {
        method: "POST",
        token,
        body: payload,
        form: true,
      });
      setBundle(data);
      clearApplicationDraft(token);
      setFiles({ photo: null, degreePdf: null, receipt: null });
      setMessage("Solicitud enviada al Colegio de Ingenieros.");
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function payMonthly(selectedPeriod = period) {
    setMessage("");
    try {
      const data = await api("/api/me/payments/monthly", {
        method: "POST",
        token,
        body: { period_month: selectedPeriod },
      });
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setMessage(data.message || "Pago creado, pero no hay enlace de checkout disponible.");
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function payRegistration() {
    setMessage("");
    const dni = onlyDniDigits(form.dni || user?.dni);
    const email = String(form.email || "").trim().toLowerCase();
    const fullName = String(form.full_name || "").trim();
    if (dni.length !== 8 || !fullName || !isValidEmail(email)) {
      setMessage("Completa DNI, nombres y correo antes de abrir el pago de inscripcion.");
      return;
    }
    try {
      saveApplicationDraft(token, form);
      const data = await api("/api/me/payments/inscription", {
        method: "POST",
        token,
        body: { dni, full_name: fullName, email },
      });
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank", "noopener,noreferrer");
        setMessage("Pago abierto en otra pestaña. Al terminar, vuelve aqui, adjunta el comprobante y envia la solicitud.");
        return;
      }
      setMessage(data.message || "Mercado Pago no esta configurado. Adjunta tu comprobante de pago para continuar.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function payFullDebt() {
    setMessage("");
    try {
      const data = await api("/api/me/payments/full", {
        method: "POST",
        token,
      });
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      setMessage(data.message || "Pago total creado, pero no hay enlace de checkout disponible.");
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function lookupSolicitudDni() {
    const dni = onlyDniDigits(form.dni || user?.dni);
    setForm((current) => ({ ...current, dni }));
    if (dni.length !== 8) {
      setMessage("Ingresa un DNI de 8 digitos para buscar.");
      return;
    }
    setMessage("");
    try {
      const applicationCheck = await api(`/api/public/applications/dni/${dni}/status`);
      const data = applicationCheck;
      const fullName = data.full_name || [data.first_name, data.paternal_last_name, data.maternal_last_name].filter(Boolean).join(" ");
      setForm((current) => ({
        ...current,
        dni,
        full_name: fullName || current.full_name,
        first_name: data.first_name || current.first_name,
        paternal_last_name: data.paternal_last_name || current.paternal_last_name,
        maternal_last_name: data.maternal_last_name || current.maternal_last_name,
      }));
      if (applicationCheck.has_application) {
        setApplicationLookupMessage(`Este DNI ya tiene una solicitud registrada con estado ${applicationCheck.status}.`);
        setApplicationUnlocked(false);
        setMessage(`Este DNI ya tiene una solicitud registrada con estado ${applicationCheck.status}.`);
      } else {
        setApplicationLookupMessage("DNI validado. Puedes iniciar una nueva solicitud.");
        setApplicationUnlocked(false);
        setMessage("Datos RENIEC cargados. Presiona Hacer solicitud para completar el formulario.");
      }
    } catch (error) {
      setMessage(error.message);
    }
  }
  const userNotifications = useMemo(() => {
    return buildUserNotifications({
      application,
      member,
      debtAmount,
      openModule: setActiveModule,
    });
  }, [application, member, debtAmount]);

  if (loading) {
    return (
      <main className="app-shell">
        <TopBar role="usuario" onLogout={onLogout} />
        <div className="loading">Cargando portal...</div>
      </main>
    );
  }

  return (
    <DashboardShell
      label="Portal de colegiatura"
      title="Colegiatura digital"
      subtitle="Completa tu solicitud, revisa tu carnet virtual y administra tus pagos mensuales."
      activeKey={activeModule}
      onSelect={setActiveModule}
      onLogout={onLogout}
      notifications={userNotifications}
      notificationScope="interesado"
      profile={
        <ProfileCard
          compact
          name={user?.full_name || "Solicitante"}
          subtitle={`DNI ${user?.dni || "--------"}`}
          detail={form.profession || "Profesion pendiente"}
          image={application?.photo_url}
          badges={[application?.status, member?.status].filter(Boolean)}
        />
      }
      navItems={USER_NAV_ITEMS}
      summary={[
        { icon: ClipboardCheck, label: "Tramite", value: APP_STATUS[application?.status] || "Sin solicitud" },
        { icon: ShieldCheck, label: "Condicion", value: MEMBER_STATUS[member?.status] || "No colegiado" },
        {
          icon: WalletCards,
          label: "Mensualidad",
          value: debtAmount > 0 ? `Deuda S/ ${debtAmount.toFixed(2)}` : `S/ 2.00 - ${period}`,
        },
      ]}
    >
      {message && <div className="banner">{message}</div>}

      <div className={`workspace user-workspace module-${activeModule}`}>
        <UserApplicationPanel
          activeModule={activeModule}
          application={application}
          form={form}
          files={files}
          emailPattern={emailPattern}
          unlocked={applicationUnlocked}
          lookupMessage={applicationLookupMessage}
          onSubmit={submitApplication}
          onLookupDni={lookupSolicitudDni}
          onPayRegistration={payRegistration}
          onUpdateForm={updateForm}
          onFilesChange={setFiles}
          onStartApplication={() => setApplicationUnlocked(true)}
          onlyDniDigits={onlyDniDigits}
        />
        <UserCardPanel
          activeModule={activeModule}
          member={member}
          user={user}
          application={application}
          cardRef={cardRef}
          period={period}
          debtAmount={debtAmount}
          pendingPeriods={pendingPeriods}
          onPeriodChange={setPeriod}
          onPayMonthly={payMonthly}
          onPayFullDebt={payFullDebt}
        />
      </div>

      <UserPaymentsPanel
        activeModule={activeModule}
        member={member}
        user={user}
        payments={payments}
        period={period}
        debtAmount={debtAmount}
        pendingPeriods={pendingPeriods}
        onRefresh={load}
        onPeriodChange={setPeriod}
        onPayMonthly={payMonthly}
        onPayFullDebt={payFullDebt}
      />
    </DashboardShell>
  );
}

function applicationDraftKey(token) {
  return `cip_application_draft:${String(token || "").slice(-18)}`;
}

function readApplicationDraft(token, dni) {
  try {
    const draft = JSON.parse(localStorage.getItem(applicationDraftKey(token)) || "null");
    if (!draft?.payment_started_at) return null;
    if (Date.now() - Number(draft.payment_started_at) > draftTtlMs) {
      clearApplicationDraft(token);
      return null;
    }
    if (draft.dni && dni && draft.dni !== dni) {
      clearApplicationDraft(token);
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

function saveApplicationDraft(token, form) {
  try {
    const { dni, full_name, first_name, paternal_last_name, maternal_last_name, email, phone, profession, branch } = form || {};
    localStorage.setItem(
      applicationDraftKey(token),
      JSON.stringify({ dni, full_name, first_name, paternal_last_name, maternal_last_name, email, phone, profession, branch, payment_started_at: Date.now() })
    );
  } catch {
    // Si el navegador bloquea storage, el formulario sigue funcionando en memoria.
  }
}

function clearApplicationDraft(token) {
  try {
    localStorage.removeItem(applicationDraftKey(token));
  } catch {
    // No hace falta interrumpir el envio por limpieza local.
  }
}

function clearLegacyApplicationDraft() {
  try {
    localStorage.removeItem(legacyDraftKey);
  } catch {
    // Limpieza defensiva del borrador global anterior.
  }
}
