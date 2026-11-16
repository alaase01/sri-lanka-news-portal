import "dotenv/config";

if (process.env.NODE_ENV === "production") {
  throw new Error("Tests create and delete data. Do not run them against production.");
}
