// Custom API for file upload using multer (matching MERN approach)
import multer from 'multer';
import type { MiddlewareConfigFn } from 'wasp/server';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';

// Configure multer for file uploads (same as MERN backend)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

// Extract text from different file types (same as MERN backend)
const extractTextFromFile = async (filePath: string, mimetype: string): Promise<string> => {
  try {
    let text = '';

    if (mimetype === 'application/pdf') {
      console.log("file path: ", filePath);
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      text = data.text;
    } else if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
    } else {
      throw new Error('Unsupported file type: ' + mimetype);
    }

    return text;
  } catch (error) {
    throw new Error('Failed to extract text from file');
  }
};

// Parse resume data using regex patterns (same as MERN backend)
const parseResumeData = (text: string) => {
  const extractedData: any = {
    name: null,
    email: null,
    phone: null,
    skills: [],
    summary: null,
  };

  // Extract email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/);
  if (emailMatch) extractedData.email = emailMatch[0];

  // Extract phone
  const phoneMatch = text.match(/(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  if (phoneMatch) extractedData.phone = phoneMatch[0];

  // Extract name (usually first line or near contact info)
  const lines = text.split('\n').filter((line: string) => line.trim());
  if (lines.length > 0) {
    extractedData.name = lines[0].trim();
  }

  // Extract skills
  const skillsSection = text.match(/(?:skills|technologies|technical skills)[\s\S]*?(?=\n\n|\n[A-Z]|$)/i);
  if (skillsSection) {
    const skillsText = skillsSection[0];
    const skills = skillsText.match(/\b(?:JavaScript|Python|Java|React|Node\.js|HTML|CSS|SQL|MongoDB|Express|Angular|Vue|Docker|AWS|Git)\b/gi);
    if (skills) extractedData.skills = [...new Set(skills)];
  }

  console.log("extracted data", extractedData);
  return extractedData;
};

// Middleware configuration for multer
export const uploadMiddleware: MiddlewareConfigFn = (middlewareConfig) => {
  middlewareConfig.set('multer', upload.single('resume'));
  return middlewareConfig;
};

// API handler for resume upload (same as MERN controller)
export const uploadResumeAPI = async (req: any, res: any) => {
  try {
    console.log("backend called for upload");
    
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file format. Please upload PDF, DOC, or DOCX'
      });
    }

    const extractedText = await extractTextFromFile(req.file.path, req.file.mimetype);
    console.log("extracted text: ", extractedText);
    
    const parsedData = parseResumeData(extractedText);
    console.log("parsed data: ", parsedData);
    
    // Delete temporary file
    fs.unlinkSync(req.file.path);

    return res.status(200).json({
      success: true,
      message: 'Resume parsed successfully',
      data: {
        extractedData: parsedData,
        missingFields: {
          name: !parsedData.name,
          email: !parsedData.email,
          phone: !parsedData.phone,
          skills: parsedData.skills.length === 0
        }
      }
    });

  } catch (error) {
    console.error('Error parsing resume:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to parse resume'
    });
  }
};
