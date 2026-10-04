import { z } from "zod";

export const MESSAGE_CHANNELS = ["whatsapp", "sms", "email", "push"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const messageChannelSchema = z.enum(MESSAGE_CHANNELS);

export const enqueueMessageSchema = z.object({
  channel: messageChannelSchema,
  template: z.string().trim().min(1).max(100),
  recipient: z.string().trim().min(1).max(254),
  payload: z.record(z.string(), z.unknown()).default({}),
  sendAt: z.date().optional(),
  dedupeKey: z.string().trim().min(1).max(200).optional(),
});

export type EnqueueMessageInput = z.input<typeof enqueueMessageSchema>;
