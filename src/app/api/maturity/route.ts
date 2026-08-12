import { computeMaturityScore } from "@/lib/maturity/score";
import { getMaturityQuestions } from "@/lib/maturity/questions";
import { requireSession } from "@/lib/supabase/session";

export async function POST(request: Request) {
  const auth = await requireSession(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { answers } = body as { answers: Record<string, number> };

    if (!answers || typeof answers !== "object") {
      return Response.json(
        { error: "answers object is required" },
        { status: 400 }
      );
    }

    // Validate against the real question registry (25 questions, scoreRange [0,4])
    const questions = getMaturityQuestions();
    const byId = new Map(questions.map((q) => [q.id, q.scoreRange]));
    for (const [id, value] of Object.entries(answers)) {
      const range = byId.get(id);
      if (!range) {
        return Response.json(
          { error: `unknown question id: ${id}` },
          { status: 400 }
        );
      }
      if (typeof value !== "number" || value < range[0] || value > range[1]) {
        return Response.json(
          { error: `answer for ${id} must be a number in [${range[0]}, ${range[1]}]` },
          { status: 400 }
        );
      }
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
