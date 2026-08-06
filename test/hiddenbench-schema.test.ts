import { describe, expect, it } from "vitest";
import { taskToConfig, type HiddenBenchTask } from "../experiments/campaign/tasks/hiddenbench/adapter";
import { resolveCandidateOptions } from "../experiments/campaign/pipeline/hiddenbenchProtocol";
import { buildDiscussionTaskContent } from "../experiments/campaign/pipeline/Runner";

function makeTask(): HiddenBenchTask {
  return {
    id: 1,
    name: "order isolation",
    description: "Choose one option",
    shared_information: ["shared fact"],
    hidden_information: ["hidden fact"],
    possible_answers: ["Option B", "Option A", "Option C"],
    correct_answer: "Option A",
  };
}

describe("HiddenBench candidate schema isolation", () => {
  it("keeps source candidate order even when the correct answer is not first", () => {
    const config = taskToConfig(makeTask());

    expect(Object.keys(config.correctAnswer)[0]).toBe("Option A");
    expect(resolveCandidateOptions(config)).toEqual(["Option B", "Option A", "Option C"]);
  });

  it("fails closed when candidate schema and answer labels diverge", () => {
    const config = taskToConfig(makeTask());
    delete config.searchKeys["Option C"];

    expect(() => resolveCandidateOptions(config)).toThrow(/does not match/);
  });

  it("injects candidate labels without revealing which option is correct", () => {
    const content = buildDiscussionTaskContent(taskToConfig(makeTask()));

    expect(content).toContain("1. Option B\n2. Option A\n3. Option C");
    expect(content).not.toMatch(/correct answer|正确答案/i);
    expect(content).toContain("order is not a priority signal");
  });
});
