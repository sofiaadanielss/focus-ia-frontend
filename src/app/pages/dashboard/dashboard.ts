import { Component, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CameraTrackingService, CameraStatus, ToastEvent } from '../../core/services/camera-tracking.service';
import { DistractionLogService } from '../../core/services/distracion-log.service';
import { FocusService } from '../../core/services/focus.service';
import { TimerService } from '../../core/services/timer.service';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { Preferencias } from '../../features/preferencias/preferencias';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [Sidebar, Preferencias],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit, OnDestroy {
  @ViewChild('videoEl') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasRef!: ElementRef<HTMLCanvasElement>;

  loading = false;
  error = '';
  cameraStatus: CameraStatus = 'idle';
  cameraPermisoDenegado = false;
  toasts: { tipo: string; mensaje: string; visible: boolean; autoCloseTimer?: any }[] = [];
  ultimoEventoTimestamp = '';
  ultimoEventoTipo = '';
  totalDistracciones = 0;
  confettiPieces: { left: string; delay: string; duration: string; color: string }[] = [];
  mostrarPreferencias = signal(false);
  _mostrarModal = false;

  private toastSub!: Subscription;
  private statusSub!: Subscription;

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private cameraTracking: CameraTrackingService,
    private distractionLog: DistractionLogService,
    private focusService: FocusService,
    public timerSvc: TimerService
  ) {}

  get timerDisplay()     { return this.timerSvc.timerDisplay; }
  get sesionActiva()     { return this.timerSvc.state.sesionActiva; }
  get pausado()          { return this.timerSvc.state.pausado; }
  get sesionTerminada()  { return this.timerSvc.state.sesionTerminada; }
  get mostrarModal()     { return this.timerSvc.state.sesionTerminada && this.timerSvc.state.tiempoRestante <= 0; }
  get tiempoRestante()   { return this.timerSvc.state.tiempoRestante; }
  get duracionMinutos()  { return this.timerSvc.state.duracionMinutos; }
  get modoTexto()        { return this.timerSvc.state.modoTexto; }
  get horaInicio()       { return this.timerSvc.state.horaInicio; }
  get horaFin()          { return this.timerSvc.state.horaFin; }

  get barraProgreso(): number {
    const total = this.timerSvc.state.tiempoTotal;
    if (!total) return 100;
    return (this.timerSvc.state.tiempoRestante / total) * 100;
  }

  get estaEnAdvertencia(): boolean {
    return this.timerSvc.state.sesionActiva && this.timerSvc.state.tiempoRestante <= 120;
  }

  get tooltipTiempo(): string {
    const seg = this.timerSvc.state.tiempoRestante;
    const m = Math.floor(seg / 60);
    const s = seg % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  ngOnInit() {
    this.cargarPreferencias();

    if (this.timerSvc.state.sesionActiva && !this.timerSvc.state.pausado) {
      this.timerSvc.iniciarTimer(
        () => this.cdr.detectChanges(),
        () => this.endSession()
      );

      setTimeout(async () => {
        const videoEl = this.videoRef?.nativeElement;
        const canvasEl = this.canvasRef?.nativeElement;
        if (videoEl && canvasEl) {
          await this.cameraTracking.iniciar(videoEl, canvasEl);
          this.cdr.detectChanges();
        }
      }, 200);
    }

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
    this.toastSub?.unsubscribe();
    this.statusSub?.unsubscribe();
  }

  cargarPreferencias() {
    if (this.timerSvc.state.sesionActiva) return;
    const prefs = this.focusService.getPreferenciasLocal();
    const duracion = prefs ? Number(prefs.duration) || 45 : 45;
    const modosMap: Record<string, string> = {
      'tranquilo': 'Tranquilo',
      'alerta': 'Alerta',
      'absoluta': 'Concentración absoluta'
    };
    const modo = prefs ? (modosMap[prefs.mode] || 'No configurado') : 'Tranquilo';
    this.timerSvc.setEstadoSesion({
      duracionMinutos: duracion,
      modoTexto: modo,
      tiempoTotal: duracion * 60,
      tiempoRestante: duracion * 60
    });
  }

  async startSession() {
    if (this.loading || this.timerSvc.state.sesionActiva) {
      this.error = 'Ya hay una sesión activa. Finalízala primero.';
      return;
    }

    try {
      const activeSession = await this.focusService.getActiveSession().toPromise();
      if (activeSession && activeSession.id) {
        this.error = 'Ya hay una sesión activa en el servidor.';
        this.timerSvc.setEstadoSesion({ sesionActiva: true, sessionIdBackend: activeSession.id });
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }
    } catch (err) {}

    this.loading = true;
    this.error = '';
    this.cameraPermisoDenegado = false;
    this.distractionLog.limpiar();
    this.totalDistracciones = 0;
    this.ultimoEventoTimestamp = '';
    this.ultimoEventoTipo = '';
    this.timerSvc.setEstadoSesion({ sesionActiva: true });
    this.cdr.detectChanges();

    await new Promise(resolve => setTimeout(resolve, 100));

    const videoEl = this.videoRef?.nativeElement;
    const canvasEl = this.canvasRef?.nativeElement;

    if (!videoEl || !canvasEl) {
      this.error = 'No se encontró el elemento de video.';
      this.timerSvc.setEstadoSesion({ sesionActiva: false });
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    const cameraOk = await this.cameraTracking.iniciar(videoEl, canvasEl);

    if (!cameraOk) {
      this.cameraPermisoDenegado = true;
      this.error = 'No se puede iniciar la sesión sin acceso a la cámara.';
      this.timerSvc.setEstadoSesion({ sesionActiva: false });
      this.loading = false;
      this.cdr.detectChanges();
      return;
    }

    try {
      const newSession = await this.focusService.startSessionWithDuration(this.duracionMinutos).toPromise();
      if (newSession && newSession.id) {
        this.timerSvc.setEstadoSesion({ sessionIdBackend: newSession.id });
      }
    } catch (err) {}

    const horaInicio = this.formatearFecha(new Date());
    this.timerSvc.setEstadoSesion({
      pausado: false,
      sesionTerminada: false,
      tiempoRestante: this.timerSvc.state.tiempoTotal,
      horaInicio,
      horaFin: ''
    });

    this.timerSvc.iniciarTimer(
      () => this.cdr.detectChanges(),
      () => this.endSession()
    );

    this.loading = false;
    this._mostrarModal = false;
    this.cdr.detectChanges();
  }

  togglePausa() {
    if (!this.timerSvc.state.sesionActiva || this.timerSvc.state.sesionTerminada) return;
    if (!this.timerSvc.state.pausado) {
      this.timerSvc.pausarTimer();
      this.cameraTracking.pausar();
    } else {
      this.timerSvc.reanudarTimer(
        () => this.cdr.detectChanges(),
        () => this.endSession()
      );
      this.cameraTracking.reanudar();
    }
    this.cdr.detectChanges();
  }

  async endSession() {
    if (!this.timerSvc.state.sesionActiva || this.loading) return;
    this.loading = true;
    this.timerSvc.limpiarInterval();
    this.cameraTracking.detener();

    const horaFin = this.formatearFecha(new Date());
    const completada = this.timerSvc.state.tiempoRestante <= 0;

    if (this.timerSvc.state.sessionIdBackend) {
      try { await this.focusService.endSession(this.timerSvc.state.sessionIdBackend).toPromise(); } catch (err) {}
    }

    const distraccionesData = this.distractionLog.sincronizarAlFinalizar();

    const sesion = {
      id: 'session_' + Date.now(),
      start_time: this.horaInicio,
      end_time: horaFin,
      modo: this.modoTexto,
      duracion_configurada: this.duracionMinutos,
      tiempo_usado_segundos: this.timerSvc.state.tiempoTotal - this.timerSvc.state.tiempoRestante,
      completada,
      distracciones: distraccionesData.eventos,
      total_distracciones: distraccionesData.total
    };

    const historial = JSON.parse(localStorage.getItem('focus_session_history') || '[]');
    historial.push(sesion);
    localStorage.setItem('focus_session_history', JSON.stringify(historial));
    this.distractionLog.guardarEnLocalStorage(sesion.id);

    this.timerSvc.setEstadoSesion({
      sesionActiva: false,
      pausado: false,
      sesionTerminada: true,
      horaFin,
      sessionIdBackend: null
    });

    this.loading = false;
    this.toasts = [];

    if (completada) {
      this.generarConfetti();
      this._mostrarModal = true;
    }

    this.cdr.detectChanges();
  }

  nuevaSesion() {
    this.cameraTracking.detener();
    this.timerSvc.resetear();
    this.cameraStatus = 'idle';
    this.cameraPermisoDenegado = false;
    this.toasts = [];
    this.totalDistracciones = 0;
    this.ultimoEventoTimestamp = '';
    this.ultimoEventoTipo = '';
    this.error = '';
    this._mostrarModal = false;
    this.cargarPreferencias();
    this.cdr.detectChanges();
  }

  cerrarModal() {
    this._mostrarModal = false;
    this.nuevaSesion();
  }

  cerrarToast(index: number) {
    if (this.toasts[index]) {
      if (this.toasts[index].autoCloseTimer) clearTimeout(this.toasts[index].autoCloseTimer);
      this.toasts.splice(index, 1);
      this.cdr.detectChanges();
    }
  }

  abrirPreferencias() {
    this.mostrarPreferencias.set(true);
  }

  cerrarPreferencias() {
    this.mostrarPreferencias.set(false);
  }

  onPreferenciasGuardadas() {
    this.cargarPreferencias();
    this.cerrarPreferencias();
  }

  private manejarToast(event: ToastEvent): void {
    if (event.visible) {
      const existente = this.toasts.findIndex(t => t.tipo === event.tipo);
      if (existente >= 0) return;
      const toast = { tipo: event.tipo, mensaje: event.mensaje, visible: true, autoCloseTimer: null as any };
      toast.autoCloseTimer = setTimeout(() => {
        const idx = this.toasts.indexOf(toast);
        if (idx >= 0) { this.toasts.splice(idx, 1); this.cdr.detectChanges(); }
      }, 6000);
      this.toasts.push(toast);
    } else {
      const idx = this.toasts.findIndex(t => t.tipo === event.tipo);
      if (idx >= 0) {
        if (this.toasts[idx].autoCloseTimer) clearTimeout(this.toasts[idx].autoCloseTimer);
        this.toasts.splice(idx, 1);
      }
    }
  }

  private formatearFecha(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  private generarConfetti() {
    const colores = ['#7c3aed','#a78bfa','#c4b5fd','#10b981','#f59e0b','#ec4899','#312e81'];
    this.confettiPieces = Array.from({ length: 50 }, () => ({
      left: Math.random() * 100 + '%',
      delay: Math.random() * 2 + 's',
      duration: (Math.random() * 2 + 2) + 's',
      color: colores[Math.floor(Math.random() * colores.length)]
    }));
  }
}