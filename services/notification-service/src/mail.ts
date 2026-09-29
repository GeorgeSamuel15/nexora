import type { Request, Response } from "express";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { internalServiceAuth } from "@nexora/http";
import { asyncHandler } from "@nexora/utils";
import { createSmtpMailer } from "@nexora/mail";
import type { PrismaClient } from "../generated/client/index.js";
const mailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(200),
  text: z.string().min(1).max(10000),
});
export function mailQueue(
  db: PrismaClient,
  secret: string,
): { router: Router; tick: () => Promise<void> } {
  const key = createHash("sha256").update(secret).digest();
  function encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const payload = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), payload]).toString("base64");
  }
  function decrypt(value: string): string {
    const b = Buffer.from(value, "base64");
    const cipher = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
    cipher.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString("utf8");
  }
  const router = Router();
  router.post(
    "/mail",
    internalServiceAuth(secret),
    asyncHandler(async (req: Request, res: Response) => {
      const mail = mailSchema.parse(req.body);
      const record = await db.emailDelivery.create({
        data: { payload: encrypt(JSON.stringify(mail)) },
      });
      res.status(202).json({ success: true, data: { id: record.id, status: record.status } });
    }),
  );
  const mailer = createSmtpMailer();
  let running = false;
  async function tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      // Leases recover after a crashed worker. SMTP is at-least-once delivery.
      await db.emailDelivery.updateMany({
        where: { status: "PROCESSING", availableAt: { lte: new Date() } },
        data: { status: "PENDING" },
      });
      const records = await db.emailDelivery.findMany({
        where: { status: "PENDING", availableAt: { lte: new Date() } },
        take: 10,
        orderBy: { createdAt: "asc" },
      });
      for (const record of records) {
        const claim = await db.emailDelivery.updateMany({
          where: { id: record.id, status: "PENDING" },
          data: {
            status: "PROCESSING",
            attempts: { increment: 1 },
            availableAt: new Date(Date.now() + 120_000),
          },
        });
        if (!claim.count) continue;
        try {
          await mailer.send(mailSchema.parse(JSON.parse(decrypt(record.payload))));
          await db.emailDelivery.update({
            where: { id: record.id },
            data: { status: "SENT", sentAt: new Date(), payload: "" },
          });
        } catch {
          await db.emailDelivery.update({
            where: { id: record.id },
            data: {
              status: record.attempts >= 7 ? "FAILED" : "PENDING",
              availableAt: new Date(Date.now() + Math.min(3600000, 10000 * 2 ** record.attempts)),
            },
          });
        }
      }
    } finally {
      running = false;
    }
  }
  return { router, tick };
}
