
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const ImageEditor: React.FC = () => {
  const [history, setHistory] = useState<string[]>([]);
  const [pointer, setPointer] = useState<number>(-1);
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCropping, setIsCropping] = useState(false);
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentImage = useMemo(() => {
    if (pointer >= 0 && pointer < history.length) {
      return history[pointer];
    }
    return null;
  }, [history, pointer]);

  const canUndo = pointer > 0;
  const canRedo = pointer < history.length - 1;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (readerEvent) => {
        const result = readerEvent.target?.result as string;
        setHistory([result]);
        setPointer(0);
        setIsCropping(false);
        setCropBox(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEdit = async () => {
    if (!currentImage || !prompt.trim() || isProcessing) return;

    try {
      // Prompt for key if not present, though Flash is usually more permissive
      // @ts-ignore
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (!hasKey) {
        // @ts-ignore
        await window.aistudio.openSelectKey();
      }

      setIsProcessing(true);
      
      // Instantiate right before call
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const base64Data = currentImage.split(',')[1];
      const mimeType = currentImage.split(';')[0].split(':')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType } },
            { text: prompt }
          ]
        },
        // Avoid setting responseMimeType for Nano models
      });

      let foundImage = false;
      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData) {
            const newImage = `data:image/png;base64,${part.inlineData.data}`;
            const newHistory = history.slice(0, pointer + 1);
            newHistory.push(newImage);
            setHistory(newHistory);
            setPointer(newHistory.length - 1);
            foundImage = true;
            setPrompt('');
            break;
          }
        }
      }

      if (!foundImage) {
        alert("Model response did not include an image. " + (response.text || "Reason unknown."));
      }
    } catch (err: any) {
      console.error('Image Edit Error:', err);
      if (err.message?.includes("Requested entity was not found")) {
        // @ts-ignore
        await window.aistudio.openSelectKey();
      } else {
        alert(`Failed to edit image: ${err?.message || 'Internal error'}.`);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const executeCrop = () => {
    if (!cropBox || !imageRef.current || !currentImage) return;

    const img = imageRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;

    const sourceX = cropBox.x * scaleX;
    const sourceY = cropBox.y * scaleY;
    const sourceW = cropBox.width * scaleX;
    const sourceH = cropBox.height * scaleY;

    canvas.width = sourceW;
    canvas.height = sourceH;

    ctx.drawImage(
      img,
      sourceX, sourceY, sourceW, sourceH,
      0, 0, sourceW, sourceH
    );

    const croppedDataUrl = canvas.toDataURL('image/png');
    const newHistory = history.slice(0, pointer + 1);
    newHistory.push(croppedDataUrl);
    setHistory(newHistory);
    setPointer(newHistory.length - 1);
    
    setIsCropping(false);
    setCropBox(null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isCropping || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDragging(true);
    setDragStart({ x, y });
    setCropBox({ x, y, width: 0, height: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isCropping || !isDragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const left = Math.min(x, dragStart.x);
    const top = Math.min(y, dragStart.y);
    const width = Math.abs(x - dragStart.x);
    const height = Math.abs(y - dragStart.y);

    if (imageRef.current) {
        const img = imageRef.current;
        const constrainedWidth = Math.min(width, img.width - left);
        const constrainedHeight = Math.min(height, img.height - top);
        setCropBox({ x: left, y: top, width: constrainedWidth, height: constrainedHeight });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const undo = () => pointer > 0 && setPointer(pointer - 1);
  const redo = () => pointer < history.length - 1 && setPointer(pointer + 1);

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              AI Image Editor & Crop
            </h2>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">Gemini 2.5 Flash</span>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                  setIsCropping(!isCropping);
                  setCropBox(null);
              }}
              disabled={!currentImage || isProcessing}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
                isCropping 
                ? 'bg-amber-600 text-white animate-pulse' 
                : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              {isCropping ? 'Cancel Crop' : 'Crop Tool'}
            </button>

            <div className="w-px h-6 bg-slate-700" />

            <div className="flex gap-1">
              <button
                onClick={undo}
                disabled={!canUndo || isProcessing}
                className="p-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-30 transition-colors"
                title="Undo"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
              <button
                onClick={redo}
                disabled={!canRedo || isProcessing}
                className="p-2 rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-30 transition-colors"
                title="Redo"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-4">
            <div 
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              className={`aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-slate-800/60 transition-all overflow-hidden relative ${currentImage ? 'border-emerald-500/30' : 'border-slate-700'}`}
              onClick={() => !isCropping && !currentImage && fileInputRef.current?.click()}
            >
              {currentImage ? (
                <>
                  <img 
                    ref={imageRef} 
                    src={currentImage} 
                    className={`w-full h-full object-contain pointer-events-none select-none ${isCropping ? 'opacity-50' : ''}`} 
                    alt="Current" 
                  />
                  {isCropping && (
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="absolute inset-0 bg-black/40" />
                      {cropBox && (
                        <div 
                          className="absolute border-2 border-white shadow-[0_0_0_9999px_rgba(0,0,0,0.4)]"
                          style={{
                            left: `${cropBox.x}px`,
                            top: `${cropBox.y}px`,
                            width: `${cropBox.width}px`,
                            height: `${cropBox.height}px`,
                          }}
                        >
                          <div className="absolute -top-6 left-0 bg-white text-black px-1 text-[10px] font-bold">
                            {Math.round(cropBox.width)} x {Math.round(cropBox.height)}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-4">
                  <svg className="w-10 h-10 mx-auto mb-2 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm font-medium text-slate-400">Upload image to start</p>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
            </div>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
                disabled={isCropping}
                placeholder={isCropping ? "Finish cropping first..." : "Describe edit (e.g. 'Add a sunset')"}
                className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none disabled:opacity-50"
              />
              
              <button
                onClick={isCropping ? executeCrop : handleEdit}
                disabled={(!isCropping && (!currentImage || !prompt.trim())) || (isCropping && !cropBox) || isProcessing}
                className={`px-6 py-3 rounded-xl font-bold shadow-lg transition-all flex items-center gap-2 ${
                    isCropping 
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-900' 
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20'
                } disabled:opacity-50`}
              >
                {isProcessing ? (
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  isCropping ? 'Apply Crop' : 'Apply Edit'
                )}
              </button>
            </div>
          </div>

          <div className="aspect-video rounded-xl border border-slate-700 bg-slate-950 flex flex-col items-center justify-center overflow-hidden relative shadow-inner">
            {currentImage ? (
              <>
                <img src={currentImage} className="w-full h-full object-contain" alt="Preview" />
                <div className="absolute top-3 right-3 flex flex-col gap-2">
                    <div className="bg-black/60 px-2 py-1 rounded-md text-[10px] text-white backdrop-blur-sm border border-white/10">
                    Step {pointer + 1} / {history.length}
                    </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 opacity-20">
                <svg className="w-12 h-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-slate-400 text-xs font-medium">No Image Loaded</span>
              </div>
            )}
            
            {isProcessing && (
              <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
                <div className="flex gap-2">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
                </div>
                <p className="text-emerald-400 text-xs font-bold uppercase tracking-widest animate-pulse">Gemini is thinking...</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {!isCropping && (
        <div className="flex flex-wrap gap-2 justify-center">
          {["Apply retro filter", "Black and white style", "Add a cute cat", "Cyberpunk theme", "Pencil sketch"].map(s => (
            <button 
              key={s} 
              onClick={() => setPrompt(s)}
              className="px-4 py-1.5 bg-slate-800/80 border border-slate-700 text-xs font-semibold text-slate-400 rounded-full hover:border-emerald-500/50 hover:text-emerald-400 transition-all backdrop-blur-sm"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isCropping && (
        <div className="flex justify-center">
            <div className="bg-amber-900/20 border border-amber-500/30 text-amber-200 px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Drag on the image to select a region, then click "Apply Crop"
            </div>
        </div>
      )}
    </div>
  );
};
