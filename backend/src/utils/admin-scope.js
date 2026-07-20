const DEFAULT_BRANCH = "Consejo Nacional - Lima";

function isSuperAdmin(admin) {
  return String(admin?.role || "").toUpperCase() === "SUPER_ADMIN";
}

function adminBranch(admin) {
  return admin?.branch || DEFAULT_BRANCH;
}

function inAdminBranch(req, rowOrBranch) {
  if (isSuperAdmin(req.admin)) return true;
  const branch = typeof rowOrBranch === "string" ? rowOrBranch : rowOrBranch?.branch;
  return (branch || DEFAULT_BRANCH) === adminBranch(req.admin);
}

function scopedBranch(req, requestedBranch) {
  return isSuperAdmin(req.admin) ? requestedBranch : adminBranch(req.admin);
}

module.exports = {
  DEFAULT_BRANCH,
  adminBranch,
  inAdminBranch,
  isSuperAdmin,
  scopedBranch,
};
