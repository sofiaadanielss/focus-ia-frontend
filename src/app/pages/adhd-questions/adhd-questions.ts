import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { FocusService } from '../../core/services/focus.service';

interface Pregunta {
  id: number;
  texto: string;
  dimension: 'inatencion' | 'hiperactividad';
}

type Respuesta = 'de_acuerdo' | 'en_desacuerdo' | null;

const PREGUNTAS: Pregunta[] = [
  { id: 1,  texto: 'Puedo poner en orden mis cosas fácilmente cuando una tarea requiere organización.', dimension: 'inatencion' },
  { id: 2,  texto: 'Presto atención a los detalles y evito cometer errores por descuido en mi trabajo o actividades.', dimension: 'inatencion' },
  { id: 3,  texto: 'Me resulta fácil mantener la atención en tareas largas o actividades recreativas.', dimension: 'inatencion' },
  { id: 4,  texto: 'Cuando alguien me habla directamente, le escucho con atención.', dimension: 'inatencion' },
  { id: 5,  texto: 'Suelo terminar las tareas que comienzo y cumplo con mis compromisos sin dejarlos a medias.', dimension: 'inatencion' },
  { id: 6,  texto: 'No me cuesta empezar tareas que requieren mucho esfuerzo o concentración mental.', dimension: 'inatencion' },
  { id: 7,  texto: 'Raramente pierdo objetos necesarios para mis actividades (llaves, teléfono, billetera, documentos).', dimension: 'inatencion' },
  { id: 8,  texto: 'Me concentro con facilidad y no me distraigo ante estímulos externos mientras trabajo.', dimension: 'inatencion' },
  { id: 9,  texto: 'Recuerdo fácilmente mis citas, obligaciones y actividades cotidianas.', dimension: 'inatencion' },
  { id: 10, texto: 'Puedo estar sentado tranquilamente durante largos periodos sin sentir inquietud en manos o pies.', dimension: 'hiperactividad' },
  { id: 11, texto: 'Raramente me levanto de mi lugar cuando se espera que permanezca sentado (reuniones, clases, etc.).', dimension: 'hiperactividad' },
  { id: 12, texto: 'No experimento una sensación de inquietud o necesidad de estar en movimiento constante.', dimension: 'hiperactividad' },
  { id: 13, texto: 'Puedo participar en actividades de ocio o entretenimiento de forma tranquila y sin agitarme.', dimension: 'hiperactividad' },
  { id: 14, texto: 'No siento que actúo como si tuviera un motor interno que me impulsa a moverme o hablar.', dimension: 'hiperactividad' },
  { id: 15, texto: 'No hablo en exceso ni interrumpo las conversaciones de los demás de forma inapropiada.', dimension: 'hiperactividad' },
  { id: 16, texto: 'Espero a que las personas terminen sus preguntas u oraciones antes de responder.', dimension: 'hiperactividad' },
  { id: 17, texto: 'Me resulta fácil esperar mi turno, ya sea en conversaciones, filas o actividades grupales.', dimension: 'hiperactividad' },
  { id: 18, texto: 'Evito interrumpir o entrometerme en lo que hacen o dicen otras personas.', dimension: 'hiperactividad' },
];

const PREGUNTAS_POR_PAGINA = 4;

@Component({
  selector: 'app-adhd-questions',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './adhd-questions.html',
})
export class AdhdQuestions implements OnInit {
  readonly preguntas = PREGUNTAS;
  readonly totalPreguntas = PREGUNTAS.length;
  readonly preguntasPorPagina = PREGUNTAS_POR_PAGINA;

  paginaActual = signal(0);
  respuestas = signal<Map<number, Respuesta>>(new Map());
  enviando = signal(false);
  errorServidor = signal('');
  completado = signal(false);

  totalPaginas = computed(() =>
    Math.ceil(this.totalPreguntas / this.preguntasPorPagina)
  );

  preguntasPaginaActual = computed(() => {
    const inicio = this.paginaActual() * this.preguntasPorPagina;
    return this.preguntas.slice(inicio, inicio + this.preguntasPorPagina);
  });

  paginaCompleta = computed(() => {
    const resp = this.respuestas();
    return this.preguntasPaginaActual().every(p => resp.get(p.id) !== null && resp.get(p.id) !== undefined);
  });

  numeroPaginaDisplay = computed(() => this.paginaActual() + 1);

  constructor(
    private router: Router,
    private http: HttpClient,
    private focusSvc: FocusService
  ) {}

  // Returns a user-scoped localStorage key so different users on the
  // same browser each get their own quiz completion flag.
  private getQuizKey(): string {
    try {
      const token = localStorage.getItem('access_token');
      const userId = token ? JSON.parse(atob(token.split('.')[1]))?.sub : null;
      return userId ? `tdah_cuestionario_completado_${userId}` : 'tdah_cuestionario_completado';
    } catch {
      return 'tdah_cuestionario_completado';
    }
  }

