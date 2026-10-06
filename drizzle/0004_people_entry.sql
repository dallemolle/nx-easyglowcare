CREATE TYPE "public"."otp_purpose" AS ENUM('signup', 'login');--> statement-breakpoint
CREATE TYPE "public"."consent_kind" AS ENUM('terms', 'marketing', 'image');--> statement-breakpoint
CREATE TYPE "public"."conversion_reason" AS ENUM('appointment', 'payment', 'attendance');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('instagram', 'google', 'referral', 'direct', 'other');--> statement-breakpoint
CREATE TYPE "public"."person_status" AS ENUM('lead', 'client');--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"purpose" "otp_purpose" NOT NULL,
	"person_id" uuid,
	"phone" text NOT NULL,
	"channel" "message_channel" NOT NULL,
	"code_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed_at" timestamp with time zone,
	"invalidated_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"pending_signup" jsonb,
	CONSTRAINT "otp_codes_tenantId_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "otp_codes_channel_allowed" CHECK ("otp_codes"."channel" IN ('whatsapp', 'sms')),
	CONSTRAINT "otp_codes_person_by_purpose" CHECK (("otp_codes"."purpose" = 'login' AND "otp_codes"."person_id" IS NOT NULL) OR ("otp_codes"."purpose" = 'signup' AND "otp_codes"."person_id" IS NULL)),
	CONSTRAINT "otp_codes_pending_by_purpose" CHECK (("otp_codes"."purpose" = 'signup' AND "otp_codes"."pending_signup" IS NOT NULL) OR ("otp_codes"."purpose" = 'login' AND "otp_codes"."pending_signup" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "person_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "person_sessions_tenantId_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "person_sessions_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" "person_status" DEFAULT 'lead' NOT NULL,
	"name" text NOT NULL,
	"cpf" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"birth_date" date,
	"phone_verified_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"conversion_reason" "conversion_reason",
	"source" "lead_source" NOT NULL,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"ref" text,
	CONSTRAINT "people_tenantId_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "people_tenantId_cpf_unique" UNIQUE("tenant_id","cpf"),
	CONSTRAINT "people_cpf_format" CHECK ("people"."cpf" ~ '^[0-9]{11}$'),
	CONSTRAINT "people_phone_format" CHECK ("people"."phone" ~ '^[1-9]{2}9[0-9]{8}$'),
	CONSTRAINT "people_client_requires_conversion" CHECK ("people"."status" <> 'client' OR ("people"."converted_at" IS NOT NULL AND "people"."conversion_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "person_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"kind" "consent_kind" NOT NULL,
	"version" text NOT NULL,
	"granted" boolean NOT NULL,
	"ip" text,
	"user_agent" text,
	CONSTRAINT "person_consents_tenantId_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_tenant_id_person_id_people_tenant_id_id_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_sessions" ADD CONSTRAINT "person_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_sessions" ADD CONSTRAINT "person_sessions_tenant_id_person_id_people_tenant_id_id_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_consents" ADD CONSTRAINT "person_consents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_consents" ADD CONSTRAINT "person_consents_tenant_id_person_id_people_tenant_id_id_fk" FOREIGN KEY ("tenant_id","person_id") REFERENCES "public"."people"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_codes_tenant_id_index" ON "otp_codes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "otp_codes_phone_created_at_index" ON "otp_codes" USING btree ("phone","created_at");--> statement-breakpoint
CREATE INDEX "otp_codes_ip_created_at_index" ON "otp_codes" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "person_sessions_tenant_id_index" ON "person_sessions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "person_sessions_person_id_index" ON "person_sessions" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "people_tenant_id_index" ON "people" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "people_tenant_id_phone_index" ON "people" USING btree ("tenant_id","phone");--> statement-breakpoint
CREATE INDEX "person_consents_tenant_id_index" ON "person_consents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "person_consents_person_id_kind_created_at_index" ON "person_consents" USING btree ("person_id","kind","created_at");