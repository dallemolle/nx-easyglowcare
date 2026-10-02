import { z } from "zod";

export const MESSAGE_CHANNELS = ["whatsapp", "sms", "email", "push"] as const;
export type MessageChannel = (typeof MESSAGE_CHANNELS)[number];

export const messageChannelSchema = z.enum(MESSAGE_CHANNELS);
