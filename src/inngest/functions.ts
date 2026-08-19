import { auditUrl } from "./functions/audit-url";
import { processMobile } from "./functions/process-mobile";
import { processCode } from "./functions/process-code";
import { retention } from "./functions/retention";
import { psiPreview } from "./functions/psi-preview";

export const functions = [auditUrl, processMobile, processCode, retention, psiPreview];

export { auditUrl, processMobile, processCode, retention, psiPreview };
