import { Component, signal, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html'
})
export class App {
  protected readonly title = signal('focus-ai');

  constructor(private authService: AuthService) {}

  @HostListener('window:pagehide')
  onPageHide() {
    this.authService.endActiveSessionBestEffort();
  }
}