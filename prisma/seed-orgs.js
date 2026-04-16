/**
 * @file prisma/seed-orgs.js
 * @description Seed script for organizations, users, roles, and suppliers.
 *
 * Seeds:
 *   - 5 base roles  (Administrador, N1, N2, Cuentas por pagar, Solicitante)
 *   - 2 organizations with SAT test RFCs (XAXX010101000, XEXX010101000)
 *   - 4 departments  (2 per org)
 *   - 20 users       (10 per org, diverse roles)
 *   - 5 suppliers    (proveedores, raw SQL)
 *   - 2 MongoDB org configs (1 per org)
 *
 * Idempotent: safe to re-run; uses upsert / ON CONFLICT / skipDuplicates.
 *
 * Usage:
 *   node prisma/seed-orgs.js
 *   make seed
 */

import { PrismaClient } from "@prisma/client";
import { MongoClient } from "mongodb";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();
const MONGO_URL = process.env.MONGO_URI || "mongodb://localhost:27017";
const SALT_ROUNDS = 10;

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * 5 base roles.
 * Business concept → DB role_name mapping:
 *   admin         → Administrador
 *   aprobador N1  → N1
 *   aprobador N2  → N2
 *   solicitante   → Solicitante
 *   contabilidad  → Cuentas por pagar
 */
const ROLES = [
  { roleName: "Administrador" },
  { roleName: "N1" },
  { roleName: "N2" },
  { roleName: "Solicitante" },
  { roleName: "Cuentas por pagar" },
];

/**
 * 2 test organizations using official SAT generic test RFCs:
 *   XAXX010101000 — persona física / moral nacional genérica
 *   XEXX010101000 — operaciones con extranjeros
 */
const ORGS = [
  {
    nombre: "TechCorp México SA de CV",
    razon_social: "TechCorp México Sociedad Anónima de Capital Variable",
    rfc: "XAXX010101000",
    prefix: "tech",
    shortName: "TECH",
  },
  {
    nombre: "Logística del Norte SA de CV",
    razon_social: "Logística del Norte Sociedad Anónima de Capital Variable",
    rfc: "XEXX010101000",
    prefix: "log",
    shortName: "LOG",
  },
];

// Role distribution across 10 employees per org:
//   1 admin · 2 N1 · 2 N2 · 2 contabilidad · 3 solicitantes
const ROLE_DIST = [
  "Administrador",
  "N1", "N1",
  "N2", "N2",
  "Cuentas por pagar", "Cuentas por pagar",
  "Solicitante", "Solicitante", "Solicitante",
];

const FIRST_NAMES = [
  "Ana", "Carlos", "Diana", "Eduardo", "Fernanda",
  "Gabriel", "Hilda", "Iván", "Julia", "Kevin",
];
const LAST_NAMES = [
  "García", "Martínez", "López", "Hernández", "González",
  "Pérez", "Rodríguez", "Sánchez", "Torres", "Ramírez",
];

// ── Schema setup (idempotent DDL) ────────────────────────────────────────────

/**
 *
 */
async function setupTables() {
  // Add business columns to organizaciones (migration 20260409000000 only has id + timestamps)
  await prisma.$executeRawUnsafe(`
    ALTER TABLE organizaciones
      ADD COLUMN IF NOT EXISTS nombre       VARCHAR(100),
      ADD COLUMN IF NOT EXISTS razon_social VARCHAR(200),
      ADD COLUMN IF NOT EXISTS rfc          VARCHAR(13)
  `);

  // Add unique constraint on rfc if it doesn't exist yet
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'organizaciones_rfc_key'
      ) THEN
        ALTER TABLE organizaciones
          ADD CONSTRAINT organizaciones_rfc_key UNIQUE (rfc);
      END IF;
    END$$
  `);

  // Create proveedores table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS proveedores (
      id           BIGSERIAL    PRIMARY KEY,
      org_id       BIGINT       NOT NULL,
      nombre       VARCHAR(100) NOT NULL,
      razon_social VARCHAR(200),
      rfc          VARCHAR(13)  NOT NULL,
      email        VARCHAR(254),
      telefono     VARCHAR(20),
      activo       BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      CONSTRAINT proveedores_org_id_fkey  FOREIGN KEY (org_id) REFERENCES organizaciones(id),
      CONSTRAINT proveedores_org_nombre_key UNIQUE (org_id, nombre)
    )
  `);
}

// ── Seed functions ────────────────────────────────────────────────────────────

/**
 *
 */
async function seedRoles() {
  await prisma.role.createMany({ data: ROLES, skipDuplicates: true });

  const rows = await prisma.role.findMany({
    where: { roleName: { in: ROLES.map((r) => r.roleName) } },
  });
  return Object.fromEntries(rows.map((r) => [r.roleName, r.roleId]));
}

/**
 *
 */
async function seedOrganizations() {
  const orgIds = [];

  for (const org of ORGS) {
    const rows = await prisma.$queryRaw`
      INSERT INTO organizaciones (nombre, razon_social, rfc, created_at, updated_at)
      VALUES (${org.nombre}, ${org.razon_social}, ${org.rfc}, NOW(), NOW())
      ON CONFLICT (rfc) DO UPDATE SET updated_at = NOW()
      RETURNING id
    `;
    orgIds.push(Number(rows[0].id));
  }

  return orgIds;
}

/**
 *
 */
async function seedDepartments() {
  const orgDepts = [];

  for (const org of ORGS) {
    await prisma.department.createMany({
      data: [
        { departmentName: `Viajes ${org.shortName}`,      costsCenter: `CC-${org.shortName}-VJ`, active: true },
        { departmentName: `Operaciones ${org.shortName}`, costsCenter: `CC-${org.shortName}-OP`, active: true },
      ],
      skipDuplicates: true,
    });

    const depts = await prisma.department.findMany({
      where: {
        departmentName: {
          in: [`Viajes ${org.shortName}`, `Operaciones ${org.shortName}`],
        },
      },
    });
    orgDepts.push(depts);
  }

  return orgDepts;
}

