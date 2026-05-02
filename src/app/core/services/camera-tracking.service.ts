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

  private fueraDeEncuadreStart: number | null = null;
  private desvioMiradaStart: number | null = null;

  private alertaFueraEncuadreEmitida = false;
  private alertaDesvioMiradaEmitida = false;

  private readonly UMBRAL_MS = 1000;

  private gazeBaseline: { h: number; v: number; headPitch: number; headYaw: number } | null = null;
  private calibrationSamples: { h: number; v: number; headPitch: number; headYaw: number }[] = [];
  private readonly CALIBRATION_FRAMES = 15;
  private calibrated = false;

  private readonly GAZE_H_THRESHOLD = 0.08;
  private readonly GAZE_V_THRESHOLD = 0.09;
  private readonly HEAD_PITCH_THRESHOLD = 0.06;
  private readonly HEAD_YAW_THRESHOLD = 0.08;
  private readonly FALLBACK_H_MIN = 0.32;
  private readonly FALLBACK_H_MAX = 0.68;
  private readonly FALLBACK_V_MIN = 0.30;
  private readonly FALLBACK_V_MAX = 0.78;
  private readonly FALLBACK_YAW = 0.18;
  private readonly FALLBACK_PITCH = 0.28;

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
    this.calibrated = false;
    this.gazeBaseline = null;
    this.calibrationSamples = [];

    this.cameraStatus$.next('idle');
  }

  pausar(): void {
    this.running = false;
    if (this.detectionInterval) {
      clearInterval(this.detectionInterval);
      this.detectionInterval = null;
    }
    this.calibrated = false;
    this.gazeBaseline = null;
    this.calibrationSamples = [];
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

  private iniciarDeteccion(): void {
    if (this.running) return;
    this.running = true;

    let lastTimestamp = -1;

    this.detectionInterval = setInterval(async () => {
      if (!this.running || !this.videoElement || !this.faceLandmarker || !this.modelsLoaded) return;
      if (this.videoElement.readyState < 2) return;

      try {
        const timestamp = performance.now();

        if (timestamp <= lastTimestamp) return;
        lastTimestamp = timestamp;

        const result: FaceLandmarkerResult = this.faceLandmarker.detectForVideo(
          this.videoElement,
          timestamp
        );

        this.ngZone.run(() => {
          this.procesarDetecciones(result);
        });
      } catch (e) {}
    }, 500);
  }

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

  private validarRostroCentrado(landmarks: NormalizedLandmark[]): boolean {
    const NOSE_TIP  = landmarks[1];
    const JAW_LEFT  = landmarks[234];
    const JAW_RIGHT = landmarks[454];
    const FOREHEAD  = landmarks[10];
    const CHIN      = landmarks[152];

    if (!NOSE_TIP || !JAW_LEFT || !JAW_RIGHT || !FOREHEAD || !CHIN) return false;

    const faceCenterX = (JAW_LEFT.x + JAW_RIGHT.x) / 2;
    const faceWidth   = Math.abs(JAW_RIGHT.x - JAW_LEFT.x) + 0.001;
    const yawOffset   = Math.abs(NOSE_TIP.x - faceCenterX) / faceWidth;

    const faceCenterY = (FOREHEAD.y + CHIN.y) / 2;
    const faceHeight  = Math.abs(CHIN.y - FOREHEAD.y) + 0.001;
    const pitchOffset = Math.abs(NOSE_TIP.y - faceCenterY) / faceHeight;

    const narizCentradaEnPantalla = NOSE_TIP.x > 0.25 && NOSE_TIP.x < 0.75;
    const cabezaRecta = yawOffset < 0.15 && pitchOffset < 0.25;

    return narizCentradaEnPantalla && cabezaRecta;
  }

  private analizarMirada(landmarks: NormalizedLandmark[]): boolean {
    if (!landmarks || landmarks.length < 478) return true;

    try {
      const datos = this.calcularGazeRatios(landmarks);
      if (!datos) return true;

      if (!this.calibrated) {
        const rostroValido = this.validarRostroCentrado(landmarks);

        if (rostroValido) {
          this.calibrationSamples.push(datos);
        }

        if (this.calibrationSamples.length >= this.CALIBRATION_FRAMES) {
          const len = this.calibrationSamples.length;
          this.gazeBaseline = {
            h: this.calibrationSamples.reduce((s, g) => s + g.h, 0) / len,
            v: this.calibrationSamples.reduce((s, g) => s + g.v, 0) / len,
            headPitch: this.calibrationSamples.reduce((s, g) => s + g.headPitch, 0) / len,
            headYaw: this.calibrationSamples.reduce((s, g) => s + g.headYaw, 0) / len,
          };
          this.calibrated = true;
          console.log('Gaze calibrado — baseline:', this.gazeBaseline);
        }

        const hOk = datos.h > this.FALLBACK_H_MIN && datos.h < this.FALLBACK_H_MAX;
        const vOk = datos.v > this.FALLBACK_V_MIN && datos.v < this.FALLBACK_V_MAX;
        const yawOk = Math.abs(datos.headYaw) < this.FALLBACK_YAW;
        const pitchOk = Math.abs(datos.headPitch) < this.FALLBACK_PITCH;

        return hOk && vOk && yawOk && pitchOk;
      }

      const dH = Math.abs(datos.h - this.gazeBaseline!.h);
      const dV = Math.abs(datos.v - this.gazeBaseline!.v);
      const dPitch = Math.abs(datos.headPitch - this.gazeBaseline!.headPitch);
      const dYaw = Math.abs(datos.headYaw - this.gazeBaseline!.headYaw);

      const irisOk = dH < this.GAZE_H_THRESHOLD && dV < this.GAZE_V_THRESHOLD;
      const headOk = dPitch < this.HEAD_PITCH_THRESHOLD && dYaw < this.HEAD_YAW_THRESHOLD;

      return irisOk && headOk;
    } catch (e) {
      console.warn('Error analizando mirada:', e);
      return true;
    }
  }

  private calcularGazeRatios(landmarks: NormalizedLandmark[]): { h: number; v: number; headPitch: number; headYaw: number } | null {
    const LEFT_IRIS  = landmarks[468];
    const RIGHT_IRIS = landmarks[473];

    const LEFT_EYE_LEFT   = landmarks[33];
    const LEFT_EYE_RIGHT  = landmarks[133];
    const LEFT_EYE_TOP    = landmarks[159];
    const LEFT_EYE_BOTTOM = landmarks[145];

    const RIGHT_EYE_LEFT   = landmarks[362];
    const RIGHT_EYE_RIGHT  = landmarks[263];
    const RIGHT_EYE_TOP    = landmarks[386];
    const RIGHT_EYE_BOTTOM = landmarks[374];

    const NOSE_TIP  = landmarks[1];
    const FOREHEAD  = landmarks[10];
    const CHIN      = landmarks[152];
    const JAW_LEFT  = landmarks[234];
    const JAW_RIGHT = landmarks[454];

    if (!LEFT_IRIS || !RIGHT_IRIS || !NOSE_TIP || !FOREHEAD || !CHIN || !JAW_LEFT || !JAW_RIGHT) return null;

    const leftH  = (LEFT_IRIS.x  - LEFT_EYE_LEFT.x)  / (LEFT_EYE_RIGHT.x  - LEFT_EYE_LEFT.x  + 0.001);
    const rightH = (RIGHT_IRIS.x - RIGHT_EYE_LEFT.x) / (RIGHT_EYE_RIGHT.x - RIGHT_EYE_LEFT.x + 0.001);

    const leftV  = (LEFT_IRIS.y  - LEFT_EYE_TOP.y)  / (LEFT_EYE_BOTTOM.y  - LEFT_EYE_TOP.y  + 0.001);
    const rightV = (RIGHT_IRIS.y - RIGHT_EYE_TOP.y) / (RIGHT_EYE_BOTTOM.y - RIGHT_EYE_TOP.y + 0.001);

    const faceCenterX = (JAW_LEFT.x + JAW_RIGHT.x) / 2;
    const faceWidth   = Math.abs(JAW_RIGHT.x - JAW_LEFT.x) + 0.001;
    const headYaw     = (NOSE_TIP.x - faceCenterX) / faceWidth;

    const faceCenterY = (FOREHEAD.y + CHIN.y) / 2;
    const faceHeight  = Math.abs(CHIN.y - FOREHEAD.y) + 0.001;
    const headPitch   = (NOSE_TIP.y - faceCenterY) / faceHeight;

    return {
      h: (leftH + rightH) / 2,
      v: (leftV + rightV) / 2,
      headPitch,
      headYaw,
    };
  }

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