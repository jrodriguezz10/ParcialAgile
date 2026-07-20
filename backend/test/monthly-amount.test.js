const test = require("node:test");
const assert = require("node:assert/strict");
const { monthlyAmountForPeriod, totalMonthlyAmount } = require("../src/utils/monthly-amount");

test("monthlyAmountForPeriod applies 1 percent only to overdue periods", () => {
  assert.equal(monthlyAmountForPeriod("2026-06", "2026-07"), 2.02);
  assert.equal(monthlyAmountForPeriod("2026-07", "2026-07"), 2);
});

test("totalMonthlyAmount sums each period with its late fee", () => {
  assert.equal(totalMonthlyAmount(["2026-05", "2026-06"], "2026-07"), 4.04);
});
