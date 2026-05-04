import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Profile } from './pages/profile/profile';
import { Dashboard } from './pages/dashboard/dashboard';
import { AdhdQuestions } from './pages/adhd-questions/adhd-questions';
import { IqComponent } from './pages/iq/iq';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: Login },
  { path: 'register', component: Login },
  { path: 'adhd-questions', component: AdhdQuestions },
  { path: 'profile', component: Profile },
  { path: 'dashboard', component: Dashboard },
  { path: 'iq', component: IqComponent}
];