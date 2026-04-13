import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LucideAngularModule, Eye, EyeOff } from 'lucide-angular';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, LucideAngularModule],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class Register {
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;

  name = signal('');
  email = signal('');
  password = signal('');
  nameError = signal('');
  emailError = signal('');
  passwordError = signal('');
  serverError = signal('');
  username = signal('');
  usernameError = signal('');
  loading = signal(false);
  showModal = signal(false);
  showPassword = signal(false);

  constructor(private router: Router, private authService: AuthService) {}

  togglePassword() {
    this.showPassword.update(v => !v);
  }

  isSubmitDisabled = computed(() => {
    return !this.name() || !this.username() || !this.email() || !this.password()
      || !!this.nameError() || !!this.usernameError() || !!this.emailError() || !!this.passwordError()
      || this.loading();
  });

  validateName() {
    this.nameError.set(!this.name() ? 'El nombre es obligatorio' : '');
  }

  validateUsername() {
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!this.username()) {
      this.usernameError.set('El nombre de usuario es obligatorio');
    } else if (!usernameRegex.test(this.username())) {
      this.usernameError.set('3–20 caracteres, solo letras, números y _');
    } else {
      this.usernameError.set('');
    }
  }

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
    if (!this.password()) {
      this.passwordError.set('La contraseña es obligatoria');
    } else if (this.password().length < 8) {
      this.passwordError.set('Mínimo 8 caracteres');
    } else {
      this.passwordError.set('');
    }
  }

  onSubmit() {
    this.validateName();
    this.validateUsername();
    this.validateEmail();
    this.validatePassword();
    if (this.nameError() || this.usernameError() || this.emailError() || this.passwordError()) return;

    this.loading.set(true);
    this.serverError.set('');

    this.authService.register({
      name: this.name(),
      username: this.username(),
      email: this.email(),
      password: this.password()
    }).subscribe({
      next: () => {
        this.showModal.set(true);
      },
      error: (err) => {
        const detail = (err.error?.detail ?? '').toLowerCase();
        if (detail.includes('username')) {
          this.usernameError.set('Este nombre de usuario ya está en uso');
        } else if (detail.includes('email')) {
          this.emailError.set('Este correo ya está registrado');
        } else if (detail.includes('password')) {
          this.passwordError.set('Mínimo 8 caracteres');
        } else {
          this.serverError.set(err.error?.detail || 'Error al registrar');
        }
        this.loading.set(false);
      },
      complete: () => {
        this.loading.set(false);
      }
    });
  }

  goToLogin() {
    this.showModal.set(false);
    this.router.navigate(['/login']);
  }
}