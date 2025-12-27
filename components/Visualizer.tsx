
import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  color: string;
}

export const Visualizer: React.FC<VisualizerProps> = ({ isActive, color }) => {
  const bars = Array.from({ length: 24 });
  
  return (
    <div className="flex items-center justify-center gap-1 h-12 w-full">
      {bars.map((_, i) => (
        <div
          key={i}
          className={`w-1 rounded-full transition-all duration-300 ${isActive ? color : 'bg-gray-700'}`}
          style={{
            height: isActive ? `${Math.max(20, Math.random() * 100)}%` : '10%',
            transitionDelay: `${i * 30}ms`
          }}
        />
      ))}
    </div>
  );
};
