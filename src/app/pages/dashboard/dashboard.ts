import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit, OnDestroy {
  timerDisplay = '00:00:00';
  loading = false;
  error = '';

  sesionActiva = false;
  pausado = false;
  sesionTerminada = false;
  mostrarModal = false;

  tiempoRestante = 0;
  tiempoTotal = 0;
  duracionMinutos = 45;
  modoTexto = 'No configurado';

  horaInicio = '';
  horaFin = '';

  confettiPieces: { left: string; delay: string; duration: string; color: string }[] = [];

  private interval: any;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.cargarPreferencias();
    this.actualizarDisplay();
  }

  ngOnDestroy() {
    this.limpiarInterval();
  }

  cargarPreferencias() {
    const raw = localStorage.getItem('focus_preferences');
    if (raw) {
      try {
        const prefs = JSON.parse(raw);
        this.duracionMinutos = Number(prefs.duration) || 45;
        const modosMap: Record<string, string> = {
          'tranquilo': 'Tranquilo',
          'alerta': 'Alerta',
          'absoluta': 'Concentración absoluta'
        };
        this.modoTexto = modosMap[prefs.mode] || 'No configurado';
      } catch {}
    }
    this.tiempoTotal = this.duracionMinutos * 60;
    this.tiempoRestante = this.tiempoTotal;
  }

  startSession() {
    if (this.loading || this.sesionActiva) return;

    this.loading = true;
    this.error = '';
    this.sesionActiva = true;
    this.pausado = false;
    this.sesionTerminada = false;
    this.mostrarModal = false;
    this.tiempoRestante = this.tiempoTotal;
    this.horaInicio = this.formatearFecha(new Date());
    this.horaFin = '';

    this.arrancarTimer();
    this.loading = false;
  }

  togglePausa() {
    if (!this.sesionActiva || this.sesionTerminada) return;

    if (!this.pausado) {
      this.pausado = true;
      this.limpiarInterval();
    } else {
      this.pausado = false;
      this.arrancarTimer();
    }
  }

  endSession() {
    if (!this.sesionActiva || this.loading) return;

    this.loading = true;
    this.limpiarInterval();

    this.horaFin = this.formatearFecha(new Date());
    const completada = this.tiempoRestante <= 0;

    const sesion = {
      id: 'session_' + Date.now(),
      start_time: this.horaInicio,
      end_time: this.horaFin,
      modo: this.modoTexto,
      duracion_configurada: this.duracionMinutos,
      tiempo_usado_segundos: this.tiempoTotal - this.tiempoRestante,
      completada: completada
    };

    const historial = JSON.parse(localStorage.getItem('focus_session_history') || '[]');
    historial.push(sesion);
    localStorage.setItem('focus_session_history', JSON.stringify(historial));

    this.sesionActiva = false;
    this.pausado = false;
    this.sesionTerminada = true;
    this.loading = false;

    if (completada) {
      this.generarConfetti();
      this.mostrarModal = true;
    }

    this.cdr.detectChanges();
  }

  nuevaSesion() {
    this.limpiarInterval();
    this.sesionActiva = false;
    this.pausado = false;
    this.sesionTerminada = false;
    this.mostrarModal = false;
    this.horaInicio = '';
    this.horaFin = '';
    this.cargarPreferencias();
    this.actualizarDisplay();
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.nuevaSesion();
  }

  logout() {
    this.router.navigate(['/login']);
  }

  private arrancarTimer() {
    this.limpiarInterval();
    this.interval = setInterval(() => {
      if (this.tiempoRestante > 0) {
        this.tiempoRestante--;
        this.actualizarDisplay();
      }
      if (this.tiempoRestante <= 0) {
        this.endSession();
      }
      this.cdr.detectChanges();
    }, 1000);
  }

  private limpiarInterval() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private actualizarDisplay() {
    const h = Math.floor(this.tiempoRestante / 3600);
    const m = Math.floor((this.tiempoRestante % 3600) / 60);
    const s = this.tiempoRestante % 60;
    this.timerDisplay = `${this.pad(h)}:${this.pad(m)}:${this.pad(s)}`;
  }

  private pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  private formatearFecha(date: Date): string {
    const y = date.getFullYear();
    const mo = this.pad(date.getMonth() + 1);
    const d = this.pad(date.getDate());
    const h = this.pad(date.getHours());
    const mi = this.pad(date.getMinutes());
    const s = this.pad(date.getSeconds());
    return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
  }

  private generarConfetti() {
    const colores = ['#7c3aed', '#a78bfa', '#c4b5fd', '#10b981', '#f59e0b', '#ec4899', '#312e81'];
    this.confettiPieces = Array.from({ length: 50 }, () => ({
      left: Math.random() * 100 + '%',
      delay: Math.random() * 2 + 's',
      duration: (Math.random() * 2 + 2) + 's',
      color: colores[Math.floor(Math.random() * colores.length)]
    }));
  }
}