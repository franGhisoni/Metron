import { PrismaClient } from "@prisma/client";
// DEFAULT_CATEGORIES lives in src so it's shared between seed and the register flow.
// tsx resolves .js → .ts at runtime so this path works.
import { DEFAULT_CATEGORIES } from "../src/modules/categories/defaults.js";

const prisma = new PrismaClient();

async function main() {
  // eslint-disable-next-line no-console
  console.log(
    `Seed ready — ${DEFAULT_CATEGORIES.length} default categories available per user.`
  );
  console.log("Default categories are seeded automatically on user registration.");
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
