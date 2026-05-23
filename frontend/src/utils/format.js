export function formatDate(value) {
  if (!value) return "Sin dato";
  return String(value).replace("T", " ").slice(0, 10);
}

export function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function initials(name) {
  return String(name || "CIP")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
