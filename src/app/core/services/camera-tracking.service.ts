import { Injectable, NgZone } from '@angular/core';
import { Subject } from 'rxjs';
import { DistractionLogService, DistractionType } from './distracion-log.service';

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

  // Face-api.js se carga dinámicamente
  private faceapi: any = null;
  private modelsLoaded = false;

  // Timers de distracción
  private fueraDeEncuadreStart: number | null = null;
  private desvioMiradaStart: number | null = null;

  // Flags para evitar múltiples alertas por el mismo evento continuo
  private alertaFueraEncuadreEmitida = false;
  private alertaDesvioMiradaEmitida = false;

  // Umbral en ms (5 segundos)
  private readonly UMBRAL_MS = 5000;

  // Observable para toasts
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
      await this.cargarFaceApi();
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

    // Registrar distracción pendiente si quedó activa
    this.finalizarDistraccionPendiente('fuera_de_encuadre', this.fueraDeEncuadreStart);
    this.finalizarDistraccionPendiente('desvio_mirada', this.desvioMiradaStart);

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

  private async cargarFaceApi(): Promise<void> {
    if (this.modelsLoaded) return;

    // Cargar face-api.js desde CDN
    await this.cargarScript('https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js');
    this.faceapi = (window as any).faceapi;

    if (!this.faceapi) {
      console.error('face-api.js no se pudo cargar');
      return;
    }

    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/';

    await Promise.all([
      this.faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      this.faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL)
    ]);

    this.modelsLoaded = true;
  }

  private cargarScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
      document.head.appendChild(script);
    });
  }

  private iniciarDeteccion(): void {
    if (this.running) return;
    this.running = true;

    // Detección cada 500ms
    this.detectionInterval = setInterval(async () => {
      if (!this.running || !this.videoElement || !this.faceapi || !this.modelsLoaded) return;

      try {
        const detections = await this.faceapi
          .detectAllFaces(this.videoElement, new this.faceapi.TinyFaceDetectorOptions({
            inputSize: 224,
            scoreThreshold: 0.4
          }))
          .withFaceLandmarks(true);

        this.ngZone.run(() => {
          this.procesarDetecciones(detections);
        });
      } catch (e) {
        // Silenciar errores de detección intermitentes
      }
    }, 500);
  }

  private procesarDetecciones(detections: any[]): void {
    const ahora = Date.now();

    if (!detections || detections.length === 0) {
      // No se detectó rostro
      this.procesarFueraDeEncuadre(ahora);
      // Si no hay rostro, resetear desvío de mirada
      this.resetDesvioMirada();
    } else {
      // Rostro detectado
      this.resetFueraDeEncuadre();

      // Analizar dirección de la mirada
      const landmarks = detections[0].landmarks;
      const mirandoPantalla = this.analizarMirada(landmarks);

      if (!mirandoPantalla) {
        this.procesarDesvioMirada(ahora);
      } else {
        this.resetDesvioMirada();
      }
    }
  }

  private analizarMirada(landmarks: any): boolean {
    if (!landmarks) return true;

    try {
      const nose = landmarks.getNose();
      const jaw = landmarks.getJawOutline();
      const leftEye = landmarks.getLeftEye();
      const rightEye = landmarks.getRightEye();

      if (!nose || !jaw || !leftEye || !rightEye) return true;

      // Centro de la nariz
      const noseTop = nose[0];
      const noseTip = nose[3] || nose[nose.length - 1];

      // Centro del rostro horizontal (basado en jaw)
      const jawLeft = jaw[0];
      const jawRight = jaw[jaw.length - 1];
      const faceCenterX = (jawLeft.x + jawRight.x) / 2;
      const faceWidth = Math.abs(jawRight.x - jawLeft.x);

      // Si la nariz está muy desviada del centro del rostro, el usuario mira a un lado
      const desvioHorizontal = Math.abs(noseTip.x - faceCenterX) / (faceWidth || 1);

      // Calcular inclinación vertical
      const eyeCenterY = (leftEye[0].y + rightEye[0].y) / 2;
      const faceHeight = Math.abs(noseTip.y - eyeCenterY);
      const desvioVertical = (noseTip.y - eyeCenterY) / (faceHeight || 1);

      // Umbrales: si desvía mucho horizontal o vertical, no mira la pantalla
      const mirandoHorizontal = desvioHorizontal < 0.38;
      const mirandoVertical = desvioVertical > 0 && desvioVertical < 2.5;

      return mirandoHorizontal && mirandoVertical;
    } catch {
      return true; // En caso de error, asumir que mira
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
      if (this.alertaFueraEncuadreEmitida) {
        // Actualizar duración final
        const duracionFinal = (Date.now() - this.fueraDeEncuadreStart) / 1000;
        const eventos = this.distractionLog.getEventosPorTipo('fuera_de_encuadre');
        if (eventos.length > 0) {
          eventos[eventos.length - 1].duracion_segundos = Math.round(duracionFinal);
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
      if (this.alertaDesvioMiradaEmitida) {
        const duracionFinal = (Date.now() - this.desvioMiradaStart) / 1000;
        const eventos = this.distractionLog.getEventosPorTipo('desvio_mirada');
        if (eventos.length > 0) {
          eventos[eventos.length - 1].duracion_segundos = Math.round(duracionFinal);
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

  private finalizarDistraccionPendiente(tipo: DistractionType, startTime: number | null): void {
    if (startTime !== null) {
      const duracion = (Date.now() - startTime) / 1000;
      if (duracion >= 5) {
        // Actualizar duración final del último evento de este tipo
        const eventos = this.distractionLog.getEventosPorTipo(tipo);
        if (eventos.length > 0) {
          eventos[eventos.length - 1].duracion_segundos = Math.round(duracion);
        }
      }
    }
  }
}
