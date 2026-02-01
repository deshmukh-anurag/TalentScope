import React from 'react';
import { useQuery } from 'wasp/client/operations';
import { getTestResults } from 'wasp/client/operations';

const ResultsPage = () => {
    const { data: results, isLoading, error } = useQuery(getTestResults);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-50 py-8 px-4">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-4 text-gray-600">Loading results...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 py-8 px-4">
                <div className="max-w-6xl mx-auto">
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                        <p className="text-red-700">Error loading results: {error.message}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-6xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">Interview Results</h1>
                    <p className="text-gray-600 mt-2">View your completed interview assessments</p>
                </div>

                {!results || results.length === 0 ? (
                    <div className="bg-white rounded-lg shadow-lg p-8 text-center">
                        <p className="text-gray-600">No interview results found. Complete an interview to see your results here.</p>
                        <a 
                            href="/interview" 
                            className="mt-4 inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Start Interview
                        </a>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {results.map((result: any) => (
                            <div key={result.id} className="bg-white rounded-lg shadow-lg p-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900 mb-2">{result.profileName}</h3>
                                        <p className="text-sm text-gray-600">{result.profileEmail}</p>
                                        <p className="text-sm text-gray-600">{result.profilePhone}</p>
                                        <div className="mt-2">
                                            <div className="flex flex-wrap gap-1">
                                                {result.skills.map((skill: string, idx: number) => (
                                                    <span 
                                                        key={idx} 
                                                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                                                    >
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div>
                                        <div className="mb-4">
                                            <p className="text-sm text-gray-600 mb-1">Score</p>
                                            <div className="flex items-center">
                                                <div className={`text-3xl font-bold ${
                                                    result.totalScore >= 70 ? 'text-green-600' :
                                                    result.totalScore >= 50 ? 'text-yellow-600' :
                                                    'text-red-600'
                                                }`}>
                                                    {result.totalScore}
                                                </div>
                                                <span className="text-gray-500 ml-1">/100</span>
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-600 mb-1">Status</p>
                                            <span className={`inline-block px-3 py-1 rounded-full text-sm ${
                                                result.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                result.status === 'interrupted' ? 'bg-yellow-100 text-yellow-800' :
                                                'bg-red-100 text-red-800'
                                            }`}>
                                                {result.status.toUpperCase()}
                                            </span>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="text-sm text-gray-600 mb-1">Date</p>
                                        <p className="text-sm font-medium">{new Date(result.createdAt).toLocaleDateString()}</p>
                                        <p className="text-xs text-gray-500">{new Date(result.createdAt).toLocaleTimeString()}</p>
                                    </div>
                                </div>

                                <div className="mt-6 pt-6 border-t border-gray-200">
                                    <h4 className="text-sm font-semibold text-gray-900 mb-2">Summary</h4>
                                    <p className="text-sm text-gray-700 whitespace-pre-line">{result.summary}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default ResultsPage;
