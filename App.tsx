
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { ConnectionStatus, TranscriptEntry, AppTab, VoiceName } from './types';
import { encode, decode, decodeAudioData } from './services/audioUtils';
import { Visualizer } from './components/Visualizer';
import { Transcript } from './components/Transcript';
import { ChatBot } from './components/ChatBot';
import { ImageGenerator } from './components/ImageGenerator';
import { ImageEditor } from './components/ImageEditor';

const VOICE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>('voice');
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [history, setHistory] = useState<TranscriptEntry[]>([]);
  const [isGeminiSpeaking, setIsGeminiSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>('Zephyr');
  
  // Audio context and refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Transcription accumulators
  const currentInputTransRef = useRef('');
  const currentOutputTransRef = useRef('');

  const stopConversation = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    activeSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    activeSourcesRef.current.clear();
    
    setStatus(ConnectionStatus.DISCONNECTED);
    setIsUserSpeaking(false);
    setIsGeminiSpeaking(false);
  }, []);

  const startConversation = async () => {
    try {
      setStatus(ConnectionStatus.CONNECTING);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: VOICE_MODEL,
        callbacks: {
          onopen: () => {
            setStatus(ConnectionStatus.CONNECTED);
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              setIsUserSpeaking(Math.sqrt(sum / inputData.length) > 0.01);

              const l = inputData.length;
              const int16 = new Int16Array(l);
              for (let i = 0; i < l; i++) {
                int16[i] = inputData[i] * 32768;
              }
              const pcmBlob = {
                data: encode(new Uint8Array(int16.buffer)),
                mimeType: 'audio/pcm;rate=16000',
              };
              
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            if (message.serverContent?.outputTranscription) {
              currentOutputTransRef.current += message.serverContent.outputTranscription.text;
            } else if (message.serverContent?.inputTranscription) {
              currentInputTransRef.current += message.serverContent.inputTranscription.text;
            }

            if (message.serverContent?.turnComplete) {
              const uText = currentInputTransRef.current;
              const gText = currentOutputTransRef.current;
              if (uText || gText) {
                setHistory(prev => [
                  ...prev,
                  ...(uText ? [{ role: 'user' as const, text: uText, timestamp: Date.now() }] : []),
                  ...(gText ? [{ role: 'gemini' as const, text: gText, timestamp: Date.now() }] : [])
                ]);
              }
              currentInputTransRef.current = '';
              currentOutputTransRef.current = '';
            }

            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              setIsGeminiSpeaking(true);
              const outCtx = outputAudioContextRef.current!;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), outCtx, 24000, 1);
              const source = outCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outCtx.destination);
              
              source.addEventListener('ended', () => {
                activeSourcesRef.current.delete(source);
                if (activeSourcesRef.current.size === 0) setIsGeminiSpeaking(false);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              activeSourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              activeSourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsGeminiSpeaking(false);
            }
          },
          onerror: (e) => {
            console.error(e);
            setStatus(ConnectionStatus.ERROR);
            stopConversation();
          },
          onclose: () => setStatus(ConnectionStatus.DISCONNECTED),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedVoice } },
          },
          systemInstruction: `You are a local guide helping with directions. Scenario scenarios: Landmarks, Pizza Detours, Traffic, Lost in Park, EV Charging. Keep it concise.`,
        },
      });

      sessionRef.current = await sessionPromise;
    } catch (error) {
      console.error(error);
      setStatus(ConnectionStatus.ERROR);
    }
  };

  useEffect(() => {
    return () => stopConversation();
  }, [stopConversation]);

  const voices: VoiceName[] = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 h-screen flex flex-col gap-6">
      {/* Header & Global Status */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <span className="p-2 bg-indigo-600 rounded-lg shadow-lg">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </span>
            Gemini Multiverse
          </h1>
          <p className="text-slate-400 text-sm">One suite for voice, chat, and image intelligence</p>
        </div>

        <nav className="flex bg-slate-800/80 p-1 rounded-xl border border-slate-700">
          {[
            { id: 'voice', label: 'Voice Nav', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
            { id: 'chat', label: 'Pro Chat', icon: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
            { id: 'image-gen', label: 'Image Pro', icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { id: 'image-edit', label: 'Edit', icon: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as AppTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Dynamic Content */}
      <main className="flex-1 min-h-0">
        {activeTab === 'voice' && (
          <div className="flex flex-col h-full gap-6">
            <div className="flex items-center justify-between bg-slate-800/40 p-4 rounded-xl border border-slate-700">
              <div className="flex items-center gap-4">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Select AI Voice:</label>
                <div className="flex gap-2">
                  {voices.map(v => (
                    <button
                      key={v}
                      onClick={() => {
                        setSelectedVoice(v);
                        if (status === ConnectionStatus.CONNECTED) {
                          stopConversation();
                          alert('Voice changed. Please restart the session.');
                        }
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        selectedVoice === v 
                          ? 'bg-indigo-600 border-indigo-500 text-white' 
                          : 'bg-slate-700 border-slate-600 text-slate-400 hover:bg-slate-600'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 rounded-full border border-slate-700">
                <div className={`w-2 h-2 rounded-full ${
                  status === ConnectionStatus.CONNECTED ? 'bg-green-500 animate-pulse' : 
                  status === ConnectionStatus.CONNECTING ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'
                }`} />
                <span className="text-[10px] font-bold uppercase text-slate-400">{status}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 flex flex-col items-center">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Your Voice</span>
                <Visualizer isActive={isUserSpeaking} color="bg-blue-500" />
              </div>
              <div className="bg-slate-800/40 p-6 rounded-2xl border border-slate-700/50 flex flex-col items-center">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Gemini ({selectedVoice})</span>
                <Visualizer isActive={isGeminiSpeaking} color="bg-purple-500" />
              </div>
            </div>

            <Transcript history={history} />

            <div className="flex justify-center pb-4">
              {status === ConnectionStatus.DISCONNECTED || status === ConnectionStatus.ERROR ? (
                <button
                  onClick={startConversation}
                  className="group flex items-center gap-3 bg-white text-slate-900 px-10 py-4 rounded-full font-bold text-lg hover:bg-indigo-50 transition-all shadow-xl shadow-indigo-500/20 active:scale-95"
                >
                  <svg className="w-6 h-6 text-indigo-600" fill="currentColor" viewBox="0 0 20 20"><path d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 005.93 6.93V17H7a1 1 0 100 2h6a1 1 0 100-2h-1.93v-2.07z" /></svg>
                  Voice Nav Ready
                </button>
              ) : (
                <button
                  onClick={stopConversation}
                  className="flex items-center gap-3 bg-red-600 text-white px-10 py-4 rounded-full font-bold text-lg hover:bg-red-500 transition-all shadow-xl shadow-red-500/20 active:scale-95"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                  Stop Nav
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'chat' && <ChatBot />}
        {activeTab === 'image-gen' && <ImageGenerator />}
        {activeTab === 'image-edit' && <ImageEditor />}
      </main>
    </div>
  );
};

export default App;
