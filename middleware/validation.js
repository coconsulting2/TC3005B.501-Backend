import { body, param, validationResult } from "express-validator";

/*
 * This will validate and sanitize the field of user id, given in any endpoint
 * (LuisDa)
 */
export const validateId = [
  param("id")
    .optional()
    .isInt()
    .toInt()
    .withMessage("The ID needs to be a valid number"),
  param("request_id")
    .optional()
    .isInt()
    .toInt()
    .withMessage("Request ID must be a valid number"),
  param("user_id")
    .optional()
    .isInt()
    .toInt()
    .withMessage("User ID must be a valid number"),
  param("receipt_id")
    .optional()
    .isInt()
    .toInt()
    .withMessage("Receipt ID must be a valid number"),
  (req, res, next) => {
    if (!req.params.id && !req.params.user_id && !req.params.request_id && !req.params.receipt_id) {
      return res.status(400).json({ error: "At least one ID needs to be provided" });
    }
    next();
  }
];

/*
 * Validates :id (viaje/request) path param for gasto_tramo GET endpoints.
 */
export const validateViajeId = [
  param("id")
    .isInt({ min: 1 })
    .toInt()
    .withMessage("Viaje ID must be a valid positive integer"),
];

/*
 * Validates :id (viaje/request) and :tramo_id (route) path params for gasto_tramo POST endpoint.
 */
export const validateViajeTramoIds = [
  param("id")
    .isInt({ min: 1 })
    .toInt()
    .withMessage("Viaje ID must be a valid positive integer"),
  param("tramo_id")
    .isInt({ min: 1 })
    .toInt()
    .withMessage("Tramo ID must be a valid positive integer"),
];

/*
 * Validates the body for POST /viajes/:id/tramos/:tramo_id/gastos.
 */
export const validateGastoTramoBody = [
  body("receipt_id")
    .isInt({ min: 1 })
    .toInt()
    .withMessage("receipt_id must be a valid positive integer"),
];

/*
 * This will validate and sanitize the Department, status ID and N
 * (LuisDa)
 */
export const validateDeptStatus = [
  param("dept_id")
    .isInt()
    .toInt()
    .withMessage("Department cannot be empty."),
  param("status_id")
    .isInt()
    .toInt()
    .withMessage("Status cannot be empty."),
  param("n")
    .optional()
    .isInt()
    .toInt()
    .withMessage("N must be a valid number")
];

/*
 * This will validate the fields in the Travel Request
 * (Sosa)
 */
