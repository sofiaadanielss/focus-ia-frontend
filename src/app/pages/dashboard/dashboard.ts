import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FocusService, Session } from '../../core/services/focus.service';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit, OnDestroy {
  activeSession: Session | null = null;
  timerDisplay = '00:00:00';
  loading = false;
  error = '';

  private interval: any;

  constructor(
    private focusService: FocusService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    this.focusService.getActiveSession().subscribe({
      next: (session) => {
        if (session) {
          this.activeSession = session;
          this.startTimer(session.start_time);
        }
      },
      error: () => {
        // Manejar error silenciosamente
      }
    });
  }

  startSession() {
    if (this.loading) return;
    this.loading = true;
    this.error = '';

    const duration = this.focusService.getDuracionSesion();
    
    // Usar el método que acepta duración
    this.focusService.startSessionWithDuration(duration).subscribe({
      next: (session) => {
        this.activeSession = session;
        this.startTimer(session.start_time);
        this.loading = false;
      },
      error: (err) => {
        console.error('Error starting session:', err);
        this.error = 'No se pudo iniciar la sesión. Inténtalo de nuevo.';
        this.loading = false;
      }
    });
  }

  endSession() {
    if (!this.activeSession || this.loading) return;
    this.loading = true;
    this.error = '';

    this.focusService.endSession(this.activeSession.id).subscribe({
      next: () => {
        this.activeSession = null;
        clearInterval(this.interval);
        this.timerDisplay = '00:00:00';
        this.loading = false;
      },
      error: (err) => {
        console.error('Error ending session:', err);
        this.error = 'No se pudo finalizar la sesión. Inténtalo de nuevo.';
        this.loading = false;
      }
    });
  }

  private startTimer(startTime: string) {
    clearInterval(this.interval);
    this.interval = setInterval(() => {
      const start = new Date(startTime).getTime();
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const h = Math.floor(elapsed / 3600);
      const m = Math.floor((elapsed % 3600) / 60);
      const s = elapsed % 60;
      this.timerDisplay = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }, 1000);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  ngOnDestroy() {
    clearInterval(this.interval);
  }
}