import "dotenv/config";
import { db } from "./src/lib/db";
import { accessTokens } from "./src/lib/schema";
async function run() {
  try {
    await db.insert(accessTokens).values({
      userId: "415a5394-4694-41c3-8c81-bab258cca963",
      name: "test",
      tokenHash: "hash",
      prefix: "vr_",
    });
    console.log("Success");
  } catch (e) {
    console.error(e);
  }
}
run();
