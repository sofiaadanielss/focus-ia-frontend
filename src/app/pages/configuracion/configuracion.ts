import { Component } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  templateUrl: './configuracion.html',
  styleUrls: ['./configuracion.css']
})
export class ConfiguracionComponent {
  duracion: number = 45;
  modoSeleccionado: string = '';
  mensajeConfirmacion: boolean = false;
  guardando: boolean = false;

  modos = [
    { id: 'tranquilo', texto: 'Tranquilo' },
    { id: 'alerta', texto: 'Alerta' },
    { id: 'absoluta', texto: 'Concentración absoluta' }
  ];

  constructor(private router: Router) {
    this.cargarPreferencias();
  }

  cargarPreferencias() {
    const raw = localStorage.getItem('focus_preferences');
    if (raw) {
      try {
        const prefs = JSON.parse(raw);
        this.modoSeleccionado = prefs.mode || '';
        this.duracion = Number(prefs.duration) || 45;
      } catch {}
    }
  }

  seleccionarModo(id: string) {
    this.modoSeleccionado = id;
  }

  guardar() {
    if (!this.modoSeleccionado || this.guardando) return;

    this.guardando = true;

    const preferencias = {
      mode: this.modoSeleccionado,
      duration: Number(this.duracion)
    };

    localStorage.setItem('focus_preferences', JSON.stringify(preferencias));

    this.mensajeConfirmacion = true;

    setTimeout(() => {
      this.router.navigate(['/dashboard']);
    }, 600);
  }
}