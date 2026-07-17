const env = require("../config/env");
const { getPool } = require("../config/database");
const kv = require("../services/kv.service");
const pgStore = require("../services/postgres-store.service");
const { currentPeriod, periodFromDate, periodsBetween, previousPeriod } = require("../utils/dates");
const { configured, sendDebtNotice } = require("../services/whatsapp.service");

function calculateDebt(member, payments) {
  const paid = new Set(payments.filter((item) => item.status === "PAGADO" && item.payment_type === "MENSUALIDAD").map((item) => item.period_month));
  const start = periodFromDate(member.enrollment_date);
  const end = previousPeriod(currentPeriod());
  const pendingPeriods = start && start <= end ? periodsBetween(start, end).filter((period) => !paid.has(period)) : [];
  return { pendingPeriods, debtAmount: pendingPeriods.length * 20 };
}

async function notifyOverdueWhatsApp(req, res) {
  if (!env.cronSecret || req.headers.authorization !== `Bearer ${env.cronSecret}`) return res.status(401).json({ message: "No autorizado." });
  if (!configured()) return res.status(503).json({ message: "Configura WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID." });

  let members = [];
  const store = kv.enabled() ? kv : pgStore;
  if (req.dbReady === false && (kv.enabled() || pgStore.enabled())) {
    members = await store.listMembers("INHABILITADO");
    members = await Promise.all(members.map(async (member) => ({ member, payments: await store.listMemberPayments(member.id) })));
  } else {
    const [rows] = await getPool().query(`SELECT m.*, u.full_name, u.phone FROM members m JOIN users u ON u.id = m.user_id WHERE m.status = 'INHABILITADO'`);
    members = await Promise.all(rows.map(async (member) => {
      const [payments] = await getPool().query("SELECT * FROM payments WHERE member_id = ?", [member.id]);
      return { member, payments };
    }));
  }

  const results = [];
  for (const { member, payments } of members) {
    const debt = calculateDebt(member, payments);
    if (!debt.pendingPeriods.length || !member.phone) continue;
    try {
      await sendDebtNotice({ phone: member.phone, fullName: member.full_name, ...debt });
      results.push({ member_id: member.id, sent: true });
    } catch (error) {
      results.push({ member_id: member.id, sent: false, error: error.message });
    }
  }
  res.json({ processed: results.length, sent: results.filter((item) => item.sent).length, results });
}

module.exports = { notifyOverdueWhatsApp };
