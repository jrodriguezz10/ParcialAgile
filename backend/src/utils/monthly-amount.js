const MONTHLY_BASE_AMOUNT = 2;
const LATE_FEE_RATE = 0.01;

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function isOverduePeriod(period, currentPeriod) {
  return String(period || "") < String(currentPeriod || "");
}

function monthlyAmountForPeriod(period, currentPeriod) {
  const base = MONTHLY_BASE_AMOUNT;
  return roundMoney(isOverduePeriod(period, currentPeriod) ? base * (1 + LATE_FEE_RATE) : base);
}

function totalMonthlyAmount(periods, currentPeriod) {
  return roundMoney((periods || []).reduce((sum, period) => sum + monthlyAmountForPeriod(period, currentPeriod), 0));
}

module.exports = {
  MONTHLY_BASE_AMOUNT,
  LATE_FEE_RATE,
  monthlyAmountForPeriod,
  totalMonthlyAmount,
};
