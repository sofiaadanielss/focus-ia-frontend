import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs'; 
import { CameraTrackingService, CameraStatus, ToastEvent } from '../../core/services/camera-tracking.service';
import { DistractionLogService, DistractionEvent } from '../../core/services/distracion-log.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasRef!: ElementRef<HTMLCanvasElement>;

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

  // Camera tracking
  cameraStatus: CameraStatus = 'idle';
  cameraPermisoDenegado = false;

  // Toast de distracciones
  toasts: { tipo: string; mensaje: string; visible: boolean; autoCloseTimer?: any }[] = [];

  // Registro para mostrar en la UI
  ultimoEventoTimestamp = '';
  ultimoEventoTipo = '';
  totalDistracciones = 0;

  private interval: any;
  private toastSub!: Subscription;
  private statusSub!: Subscription;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private cameraTracking: CameraTrackingService,
    private distractionLog: DistractionLogService
  ) {}

  ngOnInit() {
    this.cargarPreferencias();
    this.actualizarDisplay();

    this.toastSub = this.cameraTracking.toast$.subscribe((event: ToastEvent) => {
      this.manejarToast(event);
      this.totalDistracciones = this.distractionLog.getEventos().length;
      const eventos = this.distractionLog.getEventos();
      if (eventos.length > 0) {
        const ultimo = eventos[eventos.length - 1];
        this.ultimoEventoTimestamp = ultimo.timestamp;
        this.ultimoEventoTipo = ultimo.tipo === 'desvio_mirada' ? 'Desvío de mirada' : 'Fuera de encuadre';
      }
      this.cdr.detectChanges();
    });

    this.statusSub = this.cameraTracking.cameraStatus$.subscribe((status: CameraStatus) => {
      this.cameraStatus = status;
      this.cameraPermisoDenegado = status === 'denied';
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.limpiarInterval();
    this.cameraTracking.detener();
    this.toastSub?.unsubscribe();
    this.statusSub?.unsubscribe();
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

  async startSession() {
    if (this.loading || this.sesionActiva) return;

    this.loading = true;
    this.error = '';
    this.cameraPermisoDenegado = false;
    this.distractionLog.limpiar();
    this.totalDistracciones = 0;
    this.ultimoEventoTimestamp = '';
    this.ultimoEventoTipo = '';

    // Esperar un tick para que el template renderice el <video>
    this.sesionActiva = true;
    this.cdr.detectChanges();

    await new Promise(resolve => setTimeout(resolve, 100));

    // Solicitar acceso a la cámara
    const videoEl = this.videoRef?.nativeElement;
    const canvasEl = this.canvasRef?.nativeElement;

    if (!videoEl || !canvasEl) {
      this.error = 'No se encontró el elemento de video.';
      this.sesionActiva = false;
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    const cameraOk = await this.cameraTracking.iniciar(videoEl, canvasEl);

    if (!cameraOk) {
      this.cameraPermisoDenegado = true;
      this.error = 'No se puede iniciar la sesión sin acceso a la cámara. Permite el acceso e intenta de nuevo.';
      this.sesionActiva = false;
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    this.pausado = false;
    this.sesionTerminada = false;
    this.mostrarModal = false;
    this.tiempoRestante = this.tiempoTotal;
    this.horaInicio = this.formatearFecha(new Date());
    this.horaFin = '';

    this.arrancarTimer();
    this.loading = false;
    this.cdr.detectChanges();
  }

  togglePausa() {
    if (!this.sesionActiva || this.sesionTerminada) return;

    if (!this.pausado) {
      this.pausado = true;
      this.limpiarInterval();
      this.cameraTracking.pausar();
    } else {
      this.pausado = false;
      this.arrancarTimer();
      this.cameraTracking.reanudar();
    }
  }

  endSession() {
    if (!this.sesionActiva || this.loading) return;

    this.loading = true;
    this.limpiarInterval();
    this.cameraTracking.detener();

    this.horaFin = this.formatearFecha(new Date());
    const completada = this.tiempoRestante <= 0;

    // Sincronizar distracciones
    const distraccionesData = this.distractionLog.sincronizarAlFinalizar();

    const sesion = {
      id: 'session_' + Date.now(),
      start_time: this.horaInicio,
      end_time: this.horaFin,
      modo: this.modoTexto,
      duracion_configurada: this.duracionMinutos,
      tiempo_usado_segundos: this.tiempoTotal - this.tiempoRestante,
      completada: completada,
      distracciones: distraccionesData.eventos,
      total_distracciones: distraccionesData.total
    };

    const historial = JSON.parse(localStorage.getItem('focus_session_history') || '[]');
    historial.push(sesion);
    localStorage.setItem('focus_session_history', JSON.stringify(historial));

    // Guardar distracciones aparte
    this.distractionLog.guardarEnLocalStorage(sesion.id);

    this.sesionActiva = false;
    this.pausado = false;
    this.sesionTerminada = true;
    this.loading = false;

    // Limpiar toasts
    this.toasts = [];

    if (completada) {
      this.generarConfetti();
      this.mostrarModal = true;
    }

    this.cdr.detectChanges();
  }

  nuevaSesion() {
    this.limpiarInterval();
    this.cameraTracking.detener();
    this.sesionActiva = false;
    this.pausado = false;
    this.sesionTerminada = false;
    this.mostrarModal = false;
    this.horaInicio = '';
    this.horaFin = '';
    this.cameraStatus = 'idle';
    this.cameraPermisoDenegado = false;
    this.toasts = [];
    this.totalDistracciones = 0;
    this.ultimoEventoTimestamp = '';
    this.ultimoEventoTipo = '';
    this.cargarPreferencias();
    this.actualizarDisplay();
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.nuevaSesion();
  }

  cerrarToast(index: number) {
    if (this.toasts[index]) {
      if (this.toasts[index].autoCloseTimer) {
        clearTimeout(this.toasts[index].autoCloseTimer);
      }
      this.toasts.splice(index, 1);
      this.cdr.detectChanges();
    }
  }

  logout() {
    this.cameraTracking.detener();
    this.router.navigate(['/login']);
  }

  private manejarToast(event: ToastEvent): void {
    if (event.visible) {
      // Verificar si ya hay un toast del mismo tipo activo
      const existente = this.toasts.findIndex(t => t.tipo === event.tipo);
      if (existente >= 0) return; // Ya hay uno activo

      const toast = {
        tipo: event.tipo,
        mensaje: event.mensaje,
        visible: true,
        autoCloseTimer: null as any
      };

      // Auto-cerrar después de 6 segundos
      toast.autoCloseTimer = setTimeout(() => {
        const idx = this.toasts.indexOf(toast);
        if (idx >= 0) {
          this.toasts.splice(idx, 1);
          this.cdr.detectChanges();
        }
      }, 6000);

      this.toasts.push(toast);
    } else {
      // Remover toast del tipo correspondiente
      const idx = this.toasts.findIndex(t => t.tipo === event.tipo);
      if (idx >= 0) {
        if (this.toasts[idx].autoCloseTimer) {
          clearTimeout(this.toasts[idx].autoCloseTimer);
        }
        this.toasts.splice(idx, 1);
      }
    }
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