
import React, { useEffect, useRef } from 'react';
import { TranscriptEntry } from '../types';

interface TranscriptProps {
  history: TranscriptEntry[];
}

export const Transcript: React.FC<TranscriptProps> = ({ history }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history]);

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-800/50 rounded-xl border border-slate-700 scroll-smooth"
    >
      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-2">
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <p className="text-sm">Start the conversation to see the transcript</p>
        </div>
      ) : (
        history.map((entry, idx) => (
          <div 
            key={idx} 
            className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[80%] rounded-2xl p-4 text-sm shadow-sm ${
                entry.role === 'user' 
                  ? 'bg-blue-600 text-white rounded-tr-none' 
                  : 'bg-slate-700 text-slate-200 rounded-tl-none'
              }`}
            >
              <div className="font-semibold text-xs mb-1 opacity-70 uppercase tracking-wider">
                {entry.role === 'user' ? 'You' : 'Gemini'}
              </div>
              {entry.text}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
