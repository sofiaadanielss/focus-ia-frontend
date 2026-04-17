import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, UserProfile, UpdateProfileRequest } from '../../core/auth/auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  currentName = '';
  fullName = '';
  username = '';
  email = '';
  password = '';
  
  fullNameError = '';
  usernameError = '';
  passwordError = '';
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
      next: (user: UserProfile) => {
        // Mapear los campos según lo que devuelve el backend
        this.fullName = (user as any).full_name || user.name || '';
        this.username = (user as any).username || user.name || '';
        this.email = user.email;
        this.currentName = this.fullName || this.username;
        this.password = '';
        
        // Debug: ver qué datos llegan
        console.log('Perfil cargado:', user);
      },
      error: (err) => {
        console.error('Error loading profile:', err);
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
      (!this.fullName && !this.username) ||
      !!this.fullNameError ||
      !!this.usernameError ||
      !!this.passwordError ||
      this.loading
    );
  }

  validateFullName() {
    if (!this.fullName.trim()) {
      this.fullNameError = 'El nombre completo no puede estar vacío';
    } else if (this.fullName.trim().length < 3) {
      this.fullNameError = 'El nombre debe tener al menos 3 caracteres';
    } else {
      this.fullNameError = '';
    }
  }

  validateUsername() {
    if (!this.username.trim()) {
      this.usernameError = 'El nombre de usuario no puede estar vacío';
    } else if (this.username.trim().length < 3) {
      this.usernameError = 'El nombre de usuario debe tener al menos 3 caracteres';
    } else if (!/^[a-zA-Z0-9_]+$/.test(this.username)) {
      this.usernameError = 'Solo letras, números y guión bajo';
    } else {
      this.usernameError = '';
    }
  }

  validatePassword() {
    if (this.password && this.password.length > 0) {
      if (this.password.length < 6) {
        this.passwordError = 'La contraseña debe tener al menos 6 caracteres';
      } else {
        this.passwordError = '';
      }
    } else {
      this.passwordError = '';
    }
  }

  clearSuccess() {
    this.successMessage = '';
    this.serverError = '';
  }

  volver() {
    this.router.navigate(['/dashboard']);
  }

  onSubmit() {
    // Validar todos los campos
    this.validateFullName();
    this.validateUsername();
    this.validatePassword();
    
    if (this.fullNameError || this.usernameError || this.passwordError) {
      return;
    }

    if (!this.fullName.trim() && !this.username.trim()) {
      this.serverError = 'Debes proporcionar al menos nombre completo o nombre de usuario';
      return;
    }

    this.loading = true;
    this.serverError = '';
    this.successMessage = '';

    // Construir objeto de actualización
    const updateData: UpdateProfileRequest = {};
    
    if (this.fullName.trim()) {
      updateData.full_name = this.fullName.trim();
      updateData.name = this.fullName.trim();
    }
    
    if (this.username.trim()) {
      updateData.username = this.username.trim();
    }
    
    if (this.password && this.password.trim()) {
      updateData.password = this.password.trim();
    }

    this.authService.updateProfile(updateData).subscribe({
      next: (user: UserProfile) => {
        this.currentName = (user as any).full_name || (user as any).username || user.name || this.fullName;
        this.fullName = (user as any).full_name || user.name || this.fullName;
        this.username = (user as any).username || user.name || this.username;
        this.email = user.email;
        this.password = '';
        this.successMessage = '✅ Perfil actualizado';
        
        setTimeout(() => {
          if (this.successMessage === '✅ Perfil actualizado') {
            this.successMessage = '';
          }
        }, 3000);
        
        this.loading = false;
      },
      error: (err) => {
        console.error('Error al actualizar perfil:', err);
        
        const errorMessage = err.error?.detail || err.error?.message || '';
        const errorLower = errorMessage.toLowerCase();
        
        if (errorLower.includes('email') || errorLower.includes('correo')) {
          this.serverError = 'No se puede cambiar el correo electrónico';
        } else if (errorLower.includes('username') || errorLower.includes('nombre de usuario')) {
          this.usernameError = 'Este nombre de usuario ya está en uso';
        } else if (err.status === 401) {
          this.authService.logout();
          this.router.navigate(['/login']);
          return;
        } else {
          this.serverError = errorMessage || 'Error al guardar los cambios';
        }
        
        this.loading = false;
      }
    });
  }

  onLogout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}