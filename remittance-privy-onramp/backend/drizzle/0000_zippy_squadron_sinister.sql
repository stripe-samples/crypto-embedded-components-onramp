CREATE TYPE "public"."remittance_status" AS ENUM('onramp_session_created', 'onramp_fulfilled', 'transfer_in_progress', 'transfer_submitted', 'transfer_failed');--> statement-breakpoint
CREATE TABLE "remittance_wallets" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_privy_user_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"network" text NOT NULL,
	"privy_wallet_id" text NOT NULL,
	"offramp_destination_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remittances" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_privy_user_id" text NOT NULL,
	"remittance_wallet_id" text NOT NULL,
	"onramp_session_id" text NOT NULL,
	"wallet_address" text NOT NULL,
	"network" text NOT NULL,
	"privy_wallet_id" text NOT NULL,
	"offramp_destination_address" text NOT NULL,
	"status" "remittance_status" DEFAULT 'onramp_session_created' NOT NULL,
	"transfer_attempt_count" integer DEFAULT 0 NOT NULL,
	"transfer_hash" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"privy_user_id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"crypto_customer_id" text,
	"link_auth_intent_id" text,
	"access_token" text,
	"refresh_token" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "remittance_wallets" ADD CONSTRAINT "remittance_wallets_owner_privy_user_id_users_privy_user_id_fk" FOREIGN KEY ("owner_privy_user_id") REFERENCES "public"."users"("privy_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_owner_privy_user_id_users_privy_user_id_fk" FOREIGN KEY ("owner_privy_user_id") REFERENCES "public"."users"("privy_user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remittances" ADD CONSTRAINT "remittances_remittance_wallet_id_remittance_wallets_id_fk" FOREIGN KEY ("remittance_wallet_id") REFERENCES "public"."remittance_wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "remittance_wallets_owner_idx" ON "remittance_wallets" USING btree ("owner_privy_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "remittance_wallets_privy_wallet_idx" ON "remittance_wallets" USING btree ("privy_wallet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "remittances_onramp_session_idx" ON "remittances" USING btree ("onramp_session_id");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");