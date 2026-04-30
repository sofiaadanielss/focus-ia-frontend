import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { DistractionLogService, DistractionType } from './distracion-log.service';
import { FaceLandmarker, FilesetResolver, NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision';

export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

export interface ToastEvent {
  tipo: DistractionType;
  mensaje: string;
  visible: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class CameraTrackingService {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private canvasElement: HTMLCanvasElement | null = null;
  private detectionInterval: any = null;
  private running = false;

  private faceLandmarker: any = null;
  private modelsLoaded = false;

  // Timers de distracción
  private fueraDeEncuadreStart: number | null = null;
  private desvioMiradaStart: number | null = null;

  private alertaFueraEncuadreEmitida = false;
  private alertaDesvioMiradaEmitida = false;

  // Umbral en ms
  private readonly UMBRAL_MS = 500;

  // ── Índices de landmarks MediaPipe que usamos ──
  // 478 puntos totales — solo necesitamos estos 5:
  private readonly LM_NOSE_TIP   = 1;    // punta de la nariz
  private readonly LM_JAW_LEFT   = 234;  // extremo izquierdo del mentón
  private readonly LM_JAW_RIGHT  = 454;  // extremo derecho del mentón
  private readonly LM_EYE_LEFT   = 33;   // esquina interna ojo izquierdo
  private readonly LM_EYE_RIGHT  = 263;  // esquina interna ojo derecho

  toast$ = new Subject<ToastEvent>();
  cameraStatus$ = new Subject<CameraStatus>();

  constructor(
    private ngZone: NgZone,
    private distractionLog: DistractionLogService
  ) {}

  async iniciar(videoEl: HTMLVideoElement, canvasEl: HTMLCanvasElement): Promise<boolean> {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl;
    this.cameraStatus$.next('requesting');

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      this.cameraStatus$.next('active');
      await this.cargarMediaPipe();
      this.iniciarDeteccion();
      return true;
    } catch (err: any) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        this.cameraStatus$.next('denied');
      } else {
        this.cameraStatus$.next('error');
      }
      return false;
    }
  }

  detener(): void {
    this.running = false;

    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }

    this.actualizarDuracionFinalSiCorresponde('fuera_de_encuadre', this.fueraDeEncuadreStart, this.alertaFueraEncuadreEmitida);
    this.actualizarDuracionFinalSiCorresponde('desvio_mirada', this.desvioMiradaStart, this.alertaDesvioMiradaEmitida);

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this.fueraDeEncuadreStart = null;
    this.desvioMiradaStart = null;
    this.alertaFueraEncuadreEmitida = false;
    this.alertaDesvioMiradaEmitida = false;

    this.cameraStatus$.next('idle');
  }

  pausar(): void {
    this.running = false;
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
  }

  reanudar(): void {
    if (this.stream && this.modelsLoaded) {
      this.iniciarDeteccion();
    }
  }