export const validateTravelRequest = [
  body("router_index")
    .isInt({ min: 0 })
    .withMessage("Router index must be a valid number")
    .bail(),
  body("notes")
    .isString()
    .trim()
    .escape()
    .stripLow()
    .withMessage("Notes have to be a string")
    .bail(),

  body("requested_fee")
    .isFloat({min: 0})
    .exists()
    .withMessage("The minimum requested fee is 0")
    .bail(),
  body("imposed_fee")
    .isFloat({min: 0})
    .exists()
    .withMessage("The minimum imposed fee is 0")
    .bail(),

  body("origin_country_name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Origin country cannot be empty.")
    .bail(),
  body("origin_city_name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Origin city cannot be left empty.")
    .bail(),
  body("destination_country_name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Destination country cannot be left empty.")
    .bail(),
  body("destination_city_name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Destination city cannot be left empty.")
    .bail(),

  body("beginning_date")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip start date cannot be empty.")
    .bail(),
  body("beginning_time")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip start time cannot be empty.")
    .bail(),
  body("ending_date")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip end date cannot be empty.")
    .bail(),
  body("ending_time")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip end time cannot be empty.")
    .bail(),

  body("plane_needed")
    .isBoolean()
    .toBoolean()
    .exists()
    .withMessage("Please select if plane reservation is required or not.")
    .bail(),
  body("hotel_needed")
    .isBoolean()
    .toBoolean()
    .exists()
    .withMessage("Please select if hotel reservation is required or not.")
    .bail(),

  body("additionalRoutes")
    .optional()
    .isArray()
    .withMessage("Additional routes must be an array")
    .bail(),
  body("additionalRoutes.*.router_index")
    .isInt()
    .exists()
    .withMessage("Router index must be a valid number")
    .bail(),
  body("additionalRoutes.*.origin_country_name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Origin country cannot be empty.")
    .bail(),
  body("additionalRoutes.*.origin_city_name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Origin city cannot be left empty.")
    .bail(),
  body("additionalRoutes.*.destination_country_name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Destination country cannot be left empty.")
    .bail(),
  body("additionalRoutes.*.destination_city_name")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Destination city cannot be left empty.")
    .bail(),

  body("additionalRoutes.*.beginning_date")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip start date cannot be empty.")
    .bail(),
  body("additionalRoutes.*.beginning_time")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip start time cannot be empty.")
    .bail(),
  body("additionalRoutes.*.ending_date")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip end date cannot be empty.")
    .bail(),
  body("additionalRoutes.*.ending_time")
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip end time cannot be empty.")
    .bail(),

  body("additionalRoutes.*.plane_needed")
    .isBoolean()
    .toBoolean()
    .exists()
    .withMessage("Please select if plane reservation is required or not.")
    .bail(),
  body("additionalRoutes.*.hotel_needed")
    .isBoolean()
    .toBoolean()
    .exists()
    .withMessage("Please select if hotel reservation is required or not.")
    .bail(),
];

/*
 * This will validate and sanitize the receipts as they are created
 * (LuisDa)
 */
export const validateExpenseReceipts = [
  body("receipts")
    .isArray()
    .notEmpty()
    .withMessage("Receipts must be a non-empty array."),
  body("receipts.*.receipt_type_id")
    .isInt({ min: 0 })
    .toInt()
    .withMessage("Receipt type ID must be a valid number"),
  body("receipts.*.request_id")
    .isInt({ min: 0 })
    .toInt()
    .withMessage("Request ID must be a valid number"),
  body("receipts.*.amount")
    .isFloat({ min: 0 })
    .toFloat()
    .withMessage("Amounts needs to be a valid number"),
  body("receipts.*.cfdi_uuid")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 36, max: 36 })
    .withMessage("cfdi_uuid must be a 36-char UUID string when provided"),
  body("allow_missing_cfdi_uuid")
    .optional()
    .isBoolean()
    .toBoolean()
    .withMessage("allow_missing_cfdi_uuid must be boolean"),
];

/*
 * This will validate and sanitize the draft of travel requests as they are created
 * (Sosa)
 */
