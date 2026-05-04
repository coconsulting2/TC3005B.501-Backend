/**
 * @file scripts/test-notification.js
 * @description Script para probar el sistema de notificaciones (M3-006).
 * Uso dentro de Docker:
 *   docker compose -f docker-compose.dev.yml exec -T backend node scripts/test-notification.js <userId>
 * Uso local:
 *   node scripts/test-notification.js <userId>
 */
import { createNotification } from "../services/notificationService.js";
import prisma from "../database/config/prisma.js";

const userId = parseInt(process.argv[2]);

if (!userId || isNaN(userId)) {
  console.error("Uso: node scripts/test-notification.js <userId>");
  console.error("Ejemplo: node scripts/test-notification.js 1");
  process.exit(1);
}

async function main() {
  // Verificar que el usuario existe
  const user = await prisma.user.findUnique({ where: { userId } });
  if (!user) {
    console.error(`Usuario con ID ${userId} no existe.`);
    process.exit(1);
  }

  console.log(`Enviando notificación de prueba a: ${user.userName} (ID: ${userId})`);

  // Crear notificación in-app (+ push si está habilitado)
  const notification = await createNotification(
    userId,
    `🧪 Prueba: Tu solicitud de viaje ha sido aprobada — ${new Date().toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City" })}`
  );

  if (notification) {
    console.log("✅ Notificación in-app creada:", notification);
  } else {
    console.log("⚠️  Notificación in-app omitida (appNotif desactivado en preferencias)");
  }

  // Mostrar estado de preferencias
  const pref = await prisma.userPreference.findUnique({ where: { userId } });
  console.log("\n📋 Preferencias actuales:", pref || "(sin configurar — defaults: todo activado)");

  // Mostrar conteo de suscripciones push
  const pushCount = await prisma.pushSubscription.count({ where: { userId } });
  console.log(`🔔 Suscripciones push registradas: ${pushCount}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
