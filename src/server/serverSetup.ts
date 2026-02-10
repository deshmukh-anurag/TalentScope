import type { ServerSetupFn } from "wasp/server";
import express from "express";
import cors from "cors";

export const serverSetup: ServerSetupFn = async ({ app }) => {
  // Configure CORS to allow requests from Vite dev server with credentials
  app.use(cors({
    origin: 'http://localhost:3000', // Vite dev server
    credentials: true, // Allow cookies to be sent
  }));

  // Increase body parser limits for other routes
  // But this won't affect our multer route since multer handles its own parsing
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
};