export const validateDraftTravelRequest = [
  body("router_index")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Router index must be a valid number")
    .bail(),
  body("notes")
    .optional()
    .isString()
    .trim()
    .escape()
    .stripLow()
    .withMessage("Notes have to be a string")
    .bail(),

  body("requested_fee")
    .optional()
    .isFloat({min: 0})
    .exists()
    .withMessage("The minimum requested fee is 0")
    .bail(),
  body("imposed_fee")
    .optional()
    .isFloat({min: 0})
    .exists()
    .withMessage("The minimum imposed fee is 0")
    .bail(),

  body("origin_country_name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Origin country cannot be empty.")
    .bail(),
  body("origin_city_name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Origin city cannot be left empty.")
    .bail(),
  body("destination_country_name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Destination country cannot be left empty.")
    .bail(),
  body("destination_city_name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Destination city cannot be left empty.")
    .bail(),

  body("beginning_date")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip start date cannot be empty.")
    .bail(),
  body("beginning_time")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip start time cannot be empty.")
    .bail(),
  body("ending_date")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip end date cannot be empty.")
    .bail(),
  body("ending_time")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip end time cannot be empty.")
    .bail(),

  body("plane_needed")
    .optional()
    .isBoolean()
    .toBoolean()
    .exists()
    .withMessage("Please select if plane reservation is required or not.")
    .bail(),
  body("hotel_needed")
    .optional()
    .isBoolean()
    .toBoolean()
    .exists()
    .withMessage("Please select if hotel reservation is required or not.")
    .bail(),

  body("additionalRoutes")
    .optional()
    .isArray()
    .withMessage("Additional routes must be an array")
    .bail(),
  body("additionalRoutes.*.router_index")
    .optional()
    .isNumeric()
    .exists()
    .withMessage("Router index must be a valid number")
    .bail(),
  body("additionalRoutes.*.origin_country_name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Origin country cannot be empty.")
    .bail(),
  body("additionalRoutes.*.origin_city_name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Origin city cannot be left empty.")
    .bail(),
  body("additionalRoutes.*.destination_country_name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Destination country cannot be left empty.")
    .bail(),
  body("additionalRoutes.*.destination_city_name")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Destination city cannot be left empty.")
    .bail(),

  body("additionalRoutes.*.beginning_date")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip start date cannot be empty.")
    .bail(),
  body("additionalRoutes.*.beginning_time")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip start time cannot be empty.")
    .bail(),
  body("additionalRoutes.*.ending_date")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip end date cannot be empty.")
    .bail(),
  body("additionalRoutes.*.ending_time")
    .optional()
    .isString()
    .trim()
    .notEmpty()
    .withMessage("Trip end time cannot be empty.")
    .bail(),

  body("additionalRoutes.*.plane_needed")
    .optional()
    .isBoolean()
    .toBoolean()
    .exists()
    .withMessage("Please select if plane reservation is required or not.")
    .bail(),
  body("additionalRoutes.*.hotel_needed")
    .optional()
    .isBoolean()
    .toBoolean()
    .exists()
    .withMessage("Please select if hotel reservation is required or not.")
    .bail(),
];

export const validateCreateUser = [
  body("role_id")
    .isInt({ min: 1 })
    .toInt()
    .withMessage("Role ID must be a valid number"),
  body("department_id")
    .isInt({ min: 1 })
    .toInt()
    .withMessage("Department ID must be a valid number"),
  body("user_name")
    .isString()
    .trim()
    .notEmpty()
    .escape()
    .matches(/^\S+$/)
    .withMessage("Username cannot be empty neither contain spaces."),
  body("password")
    .isString()
    .trim()
    .notEmpty()
    .escape()
    .matches(/^\S+$/)
    .withMessage("Password cannot be empty neither contain spaces."),
  body("workstation")
    .isString()
    .trim()
    .notEmpty()
    .escape()
    .withMessage("Workstation cannot be empty."),
  body("email")
    .isEmail()
    .normalizeEmail()
    .escape()
    .withMessage("Email must be a valid email address"),
  body("phone_number")
    .optional()
    .isString()
    .notEmpty()
    .trim()
    .escape()
    .withMessage("Phone number cannot be empty.")
];

