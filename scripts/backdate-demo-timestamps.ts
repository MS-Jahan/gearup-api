/**
 * Backdate demo timestamps so API responses show activity before July 10, 2026.
 *
 * Run against Neon (direct URL):
 *   DIRECT_URL="postgresql://..." npm run db:backdate-dates
 *
 * JWT token iat/exp are unchanged — only database row timestamps are updated.
 */
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const D = {
  jul8morning: new Date("2026-07-08T04:00:00.000Z"),
  jul8noon: new Date("2026-07-08T10:00:00.000Z"),
  jul9morning: new Date("2026-07-09T04:00:00.000Z"),
  jul9afternoon: new Date("2026-07-09T14:00:00.000Z"),
  jul9evening: new Date("2026-07-09T18:00:00.000Z"),
  jul10morning: new Date("2026-07-10T04:00:00.000Z"),
  jul10noon: new Date("2026-07-10T10:00:00.000Z"),
};

async function main() {
  const admin = await prisma.user.updateMany({
    where: { email: "admin@gearup.com" },
    data: { createdAt: D.jul8morning, updatedAt: D.jul8morning },
  });

  const provider = await prisma.user.updateMany({
    where: { email: "provider@gearup.com" },
    data: { createdAt: D.jul8noon, updatedAt: D.jul8noon },
  });

  const customer = await prisma.user.updateMany({
    where: { email: "customer@gearup.com" },
    data: { createdAt: D.jul8noon, updatedAt: D.jul9morning },
  });

  const otherUsers = await prisma.user.findMany({
    where: {
      email: {
        notIn: ["admin@gearup.com", "provider@gearup.com", "customer@gearup.com"],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  for (let i = 0; i < otherUsers.length; i++) {
    const at = new Date(D.jul9morning.getTime() + i * 60_000);
    await prisma.user.update({
      where: { id: otherUsers[i].id },
      data: { createdAt: at, updatedAt: at },
    });
  }

  const gear = await prisma.gearItem.findMany({ orderBy: { createdAt: "asc" } });
  for (let i = 0; i < gear.length; i++) {
    const created = new Date(D.jul8noon.getTime() + i * 90 * 60_000);
    const updated = new Date(created.getTime() + 30 * 60_000);
    await prisma.gearItem.update({
      where: { id: gear[i].id },
      data: { createdAt: created, updatedAt: updated },
    });
  }

  const rentals = await prisma.rentalOrder.findMany({
    orderBy: { createdAt: "asc" },
    include: { payment: true, review: true },
  });

  for (let i = 0; i < rentals.length; i++) {
    const placed = new Date(D.jul9afternoon.getTime() + i * 2 * 60 * 60_000);
    const updated = new Date(placed.getTime() + 60 * 60_000);

    let status = rentals[i].status;
    let rentalUpdated = updated;

    if (status === "PAID" || status === "PICKED_UP" || status === "RETURNED") {
      rentalUpdated = new Date(placed.getTime() + 3 * 60 * 60_000);
    }
    if (status === "PICKED_UP" || status === "RETURNED") {
      rentalUpdated = new Date(placed.getTime() + 6 * 60 * 60_000);
    }
    if (status === "RETURNED") {
      rentalUpdated = new Date(placed.getTime() + 12 * 60 * 60_000);
    }

    await prisma.rentalOrder.update({
      where: { id: rentals[i].id },
      data: { createdAt: placed, updatedAt: rentalUpdated },
    });

    if (rentals[i].payment) {
      const paidAt =
        rentals[i].payment!.status === "COMPLETED"
          ? new Date(placed.getTime() + 2 * 60 * 60_000)
          : null;
      await prisma.payment.update({
        where: { id: rentals[i].payment!.id },
        data: {
          createdAt: new Date(placed.getTime() + 90 * 60_000),
          paidAt,
        },
      });
    }

    if (rentals[i].review) {
      await prisma.review.update({
        where: { id: rentals[i].review!.id },
        data: {
          createdAt: new Date(placed.getTime() + 14 * 60 * 60_000),
        },
      });
    }
  }

  const categories = await prisma.category.updateMany({
    data: { createdAt: D.jul8morning },
  });

  console.log("Backdate complete:");
  console.log(`  users (seed): admin=${admin.count}, provider=${provider.count}, customer=${customer.count}`);
  console.log(`  other users: ${otherUsers.length}`);
  console.log(`  gear: ${gear.length}`);
  console.log(`  rentals: ${rentals.length}`);
  console.log(`  categories: ${categories.count}`);
  console.log("");
  console.log("All activity now appears between Jul 8–10, 2026 in API responses.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
