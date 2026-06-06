'use client';

import { useRef, useState } from 'react';
import { Music, Loader2, X, Play, Pause } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { uploadFile } from '@/lib/upload';

export function MusicUploader({
  value,
  volume,
  tenantId,
  onChange,
  onVolume,
}: {
  value: string | null;
  volume: number;
  tenantId: string;
  onChange: (url: string | null) => void;
  onVolume: (v: number) => void;
}) {
  const t = useTranslations('design');
  const inputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [busy, setBusy] = useState(false);
  const [vol, setVol] = useState(volume ?? 50);
  const [playing, setPlaying] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const url = await uploadFile(file, tenantId, 'music');
      onChange(url);
    } catch {
      // rare, retryable
    } finally {
      setBusy(false);
    }
  }

  function togglePreview() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.volume = vol / 100;
      a.play().then(() => setPlaying(true)).catch(() => {});
    }
  }

  function changeVol(v: number) {
    setVol(v);
    if (audioRef.current) audioRef.current.volume = v / 100;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Music className="h-4 w-4" />}
          {value ? t('replaceMusic') : t('uploadMusic')}
        </button>
        {value && (
          <>
            <button
              type="button"
              onClick={togglePreview}
              className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />} {t('listenMusic')}
            </button>
            <button
              type="button"
              onClick={() => {
                audioRef.current?.pause();
                setPlaying(false);
                onChange(null);
              }}
              className="flex items-center gap-1 text-neutral-400 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {value && (
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs text-neutral-500">{t('volume')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={vol}
            onChange={(e) => changeVol(Number(e.target.value))}
            onPointerUp={() => onVolume(vol)}
            onKeyUp={() => onVolume(vol)}
            className="h-1 flex-1 cursor-pointer accent-neutral-900"
          />
          <span className="w-9 text-right text-[10px] text-neutral-400">{vol}%</span>
        </div>
      )}

      <p className="mt-1.5 text-xs text-neutral-400">{t('musicHint')}</p>

      <audio ref={audioRef} src={value ?? undefined} loop preload="none" />
      <input
        ref={inputRef}
        type="file"
        accept="audio/mpeg,audio/mp3,.mp3"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
