ALTER TABLE "TokenUsage" ALTER COLUMN "promptTokens" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "TokenUsage" ALTER COLUMN "completionTokens" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "TokenUsage" ALTER COLUMN "totalTokens" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "TokenUsage" ADD COLUMN "audioSeconds" varchar(32);--> statement-breakpoint
ALTER TABLE "TokenUsage" ADD COLUMN "usageType" varchar(32) DEFAULT 'chat' NOT NULL;