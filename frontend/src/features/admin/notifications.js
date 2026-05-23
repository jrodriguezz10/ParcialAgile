function idsSignature(items) {
  return items.map((item) => String(item.id)).sort().join(",");
}

export function buildAdminNotifications({
  applications,
  members,
  openApplications,
  openMembers,
}) {
  const pendingApps = applications.filter((item) => item.status === "PENDIENTE");
  const observedApps = applications.filter((item) => item.status === "OBSERVADO");
  const disabledMembers = members.filter((item) => item.status === "INHABILITADO");
  const items = [];

  if (pendingApps.length) {
    items.push({
      id: "pending-applications",
      readKey: `pending-applications:${idsSignature(pendingApps)}`,
      title: `${pendingApps.length} solicitud(es) pendiente(s)`,
      message: "Hay expedientes esperando revision.",
      meta: "Abrir Solicitudes",
      onClick: () => openApplications("PENDIENTE"),
    });
  }

  if (observedApps.length) {
    items.push({
      id: "observed-applications",
      readKey: `observed-applications:${idsSignature(observedApps)}`,
      title: `${observedApps.length} solicitud(es) observada(s)`,
      message: "Revisa si el interesado ya corrigio documentos.",
      meta: "Abrir Solicitudes",
      onClick: () => openApplications("OBSERVADO"),
    });
  }

  if (disabledMembers.length) {
    items.push({
      id: "disabled-members",
      readKey: `disabled-members:${idsSignature(disabledMembers)}`,
      title: `${disabledMembers.length} colegiado(s) inhabilitado(s)`,
      message: "Tienen pagos o restricciones pendientes.",
      meta: "Abrir Padron",
      variant: "danger",
      onClick: () => openMembers("INHABILITADO"),
    });
  }

  return items;
}