  ngOnInit() {
    if (localStorage.getItem(this.getQuizKey()) === 'true') {
      this.router.navigate(['/dashboard']);
      return;
    }

    const mapa = new Map<number, Respuesta>();
    this.preguntas.forEach(p => mapa.set(p.id, null));
    this.respuestas.set(mapa);
  }

  responder(preguntaId: number, valor: 'de_acuerdo' | 'en_desacuerdo') {
    const nuevo = new Map(this.respuestas());
    nuevo.set(preguntaId, valor);
    this.respuestas.set(nuevo);
  }

  getRespuesta(preguntaId: number): Respuesta {
    return this.respuestas().get(preguntaId) ?? null;
  }

  siguientePagina() {
    if (!this.paginaCompleta()) return;

    const esPagina = this.paginaActual() < this.totalPaginas() - 1;
    if (esPagina) {
      this.paginaActual.update(p => p + 1);
      this.errorServidor.set('');
    } else {
      this.enviarResultados();
    }
  }

  esUltimaPagina = computed(() => this.paginaActual() === this.totalPaginas() - 1);

  private calcularResultados() {
    const resp = this.respuestas();

    let puntajeInatencion = 0;
    let puntajeHiperactividad = 0;

    this.preguntas.forEach(p => {
      if (resp.get(p.id) === 'en_desacuerdo') {
        if (p.dimension === 'inatencion') puntajeInatencion++;
        else puntajeHiperactividad++;
      }
    });

    const total = puntajeInatencion + puntajeHiperactividad;

    let nivel: string;
    if (total <= 3) nivel = 'Muy bajo';
    else if (total <= 7) nivel = 'Bajo';
    else if (total <= 11) nivel = 'Moderado';
    else if (total <= 15) nivel = 'Alto';
    else nivel = 'Muy alto';

    return {
      puntaje_inatencion: puntajeInatencion,
      puntaje_hiperactividad: puntajeHiperactividad,
      puntaje_total: total,
      nivel_interpretacion: nivel,
      respuestas: Object.fromEntries(
        [...resp.entries()].map(([k, v]) => [k, v])
      ),
    };
  }

  private nivelAModo(nivel: string): 'tranquilo' | 'alerta' | 'absoluta' {
    if (nivel === 'Muy bajo' || nivel === 'Bajo') return 'tranquilo';
    if (nivel === 'Moderado') return 'alerta';
    return 'absoluta';
  }

  private nivelADuracion(nivel: string): number {
    if (nivel === 'Muy bajo' || nivel === 'Bajo') return 50;
    if (nivel === 'Moderado') return 35;
    return 25;
  }

  duracionRecomendada = computed(() => {
    const resultados = this.calcularResultados();
    return this.nivelADuracion(resultados.nivel_interpretacion);
  });

  nivelResultado = computed(() => this.calcularResultados().nivel_interpretacion);

  private enviarResultados() {
    this.enviando.set(true);
    this.errorServidor.set('');

    const token = localStorage.getItem('access_token');
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    const payload = this.calcularResultados();

    this.http
      .post(`${environment.apiUrl}/tdah/resultados`, payload, { headers })
      .subscribe({
        next: () => {
          const modoRecomendado = this.nivelAModo(payload.nivel_interpretacion);
          const duracion = this.nivelADuracion(payload.nivel_interpretacion);
          this.focusSvc.guardarPreferenciasLocal({ mode: modoRecomendado, duration: duracion });
          this.focusSvc.savePreferences(modoRecomendado, duracion).subscribe();

          localStorage.setItem(this.getQuizKey(), 'true');
          this.enviando.set(false);
          this.completado.set(true);
        },
        error: (err) => {
          const modoRecomendado = this.nivelAModo(payload.nivel_interpretacion);
          const duracion = this.nivelADuracion(payload.nivel_interpretacion);
          this.focusSvc.guardarPreferenciasLocal({ mode: modoRecomendado, duration: duracion });

          localStorage.setItem(this.getQuizKey(), 'true');
          this.enviando.set(false);
          console.warn('TDAH submit error (non-blocking):', err);
          this.completado.set(true);
        },
      });
  }

  irAlDashboard() {
    this.router.navigate(['/dashboard']);
  }

  modoRecomendado = computed(() => {
    const resultados = this.calcularResultados();
    return this.nivelAModo(resultados.nivel_interpretacion);
  });

  modoLabel = computed(() => {
    const modos: Record<string, string> = {
      tranquilo: ' Tranquilo',
      alerta: ' Alerta',
      absoluta: ' Concentración absoluta',
    };
    return modos[this.modoRecomendado()] ?? this.modoRecomendado();
  });
}