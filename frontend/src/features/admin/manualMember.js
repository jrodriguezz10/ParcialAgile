export const blankManualMember = {
  dni: "",
  full_name: "",
  first_name: "",
  paternal_last_name: "",
  maternal_last_name: "",
  email: "",
  phone: "",
  profession: "",
  branch: "Consejo Nacional - Lima",
};

export function onlyDniDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

export function memberFormFromDni(current, dni, data) {
  const fullName =
    data.full_name ||
    [data.first_name, data.paternal_last_name, data.maternal_last_name].filter(Boolean).join(" ");

  return {
    ...current,
    dni,
    full_name: fullName || current.full_name,
    first_name: data.first_name || current.first_name,
    paternal_last_name: data.paternal_last_name || current.paternal_last_name,
    maternal_last_name: data.maternal_last_name || current.maternal_last_name,
  };
}

export function createManualMemberPayload(member, files = {}, payment = {}) {
  const payload = new FormData();
  Object.entries(member).forEach(([key, value]) => payload.append(key, value || ""));
  payload.append("payment_period_month", payment.period_month || "");
  payload.append("payment_method", payment.method || "EFECTIVO");
  payload.append("payment_methods", JSON.stringify(payment.methods || []));
  if (files.photo) payload.append("photo", files.photo);
  if (files.degreePdf) payload.append("degreePdf", files.degreePdf);
  if (files.receipt) payload.append("receipt", files.receipt);
  return payload;
}
