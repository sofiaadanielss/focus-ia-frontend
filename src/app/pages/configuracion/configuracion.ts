import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FocusService } from '../../core/services/focus.service';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracion.html',
  styleUrls: ['./configuracion.css']
})
export class ConfiguracionComponent {

  private router   = inject(Router);
  private focusSvc = inject(FocusService);

  // Estado reactivo de preferencias
  preferencias = signal({
    modo: '',
    duracion: 15
  });

  mostrarCompletado   = signal(false);
  mostrarSesionActiva = signal(false);

  // Bloquea guardar si no hay modo seleccionado
  botonBloqueado = computed(() => this.preferencias().modo === '');

  seleccionarModo(modo: string) {
    this.preferencias.update(prev => ({ ...prev, modo }));
  }

  actualizarDuracion(valor: number) {
    this.preferencias.update(prev => ({ ...prev, duracion: valor }));
  }

  guardar() {
    if (this.botonBloqueado()) return;

    // Verificar si hay sesión activa antes de guardar
    this.focusSvc.getActiveSession().subscribe({
      next: (session) => {
        const haySession = !!session;

        // Guardar preferencias (simulación — aquí iría el llamado real a la API)
        console.log('Guardando preferencias:', this.preferencias());

        // Mostrar mensaje según si hay sesión activa o no
        if (haySession) {
          // La sesión sigue corriendo — solo actualizamos preferencias
          this.mostrarSesionActiva.set(true);
          setTimeout(() => this.mostrarSesionActiva.set(false), 4000);
        } else {
          this.mostrarCompletado.set(true);
          setTimeout(() => this.mostrarCompletado.set(false), 3000);
        }
      },
      error: () => {
        // Si falla la consulta igual guardamos las preferencias
        console.log('Guardando preferencias (sin verificar sesión):', this.preferencias());
        this.mostrarCompletado.set(true);
        setTimeout(() => this.mostrarCompletado.set(false), 3000);
      }
    });
  }

  volver() {
    this.router.navigate(['/dashboard']);
  }
}