// --- RFC format: Personas Morales (12 chars) + Personas Físicas (13 chars) ---
const RFC_REGEX = /^([A-ZÑ&]{3,4})(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([A-Z\d]{3})$/;
const RFC_GENERICOS = ["XAXX010101000", "XEXX010101000"]; // RFC genérico extranjero/sin efectos

/**
 * Validates all CFDI 4.0 fields (from M1-001 XML parsing)
 * El acuse SAT se obtiene en servidor (satConsultaService); el cliente solo envia datos del CFDI.
 * Opcional: sello_emisor (atributo Sello del XML) para armar el parametro fe en la consulta SAT.
 * WebService SAT: https://consultaqr.facturaelectronica.sat.gob.mx/ConsultaCFDIService.svc
 * (Hector Lugo — M1-003)
 */
export const validateCfdi = [
  // Path param
  param("receipt_id").isInt({ min: 1 }).toInt().withMessage("receipt_id debe ser entero positivo"),
  // --- TimbreFiscalDigital ---
  body("uuid").isUUID().withMessage("uuid debe ser UUID válido (Folio Fiscal del SAT)"),
  body("fecha_timbrado").isISO8601().withMessage("fecha_timbrado debe ser fecha ISO 8601"),
  body("rfc_pac").isString().trim().notEmpty().withMessage("rfc_pac es requerido (RFC del PAC)"),
  // --- Comprobante ---
  body("version").optional().isIn(["3.3", "4.0"]).withMessage("version debe ser 3.3 o 4.0"),
  body("serie").optional().isString().trim().isLength({ max: 25 }),
  body("folio").optional().isString().trim().isLength({ max: 40 }),
  body("fecha_emision").isISO8601().withMessage("fecha_emision debe ser fecha ISO 8601"),
  body("tipo_comprobante").isIn(["I", "E", "T", "P", "N"]).withMessage("tipo_comprobante inválido (I, E, T, P, N)"),
  body("lugar_expedicion").matches(/^\d{5}$/).withMessage("lugar_expedicion debe ser CP de 5 dígitos"),
  body("exportacion").optional().isIn(["01", "02", "03", "04"]).withMessage("exportacion debe ser 01, 02, 03 o 04"),
  body("metodo_pago").isIn(["PUE", "PPD"]).withMessage("metodo_pago debe ser PUE o PPD"),
  body("forma_pago").isString().trim().isLength({ min: 2, max: 2 }).withMessage("forma_pago debe ser 2 caracteres (ej. 03)"),
  body("moneda").isString().trim().isLength({ min: 3, max: 3 }).withMessage("moneda debe ser código ISO 4217 de 3 caracteres"),
  body("tipo_cambio").optional().isFloat({ min: 0.0001 }).withMessage("tipo_cambio debe ser > 0"),
  body("subtotal").isFloat({ min: 0 }).withMessage("subtotal debe ser número >= 0"),
  body("descuento").optional().isFloat({ min: 0 }),
  body("iva").optional().isFloat({ min: 0 }),
  body("total").isFloat({ min: 0 }).withMessage("total debe ser número >= 0"),
  // --- Emisor ---
  body("rfc_emisor")
    .custom(v => RFC_REGEX.test(v) || RFC_GENERICOS.includes(v))
    .withMessage("rfc_emisor no tiene formato SAT válido"),
  body("nombre_emisor").isString().trim().notEmpty().isLength({ max: 254 }),
  body("regimen_fiscal_emisor").isString().trim().isLength({ min: 3, max: 3 }).withMessage("regimen_fiscal_emisor debe ser código de 3 dígitos (ej. 601)"),
  // --- Receptor ---
  body("rfc_receptor")
    .custom(v => RFC_REGEX.test(v) || RFC_GENERICOS.includes(v))
    .withMessage("rfc_receptor no tiene formato SAT válido"),
  body("nombre_receptor").isString().trim().notEmpty().isLength({ max: 254 }),
  body("domicilio_fiscal_receptor").matches(/^\d{5}$/).withMessage("domicilio_fiscal_receptor debe ser CP de 5 dígitos"),
  body("regimen_fiscal_receptor").isString().trim().isLength({ min: 3, max: 3 }),
  body("uso_cfdi").isString().trim().isLength({ min: 2, max: 4 }).withMessage("uso_cfdi inválido (ej. G03, S01, D01)"),
  body("sello_emisor").optional().isString().trim().isLength({ min: 1 }).withMessage("sello_emisor debe ser texto del XML si se envia"),
];

/*
 * This reviews any errors received in previous validations
 */
export const validateInputs = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
  }
  next();
};

export default {
  validateId,
  validateTravelRequest,
  validateExpenseReceipts,
  validateInputs,
  validateDraftTravelRequest,
  validateCreateUser,
  validateCfdi,
  validateViajeId,
  validateViajeTramoIds,
  validateGastoTramoBody,
};
