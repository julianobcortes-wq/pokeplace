import { describe, expect, it } from "vitest";
import { createRollingBudget } from "@/lib/rolling-budget";

describe("createRollingBudget", () => {
  it("allows up to the limit inside one window and refuses the rest", () => {
    const clock = { t: 0 };
    const budget = createRollingBudget(3, 1000, () => clock.t);
    expect([budget.tryTake(), budget.tryTake(), budget.tryTake(), budget.tryTake()]).toEqual([
      true,
      true,
      true,
      false,
    ]);
    expect(budget.remaining()).toBe(0);
  });

  it("frees capacity as old entries leave the window", () => {
    const clock = { t: 0 };
    const budget = createRollingBudget(2, 1000, () => clock.t);
    expect(budget.tryTake()).toBe(true);
    clock.t = 400;
    expect(budget.tryTake()).toBe(true);
    expect(budget.tryTake()).toBe(false);
    clock.t = 1000;
    expect(budget.remaining()).toBe(1);
    expect(budget.tryTake()).toBe(true);
    expect(budget.tryTake()).toBe(false);
  });
});
