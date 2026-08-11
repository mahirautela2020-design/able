import { computeMaturityScore } from "@/lib/maturity/score";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { answers } = body as { answers: Record<string, number> };

    if (!answers || typeof answers !== "object") {
      return Response.json(
        { error: "answers object is required" },
        { status: 400 }
      );
    }

    const result = computeMaturityScore(answers);

    return Response.json(result);
  } catch {
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
