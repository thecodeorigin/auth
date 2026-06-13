CREATE TABLE `memberAppScope` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text NOT NULL,
	`userId` text NOT NULL,
	`clientId` text DEFAULT '*' NOT NULL,
	`role` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `memberAppScope_org_user_idx` ON `memberAppScope` (`organizationId`,`userId`);--> statement-breakpoint
CREATE UNIQUE INDEX `memberAppScope_unique` ON `memberAppScope` (`organizationId`,`userId`,`clientId`);