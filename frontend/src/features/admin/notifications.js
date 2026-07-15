function idsSignature(items) {
  return items.map((item) => String(item.id)).sort().join(",");
}

export function buildAdminNotifications({
  applications,
  openApplications,
}) {
  const pendingApps = applications.filter((item) => item.status === "PENDIENTE");
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

  return items;
}
