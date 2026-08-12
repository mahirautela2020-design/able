"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { getMaturityQuestions } from "@/lib/maturity/questions";
import type { MaturityResult } from "@/lib/maturity/score";

export function Questionnaire() {
  const questions = getMaturityQuestions();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<MaturityResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (id: string, value: number) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch("/api/maturity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ answers }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const domains = [...new Set(questions.map((q) => q.domain))];
  const domainLabels: Record<string, string> = {
    governance: "Governance",
    design: "Design",
    dev: "Development",
    qa: "QA & Testing",
    ops: "Operations",
  };

  return (
    <div className="space-y-8">
      {domains.map((domain) => (
        <div key={domain} className="space-y-4">
          <h3 className="text-lg font-semibold">
            {domainLabels[domain] || domain}
          </h3>
          {questions
            .filter((q) => q.domain === domain)
            .map((q) => (
              <div key={q.id} className="space-y-2">
                <p className="text-sm font-medium">{q.text}</p>
                <div className="flex gap-3">
                  {[0, 1, 2, 3, 4].map((value) => (
                    <label
                      key={value}
                      className="flex items-center gap-1 text-sm cursor-pointer"
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={value}
                        checked={answers[q.id] === value}
                        onChange={() => handleChange(q.id, value)}
                        className="h-4 w-4"
                      />
                      {value}
                    </label>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ))}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Computing..." : "Submit Assessment"}
      </button>

      {result && (
        <div className="mt-8 p-4 border rounded-lg space-y-3">
          <h3 className="text-lg font-semibold">Results</h3>
          <p>
            Overall Score: <span className="font-bold">{result.overall}</span>
          </p>
          <p>
            Maturity Level: <span className="font-bold">{result.level}</span>
          </p>
          <div className="space-y-1">
            {result.byDomain.map((d) => (
              <div key={d.domain} className="flex justify-between text-sm">
                <span>{domainLabels[d.domain] || d.domain}</span>
                <span className="font-medium">
                  {d.score} / {d.maxScore} ({d.answeredQuestions} answered)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
