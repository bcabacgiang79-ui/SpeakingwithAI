
import React, { useState, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';

export const ImageEditor: React.FC = () => {
  const [baseImage, setBaseImage] = useState<string | null>(null);
  const [editedImage, setEditedImage] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        setBaseImage(readerEvent.target?.result as string);
        setEditedImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = async () => {
    if (!baseImage || !prompt.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const base64Data = baseImage.split(',')[1];
      const mimeType = baseImage.split(';')[0].split(':')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: prompt }
          ]
        }
      });

      let foundImage = false;
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          setEditedImage(`data:image/png;base64,${part.inlineData.data}`);
          foundImage = true;
          break;
        }
      }
      if (!foundImage) alert("Model returned text only: " + response.text);
    } catch (err) {
      console.error(err);
      alert("Failed to edit image. Try a clearer prompt.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          AI Image Editor (2.5 Flash)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`aspect-video rounded-xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800/60 transition-all overflow-hidden relative ${baseImage ? 'border-emerald-500/50' : ''}`}
            >
              {baseImage ? (
                <img src={baseImage} className="w-full h-full object-cover opacity-60" alt="Source" />
              ) : (
                <div className="text-center p-4">
                  <svg className="w-10 h-10 mx-auto mb-2 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-medium text-slate-400">Click to upload base image</p>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
            </div>
            
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., 'Add a retro 80s filter' or 'Make it sunny'"
              className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
            
            <button
              onClick={handleEdit}
              disabled={!baseImage || !prompt.trim() || isProcessing}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-50 transition-all"
            >
              {isProcessing ? 'Processing...' : 'Apply AI Edit'}
            </button>
          </div>

          <div className="aspect-video rounded-xl border border-slate-700 bg-slate-900 flex items-center justify-center overflow-hidden relative shadow-inner">
            {editedImage ? (
              <img src={editedImage} className="w-full h-full object-contain" alt="Result" />
            ) : (
              <span className="text-slate-600 text-sm italic">Result will appear here</span>
            )}
            {isProcessing && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="flex gap-2">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-.3s]" />
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-.5s]" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex flex-wrap gap-2 justify-center">
        {["Add a cat", "Make it black and white", "Sketch style", "Add sunglasses", "Cyberpunk vibes"].map(s => (
          <button 
            key={s} 
            onClick={() => setPrompt(s)}
            className="px-3 py-1 bg-slate-800 border border-slate-700 text-xs text-slate-400 rounded-full hover:border-emerald-500/50 hover:text-emerald-400 transition-all"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
};
