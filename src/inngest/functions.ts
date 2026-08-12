import { auditUrl } from "./functions/audit-url";
import { processMobile } from "./functions/process-mobile";
import { processCode } from "./functions/process-code";

export const functions = [auditUrl, processMobile, processCode];

export { auditUrl, processMobile, processCode };
