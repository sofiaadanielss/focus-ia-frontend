import { Injectable } from '@angular/core';

export type FocusMode = 'tranquilo' | 'moderado' | 'absoluta';

@Injectable({ providedIn: 'root' })
export class AudioService {
  private audioCache: Map<string, HTMLAudioElement> = new Map();

  private readonly SOUND_MAP: Record<string, string> = {
    moderado:  'assets/audio/mixkit-bell-notification-993.wav',
    absoluta:  'assets/audio/999-social-credit-siren.mp3',
  };

  /** Pre-load a sound so first play is instant */
  preload(mode: FocusMode): void {
    const src = this.SOUND_MAP[mode];
    if (!src || this.audioCache.has(mode)) return;
    const audio = new Audio(src);
    audio.load();
    this.audioCache.set(mode, audio);
  }

  /** Play the sound for the given focus mode (no-op for 'tranquilo') */
  play(mode: FocusMode): void {
    const src = this.SOUND_MAP[mode];
    if (!src) return; // tranquilo → sin sonido

    let audio = this.audioCache.get(mode);
    if (!audio) {
      audio = new Audio(src);
      this.audioCache.set(mode, audio);
    }

    // Restart from beginning if already playing
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay blocked by browser policy — silently ignore
    });
  }

  stop(mode: FocusMode): void {
    const audio = this.audioCache.get(mode);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }

  /** Get mode key from the stored preference string */
  modeFromPreference(prefMode: string): FocusMode {
    const map: Record<string, FocusMode> = {
      tranquilo: 'tranquilo',
      moderado:  'moderado',
      absoluta:  'absoluta',
    };
    return map[prefMode] ?? 'tranquilo';
  }
}