/**
 *
 * @param roleMap
 * @param orgDepts
 */
async function seedUsers(roleMap, orgDepts) {
  for (let orgIdx = 0; orgIdx < ORGS.length; orgIdx++) {
    const { prefix, shortName } = ORGS[orgIdx];
    const depts = orgDepts[orgIdx];

    for (let i = 0; i < 10; i++) {
      const firstName = FIRST_NAMES[i];
      const lastName  = LAST_NAMES[i];
      const userName  = `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${prefix}`;
      const email     = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${prefix}.empresa.test`;
      const roleName  = ROLE_DIST[i];
      const deptId    = depts[i % 2].departmentId;
      const password  = await bcrypt.hash(`Pass${firstName}2024!`, SALT_ROUNDS);

      await prisma.user.upsert({
        where: { userName },
        update: {},
        create: {
          userName,
          password,
          workstation:  `WS-${shortName}-${String(i + 1).padStart(2, "0")}`,
          email,
          phoneNumber:  `55-${String(orgIdx * 10 + i + 1).padStart(4, "0")}-0000`,
          wallet:       0.0,
          roleId:       roleMap[roleName],
          departmentId: deptId,
          active:       true,
        },
      });
    }
  }
}

/**
 *
 * @param orgIds
 */
async function seedSuppliers(orgIds) {
  const suppliers = [
    {
      orgIdx:       0,
      nombre:       "Aerolineas Test SA de CV",
      razon_social: "Aerolineas Test Sociedad Anónima de Capital Variable",
      rfc:          "XAXX010101000",
      email:        "ventas@aerotest.empresa.test",
      telefono:     "55-0001-0001",
    },
    {
      orgIdx:       0,
      nombre:       "Hoteles Demo SC",
      razon_social: "Hoteles Demo Sociedad Civil",
      rfc:          "XEXX010101000",
      email:        "reservas@hoteldemo.empresa.test",
      telefono:     "55-0001-0002",
    },
    {
      orgIdx:       1,
      nombre:       "Transporte Ejecutivo Test SA",
      razon_social: "Transporte Ejecutivo Test Sociedad Anónima",
      rfc:          "XAXX010101000",
      email:        "ops@transtest.empresa.test",
      telefono:     "55-0002-0001",
    },
    {
      orgIdx:       1,
      nombre:       "Seguros Corporativos Demo SC",
      razon_social: "Seguros Corporativos Demo Sociedad Civil",
      rfc:          "XEXX010101000",
      email:        "contacto@segdemo.empresa.test",
      telefono:     "55-0002-0002",
    },
    {
      orgIdx:       0,
      nombre:       "Papelería y Suministros Test SA",
      razon_social: "Papelería y Suministros Test Sociedad Anónima",
      rfc:          "XAXX010101000",
      email:        "pedidos@paptest.empresa.test",
      telefono:     "55-0001-0003",
    },
  ];

  for (const s of suppliers) {
    const orgId = BigInt(orgIds[s.orgIdx]);
    await prisma.$executeRaw`
      INSERT INTO proveedores
        (org_id, nombre, razon_social, rfc, email, telefono, activo, created_at, updated_at)
      VALUES
        (${orgId}, ${s.nombre}, ${s.razon_social}, ${s.rfc},
         ${s.email}, ${s.telefono}, TRUE, NOW(), NOW())
      ON CONFLICT (org_id, nombre) DO NOTHING
    `;
  }
}

/**
 *
 * @param orgIds
 */
async function seedMongoConfig(orgIds) {
  const client = await MongoClient.connect(MONGO_URL);
  const db     = client.db("orgConfig");
  const col    = db.collection("org_settings");

  for (let i = 0; i < ORGS.length; i++) {
    const { nombre, rfc } = ORGS[i];

    await col.updateOne(
      { org_id: orgIds[i] },
      {
        $setOnInsert: {
          org_id:   orgIds[i],
          nombre,
          rfc,
          currency: "MXN",
          timezone: "America/Mexico_City",
          politicas_viaticos: {
            max_por_dia:            1500.00,
            aprobacion_auto_hasta:   500.00,
            dias_maximos_solicitud:    30,
          },
          notificaciones: {
            email: true,
            push:  false,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }

  await client.close();
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 *
 */
async function main() {
  console.log("Configuring schema extensions...");
  await setupTables();

  console.log("Seeding roles...");
  const roleMap = await seedRoles();

  console.log("Seeding organizations...");
  const orgIds = await seedOrganizations();

  console.log("Seeding departments...");
  const orgDepts = await seedDepartments();

  console.log("Seeding users (10 per org)...");
  await seedUsers(roleMap, orgDepts);

  console.log("Seeding suppliers...");
  await seedSuppliers(orgIds);

  console.log("Seeding MongoDB org config...");
  await seedMongoConfig(orgIds);

  console.log("");
  console.log("Seed complete:");
  console.log(`  Organizations : 2  (IDs ${orgIds.join(", ")})`);
  console.log("  Roles         : 5  (Administrador / N1 / N2 / Cuentas por pagar / Solicitante)");
  console.log("  Departments   : 4  (2 per org)");
  console.log("  Users         : 20 (10 per org, roles: 1 admin · 2 N1 · 2 N2 · 2 contabilidad · 3 solicitante)");
  console.log("  Suppliers     : 5  (RFCs: XAXX010101000, XEXX010101000)");
  console.log("  MongoDB cfg   : 2  (1 per org in orgConfig.org_settings)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
