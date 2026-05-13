import { Component, OnInit, ChangeDetectionStrategy, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Sidebar } from '../../shared/sidebar/sidebar';
import { SessionReportComponent, SessionReportData } from '../../shared/session-report/session-report';
import { Router } from '@angular/router';

@Component({
  selector: 'app-session-history',
  standalone: true,
  imports: [CommonModule, Sidebar, SessionReportComponent],
  templateUrl: './session-history.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SessionHistory implements OnInit {
  historial: SessionReportData[] = [];
  reporteSeleccionado: SessionReportData | null = null;

  constructor(private cdr: ChangeDetectorRef, private router: Router) {}

  ngOnInit(): void {
    this.cargarHistorial();
  }

  cargarHistorial(): void {
    try {
      const raw = localStorage.getItem('focus_session_history');
      const lista: SessionReportData[] = raw ? JSON.parse(raw) : [];
      // Ordenar de más reciente a más antiguo
      this.historial = lista.slice().reverse();
    } catch {
      this.historial = [];
    }
    this.cdr.markForCheck();
  }

  abrirReporte(sesion: SessionReportData): void {
    this.reporteSeleccionado = sesion;
    this.cdr.markForCheck();
  }

  cerrarReporte(): void {
    this.reporteSeleccionado = null;
    this.cdr.markForCheck();
  }

  // El historial no tiene opción de nueva sesión desde aquí; redirigir al dashboard
  irAlDashboard(): void {
    this.router.navigate(['/dashboard']);
  }

  formatearDuracion(segundos: number): string {
    const h = Math.floor(segundos / 3600);
    const m = Math.floor((segundos % 3600) / 60);
    const s = segundos % 60;
    return [
      h.toString().padStart(2, '0'),
      m.toString().padStart(2, '0'),
      s.toString().padStart(2, '0')
    ].join(':');
  }

  calcularNivelConcentracion(sesion: SessionReportData): { nivel: string; color: string; bg: string } {
    const usados = sesion.tiempo_usado_segundos;
    const segDistracciones = sesion.distracciones.reduce((acc, d) => acc + (d.duracion_segundos || 0), 0);
    const tiempoEfectivo = Math.max(0, usados - segDistracciones);
    const pct = usados > 0 ? Math.round((tiempoEfectivo / usados) * 100) : 100;

    if (pct >= 80) return { nivel: 'Alto', color: '#7C5CBF', bg: '#ede9fe' };
    if (pct >= 50) return { nivel: 'Medio', color: '#d97706', bg: '#fef3c7' };
    return { nivel: 'Bajo', color: '#dc2626', bg: '#fee2e2' };
  }

  formatearFechaLegible(fechaStr: string): string {
    // Convierte "2026-05-01 14:35:22" → "01 May 2026, 14:35"
    try {
      const clean = fechaStr.replace(' ', 'T');
      const d = new Date(clean);
      if (isNaN(d.getTime())) return fechaStr;
      return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
        + ', ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return fechaStr;
    }
  }
}