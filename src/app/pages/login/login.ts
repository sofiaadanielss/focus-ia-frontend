import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LucideAngularModule, Eye, EyeOff } from 'lucide-angular';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  email = signal('');
  password = signal('');
  emailError = signal('');
  passwordError = signal('');
  serverError = signal('');
  successMessage = signal('');
  loading = signal(false);
  showPassword = signal(false);
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;

  // Variables para el bloqueo por intentos fallidos
  private failedAttempts = 0;
  private lockUntil: Date | null = null;
  isLocked = signal(false);
  lockRemainingSeconds = signal(0);
  private lockInterval: any = null;

  constructor(private router: Router, private authService: AuthService) {}

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  isSubmitDisabled = computed(() => {
    return !this.email() || !this.password() || 
           !!this.emailError() || !!this.passwordError() || 
           this.loading() || this.isLocked();
  });

  validateEmail() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.email()) {
      this.emailError.set('El correo electrónico es obligatorio');
    } else if (!emailRegex.test(this.email())) {
      this.emailError.set('Formato de correo inválido');
    } else {
      this.emailError.set('');
    }
  }

  validatePassword() {
    this.passwordError.set(!this.password() ? 'La contraseña es obligatoria' : '');
  }

  // Verificar si la cuenta está bloqueada
  checkLockStatus(): boolean {
    if (this.lockUntil && new Date() < this.lockUntil) {
      // Todavía bloqueado
      this.isLocked.set(true);
      this.updateLockRemainingTime();
      return true;
    } else if (this.lockUntil && new Date() >= this.lockUntil) {
      // Bloqueo expirado, reiniciar
      this.clearLock();
    }
    return false;
  }

  // Actualizar el tiempo restante del bloqueo
  private updateLockRemainingTime() {
    if (this.lockInterval) {
      clearInterval(this.lockInterval);
    }

    this.lockInterval = setInterval(() => {
      if (this.lockUntil) {
        const remaining = Math.max(0, Math.ceil((this.lockUntil.getTime() - new Date().getTime()) / 1000));
        
        if (remaining <= 0) {
          this.clearLock();
        } else {
          this.lockRemainingSeconds.set(remaining);
        }
      }
    }, 1000);
  }

  // Limpiar el bloqueo
  private clearLock() {
    this.isLocked.set(false);
    this.lockUntil = null;
    this.failedAttempts = 0;
    this.lockRemainingSeconds.set(0);
    
    if (this.lockInterval) {
      clearInterval(this.lockInterval);
      this.lockInterval = null;
    }
  }

  // Registrar un intento fallido
  private registerFailedAttempt() {
    this.failedAttempts++;
    
    if (this.failedAttempts >= 3) {
      // Bloquear por 1 minuto
      this.lockUntil = new Date(Date.now() + 60 * 1000); // 60 segundos
      this.isLocked.set(true);
      this.updateLockRemainingTime();
      
      // Mostrar mensaje de bloqueo
      this.serverError.set(`Demasiados intentos fallidos. Cuenta bloqueada por 1 minuto.`);
      
      // Limpiar campos
      this.password.set('');
      
      // Opcional: limpiar el error después de 5 segundos pero mantener el bloqueo
      setTimeout(() => {
        if (this.serverError()?.includes('Demasiados intentos')) {
          // No limpiar el mensaje de bloqueo, solo mantenerlo
        }
      }, 5000);
    } else {
      // Mostrar intentos restantes
      const attemptsLeft = 3 - this.failedAttempts;
      this.serverError.set(`Correo o contraseña incorrectos. Te quedan ${attemptsLeft} intento${attemptsLeft !== 1 ? 's' : ''}.`);
    }
  }

  // Resetear intentos fallidos (en caso de login exitoso)
  private resetFailedAttempts() {
    this.failedAttempts = 0;
    this.lockUntil = null;
    this.isLocked.set(false);
    this.lockRemainingSeconds.set(0);
    
    if (this.lockInterval) {
      clearInterval(this.lockInterval);
      this.lockInterval = null;
    }
  }

  onSubmit() {
    // Verificar bloqueo antes de validar
    if (this.checkLockStatus()) {
      return;
    }

    this.validateEmail();
    this.validatePassword();
    
    if (this.emailError() || this.passwordError()) return;

    this.loading.set(true);
    this.serverError.set('');
    this.successMessage.set('');

    this.authService.login(this.email(), this.password()).subscribe({
      next: () => {
        // Login exitoso - resetear intentos fallidos
        this.resetFailedAttempts();
        this.successMessage.set('Inicio de sesión exitoso');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        // Login fallido - registrar intento
        const errorMsg = err.error?.detail || 'Correo o contraseña incorrectos';
        
        // Si el error es de credenciales (no de conexión, etc)
        if (errorMsg.toLowerCase().includes('credentials') || 
            errorMsg.toLowerCase().includes('incorrect') ||
            err.status === 401) {
          this.registerFailedAttempt();
        } else {
          this.serverError.set(errorMsg);
        }
        
        this.loading.set(false);
        this.password.set(''); // Limpiar contraseña por seguridad
      },
      complete: () => {
        this.loading.set(false);
      }
    });
  }

  // Limpiar al destruir el componente
  ngOnDestroy() {
    if (this.lockInterval) {
      clearInterval(this.lockInterval);
    }
  }
}