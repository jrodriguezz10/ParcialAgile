const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const env = require("../config/env");

fs.mkdirSync(env.applicationUploadDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: env.applicationUploadDir,
    filename(req, file, callback) {
      const ext = path.extname(file.originalname).toLowerCase();
      const base = path
        .basename(file.originalname, ext)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .slice(0, 40);
      callback(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${base}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    const allowed = {
      photo: ["image/jpeg", "image/png", "image/webp"],
      degreePdf: ["application/pdf"],
      receipt: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
    };
    if (!allowed[file.fieldname]?.includes(file.mimetype)) {
      return callback(new Error(`Formato invalido para ${file.fieldname}.`));
    }
    callback(null, true);
  },
});

module.exports = upload;
