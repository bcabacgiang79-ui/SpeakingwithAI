
import React, { useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { GeneratedImage } from '../types';

export const ImageGenerator: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [isGenerating, setIsGenerating] = useState(false);
  const [images, setImages] = useState<GeneratedImage[]>([]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;

    try {
      // Key selection is mandatory for gemini-3-pro-image-preview
      // @ts-ignore
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        // @ts-ignore
        await window.aistudio.openSelectKey();
        // Proceeding immediately as per guidelines to avoid race condition
      }

      setIsGenerating(true);
      
      // Instantiate at call-site
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-image-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: size
          }
        },
      });

      let foundImage = false;
      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            const imageUrl = `data:image/png;base64,${part.inlineData.data}`;
            setImages(prev => [{ url: imageUrl, prompt, timestamp: Date.now() }, ...prev]);
            foundImage = true;
            break;
          }
        }
      }

      if (!foundImage) alert("No image was returned. " + (response.text || "Reason unknown."));
      setPrompt('');
    } catch (err: any) {
      console.error('Generation error:', err);
      if (err.message?.includes("Requested entity was not found")) {
        // @ts-ignore
        await window.aistudio.openSelectKey();
      } else {
        alert(`Failed to generate image: ${err.message || 'Internal error'}`);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <svg className="w-6 h-6 text-pink-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Gemini 3 Pro Image Generation
        </h2>
        
        <div className="flex flex-col gap-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A futuristic city in the clouds with neon lights..."
            className="w-full h-24 bg-slate-900 border border-slate-700 text-white rounded-xl p-4 focus:ring-2 focus:ring-pink-500 outline-none resize-none"
          />
          
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resolution:</label>
              {(['1K', '2K', '4K'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    size === s ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/30' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white px-8 py-2 rounded-xl font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating Magic...
                </>
              ) : 'Generate Image'}
            </button>
          </div>
          <p className="text-[10px] text-slate-500 italic">Note: High quality generation requires a selected API key with billing. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" className="underline hover:text-pink-400">Learn more</a></p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
          {images.map((img, i) => (
            <div key={i} className="bg-slate-800 rounded-2xl overflow-hidden border border-slate-700 shadow-xl group">
              <div className="relative aspect-square">
                <img src={img.url} alt={img.prompt} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity p-6 flex flex-col justify-end">
                  <p className="text-white text-sm line-clamp-3">{img.prompt}</p>
                </div>
              </div>
            </div>
          ))}
          {images.length === 0 && !isGenerating && (
            <div className="col-span-full h-40 flex items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-2xl">
              Generated images will appear here
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
