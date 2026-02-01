// Interview queries for Wasp
import type { GetTestResults } from "wasp/server/operations";
import { HttpError } from "wasp/server";

// Get test results for the current user
export const getTestResults: GetTestResults<void, any[]> = async (args, context) => {
  if (!context.user) {
    throw new HttpError(401, "User not authenticated");
  }

  try {
    const results = await context.entities.TestResult.findMany({
      where: {
        userId: context.user.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return results;
  } catch (error: any) {
    console.error('Error fetching test results:', error);
    throw new HttpError(500, error.message || 'Failed to fetch test results');
  }
};
