// Custom API for resume upload + parsing.
//
// Wasp's built-in actions can't receive multipart/form-data, so file upload is
// handled with a dedicated Express route + multer. CORS is intentionally left
// to Wasp's global middleware (configured from WASP_WEB_CLIENT_URL) — we only
// inject the multer middleware here.
import multer from "multer";
import type { MiddlewareConfigFn } from "wasp/server";
import type { UploadResumeAPI } from "wasp/server/api";
import fs from "fs";
import path from "path";
import { extractTextFromFile, parseResume } from "./resumeParser";
import { createLogger } from "../server/logger";
import type { MissingFields } from "../shared/types";

const log = createLogger("upload");

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

// The server runs from .wasp/out/server; resolve uploads at the project root.
const uploadsDir = path.join(process.cwd(), "../../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(new Error("Invalid file format. Please upload a PDF or DOCX file."));
  },
});

export const uploadMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  // NB: do not override the 'cors' middleware here — Wasp's global CORS handles
  // origins/credentials correctly across dev and production.
  middlewareConfig.set("multer", (req, res, next) => {
    upload.single("resume")(req, res, (err: unknown) => {
      if (err) {
        const message = err instanceof Error ? err.message : "File upload failed";
        log.warn("multer rejected upload", message);
        return res.status(400).json({ success: false, message });
      }
      next();
    });
  });
  return middlewareConfig;
};

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

// Express handler — multer has already placed the file on req.file.
export const uploadResumeAPI: UploadResumeAPI = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const { path: filePath, mimetype, originalname, size } = req.file;
  log.info("resume received", { name: originalname, mimetype, size });

  try {
    const text = await extractTextFromFile(filePath, mimetype);
    const extractedData = await parseResume(text);

    const missingFields: MissingFields = {
      name: !extractedData.name,
      email: !extractedData.email,
      phone: !extractedData.phone,
      skills: extractedData.skills.length === 0,
    };

    return res.status(200).json({
      success: true,
      message: "Resume parsed successfully",
      data: { extractedData, missingFields },
    });
  } catch (error) {
    log.error("failed to parse resume", errMessage(error));
    return res.status(500).json({ success: false, message: "Failed to parse resume" });
  } finally {
    // Always clean up the uploaded temp file.
    fs.promises.unlink(filePath).catch(() => undefined);
  }
};
