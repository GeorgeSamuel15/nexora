import nodemailer from "nodemailer";
export interface Mail {
  to: string;
  subject: string;
  text: string;
}
export interface Mailer {
  send(mail: Mail): Promise<void>;
}
export function createSmtpMailer(): Mailer {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? "localhost",
    port: Number(process.env.SMTP_PORT ?? "1025"),
    secure: process.env.SMTP_SECURE === "true",
    ...(process.env.SMTP_USER && process.env.SMTP_PASSWORD
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } }
      : {}),
    connectionTimeout: 5000,
    socketTimeout: 10_000,
  });
  return {
    async send(mail) {
      await transport.sendMail({
        ...mail,
        from: process.env.SMTP_FROM ?? "Nexora <noreply@nexora.test>",
      });
    },
  };
}
export function actionMail(to: string, subject: string, path: string, token: string): Mail {
  const url = new URL(path, process.env.FRONTEND_URL ?? "http://localhost:5173");
  url.searchParams.set("token", token);
  return {
    to,
    subject,
    text: `${subject}\n\nOpen this link to continue:\n${url.toString()}\n\nIf you did not request this, ignore this message. Never share this link.`,
  };
}

export async function enqueueMail(mail: Mail): Promise<void> {
  const response = await fetch(
    `${process.env.NOTIFICATION_SERVICE_INTERNAL_URL ?? "http://localhost:4009"}/internal/mail`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": process.env.INTERNAL_SERVICE_SECRET ?? "",
      },
      body: JSON.stringify(mail),
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error("Email could not be queued. Please try again.");
}
