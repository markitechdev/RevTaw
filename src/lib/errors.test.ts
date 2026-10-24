import { describe, expect, it } from "vitest";

import { ServiceError } from "@/lib/errors";
import { PlannerError } from "@/lib/planner/service";
import { SessionError } from "@/lib/study/sessions";

describe("ServiceError", () => {
  it("is what every area's error is, so one check catches them all", () => {
    const session = new SessionError("This session is already finished.", 409);
    const planner = new PlannerError("Exam not found.", 404);
    for (const [error, name, status] of [[session, "SessionError", 409], [planner, "PlannerError", 404]] as const) {
      expect(error).toBeInstanceOf(ServiceError);
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe(name);
      expect(error.status).toBe(status);
    }
    expect(new ServiceError("Quiz not found.", 404).name).toBe("ServiceError");
  });
});
