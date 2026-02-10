// Custom API for file upload using multer (matching MERN approach)
import multer from 'multer';
import type { MiddlewareConfigFn } from 'wasp/server';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import fs from 'fs';
import path from 'path';

// Get absolute path to uploads directory (server runs from .wasp/out/server)
const uploadsDir = path.join(process.cwd(), '../../../uploads');

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads (same as MERN backend)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
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
  // Add CORS middleware BEFORE multer to handle preflight and credentials
  middlewareConfig.set('cors', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });
  
  middlewareConfig.set('multer', (req, res, next) => {
    upload.single('resume')(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        return res.status(400).json({ success: false, message: err.message });
      }
      next();
    });
  });
  return middlewareConfig;
};

// API handler for resume upload (same as MERN controller)
export const uploadResumeAPI = async (req: any, res: any, context: any) => {
  console.log('=== Upload Resume API Called ===');
  console.log('Request method:', req.method);
  console.log('Request headers:', req.headers);
  console.log('Request file:', req.file);
  console.log('Request body:', req.body);
  
  try {
    console.log("backend called for upload");
    
    if (!req.file) {
      console.log('No file found in request');
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    console.log('File received:', req.file.originalname, req.file.mimetype, req.file.size);

    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      console.log('Invalid mime type:', req.file.mimetype);
      return res.status(400).json({
        success: false,
        message: 'Invalid file format. Please upload PDF, DOC, or DOCX'
      });
    }

    console.log('Extracting text from file:', req.file.path);
    const extractedText = await extractTextFromFile(req.file.path, req.file.mimetype);
    console.log("extracted text length:", extractedText.length);
    
    const parsedData = parseResumeData(extractedText);
    console.log("parsed data: ", parsedData);
    
    // Delete temporary file
    fs.unlinkSync(req.file.path);
    console.log('Temp file deleted');

    const responseData = {
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
    };

    console.log('Sending response:', JSON.stringify(responseData));
    return res.status(200).json(responseData);

  } catch (error: any) {
    console.error('Error parsing resume:', error);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to parse resume',
      error: error.message
    });
  }
};
