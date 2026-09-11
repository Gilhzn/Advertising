import { getDb } from "./client.js";
import { businesses, users } from "./schema.js";

const db = getDb();
const [user] = await db
  .insert(users)
  .values({ email: "demo@example.com", name: "Demo" })
  .onConflictDoNothing()
  .returning();
if (user) {
  await db.insert(businesses).values({
    userId: user.id,
    name: "Pixel Dungeon Run",
    slug: "pixel-dungeon-run",
    description:
      "A fast-paced roguelike mobile game with daily dungeons, pixel art and 5-minute runs. Free with cosmetic-only purchases. Launching on iOS and Android.",
    category: "game",
    languages: ["en"],
    primaryLanguage: "en",
    websiteUrl: "https://example.com/pixel-dungeon-run",
  });
}
console.log("seeded");
process.exit(0);
