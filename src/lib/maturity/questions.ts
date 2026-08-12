export interface MaturityQuestion {
  id: string;
  domain: "governance" | "design" | "dev" | "qa" | "ops";
  text: string;
  weight: number;
  scoreRange: [number, number];
}

export function getMaturityQuestions(): MaturityQuestion[] {
  return [
    {
      id: "gov-1",
      domain: "governance",
      text: "Does your organization have a published accessibility policy that is reviewed annually?",
      weight: 5,
      scoreRange: [0, 4],
    },
    {
      id: "gov-2",
      domain: "governance",
      text: "Is there an executive sponsor or designated accessibility lead with organizational authority?",
      weight: 5,
      scoreRange: [0, 4],
    },
    {
      id: "gov-3",
      domain: "governance",
      text: "Are accessibility requirements included in all RFPs and vendor procurement documents?",
      weight: 5,
      scoreRange: [0, 4],
    },
    {
      id: "gov-4",
      domain: "governance",
      text: "Does the organization track and report accessibility metrics (violation counts, remediation rate, audit coverage) to leadership?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "gov-5",
      domain: "governance",
      text: "Is there a documented process for handling accessibility complaints and feedback from users with disabilities?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "design-1",
      domain: "design",
      text: "Do designers use a design system with baked-in accessibility tokens (contrast ratios, focus indicators, target sizes)?",
      weight: 5,
      scoreRange: [0, 4],
    },
    {
      id: "design-2",
      domain: "design",
      text: "Are Figma or design files audited for accessibility before handoff to development?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "design-3",
      domain: "design",
      text: "Do all designs include visible focus indicators, hover states, and error states for every interactive component?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "design-4",
      domain: "design",
      text: "Is reading order documented and validated in design handoffs?",
      weight: 3,
      scoreRange: [0, 4],
    },
    {
      id: "design-5",
      domain: "design",
      text: "Are color palettes verified for WCAG 2.2 AA contrast (4.5:1 text, 3:1 non-text) before adoption?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "dev-1",
      domain: "dev",
      text: "Do all pull requests include automated accessibility checks (axe-core, lint rules) in CI?",
      weight: 5,
      scoreRange: [0, 4],
    },
    {
      id: "dev-2",
      domain: "dev",
      text: "Are semantic HTML and ARIA patterns used correctly and reviewed in code review?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "dev-3",
      domain: "dev",
      text: "Is keyboard-only navigation tested for every new feature before release?",
      weight: 5,
      scoreRange: [0, 4],
    },
    {
      id: "dev-4",
      domain: "dev",
      text: "Are developers trained on WCAG 2.2 requirements and assistive technology basics?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "dev-5",
      domain: "dev",
      text: "Is there a component library with pre-tested accessible components that all teams use?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "qa-1",
      domain: "qa",
      text: "Does QA include assistive technology testing (screen readers, zoom, voice control) in every release cycle?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "qa-2",
      domain: "qa",
      text: "Are automated accessibility scans run on a schedule (daily/weekly) across production pages?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "qa-3",
      domain: "qa",
      text: "Is there a documented manual testing checklist mapped to WCAG 2.2 criteria?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "qa-4",
      domain: "qa",
      text: "Are accessibility bugs tracked with the same severity and SLA as functional bugs?",
      weight: 3,
      scoreRange: [0, 4],
    },
    {
      id: "qa-5",
      domain: "qa",
      text: "Does the team conduct periodic external accessibility audits (at least annually)?",
      weight: 3,
      scoreRange: [0, 4],
    },
    {
      id: "ops-1",
      domain: "ops",
      text: "Does the organization maintain a current VPAT/ACR for all public-facing products?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "ops-2",
      domain: "ops",
      text: "Are accessibility requirements included in the definition of done for all features?",
      weight: 4,
      scoreRange: [0, 4],
    },
    {
      id: "ops-3",
      domain: "ops",
      text: "Is there a process for users to report accessibility barriers and receive timely responses?",
      weight: 3,
      scoreRange: [0, 4],
    },
    {
      id: "ops-4",
      domain: "ops",
      text: "Are third-party integrations and embedded content evaluated for accessibility before adoption?",
      weight: 3,
      scoreRange: [0, 4],
    },
    {
      id: "ops-5",
      domain: "ops",
      text: "Does the organization provide ongoing accessibility training for all roles (design, dev, QA, PM, content)?",
      weight: 3,
      scoreRange: [0, 4],
    },
  ];
}
