import { Component, signal, computed, inject, OnInit } from '@angular/core';
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
export class ConfiguracionComponent implements OnInit {

  private router   = inject(Router);
  private focusSvc = inject(FocusService);

  // Estado reactivo de preferencias
  preferencias = signal({
    modo: '',
    duracion: 45  // Valor por defecto
  });

  mostrarCompletado   = signal(false);
  mostrarSesionActiva = signal(false);
  haySesionActiva = signal(false);

  // Bloquea guardar si no hay modo seleccionado
  botonBloqueado = computed(() => this.preferencias().modo === '');

  ngOnInit() {
    this.cargarPreferenciasGuardadas();
    this.verificarSesionActiva();
  }

  private cargarPreferenciasGuardadas() {
    // Cargar desde localStorage
    const localPrefs = this.focusSvc.getPreferenciasLocal();
    if (localPrefs) {
      this.preferencias.set({
        modo: localPrefs.mode,
        duracion: localPrefs.duration
      });
    } else {
      // Valores por defecto
      this.preferencias.set({
        modo: 'tranquilo',
        duracion: 45
      });
    }
  }

  private verificarSesionActiva() {
    this.focusSvc.getActiveSession().subscribe({
      next: (session) => {
        this.haySesionActiva.set(!!session);
      },
      error: () => {
        this.haySesionActiva.set(false);
      }
    });
  }

  seleccionarModo(modo: string) {
    this.preferencias.update(prev => ({ ...prev, modo }));
  }

  actualizarDuracion(valor: number) {
    this.preferencias.update(prev => ({ ...prev, duracion: valor }));
  }

  async guardar() {
    if (this.botonBloqueado()) return;

    const prefs = {
      mode: this.preferencias().modo,
      duration: this.preferencias().duracion
    };

    try {
      // Guardar en localStorage primero
      this.focusSvc.guardarPreferenciasLocal(prefs);
      
      // Intentar guardar en backend
      await this.focusSvc.savePreferences(prefs.mode, prefs.duration).toPromise();
      
      // Mostrar mensaje según si hay sesión activa y redirigir al dashboard
      if (this.haySesionActiva()) {
        this.mostrarSesionActiva.set(true);
        setTimeout(() => {
          this.mostrarSesionActiva.set(false);
          this.router.navigate(['/dashboard']);
        }, 1000);
      } else {
        this.mostrarCompletado.set(true);
        setTimeout(() => {
          this.mostrarCompletado.set(false);
          this.router.navigate(['/dashboard']);
        }, 1000);
      }
    } catch (error) {
      console.error('Error guardando preferencias:', error);
      // Aún así, las preferencias quedan en localStorage y se redirige
      this.mostrarCompletado.set(true);
      setTimeout(() => {
        this.mostrarCompletado.set(false);
        this.router.navigate(['/dashboard']);
      }, 1000);
    }
  }

  volver() {
    this.router.navigate(['/dashboard']);
  }
}