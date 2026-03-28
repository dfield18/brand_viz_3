import { Resend } from "resend";

const key = process.env.RESEND_API_KEY;
if (!key && process.env.NODE_ENV === "production") {
  console.warn("RESEND_API_KEY is not set — email reports will not be sent");
}

export const resend = new Resend(key || "re_placeholder");
