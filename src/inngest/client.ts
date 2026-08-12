import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "scana11y",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
