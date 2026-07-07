/**
 * Vitest 全局 setup
 *
 * jsdom 环境下加载 @testing-library/jest-dom 以获得
 * toBeInTheDocument 等 DOM 匹配器。
 */

import "@testing-library/jest-dom/vitest";
import { expect } from "vitest";

// Custom matcher: toBeOneOf — asserts a value is present in an array
expect.extend({
  toBeOneOf(received: unknown, allowed: unknown[]) {
    const pass = allowed.includes(received);
    return {
      pass,
      message: () =>
        pass
          ? `expected ${this.utils.printReceived(received)} not to be one of ${this.utils.printExpected(allowed)}`
          : `expected ${this.utils.printReceived(received)} to be one of ${this.utils.printExpected(allowed)}`,
    };
  },
});
