import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "able",
  eventKey: process.env.INNGEST_EVENT_KEY,
});