private async cargarMediaPipe(): Promise<void> {
  if (this.modelsLoaded) return;

  try {
    const filesetResolver = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: '/assets/models/face_landmarker.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numFaces: 1
    });

    this.modelsLoaded = true;
    console.log('MediaPipe Face Landmarker cargado correctamente');
  } catch (err) {
    console.error('Error cargando MediaPipe (GPU), intentando CPU...', err);
    try {
      const filesetResolver = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
      );

      this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: '/assets/models/face_landmarker.task',
          delegate: 'CPU'
        },
        runningMode: 'VIDEO',
        numFaces: 1
      });

      this.modelsLoaded = true;
      console.log('MediaPipe cargado en modo CPU (fallback)');
    } catch (err2) {
      console.error('No se pudo cargar MediaPipe ni en CPU:', err2);
    }
  }
}

  // ── Loop de detección ──
  private iniciarDeteccion(): void {
    if (this.running) return;
    this.running = true;

    let lastTimestamp = -1;

    this.detectionInterval = setInterval(async () => {
      if (!this.running || !this.videoElement || !this.faceLandmarker || !this.modelsLoaded) return;
      if (this.videoElement.readyState < 2) return; // video aún no listo

      try {
        const timestamp = performance.now();

        // MediaPipe requiere timestamps estrictamente crecientes
        if (timestamp <= lastTimestamp) return;
        lastTimestamp = timestamp;

        const result: FaceLandmarkerResult = this.faceLandmarker.detectForVideo(
          this.videoElement,
          timestamp
        );

        this.ngZone.run(() => {
          this.procesarDetecciones(result);
        });
      } catch (e) {
        // Silenciar errores intermitentes de frame
      }
    }, 500);
  }

  // ── Procesamiento de resultados ──
  private procesarDetecciones(result: FaceLandmarkerResult): void {
    const ahora = Date.now();
    const hayRostro = result.faceLandmarks && result.faceLandmarks.length > 0;

    if (!hayRostro) {
      this.procesarFueraDeEncuadre(ahora);
      this.resetDesvioMirada();
    } else {
      this.resetFueraDeEncuadre();

      const landmarks = result.faceLandmarks[0];
      const mirandoPantalla = this.analizarMirada(landmarks);

      if (!mirandoPantalla) {
        this.procesarDesvioMirada(ahora);
      } else {
        this.resetDesvioMirada();
      }
    }
  }

  // ── Análisis de mirada con índices MediaPipe ──
  private analizarMirada(landmarks: NormalizedLandmark[]): boolean {
    if (!landmarks || landmarks.length < 478) return true;

    try {
      const noseTip   = landmarks[this.LM_NOSE_TIP];
      const jawLeft   = landmarks[this.LM_JAW_LEFT];
      const jawRight  = landmarks[this.LM_JAW_RIGHT];
      const eyeLeft   = landmarks[this.LM_EYE_LEFT];
      const eyeRight  = landmarks[this.LM_EYE_RIGHT];

      if (!noseTip || !jawLeft || !jawRight || !eyeLeft || !eyeRight) return true;

      const faceCenterX = (jawLeft.x + jawRight.x) / 2;
      const faceWidth   = Math.abs(jawRight.x - jawLeft.x);

      const desvioHorizontal = Math.abs(noseTip.x - faceCenterX) / (faceWidth || 1);

      const eyeCenterY  = (eyeLeft.y + eyeRight.y) / 2;
      const faceHeight  = Math.abs(noseTip.y - eyeCenterY);
      const desvioVertical = (noseTip.y - eyeCenterY) / (faceHeight || 1);

      const mirandoHorizontal = desvioHorizontal < 0.38;
      const mirandoVertical   = desvioVertical > 0 && desvioVertical < 2.5;

      return mirandoHorizontal && mirandoVertical;
    } catch (e) {
      console.warn('Error analizando mirada:', e);
      return true;
    }
  }

  // ── Fuera de encuadre ──
  private procesarFueraDeEncuadre(ahora: number): void {
    if (this.fueraDeEncuadreStart === null) {
      this.fueraDeEncuadreStart = ahora;
      this.alertaFueraEncuadreEmitida = false;
    }

    const duracion = ahora - this.fueraDeEncuadreStart;

    if (duracion >= this.UMBRAL_MS && !this.alertaFueraEncuadreEmitida) {
      this.alertaFueraEncuadreEmitida = true;
      this.distractionLog.registrarEvento('fuera_de_encuadre', duracion / 1000);
      this.toast$.next({
        tipo: 'fuera_de_encuadre',
        mensaje: 'No se detecta tu rostro',
        visible: true
      });
    }
  }

  private resetFueraDeEncuadre(): void {
    if (this.fueraDeEncuadreStart !== null) {
      const duracionTotal = (Date.now() - this.fueraDeEncuadreStart) / 1000;
      if (this.alertaFueraEncuadreEmitida && duracionTotal >= 1) {
        const eventos = this.distractionLog.getEventosPorTipo('fuera_de_encuadre');
        if (eventos.length > 0) {
          eventos[eventos.length - 1].duracion_segundos = Math.round(duracionTotal);
        }
      }
      this.fueraDeEncuadreStart = null;
      this.alertaFueraEncuadreEmitida = false;
      this.toast$.next({
        tipo: 'fuera_de_encuadre',
        mensaje: '',
        visible: false
      });
    }
  }

  // ── Desvío de mirada ──
  private procesarDesvioMirada(ahora: number): void {
    if (this.desvioMiradaStart === null) {
      this.desvioMiradaStart = ahora;
      this.alertaDesvioMiradaEmitida = false;
    }

    const duracion = ahora - this.desvioMiradaStart;

    if (duracion >= this.UMBRAL_MS && !this.alertaDesvioMiradaEmitida) {
      this.alertaDesvioMiradaEmitida = true;
      this.distractionLog.registrarEvento('desvio_mirada', duracion / 1000);
      this.toast$.next({
        tipo: 'desvio_mirada',
        mensaje: 'Desvío de mirada detectado',
        visible: true
      });
    }
  }

  private resetDesvioMirada(): void {
    if (this.desvioMiradaStart !== null) {
      const duracionTotal = (Date.now() - this.desvioMiradaStart) / 1000;
      if (this.alertaDesvioMiradaEmitida && duracionTotal >= 1) {
        const eventos = this.distractionLog.getEventosPorTipo('desvio_mirada');
        if (eventos.length > 0) {
          eventos[eventos.length - 1].duracion_segundos = Math.round(duracionTotal);
        }
      }
      this.desvioMiradaStart = null;
      this.alertaDesvioMiradaEmitida = false;
      this.toast$.next({
        tipo: 'desvio_mirada',
        mensaje: '',
        visible: false
      });
    }
  }

  private actualizarDuracionFinalSiCorresponde(tipo: DistractionType, startTime: number | null, alertaEmitida: boolean): void {
    if (startTime !== null && alertaEmitida) {
      const duracionFinal = (Date.now() - startTime) / 1000;
      if (duracionFinal >= 1) {
        const eventos = this.distractionLog.getEventosPorTipo(tipo);
        if (eventos.length > 0) {
          eventos[eventos.length - 1].duracion_segundos = Math.round(duracionFinal);
        }
      }
    }
  }
}