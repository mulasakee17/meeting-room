/**
 * Vitest 全局 setup
 *
 * jsdom 环境下加载 @testing-library/jest-dom 以获得
 * toBeInTheDocument 等 DOM 匹配器。
 */

import "@testing-library/jest-dom/vitest";
