import { Injectable, OnDestroy } from '@angular/core';
import { Subject } from 'rxjs';

export type RestrictionLevel = 'bajo' | 'intermedio' | 'alto';
export type DistractorCategory = 'red_social' | 'videojuego' | 'streaming' | 'otro';
export type DistractorOrigin = 'global' | 'personal';

export interface DistractorEntry {
  nombre: string;
  url?: string;            // para páginas web (coincidencia parcial en hostname)
  proceso?: string;        // para apps de escritorio (no aplica en web, placeholder)
  categoria: DistractorCategory;
  origen: DistractorOrigin;
}

export interface DistractorDetectionEvent {
  timestamp: string;       // formato 2026-04-12|14:35:22
  nombre: string;
  categoria: DistractorCategory;
  nivelRestriccion: RestrictionLevel;
  url?: string;
}

export type DistractorAction = 'silencio' | 'toast' | 'bloqueo';

@Injectable({
  providedIn: 'root'
})
export class DistractorDetectionService implements OnDestroy {

  // ─── Base de datos de distractores ───────────────────────────────────────
  private readonly DB: DistractorEntry[] = [
    // Redes sociales
    { nombre: 'Facebook',   url: 'facebook.com',   categoria: 'red_social',  origen: 'global' },
    { nombre: 'Instagram',  url: 'instagram.com',  categoria: 'red_social',  origen: 'global' },
    { nombre: 'Twitter/X',  url: 'twitter.com',    categoria: 'red_social',  origen: 'global' },
    { nombre: 'Twitter/X',  url: 'x.com',          categoria: 'red_social',  origen: 'global' },
    { nombre: 'TikTok',     url: 'tiktok.com',     categoria: 'red_social',  origen: 'global' },
    { nombre: 'Snapchat',   url: 'snapchat.com',   categoria: 'red_social',  origen: 'global' },
    { nombre: 'Reddit',     url: 'reddit.com',     categoria: 'red_social',  origen: 'global' },
    { nombre: 'Pinterest',  url: 'pinterest.com',  categoria: 'red_social',  origen: 'global' },
    { nombre: 'LinkedIn',   url: 'linkedin.com',   categoria: 'red_social',  origen: 'global' },
    // Streaming
    { nombre: 'YouTube',    url: 'youtube.com',    categoria: 'streaming',   origen: 'global' },
    { nombre: 'Netflix',    url: 'netflix.com',    categoria: 'streaming',   origen: 'global' },
    { nombre: 'Twitch',     url: 'twitch.tv',      categoria: 'streaming',   origen: 'global' },
    { nombre: 'Disney+',    url: 'disneyplus.com', categoria: 'streaming',   origen: 'global' },
    { nombre: 'HBO Max',    url: 'hbomax.com',     categoria: 'streaming',   origen: 'global' },
    { nombre: 'Spotify',    url: 'spotify.com',    categoria: 'streaming',   origen: 'global' },
    { nombre: 'Prime Video',url: 'primevideo.com', categoria: 'streaming',   origen: 'global' },
    // Videojuegos
    { nombre: 'Steam',      url: 'store.steampowered.com', categoria: 'videojuego', origen: 'global' },
    { nombre: 'Epic Games', url: 'epicgames.com',  categoria: 'videojuego',  origen: 'global' },
    { nombre: 'Roblox',     url: 'roblox.com',     categoria: 'videojuego',  origen: 'global' },
    { nombre: 'Miniclip',   url: 'miniclip.com',   categoria: 'videojuego',  origen: 'global' },
    // Otro
    { nombre: 'WhatsApp Web', url: 'web.whatsapp.com', categoria: 'otro',   origen: 'global' },
    { nombre: 'Telegram',   url: 'web.telegram.org', categoria: 'otro',     origen: 'global' },
    { nombre: 'BuzzFeed',   url: 'buzzfeed.com',   categoria: 'otro',       origen: 'global' },
  ];

  readonly deteccion$ = new Subject<{ evento: DistractorDetectionEvent; accion: DistractorAction }>();

  private pollingInterval: any = null;
  private sesionActiva = false;
  private ultimaUrl = '';
  private registros: DistractorDetectionEvent[] = [];

  getNivelRestriccion(): RestrictionLevel {
    return (localStorage.getItem('focus_restriction_level') as RestrictionLevel) || 'intermedio';
  }

  setNivelRestriccion(nivel: RestrictionLevel): void {
    localStorage.setItem('focus_restriction_level_pending', nivel);
  }

  aplicarNivelPendiente(): void {
    const pending = localStorage.getItem('focus_restriction_level_pending');
    if (pending) {
      localStorage.setItem('focus_restriction_level', pending);
    } else if (!localStorage.getItem('focus_restriction_level')) {
      localStorage.setItem('focus_restriction_level', 'intermedio');
    }
  }

  iniciarMonitoreo(): void {
    if (this.sesionActiva) return;
    this.aplicarNivelPendiente();
    this.sesionActiva = true;
    this.registros = [];
    this.ultimaUrl = '';
    this.pollingInterval = setInterval(() => this.verificarUrl(), 2000);
  }

  detenerMonitoreo(): void {
    this.sesionActiva = false;
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  getRegistros(): DistractorDetectionEvent[] {
    return [...this.registros];
  }

  limpiarRegistros(): void {
    this.registros = [];
  }

  // ─── Detección manual (para llamar desde extensión de Chrome o desde la app) ──
  /**
   * Verifica si una URL dada es un distractor y ejecuta la acción según
   * el nivel de restricción. Retorna la acción ejecutada o null si no hay coincidencia.
   */
  verificarUrlExterna(url: string): DistractorAction | null {
    if (!this.sesionActiva) return null;
    return this.procesarUrl(url);
  }

  // ─── Privado ──────────────────────────────────────────────────────────────
  private verificarUrl(): void {
    try {
      const currentUrl = window.location.href;
      if (currentUrl === this.ultimaUrl) return;
      this.ultimaUrl = currentUrl;
      this.procesarUrl(currentUrl);
    } catch { /* cross-origin */ }
  }

  private procesarUrl(rawUrl: string): DistractorAction | null {
    let hostname = '';
    try {
      hostname = new URL(rawUrl).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }

    const match = this.DB.find(d => d.url && hostname.includes(d.url.replace(/^www\./, '')));
    if (!match) return null;

    const nivel = this.getNivelRestriccion();
    const evento: DistractorDetectionEvent = {
      timestamp: this.formatTimestamp(new Date()),
      nombre: match.nombre,
      categoria: match.categoria,
      nivelRestriccion: nivel,
      url: rawUrl
    };

    // Registrar siempre
    this.registros.push(evento);
    this.persistirRegistro(evento);

    // Determinar acción
    let accion: DistractorAction;
    if (nivel === 'bajo') {
      accion = 'silencio';
    } else if (nivel === 'intermedio') {
      accion = 'toast';
    } else {
      accion = 'bloqueo';
    }

    this.deteccion$.next({ evento, accion });
    return accion;
  }

  private persistirRegistro(evento: DistractorDetectionEvent): void {
    try {
      const key = 'focus_distractor_log';
      const existing: DistractorDetectionEvent[] = JSON.parse(localStorage.getItem(key) || '[]');
      existing.push(evento);
      localStorage.setItem(key, JSON.stringify(existing));
    } catch { /* storage full */ }
  }

  private formatTimestamp(date: Date): string {
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const s = String(date.getSeconds()).padStart(2, '0');
    return `${y}-${mo}-${d}|${h}:${mi}:${s}`;
  }

  ngOnDestroy(): void {
    this.detenerMonitoreo();
    this.deteccion$.complete();
  }
}
