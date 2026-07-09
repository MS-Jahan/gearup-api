import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || "admin@gearup.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@12345";

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: adminHash,
      name: "Platform Admin",
      role: Role.ADMIN,
    },
  });

  const categories = [
    { name: "Cycling", slug: "cycling", description: "Bikes and cycling gear" },
    { name: "Camping", slug: "camping", description: "Tents, sleeping bags, stoves" },
    { name: "Fitness", slug: "fitness", description: "Gym and training equipment" },
    { name: "Water Sports", slug: "water-sports", description: "Kayaks, boards, life jackets" },
    { name: "Climbing", slug: "climbing", description: "Harnesses, ropes, helmets" },
  ];

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    });
  }

  const providerHash = await bcrypt.hash("Provider@123", 10);
  const provider = await prisma.user.upsert({
    where: { email: "provider@gearup.com" },
    update: {},
    create: {
      email: "provider@gearup.com",
      password: providerHash,
      name: "Adventure Gear Shop",
      phone: "+8801700000001",
      role: Role.PROVIDER,
    },
  });

  const customerHash = await bcrypt.hash("Customer@123", 10);
  await prisma.user.upsert({
    where: { email: "customer@gearup.com" },
    update: {},
    create: {
      email: "customer@gearup.com",
      password: customerHash,
      name: "Rahim Khan",
      phone: "+8801700000002",
      role: Role.CUSTOMER,
    },
  });

  const camping = await prisma.category.findUnique({ where: { slug: "camping" } });
  const cycling = await prisma.category.findUnique({ where: { slug: "cycling" } });
  const water = await prisma.category.findUnique({ where: { slug: "water-sports" } });

  if (camping && cycling && water) {
    const sampleGear = [
      {
        name: "4-Person Camping Tent",
        brand: "NatureHike",
        description: "Waterproof dome tent suitable for family camping trips.",
        categoryId: camping.id,
        pricePerDay: 25,
        stock: 5,
        specifications: { capacity: "4 persons", weight: "6.2kg" },
      },
      {
        name: "Mountain Bike Pro 29",
        brand: "TrailMaster",
        description: "Full suspension mountain bike for trail riding.",
        categoryId: cycling.id,
        pricePerDay: 35,
        stock: 3,
        specifications: { frame: "aluminum", wheelSize: "29 inch" },
      },
      {
        name: "Inflatable Kayak 2-Seater",
        brand: "AquaFlow",
        description: "Lightweight inflatable kayak for lakes and calm rivers.",
        categoryId: water.id,
        pricePerDay: 40,
        stock: 4,
        specifications: { capacity: "2 persons", length: "3.2m" },
      },
    ];

    for (const gear of sampleGear) {
      const existing = await prisma.gearItem.findFirst({
        where: { name: gear.name, providerId: provider.id },
      });
      if (!existing) {
        await prisma.gearItem.create({
          data: { ...gear, providerId: provider.id, images: [] },
        });
      }
    }
  }

  console.log("Seed done");
  console.log(`Admin: ${admin.email} / ${adminPassword}`);
  console.log("Provider: provider@gearup.com / Provider@123");
  console.log("Customer: customer@gearup.com / Customer@123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
