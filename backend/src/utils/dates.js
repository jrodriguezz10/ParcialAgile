function currentPeriod() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year").value;
  const month = parts.find((part) => part.type === "month").value;
  return `${year}-${month}`;
}

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidPeriod(period) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(period || ""));
}

function comparePeriods(left, right) {
  if (!isValidPeriod(left) || !isValidPeriod(right)) return 0;
  return String(left).localeCompare(String(right));
}

function periodFromDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }

  const raw = String(value || "").slice(0, 7);
  return isValidPeriod(raw) ? raw : currentPeriod();
}

function nextPeriod(period) {
  const [year, month] = String(period).split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${nextYear}-${nextMonth}`;
}

function previousPeriod(period) {
  const [year, month] = String(period).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  const previousYear = date.getUTCFullYear();
  const previousMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${previousYear}-${previousMonth}`;
}

function periodsBetween(startPeriod, endPeriod) {
  if (!isValidPeriod(startPeriod) || !isValidPeriod(endPeriod)) return [];
  const periods = [];
  let cursor = startPeriod;
  while (cursor <= endPeriod) {
    periods.push(cursor);
    cursor = nextPeriod(cursor);
  }
  return periods;
}

module.exports = {
  currentPeriod,
  todayDate,
  isValidPeriod,
  comparePeriods,
  periodFromDate,
  previousPeriod,
  periodsBetween,
};
