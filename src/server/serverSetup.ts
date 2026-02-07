import type { ServerSetupFn } from "wasp/server";
import express from "express";

export const serverSetup: ServerSetupFn = async ({ app }) => {
  // Increase JSON payload limit to 10MB for file uploads
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));
};
