import test from "node:test";
import assert from "node:assert/strict";
import { deploymentConfig } from "../scripts/deploy-config.mjs";
test("upgrading deployment config preserves resources and user schedules without mutation", () => {
  const old = {
    name: "custom",
    d1_databases: [{ binding: "DB", database_id: "existing" }],
    triggers: { crons: ["15 2 * * *"] },
    images: { remote: true },
  };
  const result = deploymentConfig(old);
  assert.equal(result.d1_databases, old.d1_databases);
  assert.deepEqual(result.triggers.crons, ["15 2 * * *", "0 * * * *"]);
  assert.deepEqual(result.images, { remote: true, binding: "IMAGE_PROCESSOR" });
  assert.deepEqual(old.triggers.crons, ["15 2 * * *"]);
  assert.deepEqual(deploymentConfig(result), result);
});
