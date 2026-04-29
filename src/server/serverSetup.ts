import type { ServerSetupFn } from "wasp/server";
import express from "express";

export const serverSetup: ServerSetupFn = async ({ app }) => {
  // Wasp 0.21 manages CORS automatically via WASP_WEB_CLIENT_URL — do not add
  // a second cors() middleware here, it shadows Wasp's and breaks auth cookies.

  // Larger body limits for JSON routes (e.g. base64 audio sent to transcribeAudio).
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
};
