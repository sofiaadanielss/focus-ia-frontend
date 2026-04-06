import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
 
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
 
  constructor(private router: Router, private authService: AuthService) {}
 
  ngOnInit() {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login']);
      return;
    }
    this.loadProfile();
  }
 
  private loadProfile() {
    this.authService.getProfile().subscribe({
      next: (user) => {
        this.name = user.name ?? '';
        this.email = user.email ?? '';
        this.currentName = this.name;
      },
      error: (err) => {
        if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/login']);
        } else {
          this.serverError = 'No se pudo cargar el perfil.';
        }
      }
    });
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
 
  onSubmit() {
    this.validateName();
    this.validateEmail();
    if (this.nameError || this.emailError) return;
 
    this.loading = true;
    this.serverError = '';
    this.successMessage = '';
 
    this.authService.updateProfile({
      name: this.name.trim(),
      email: this.email.trim()
    }).subscribe({
      next: (user) => {
        this.currentName = user.name;
        this.name = user.name;
        this.email = user.email;
        this.successMessage = 'Completado';
        setTimeout(() => (this.successMessage = ''), 4000);
      },
      error: (err) => {
        const detail = (err.error?.detail ?? '').toLowerCase();
        if (detail.includes('email') || detail.includes('correo')) {
          this.emailError = 'Este correo ya está registrado por otro usuario';
        } else if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/login']);
        } else {
          this.serverError = err.error?.detail || 'Error al guardar los cambios';
        }
        this.loading = false;
      },
      complete: () => {
        this.loading = false;
      }
    });
  }
 
  onLogout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}