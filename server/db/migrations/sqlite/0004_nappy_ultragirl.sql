CREATE TABLE `impersonationAudit` (
	`id` text PRIMARY KEY NOT NULL,
	`impersonatorId` text NOT NULL,
	`targetId` text NOT NULL,
	`clientId` text NOT NULL,
	`action` text NOT NULL,
	`tokenId` text,
	`createdAt` integer NOT NULL
);
