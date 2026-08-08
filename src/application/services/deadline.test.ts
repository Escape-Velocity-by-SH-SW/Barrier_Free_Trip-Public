import { describe, expect, it } from "vitest";

import { runWithDeadline } from "./deadline.js";

describe("runWithDeadline", () => {
  it("provides an absolute deadline and aborts deadline-aware downstream work", async () => {
    const startedAt = performance.now();
    await expect(
      runWithDeadline(20, (context) => {
        expect(context.deadlineAtMs).toBeGreaterThan(Date.now());
        return new Promise((_resolve, reject) => {
          context.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        });
      }),
    ).rejects.toThrow("aborted");
    expect(performance.now() - startedAt).toBeLessThan(200);
  });
});
