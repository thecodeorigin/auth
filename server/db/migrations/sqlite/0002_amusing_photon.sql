CREATE TABLE `subscription` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`planSlug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`currentPeriodEnd` integer,
	`cancelAtPeriodEnd` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'polar' NOT NULL,
	`polarSubscriptionId` text,
	`polarCustomerId` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subscription_user_idx` ON `subscription` (`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_polar_unique` ON `subscription` (`polarSubscriptionId`);--> statement-breakpoint
CREATE TABLE `subscriptionMember` (
	`id` text PRIMARY KEY NOT NULL,
	`subscriptionId` text NOT NULL,
	`email` text NOT NULL,
	`userId` text,
	`status` text DEFAULT 'invited' NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`subscriptionId`) REFERENCES `subscription`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `subscriptionMember_sub_idx` ON `subscriptionMember` (`subscriptionId`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptionMember_unique` ON `subscriptionMember` (`subscriptionId`,`email`);