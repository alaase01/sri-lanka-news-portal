import "dotenv/config";

if (process.env.NODE_ENV === "production") {
  throw new Error("Tests create and delete data. Do not run them against production.");
}

// Uploaded test images go to a throwaway folder, never the real media folder.
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.MEDIA_DIR = join(tmpdir(), "rsnews-test-media");
