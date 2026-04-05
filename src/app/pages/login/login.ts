import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';

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

  constructor(private router: Router) {}

  isSubmitDisabled(): boolean {
    return (
      !this.email ||
      !this.password ||
      !!this.emailError ||
      !!this.passwordError ||
      this.loading
    );
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

  async onSubmit() {
    this.validateEmail();
    this.validatePassword();

    if (this.emailError || this.passwordError) return;

    this.loading = true;
    this.serverError = '';
    this.successMessage = '';

    try {
      const body = new URLSearchParams();
      body.set('username', this.email);
      body.set('password', this.password);

      const res = await fetch('http://localhost:8000/auth/jwt/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      });

      const result = await res.json();

      if (res.ok) {
        localStorage.setItem('access_token', result.access_token);
        this.successMessage = 'Inicio de sesión exitoso';
        setTimeout(() => this.router.navigate(['/dashboard']), 1500);
      } else {
        this.serverError = result.detail || 'Correo o contraseña incorrectos';
      }
    } catch (err) {
      this.serverError = 'Error de conexión con el servidor. ¿Está corriendo el backend?';
    } finally {
      this.loading = false;
    }
  }
}
