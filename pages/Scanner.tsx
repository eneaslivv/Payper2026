
import React, { useState, useRef, useEffect } from 'react';

const Scanner: React.FC = () => {
  const [manualCode, setManualCode] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      setError(null);
      setIsCameraActive(false);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Hardware incompatible.");
      }
      
      const constraints = { video: { facingMode: 'environment' }, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setIsCameraActive(true);
          setPermissionState('granted');
        };
        streamRef.current = stream;
      }
    } catch (err: any) {
      console.error("Camera Error:", err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.message?.includes('denied')) {
        setPermissionState('denied');
        setError("PERMISO DENEGADO: Debes habilitar la cámara en los ajustes del navegador.");
      } else {
        setError(`FALLO SENSOR: ${err.message || "No detectado"}`);
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-[#0D0F0D] animate-in fade-in duration-700">
      <main className="flex-1 flex flex-col items-center justify-start py-12 px-6">
        
        <div className="w-full max-w-xl text-center mb-10">
          <h1 className="text-white text-4xl font-black italic-black tracking-tighter uppercase mb-2">
            ESCANEAR <span className="text-neon">PEDIDO</span>
          </h1>
          <p className="text-text-secondary text-[10px] font-bold uppercase tracking-[0.4em] opacity-40">Tactical Validation Unit v2.5</p>
        </div>
        
        <div className="w-full max-w-[640px] space-y-8">
          <div className="relative aspect-video bg-[#111311] rounded-[3rem] overflow-hidden border border-white/5 shadow-2xl group">
            
            <video ref={videoRef} autoPlay playsInline muted className={`absolute inset-0 size-full object-cover transition-opacity duration-1000 ${isCameraActive ? 'opacity-50' : 'opacity-0'}`} />

            {(!isCameraActive && !error) && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111311] z-10">
                <div className="size-10 border-4 border-neon/10 border-t-neon rounded-full animate-spin"></div>
                <p className="mt-4 text-[9px] font-black text-neon uppercase tracking-widest animate-pulse">Sincronizando Sensor...</p>
              </div>
            )}

            {(error || permissionState === 'denied') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 p-12 text-center backdrop-blur-md">
                <div className="size-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6 text-primary shadow-2xl">
                   <span className="material-symbols-outlined text-5xl">videocam_off</span>
                </div>
                <h3 className="text-white font-black uppercase text-xl italic-black mb-2 tracking-tighter">ERROR DE ENLACE</h3>
                <p className="text-[10px] font-bold text-white/40 uppercase mb-8 max-w-xs leading-relaxed">{error}</p>
                <button onClick={startCamera} className="px-10 py-4 bg-neon text-black rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-neon-soft active:scale-95 transition-all">REINTENTAR ACCESO</button>
              </div>
            )}
            
            {isCameraActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-12 pointer-events-none z-10">
                <div className="w-64 h-64 border border-neon/20 relative rounded-[2rem]">
                   <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-neon -mt-1 -ml-1 rounded-tl-[1.8rem] shadow-neon-soft"></div>
                   <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-neon -mt-1 -mr-1 rounded-tr-[1.8rem] shadow-neon-soft"></div>
                   <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-neon -mb-1 -ml-1 rounded-bl-[1.8rem] shadow-neon-soft"></div>
                   <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-neon -mb-1 -mr-1 rounded-br-[1.8rem] shadow-neon-soft"></div>
                   <div className="absolute top-0 left-4 right-4 h-[1px] bg-neon shadow-neon-soft animate-[scan_3s_ease-in-out_infinite]"></div>
                </div>
                <div className="mt-12 px-6 py-2.5 bg-neon/10 border border-neon/20 rounded-xl flex items-center gap-3">
                   <div className="size-2 rounded-full bg-neon animate-pulse"></div>
                   <span className="text-neon font-black text-[10px] uppercase tracking-[0.2em] italic">Sensor de Campo Activo</span>
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#111311] p-8 rounded-[2.5rem] border border-white/5 shadow-xl">
             <label className="flex items-center gap-3 text-[9px] font-black uppercase text-white/30 tracking-widest mb-4 ml-1 italic"><span className="material-symbols-outlined text-neon text-lg">keyboard</span> Entrada Manual</label>
             <div className="flex gap-4">
                <input 
                  value={manualCode}
                  onChange={e => setManualCode(e.target.value.toUpperCase())}
                  className="flex-1 h-14 px-6 rounded-2xl bg-black/40 border border-white/10 text-xl font-black italic-black text-white focus:ring-1 focus:ring-neon/30 outline-none uppercase" 
                  placeholder="ID TRANSACCIÓN" 
                />
                <button className="px-8 bg-neon text-black rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-neon-soft active:scale-95">VALIDAR</button>
             </div>
          </div>
        </div>
      </main>

      <style>{`
        @keyframes scan {
          0%, 100% { transform: translateY(0); opacity: 0.5; }
          50% { transform: translateY(256px); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default Scanner;
