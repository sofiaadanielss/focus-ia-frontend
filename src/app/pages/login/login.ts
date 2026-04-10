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

  constructor(private router: Router, private authService: AuthService) {}

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  isSubmitDisabled = computed(() => {
    return !this.email() || !this.password() || !!this.emailError() || !!this.passwordError() || this.loading();
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

  onSubmit() {
    this.validateEmail();
    this.validatePassword();
    if (this.emailError() || this.passwordError()) return;

    this.loading.set(true);
    this.serverError.set('');
    this.successMessage.set('');

    this.authService.login(this.email(), this.password()).subscribe({
      next: () => {
        this.successMessage.set('Inicio de sesión exitoso');
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.serverError.set(err.error?.detail || 'Correo o contraseña incorrectos');
        this.loading.set(false);
      },
      complete: () => {
        this.loading.set(false);
      }
    });
  }
}