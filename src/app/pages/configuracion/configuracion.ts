import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FocusService, Preference } from '../../core/services/focus.service';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  templateUrl: './configuracion.html',
  styleUrls: ['./configuracion.css']
})
export class ConfiguracionComponent {
  duracion: number = 25;
  modoSeleccionado: string = '';
  mensajeConfirmacion: boolean = false;
  guardando: boolean = false;

  modos = [
    { id: 'tranquilo', texto: 'Tranquilo' },
    { id: 'alerta', texto: 'Alerta' },
    { id: 'absoluta', texto: 'Concentración absoluta' }
  ];

  constructor(
    private focusService: FocusService,
    private router: Router) {
    this.cargarPreferencias();
  }

  cargarPreferencias() {
    
    this.focusService.getPreferences().subscribe({
      next: (prefs) => {
        this.modoSeleccionado = prefs.mode;
        this.duracion = prefs.duration;
      },
      error: () => {
        
        const localPrefs = this.focusService.getPreferenciasLocal();
        if (localPrefs) {
          this.modoSeleccionado = localPrefs.mode;
          this.duracion = localPrefs.duration;
        }
      }
    });
  }

  seleccionarModo(id: string) {
    this.modoSeleccionado = id;
  }

  guardar() {
    if (!this.modoSeleccionado || this.guardando) return;
    
    this.guardando = true;
    
    const preferencias: Preference = {
      mode: this.modoSeleccionado,
      duration: this.duracion
    };

    this.focusService.guardarPreferencias(preferencias).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        console.error('Error:', err);
        this.router.navigate(['/dashboard']);  
      }
    });
  }
}