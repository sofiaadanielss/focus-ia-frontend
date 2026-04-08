import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Preference {
  mode: string;
  duration: number;
}

export interface Session {
  id: number;
  start_time: string;
  end_time: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class FocusService {
  private BASE_URL = environment.apiUrl;

  constructor(private http: HttpClient) {}

  savePreferences(mode: string, duration: number): Observable<Preference> {
    return this.http.post<Preference>(`${this.BASE_URL}/preferences`, { mode, duration });
  }

  getPreferences(): Observable<Preference> {
    return this.http.get<Preference>(`${this.BASE_URL}/preferences`);
  }

  startSession(): Observable<Session> {
    return this.http.post<Session>(`${this.BASE_URL}/sessions`, {});
  }

  endSession(id: number): Observable<Session> {
    return this.http.patch<Session>(`${this.BASE_URL}/sessions/${id}`, {});
  }

  getActiveSession(): Observable<Session | null> {
    return this.http.get<Session | null>(`${this.BASE_URL}/sessions/active`);
  }
}
