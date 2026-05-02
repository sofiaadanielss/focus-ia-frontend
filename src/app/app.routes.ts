import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Profile } from './pages/profile/profile';
import { Dashboard } from './pages/dashboard/dashboard';
import { Adhd } from './pages/adhd-questions/adhd-questions';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'register', component: Login },
  { path: 'adhd', component: Adhd },
  { path: 'profile', component: Profile },
  { path: 'dashboard', component: Dashboard }
];