import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

@Component({
  
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  currentName = '';

  name = '';
  email = '';

  
  nameError = '';
  emailError = '';
  serverError = '';
  successMessage = '';
  loading = false;

  constructor(private router: Router) {}

  ngOnInit() {
    
    const token = localStorage.getItem('access_token');
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadProfile(token);
  }

  private async loadProfile(token: string) {
    try {
      const res = await fetch('http://localhost:8000/users/me', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 401) {
        localStorage.removeItem('access_token');
        this.router.navigate(['/login']);
        return;
      }

      const user = await res.json();
      this.name = user.name ?? '';
      this.email = user.email ?? '';
      this.currentName = this.name;
    } catch {
      this.serverError = 'No se pudo cargar el perfil. ¿Está corriendo el backend?';
    }
  }

  isSubmitDisabled(): boolean {
    return (
      !this.name ||
      !this.email ||
      !!this.nameError ||
      !!this.emailError ||
      this.loading
    );
  }

  validateName() {
    
    this.nameError = !this.name.trim() ? 'El nombre no puede estar vacío' : '';
  }

  validateEmail() {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!this.email.trim()) {
      this.emailError = 'El correo no puede estar vacío';
    } else if (!emailRegex.test(this.email)) {
      this.emailError = 'Formato de correo inválido';
    } else {
      this.emailError = '';
    }
  }

  clearSuccess() {
    this.successMessage = '';
  }

  async onSubmit() {
    this.validateName();
    this.validateEmail();
    if (this.nameError || this.emailError) return;

    const token = localStorage.getItem('access_token');
    if (!token) {
      this.router.navigate(['/login']);
      return;
    }

    this.loading = true;
    this.serverError = '';
    this.successMessage = '';

    try {
      const res = await fetch('http://localhost:8000/users/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: this.name.trim(),
          email: this.email.trim()
        })
      });

      const result = await res.json();

      if (res.ok) {
        this.currentName = this.name;
        this.successMessage = 'Datos guardados con éxito!';
        setTimeout(() => (this.successMessage = ''), 4000);
      } else {
        const detail = result.detail?.toLowerCase() ?? '';
        if (detail.includes('email') || detail.includes('correo')) {
          this.emailError = 'Este correo ya está registrado por otro usuario';
        } else {
          this.serverError = result.detail || 'Error al guardar los cambios';
        }
      }
    } catch {
      this.serverError = 'Error de conexión con el servidor. ¿Está corriendo el backend?';
    } finally {
      this.loading = false;
    }
  }
}
