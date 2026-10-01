CREATE TYPE "public"."tenant_segment" AS ENUM('aesthetics', 'salon', 'barbershop', 'other');--> statement-breakpoint
CREATE TABLE "service_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_categories_tenantId_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "service_categories_tenantId_slug_unique" UNIQUE("tenant_id","slug")
);
--> statement-breakpoint
CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"duration_min" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"price_is_from" boolean DEFAULT false NOT NULL,
	"cleanup_buffer_min" integer DEFAULT 0 NOT NULL,
	"requires_assessment" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "services_tenantId_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "services_tenantId_slug_unique" UNIQUE("tenant_id","slug"),
	CONSTRAINT "services_duration_positive" CHECK ("services"."duration_min" > 0),
	CONSTRAINT "services_price_non_negative" CHECK ("services"."price_cents" >= 0),
	CONSTRAINT "services_cleanup_buffer_non_negative" CHECK ("services"."cleanup_buffer_min" >= 0)
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "equipment_tenantId_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "equipment_tenantId_locationId_name_unique" UNIQUE("tenant_id","location_id","name")
);
--> statement-breakpoint
CREATE TABLE "professionals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"color" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "professionals_tenantId_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "rooms_tenantId_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "rooms_tenantId_locationId_name_unique" UNIQUE("tenant_id","location_id","name")
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "locations_tenantId_id_unique" UNIQUE("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"segment" "tenant_segment" DEFAULT 'aesthetics' NOT NULL,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_slug_format" CHECK ("tenants"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "service_categories" ADD CONSTRAINT "service_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_tenant_id_category_id_service_categories_tenant_id_id_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."service_categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_tenant_id_location_id_locations_tenant_id_id_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "professionals" ADD CONSTRAINT "professionals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_location_id_locations_tenant_id_id_fk" FOREIGN KEY ("tenant_id","location_id") REFERENCES "public"."locations"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_categories_tenant_id_index" ON "service_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "services_tenant_id_category_id_index" ON "services" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE INDEX "equipment_tenant_id_index" ON "equipment" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "professionals_tenant_id_index" ON "professionals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "rooms_tenant_id_index" ON "rooms" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "locations_tenant_id_index" ON "locations" USING btree ("tenant_id");