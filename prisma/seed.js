/**
 * @file prisma/seed.js
 * @description Seeds the database with reference data (always) and dummy data (with "dev" arg).
 * Replaces Prepopulate.sql + Dummy.sql.
 *
 * Usage:
 *   node prisma/seed.js        # Reference data only
 *   node prisma/seed.js dev    # Reference + dummy data
 */
import { PrismaClient } from "@prisma/client";
import { parseCSV } from "../services/adminService.js";

const prisma = new PrismaClient();
const isDev = process.argv.includes("dev");

/**
 *
 */
async function main() {
  console.log("Seeding reference data...");

  // Roles
  await prisma.role.createMany({
    data: [
      { roleName: "Solicitante" },
      { roleName: "Agencia de viajes" },
      { roleName: "Cuentas por pagar" },
      { roleName: "N1" },
      { roleName: "N2" },
      { roleName: "Administrador" },
    ],
    skipDuplicates: true,
  });

  // Alert Messages
  await prisma.alertMessage.createMany({
    data: [
      { messageText: "Se ha abierto una solicitud." },
      { messageText: "Se requiere tu revisión para Primera Revisión." },
      { messageText: "Se requiere tu revisión para Segunda Revisión." },
      { messageText: "La solicitud está lista para generar su cotización de viaje." },
      { messageText: "Se deben asignar los servicios del viaje para la solicitud." },
      { messageText: "Se requiere validar comprobantes de los gastos del viaje." },
      { messageText: "Los comprobantes están listos para validación." },
    ],
    skipDuplicates: true,
  });

  // Request Statuses
  await prisma.requestStatus.createMany({
    data: [
      { status: "Borrador" },
      { status: "Primera Revisión" },
      { status: "Segunda Revisión" },
      { status: "Cotización del Viaje" },
      { status: "Atención Agencia de Viajes" },
      { status: "Comprobación gastos del viaje" },
      { status: "Validación de comprobantes" },
      { status: "Finalizado" },
      { status: "Cancelado" },
      { status: "Rechazado" },
    ],
    skipDuplicates: true,
  });

  // Receipt Types
  await prisma.receiptType.createMany({
    data: [
      { receiptTypeName: "Hospedaje" },
      { receiptTypeName: "Comida" },
      { receiptTypeName: "Transporte" },
      { receiptTypeName: "Caseta" },
      { receiptTypeName: "Autobús" },
      { receiptTypeName: "Vuelo" },
      { receiptTypeName: "Otro" },
    ],
    skipDuplicates: true,
  });

  console.log("Reference data seeded.");

  if (isDev) {
    console.log("Seeding dummy data...");

    // Departments
    await prisma.department.createMany({
      data: [
        { departmentName: "Finanzas", costsCenter: "CC001", active: true },
        { departmentName: "Recursos Humanos", costsCenter: "CC002", active: true },
        { departmentName: "IT", costsCenter: "CC003", active: true },
        { departmentName: "Marketing", costsCenter: "CC004", active: true },
        { departmentName: "Operaciones", costsCenter: "CC005", active: false },
        { departmentName: "Admin", costsCenter: "ADMIN", active: true },
      ],
      skipDuplicates: true,
    });

    // Users from CSV
    try {
      const csvResult = await parseCSV("./database/config/dummy_users.csv", true);
      console.log("CSV users:", csvResult);
    } catch (err) {
      console.error("Error seeding CSV users:", err.message);
    }

    // Countries
    const countries = [
      "México", "Estados Unidos", "Canadá", "Brásil", "Argentina",
      "Chile", "Colombia", "España", "Francia", "Reino Unido",
      "Alemania", "Italia", "Japón", "China", "India",
    ];
    await prisma.country.createMany({
      data: countries.map((c) => ({ countryName: c })),
      skipDuplicates: true,
    });

    // Cities
    const cities = [
      "CDMX", "Guadalajara", "Monterrey", "Cancún", "Mérida",
      "Nueva York", "Los Ángeles", "San Francisco", "Chicago", "Las Vegas",
      "Toronto", "Vancouver", "Rio de Janeiro", "Sao Paulo",
      "Buenos Aires", "Cordoba", "Santiago", "Valparaíso",
      "Bogotá", "Barranquilla", "Madrid", "Barcelona",
      "Paris", "Lyon", "Londres", "Manchester",
      "Berlín", "Munich", "Roma", "Venecia",
      "Tokyo", "Kyoto", "Pekín", "Hong Kong",
      "Bombay", "Nueva Delhi",
    ];
    await prisma.city.createMany({
      data: cities.map((c) => ({ cityName: c })),
      skipDuplicates: true,
    });

    // Requests (user IDs reference users created from CSV)
    const requestsData = [
      { userId: 1, requestStatusId: 1, notes: "Solicito viáticos para viaje a conferencia en Barcelona.", requestedFee: 1500.00, imposedFee: null, requestDays: 3.0 },
      { userId: 1, requestStatusId: 2, notes: "Reembolso por gastos médicos durante viaje.", requestedFee: 800.00, imposedFee: null, requestDays: 1.0 },
      { userId: 1, requestStatusId: 3, notes: "Solicitud de apoyo económico para capacitación online.", requestedFee: 500.00, imposedFee: null, requestDays: 0.0 },
      { userId: 1, requestStatusId: 4, notes: "Viáticos para taller de liderazgo en Madrid.", requestedFee: 1200.00, imposedFee: null, requestDays: 2.0 },
      { userId: 1, requestStatusId: 5, notes: "Reembolso de transporte.", requestedFee: 300.00, imposedFee: 250.00, requestDays: 0.5 },
      { userId: 1, requestStatusId: 6, notes: "Apoyo para participación en congreso internacional.", requestedFee: 2000.00, imposedFee: 1800.00, requestDays: 4.0 },
      { userId: 1, requestStatusId: 7, notes: "Gastos operativos extraordinarios.", requestedFee: 650.00, imposedFee: 600.00, requestDays: 0.0 },
      { userId: 1, requestStatusId: 8, notes: "Viaje urgente por representación institucional.", requestedFee: 1750.00, imposedFee: 1500.00, requestDays: 3.5 },
      { userId: 1, requestStatusId: 9, notes: "Solicito anticipo para misión técnica en el extranjero.", requestedFee: 2200.00, imposedFee: 2000.00, requestDays: 5.0 },
      { userId: 1, requestStatusId: 10, notes: "Solicitud de viáticos por gira de supervisión.", requestedFee: 1300.00, imposedFee: 1200.00, requestDays: 2.5 },
    ];

    for (const r of requestsData) {
      await prisma.request.create({ data: r });
    }

    // Routes (simplified subset - first 10 routes + route_requests)
    const routesData = [
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 1, idDestinationCity: 2, routerIndex: 0, planeNeeded: true, hotelNeeded: false, beginningDate: new Date("2025-05-01"), beginningTime: new Date("1970-01-01T08:00:00"), endingDate: new Date("2025-05-01"), endingTime: new Date("1970-01-01T11:00:00") },
      { idOriginCountry: 1, idOriginCity: 3, idDestinationCountry: 1, idDestinationCity: 5, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-05-02"), beginningTime: new Date("1970-01-01T10:30:00"), endingDate: new Date("2025-05-02"), endingTime: new Date("1970-01-01T14:30:00") },
      { idOriginCountry: 1, idOriginCity: 2, idDestinationCountry: 1, idDestinationCity: 1, routerIndex: 0, planeNeeded: false, hotelNeeded: true, beginningDate: new Date("2025-05-03"), beginningTime: new Date("1970-01-01T12:00:00"), endingDate: new Date("2025-05-03"), endingTime: new Date("1970-01-01T15:00:00") },
      { idOriginCountry: 1, idOriginCity: 3, idDestinationCountry: 1, idDestinationCity: 2, routerIndex: 0, planeNeeded: true, hotelNeeded: false, beginningDate: new Date("2025-05-04"), beginningTime: new Date("1970-01-01T06:00:00"), endingDate: new Date("2025-05-04"), endingTime: new Date("1970-01-01T09:00:00") },
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 2, idDestinationCity: 1, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-05-05"), beginningTime: new Date("1970-01-01T14:00:00"), endingDate: new Date("2025-05-05"), endingTime: new Date("1970-01-01T18:00:00") },
      { idOriginCountry: 2, idOriginCity: 1, idDestinationCountry: 1, idDestinationCity: 1, routerIndex: 0, planeNeeded: false, hotelNeeded: false, beginningDate: new Date("2025-05-06"), beginningTime: new Date("1970-01-01T11:00:00"), endingDate: new Date("2025-05-06"), endingTime: new Date("1970-01-01T13:00:00") },
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 8, idDestinationCity: 31, routerIndex: 0, planeNeeded: true, hotelNeeded: false, beginningDate: new Date("2025-05-07"), beginningTime: new Date("1970-01-01T09:30:00"), endingDate: new Date("2025-05-07"), endingTime: new Date("1970-01-01T12:30:00") },
      { idOriginCountry: 10, idOriginCity: 36, idDestinationCountry: 2, idDestinationCity: 7, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-05-08"), beginningTime: new Date("1970-01-01T15:00:00"), endingDate: new Date("2025-05-08"), endingTime: new Date("1970-01-01T18:30:00") },
      { idOriginCountry: 1, idOriginCity: 1, idDestinationCountry: 8, idDestinationCity: 31, routerIndex: 0, planeNeeded: true, hotelNeeded: true, beginningDate: new Date("2025-05-09"), beginningTime: new Date("1970-01-01T08:00:00"), endingDate: new Date("2025-05-09"), endingTime: new Date("1970-01-01T11:15:00") },
      { idOriginCountry: 10, idOriginCity: 25, idDestinationCountry: 7, idDestinationCity: 29, routerIndex: 0, planeNeeded: true, hotelNeeded: false, beginningDate: new Date("2025-05-10"), beginningTime: new Date("1970-01-01T07:00:00"), endingDate: new Date("2025-05-10"), endingTime: new Date("1970-01-01T09:00:00") },
    ];

    for (let i = 0; i < routesData.length; i++) {
      const route = await prisma.route.create({ data: routesData[i] });
      await prisma.routeRequest.create({
        data: { requestId: i + 1, routeId: route.routeId },
      });
    }

    // Receipts
    const receiptsData = [
      { receiptTypeId: 4, requestId: 7, validation: "Pendiente", amount: 300.00, validationDate: new Date("2025-04-19T09:00:00") },
      { receiptTypeId: 2, requestId: 7, validation: "Aprobado", amount: 300.00, validationDate: new Date("2025-04-19T09:03:00") },
      { receiptTypeId: 3, requestId: 8, validation: "Rechazado", amount: 1000.00, validationDate: new Date("2025-04-19T18:00:00") },
      { receiptTypeId: 7, requestId: 8, validation: "Pendiente", amount: 600.00, validationDate: new Date("2025-04-19T18:00:59") },
    ];

    for (const receipt of receiptsData) {
      await prisma.receipt.create({ data: receipt });
    }

    console.log("Dummy data seeded.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("Seed error:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
