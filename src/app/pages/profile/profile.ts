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

  // mock prueba
  ngOnInit() {
    this.name = 'Margarita Lopez';
    this.email = 'prueba@correo.com';
    this.currentName = this.name;
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

    this.loading = true;
    this.serverError = '';
    this.successMessage = '';

    await new Promise(resolve => setTimeout(resolve, 600));
    this.currentName = this.name;
    this.successMessage = 'Datos guardados con éxito!';
    setTimeout(() => (this.successMessage = ''), 4000);
    this.loading = false;
  }
}