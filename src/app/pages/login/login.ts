import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login {
  email = '';
  password = '';
  emailError = '';
  passwordError = '';
  serverError = '';
  successMessage = '';
  loading = false;

  constructor(private router: Router, private authService: AuthService) {}

  isSubmitDisabled(): boolean {
    return !this.email || !this.password || !!this.emailError || !!this.passwordError || this.loading;
  }

  validateEmail() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.email) {
      this.emailError = 'El correo electrónico es obligatorio';
    } else if (!emailRegex.test(this.email)) {
      this.emailError = 'Formato de correo inválido';
    } else {
      this.emailError = '';
    }
  }

  validatePassword() {
    this.passwordError = !this.password ? 'La contraseña es obligatoria' : '';
  }

  onSubmit() {
    this.validateEmail();
    this.validatePassword();
    if (this.emailError || this.passwordError) return;

    this.loading = true;
    this.serverError = '';
    this.successMessage = '';

    this.authService.login(this.email, this.password).subscribe({
      next: () => {
        this.successMessage = 'Inicio de sesión exitoso';
        setTimeout(() => this.router.navigate(['/profile']), 1500);
      },
      error: (err) => {
        this.serverError = err.error?.detail || 'Correo o contraseña incorrectos';
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      }
    });
  }
}
