'use client';

import { useRef } from 'react';

interface FileUploadProps {
  label: string;
  accept?: string;
  onFile: (file: File) => void;
  preview?: string | null;
  variant?: 'primary' | 'ghost';
}

export function FileUpload({ label, accept = 'image/*', onFile, preview, variant = 'primary' }: FileUploadProps) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 flex flex-col gap-2">
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      {preview ? (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="relative rounded-2xl overflow-hidden border border-[rgba(232,70,122,0.6)] group"
        >
          <img src={preview} alt="Vista previa del archivo subido" className="w-full object-contain max-h-64" />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <span className="text-white text-xs font-medium">Cambiar imagen</span>
          </div>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className={
            variant === 'primary'
              ? 'h-28 rounded-2xl border-2 border-dashed border-white/[0.06] text-[#a98c88] text-sm hover:border-[rgba(232,70,122,0.6)] hover:text-[#e8467a] transition-colors flex flex-col items-center justify-center gap-2 bg-[#2a0f1a]'
              : 'h-28 rounded-2xl border-2 border-dashed border-white/[0.06] text-[#a98c88] text-xs hover:border-white/20 hover:text-[#c9b4ae] transition-colors flex flex-col items-center justify-center gap-1 bg-[#2a0f1a]'
          }
        >
          <svg className="w-6 h-6 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <span>{label}</span>
        </button>
      )}
    </div>
  );
}
