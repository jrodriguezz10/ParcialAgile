const { fileUrl, originFromReq } = require("./files");

function applicationFileUrl(req, row, field, type) {
  const value = row?.[field];
  if (!value) return null;
  if (/^(data:|kvfile:)/i.test(value)) return `${originFromReq(req)}/api/public/applications/${row.id}/files/${type}`;
  return fileUrl(req, value);
}

function applicationPresenter(req, row) {
  if (!row) return null;
  const { photo_path, degree_pdf_path, receipt_path, ...safeRow } = row;
  return {
    ...safeRow,
    photo_url: applicationFileUrl(req, row, "photo_path", "photo"),
    degree_pdf_url: applicationFileUrl(req, row, "degree_pdf_path", "degree"),
    receipt_url: applicationFileUrl(req, row, "receipt_path", "receipt"),
  };
}

module.exports = {
  applicationPresenter,
};
