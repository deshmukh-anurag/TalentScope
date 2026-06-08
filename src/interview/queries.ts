// Interview queries for Wasp
import type { GetTestResults } from "wasp/server/operations";
import type { TestResult } from "wasp/entities";
import { HttpError } from "wasp/server";
import { createLogger } from "../server/logger";

const log = createLogger("interview");

// Get all completed interview results for the current user, newest first.
export const getTestResults: GetTestResults<void, TestResult[]> = async (_args, context) => {
  if (!context.user) {
    throw new HttpError(401, "User not authenticated");
  }

  try {
    return await context.entities.TestResult.findMany({
      where: { userId: context.user.id },
      orderBy: { createdAt: "desc" },
    });
  } catch (error) {
    log.error("failed to fetch test results", error instanceof Error ? error.message : error);
    throw new HttpError(500, "Failed to fetch test results");
  }
};
