import { auditUrl } from "./functions/audit-url";
import { processMobile } from "./functions/process-mobile";
import { processCode } from "./functions/process-code";
import { retention } from "./functions/retention";

export const functions = [auditUrl, processMobile, processCode, retention];

export { auditUrl, processMobile, processCode, retention };
