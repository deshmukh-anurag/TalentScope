import React, { useState, useEffect, useRef } from 'react';
import { startInterview, submitAnswer } from 'wasp/client/operations';

export const InterviewPage = () => {
    // Main state management
    const [currentStep, setCurrentStep] = useState(1); // 1: Upload, 2: Profile, 3: Interview, 4: Complete
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    
    // Resume upload state
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [extractedData, setExtractedData] = useState<any>(null);
    
    // Profile completion state
    const [profileData, setProfileData] = useState({
        name: '',
        email: '',
        phone: '',
        skills: '',
    });
    const [missingFields, setMissingFields] = useState<any>({});
    
    // Interview state
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [currentQuestion, setCurrentQuestion] = useState<any>(null);
    const [questionNumber, setQuestionNumber] = useState(0);
    const [totalQuestions, setTotalQuestions] = useState(0);
    const [answer, setAnswer] = useState('');
    const [timeLeft, setTimeLeft] = useState(0);
    const [timeLimit, setTimeLimit] = useState(0);
    const [questionStartTime, setQuestionStartTime] = useState<Date | null>(null);
    const [interviewComplete, setInterviewComplete] = useState(false);
    
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Timer management
    useEffect(() => {
        if (currentStep === 3 && timeLeft > 0) {
            timerRef.current = setTimeout(() => {
                setTimeLeft(timeLeft - 1);
            }, 1000);
        } else if (timeLeft === 0 && currentStep === 3 && !interviewComplete) {
            handleTimeUp();
        }
        
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [timeLeft, currentStep, interviewComplete]);

    // File upload handlers
    const handleFileSelect = (file: File | null) => {
        if (!file) return;
        
        const allowedTypes = ['application/pdf', 'application/msword', 
                             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        
        if (!allowedTypes.includes(file.type)) {
            setError('Please upload a PDF, DOC, or DOCX file');
            return;
        }
        
        setSelectedFile(file);
        setError('');
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        handleFileSelect(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
    };

    // Upload resume and parse (using FormData like MERN project)
    const handleResumeUpload = async () => {
        if (!selectedFile) return;

        setLoading(true);
        setError('');
        
        try {
            // Check file size (max 5MB)
            const maxSize = 5 * 1024 * 1024; // 5MB
            if (selectedFile.size > maxSize) {
                setError('File size must be less than 5MB');
                setLoading(false);
                return;
            }

            // Create FormData and append file (same as MERN frontend)
            const formData = new FormData();
            formData.append('resume', selectedFile);

            // Call custom API endpoint
            const response = await fetch('/api/upload-resume', {
                method: 'POST',
                body: formData,
                // Note: Don't set Content-Type header - browser sets it automatically with boundary
            });

            const data = await response.json();

            if (data.success) {
                setExtractedData(data.data.extractedData);
                setMissingFields(data.data.missingFields);
                
                // Pre-fill profile form
                setProfileData({
                    name: data.data.extractedData.name || '',
                    email: data.data.extractedData.email || '',
                    phone: data.data.extractedData.phone || '',
                    skills: data.data.extractedData.skills.join(', ') || '',
                });
                setCurrentStep(2);
            } else {
                setError(data.message);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to upload resume. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Complete profile and start interview
    const handleProfileComplete = async () => {
        setLoading(true);
        setError('');
        
        try {
            const profileToSubmit = {
                ...profileData,
                skills: profileData.skills.split(',').map((s: string) => s.trim())
            };

            const interviewResponse = await startInterview({ profile: profileToSubmit });

            if (interviewResponse.success) {
                setSessionId(interviewResponse.data.sessionId);
                setCurrentQuestion(interviewResponse.data.question);
                setQuestionNumber(interviewResponse.data.questionNumber);
                setTotalQuestions(interviewResponse.data.totalQuestions);
                setTimeLimit(interviewResponse.data.timeLimit);
                setTimeLeft(interviewResponse.data.timeLimit);
                setQuestionStartTime(new Date(interviewResponse.data.questionStartTime));
                setCurrentStep(3);
            } else {
                setError(interviewResponse.message);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to start interview. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Submit answer
    const handleSubmitAnswer = async () => {
        if (!sessionId || !questionStartTime) return;
        
        setLoading(true);
        setError('');
        
        try {
            const response = await submitAnswer({
                sessionId,
                answer,
                questionStartTime: questionStartTime.getTime(),
                timeLimit
            });

            if (response.success) {
                if (response.data.status === 'completed') {
                    setInterviewComplete(true);
                    setCurrentStep(4);
                } else {
                    // Move to next question
                    setCurrentQuestion(response.data.question);
                    setQuestionNumber(response.data.questionNumber);
                    setTimeLimit(response.data.question.timeLimit);
                    setTimeLeft(response.data.question.timeLimit);
                    setQuestionStartTime(new Date(response.data.questionStartTime));
                    setAnswer('');
                }
            } else {
                setError(response.message);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to submit answer. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    // Handle time up
    const handleTimeUp = async () => {
        await handleSubmitAnswer();
    };

    // Format time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Get timer color
    const getTimerColor = () => {
        const percentage = (timeLeft / timeLimit) * 100;
        if (percentage > 50) return 'text-green-600';
        if (percentage > 25) return 'text-yellow-600';
        return 'text-red-600';
    };

    // Step 1: Resume Upload
    if (currentStep === 1) {
        return (
            <div className="min-h-screen bg-gray-50 py-8 px-4">
                <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Interview Assistant</h1>
                        <p className="text-gray-600">Upload your resume to get started</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-700">{error}</p>
                        </div>
                    )}

                    <div className="bg-white rounded-lg shadow-lg p-6">
                        <div
                            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                                dragOver 
                                    ? 'border-blue-400 bg-blue-50' 
                                    : 'border-gray-300 hover:border-gray-400'
                            }`}
                            onDrop={handleDrop}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                        >
                            <div className="mb-4">
                                <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            
                            {selectedFile ? (
                                <div className="text-center">
                                    <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
                                    <p className="text-sm text-gray-500">
                                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                            ) : (
                                <div>
                                    <p className="text-lg font-medium text-gray-900 mb-2">
                                        Drop your resume here or click to browse
                                    </p>
                                    <p className="text-sm text-gray-500 mb-4">
                                        Supports PDF, DOC, and DOCX files
                                    </p>
                                </div>
                            )}
                            
                            <input
                                ref={fileInputRef}
                                type="file"
                                className="hidden"
                                accept=".pdf,.doc,.docx"
                                onChange={(e) => handleFileSelect(e.target.files?.[0] || null)}
                            />
                            
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Choose File
                            </button>
                        </div>

                        <div className="mt-6 flex justify-center">
                            <button
                                onClick={handleResumeUpload}
                                disabled={!selectedFile || loading}
                                className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                            >
                                {loading ? 'Processing...' : 'Upload & Parse Resume'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Step 2: Profile Completion
    if (currentStep === 2) {
        return (
            <div className="min-h-screen bg-gray-50 py-8 px-4">
                <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900 mb-2">Complete Your Profile</h1>
                        <p className="text-gray-600">Review and complete the extracted information</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-700">{error}</p>
                        </div>
                    )}

                    <div className="bg-white rounded-lg shadow-lg p-6">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Full Name {missingFields.name && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                    type="text"
                                    value={profileData.name}
                                    onChange={(e) => setProfileData({...profileData, name: e.target.value})}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter your full name"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Email {missingFields.email && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                    type="email"
                                    value={profileData.email}
                                    onChange={(e) => setProfileData({...profileData, email: e.target.value})}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter your email"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Phone {missingFields.phone && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                    type="tel"
                                    value={profileData.phone}
                                    onChange={(e) => setProfileData({...profileData, phone: e.target.value})}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter your phone number"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Skills {missingFields.skills && <span className="text-red-500">*</span>}
                                </label>
                                <input
                                    type="text"
                                    value={profileData.skills}
                                    onChange={(e) => setProfileData({...profileData, skills: e.target.value})}
                                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter skills separated by commas"
                                />
                            </div>
                        </div>

                        <div className="mt-8 flex justify-between">
                            <button
                                onClick={() => setCurrentStep(1)}
                                className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleProfileComplete}
                                disabled={loading}
                                className="px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                            >
                                {loading ? 'Starting Interview...' : 'Start Interview'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Step 3: Interview
    if (currentStep === 3) {
        return (
            <div className="min-h-screen bg-gray-50 py-8 px-4">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-2xl font-bold text-gray-900">Interview Session</h1>
                                <p className="text-gray-600">
                                    Question {questionNumber} of {totalQuestions}
                                </p>
                            </div>
                            <div className="text-right">
                                <div className={`text-3xl font-bold ${getTimerColor()}`}>
                                    {formatTime(timeLeft)}
                                </div>
                                <p className="text-sm text-gray-500">Time remaining</p>
                            </div>
                        </div>
                        
                        {/* Progress bar */}
                        <div className="mt-4">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-700">{error}</p>
                        </div>
                    )}

                    {/* Question */}
                    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
                        <div className="mb-4">
                            <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                                currentQuestion?.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
                                currentQuestion?.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-red-100 text-red-800'
                            }`}>
                                {currentQuestion?.difficulty?.toUpperCase() || 'MEDIUM'}
                            </span>
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">
                            {currentQuestion?.question || 'Loading question...'}
                        </h2>
                    </div>

                    {/* Answer */}
                    <div className="bg-white rounded-lg shadow-lg p-6">
                        <label className="block text-sm font-medium text-gray-700 mb-3">
                            Your Answer
                        </label>
                        <textarea
                            value={answer}
                            onChange={(e) => setAnswer(e.target.value)}
                            className="w-full p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            rows={8}
                            placeholder="Type your answer here..."
                        />
                        
                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={handleSubmitAnswer}
                                disabled={loading}
                                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                            >
                                {loading ? 'Submitting...' : 'Submit Answer'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Step 4: Completion
    if (currentStep === 4) {
        return (
            <div className="min-h-screen bg-gray-50 py-8 px-4">
                <div className="max-w-2xl mx-auto text-center">
                    <div className="bg-white rounded-lg shadow-lg p-8">
                        <div className="mb-6">
                            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <h1 className="text-3xl font-bold text-gray-900 mb-2">Interview Complete!</h1>
                            <p className="text-gray-600">
                                Thank you for completing the interview. Your responses have been recorded.
                            </p>
                        </div>

                        <div className="bg-gray-50 rounded-lg p-6 mb-6">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">Session Summary</h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <p className="text-gray-500">Total Questions</p>
                                    <p className="font-semibold">{totalQuestions}</p>
                                </div>
                                <div>
                                    <p className="text-gray-500">Session ID</p>
                                    <p className="font-semibold">{sessionId}</p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => window.location.reload()}
                            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Start New Interview
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
