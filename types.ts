
export interface TranscriptEntry {
  role: 'user' | 'gemini';
  text: string;
  timestamp: number;
}

export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  ERROR = 'ERROR'
}

export type AppTab = 'voice' | 'chat' | 'image-gen' | 'image-edit';

export type VoiceName = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  timestamp: number;
}
