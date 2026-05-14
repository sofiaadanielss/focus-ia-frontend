import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { IqComponent } from './pages/iq/iq';
import { Profile } from './pages/profile/profile';
import { Dashboard } from './pages/dashboard/dashboard';
import { Distractors } from './pages/distractors/distractors';
import { AdhdQuestions } from './pages/adhd-questions/adhd-questions';
import { SessionHistory } from './shared/session-history/session-history';

function rootRedirect(): string {
  try {
    return localStorage.getItem('access_token') ? '/dashboard' : '/login';
  } catch {
    return '/login';
  }
}

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: rootRedirect() },
  { path: 'login', component: Login },
  { path: 'profile', component: Profile },
  { path: 'dashboard', component: Dashboard },
  { path: 'distractors', component: Distractors },
  { path: 'adhd-questions', component: AdhdQuestions },
  { path: 'historico', component: SessionHistory },
  { path: 'iq', component: IqComponent},
  
];
