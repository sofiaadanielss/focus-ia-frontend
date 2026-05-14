import { Injectable } from '@angular/core';

export type FocusMode = 'tranquilo' | 'moderado' | 'absoluta';

@Injectable({ providedIn: 'root' })
export class AudioService {
  private audioCache: Map<string, HTMLAudioElement> = new Map();

  private readonly SOUND_MAP: Record<string, string> = {
    moderado: 'assets/audio/mixkit-bell-notification-933.mp3',
    absoluta: 'assets/audio/999-social-credit-siren.mp3',
  };

  preload(mode: FocusMode): void {
    const src = this.SOUND_MAP[mode];
    if (!src || this.audioCache.has(mode)) return;
    const audio = new Audio(src);
    audio.load();
    this.audioCache.set(mode, audio);
  }

  /** One-shot play (resets from start) */
  play(mode: FocusMode): void {
    const audio = this.getOrCreate(mode);
    if (!audio) return;
    audio.loop = false;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  /** Looping play — keeps repeating until stop() is called */
  playLoop(mode: FocusMode): void {
    const audio = this.getOrCreate(mode);
    if (!audio) return;
    if (!audio.paused) return; // already playing
    audio.loop = true;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  stop(mode: FocusMode): void {
    const audio = this.audioCache.get(mode);
    if (!audio) return;
    audio.loop = false;
    audio.pause();
    audio.currentTime = 0;
  }

  stopAll(): void {
    this.audioCache.forEach(audio => {
      audio.loop = false;
      audio.pause();
      audio.currentTime = 0;
    });
  }

  modeFromPreference(prefMode: string): FocusMode {
    const map: Record<string, FocusMode> = {
      tranquilo: 'tranquilo',
      moderado:  'moderado',
      absoluta:  'absoluta',
    };
    return map[prefMode] ?? 'tranquilo';
  }

  private getOrCreate(mode: FocusMode): HTMLAudioElement | null {
    const src = this.SOUND_MAP[mode];
    if (!src) return null; // tranquilo → sin sonido
    let audio = this.audioCache.get(mode);
    if (!audio) {
      audio = new Audio(src);
      this.audioCache.set(mode, audio);
    }
    return audio;
  }
}
