import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class Register {
  name = '';
  email = '';
  password = '';
  nameError = '';
  emailError = '';
  passwordError = '';
  serverError = '';
  loading = false;
  showModal = false;

  constructor(private router: Router, private authService: AuthService) {}

  isSubmitDisabled(): boolean {
    return !this.name || !this.email || !this.password || !!this.nameError || !!this.emailError || !!this.passwordError || this.loading;
  }

  validateName() {
    this.nameError = !this.name ? 'El nombre es obligatorio' : '';
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
    if (!this.password) {
      this.passwordError = 'La contraseña es obligatoria';
    } else if (this.password.length < 8) {
      this.passwordError = 'Mínimo 8 caracteres';
    } else {
      this.passwordError = '';
    }
  }

  onSubmit() {
    this.validateName();
    this.validateEmail();
    this.validatePassword();
    if (this.nameError || this.emailError || this.passwordError) return;

    this.loading = true;
    this.serverError = '';

    this.authService.register({ name: this.name, email: this.email, password: this.password }).subscribe({
      next: () => {
        this.showModal = true;
      },
      error: (err) => {
        const detail = (err.error?.detail ?? '').toLowerCase();
        if (detail.includes('email')) {
          this.emailError = 'Este correo ya está registrado';
        } else if (detail.includes('password')) {
          this.passwordError = 'Mínimo 8 caracteres';
        } else {
          this.serverError = err.error?.detail || 'Error al registrar';
        }
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      }
    });
  }

  goToLogin() {
    this.showModal = false;
    this.router.navigate(['/login']);
  }
}