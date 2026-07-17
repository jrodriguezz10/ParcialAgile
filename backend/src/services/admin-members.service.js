const bcrypt = require("bcryptjs");
const { currentPeriod, isValidPeriod } = require("../utils/dates");
const { fileDataUrl, fileUrl, frontendUrl, shouldStoreUploadsInDatabase, storedPath } = require("../utils/files");
const { isValidEmail, normalizeDni } = require("../utils/text");
const { createMemberForApprovedApplication, refreshMemberStatus } = require("./members.service");
const { createExternalReference, createMercadoPagoPreference } = require("./payments.service");
const { consultDniApi } = require("./reniec.service");

function validationError(message, statusCode = 422) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function getRequiredDniIdentity(dni) {
  try {
    return await consultDniApi(dni);
  } catch (error) {
    const message =
      error.statusCode === 503
        ? "La API de DNI no esta configurada. Define RENIEC_BASE_URL y RENIEC_TOKEN en backend/.env."
        : "No se pudo obtener los datos del DNI desde la API.";
    throw validationError(message, error.statusCode || 502);
  }
}

async function createManualMemberRecord({ pool, body, files, adminId, req }) {
  const dni = normalizeDni(body.dni);
  const email = String(body.email || "").trim().toLowerCase();
  const phone = String(body.phone || "").trim();
  const address = String(body.address || "").trim();
  const profession = String(body.profession || "").trim();
  const branch = String(body.branch || "Consejo Nacional - Lima").trim();
  const password = String(body.password || dni || "123456");
  const storeFilesInDatabase = shouldStoreUploadsInDatabase();
  const photoPath = (storeFilesInDatabase ? fileDataUrl(files?.photo?.[0]) : storedPath(files?.photo?.[0])) || null;
  const degreePdfPath = (storeFilesInDatabase ? fileDataUrl(files?.degreePdf?.[0]) : storedPath(files?.degreePdf?.[0])) || null;
  const receiptPath = (storeFilesInDatabase ? fileDataUrl(files?.receipt?.[0]) : storedPath(files?.receipt?.[0])) || null;
  const paymentPeriod = isValidPeriod(body.payment_period_month) ? body.payment_period_month : currentPeriod();
  const paymentMethod = String(body.payment_method || "EFECTIVO").trim().toUpperCase();
  const paymentAmount = 20;

  if (dni.length !== 8) throw validationError("DNI invalido.");
  if (!profession) throw validationError("Completa la profesion.");
  if (phone && !/^\d{9}$/.test(phone)) throw validationError("El telefono debe tener 9 digitos.");
  if (!isValidEmail(email)) throw validationError("Correo invalido.");
  if (body.password && password.length < 6) throw validationError("La clave debe tener al menos 6 caracteres.");
  if (!degreePdfPath) throw validationError("Sube el PDF del titulo profesional.");
  if (!["EFECTIVO", "MERCADO_PAGO"].includes(paymentMethod)) {
    throw validationError("Selecciona un metodo de pago valido.");
  }
  if (paymentMethod === "EFECTIVO" && !receiptPath) {
    throw validationError("Sube la imagen o PDF del comprobante de pago.");
  }

  const dniIdentity = await getRequiredDniIdentity(dni);
  const fullName = dniIdentity.full_name;
  if (!fullName) throw validationError("La API de DNI no devolvio nombres completos.", 502);

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const passwordHash = await bcrypt.hash(password, 10);
    const [userResult] = await connection.query(
      `INSERT INTO users
         (dni, full_name, first_name, paternal_last_name, maternal_last_name,
          email, phone, address, profession, branch, password_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        dni,
        fullName,
        dniIdentity.first_name || null,
        dniIdentity.paternal_last_name || null,
        dniIdentity.maternal_last_name || null,
        email,
        phone || null,
        address || null,
        profession,
        branch,
        passwordHash,
      ]
    );

    const [applicationResult] = await connection.query(
      `INSERT INTO applications
         (user_id, status, photo_path, degree_pdf_path, receipt_path, observations, submitted_at, reviewed_at, reviewed_by)
       VALUES (?, 'APROBADO', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)`,
      [
        userResult.insertId,
        photoPath,
        degreePdfPath,
        receiptPath,
        "Registro presencial creado por administrador con datos de API DNI.",
        adminId,
      ]
    );

    const application = {
      id: applicationResult.insertId,
      user_id: userResult.insertId,
    };
    const member = await createMemberForApprovedApplication(connection, application);
    const externalReference = paymentMethod === "MERCADO_PAGO" ? createExternalReference(member.id, paymentPeriod) : null;
    const paymentStatus = paymentMethod === "MERCADO_PAGO" ? "PENDIENTE" : "PAGADO";
    const paidAtSql = paymentMethod === "MERCADO_PAGO" ? "NULL" : "CURRENT_TIMESTAMP";

    const [paymentResult] = await connection.query(
      `INSERT INTO payments
         (member_id, user_id, period_month, amount, payment_type, method, status, paid_at, receipt_path, external_reference, created_by_admin)
       VALUES (?, ?, ?, ?, 'INSCRIPCION', ?, ?, ${paidAtSql}, ?, ?, ?)`,
      [member.id, userResult.insertId, paymentPeriod, paymentAmount, paymentMethod, paymentStatus, receiptPath, externalReference, adminId]
    );

    await connection.commit();
    await refreshMemberStatus(member.id);

    let mercadoPago = {};
    if (paymentMethod === "MERCADO_PAGO") {
      try {
        mercadoPago = await createMercadoPagoPreference(
          {
            id: paymentResult.insertId,
            amount: paymentAmount,
            external_reference: externalReference,
            item_id: `registro-presencial-${member.id}-${paymentPeriod}`,
            title: `Pago de colegiatura CIP ${paymentPeriod}`,
            description: `Registro presencial CIP - ${fullName}`,
            period_month: paymentPeriod,
          },
          { id: userResult.insertId, email, full_name: fullName, dni },
          req
        );
        if (mercadoPago.preference_id) {
          await pool.query("UPDATE payments SET mp_preference_id = ? WHERE id = ?", [
            mercadoPago.preference_id,
            paymentResult.insertId,
          ]);
        }
      } catch (error) {
        mercadoPago = { checkout_url: null, message: "Registro creado, pero no se pudo abrir Mercado Pago." };
      }
    }

    const [[created]] = await pool.query(
      `SELECT m.*, u.dni, u.full_name, u.first_name, u.paternal_last_name, u.maternal_last_name,
              u.email, u.phone, u.address, u.profession, a.photo_path
       FROM members m
       JOIN users u ON u.id = m.user_id
       JOIN applications a ON a.id = m.application_id
       WHERE m.id = ?`,
      [member.id]
    );

    return {
      ...created,
      status: await refreshMemberStatus(member.id),
      verify_url: `${frontendUrl(req)}/verificar/${created.verification_code}`,
      photo_url: fileUrl(req, created.photo_path),
      registration_payment: {
        id: paymentResult.insertId,
        member_id: member.id,
        user_id: userResult.insertId,
        period_month: paymentPeriod,
        amount: paymentAmount,
        method: paymentMethod,
        status: paymentStatus,
        paid_at: paymentMethod === "EFECTIVO" ? new Date().toISOString() : null,
        receipt_url: receiptPath ? fileUrl(req, receiptPath) : null,
        external_reference: externalReference,
      },
      ...mercadoPago,
      dni_source: "api",
    };
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      throw validationError("Ya existe un usuario con ese DNI o correo.", 409);
    }
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createManualMemberRecord,
};
