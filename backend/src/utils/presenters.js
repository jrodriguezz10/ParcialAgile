const { fileUrl } = require("./files");

function applicationPresenter(req, row) {
  if (!row) return null;
  return {
    ...row,
    photo_url: fileUrl(req, row.photo_path),
    degree_pdf_url: fileUrl(req, row.degree_pdf_path),
    receipt_url: fileUrl(req, row.receipt_path),
  };
}

module.exports = {
  applicationPresenter,
};
