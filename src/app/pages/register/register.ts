import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';


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

  constructor(private router: Router) {}

  isSubmitDisabled(): boolean {
    return (
      !this.name ||
      !this.email ||
      !this.password ||
      !!this.nameError ||
      !!this.emailError ||
      !!this.passwordError ||
      this.loading
    );
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

  async onSubmit() {
    this.validateName();
    this.validateEmail();
    this.validatePassword();

    if (this.nameError || this.emailError || this.passwordError) return;

    this.loading = true;
    this.serverError = '';

    try {
      const res = await fetch('http://localhost:8000/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.name,
          email: this.email,
          password: this.password
        })
      });

      const result = await res.json();

      if (res.ok) {
        this.showModal = true;
      } else {
        const detail = result.detail?.toLowerCase() ?? '';
        if (detail.includes('email')) {
          this.emailError = 'Este correo ya está registrado';
        } else if (detail.includes('password')) {
          this.passwordError = 'Mínimo 8 caracteres';
        } else {
          this.serverError = result.detail || 'Error al registrar';
        }
      }
    } catch (err) {
      this.serverError = 'Error de conexión con el servidor. ¿Está corriendo el backend?';
    } finally {
      this.loading = false;
    }
  }

  goToLogin() {
    this.showModal = false;
    this.router.navigate(['/login']);
  }
}
