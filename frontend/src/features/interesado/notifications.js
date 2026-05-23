export function buildUserNotifications({ application, member, debtAmount, openModule }) {
  const items = [];

  if (application?.status === "OBSERVADO") {
    items.push({
      id: "application-observed",
      readKey: `application-observed:${application.id}:${application.observations || ""}`,
      title: "Solicitud observada",
      message: application.observations || "El administrador envio una observacion.",
      meta: "Abre Solicitud para corregir y reenviar.",
      variant: "danger",
      onClick: () => openModule("solicitud"),
    });
  } else if (application?.status === "APROBADO") {
    items.push({
      id: "application-approved",
      readKey: `application-approved:${application.id}:${application.reviewed_at || ""}`,
      title: "Solicitud aprobada",
      message: application.observations || "Tu carnet virtual ya esta disponible.",
      meta: "Abre Carnet para verlo o descargarlo.",
      variant: "success",
      onClick: () => openModule("carnet"),
    });
  } else if (application?.status === "RECHAZADO") {
    items.push({
      id: "application-rejected",
      readKey: `application-rejected:${application.id}:${application.observations || ""}`,
      title: "Solicitud rechazada",
      message: application.observations || "El administrador rechazo la solicitud.",
      meta: "Revisa el comentario del Colegio.",
      variant: "danger",
      onClick: () => openModule("solicitud"),
    });
  } else if (application?.status === "PENDIENTE") {
    items.push({
      id: "application-pending",
      readKey: `application-pending:${application.id}:${application.submitted_at || ""}`,
      title: "Solicitud enviada",
      message: "Tu expediente esta pendiente de revision.",
      meta: "El Colegio notificara el resultado aqui.",
      onClick: () => openModule("solicitud"),
    });
  }

  if (member?.status === "INHABILITADO") {
    items.push({
      id: "member-disabled",
      readKey: `member-disabled:${member.id}:${member.status}:${Number(debtAmount || 0).toFixed(2)}`,
      title: "Carnet inhabilitado",
      message: debtAmount > 0 ? `Tienes deuda de S/ ${debtAmount.toFixed(2)}.` : "Hay una restriccion vigente.",
      meta: "Abre Pagos para regularizar.",
      variant: "danger",
      onClick: () => openModule("pagos"),
    });
  }

  return items;
}
