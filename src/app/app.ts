import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BackendService } from './services/backend.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('URMS');
  protected readonly backendStatus = signal<string>('Loading...');
  private readonly backendService = inject(BackendService);

  ngOnInit(): void {
    console.log('AppComponent ngOnInit called');
    this.backendService.getStatus().subscribe({
      next: (status) => {
        console.log('Backend status received:', status);
        this.backendStatus.set(status);
      },
      error: (error) => {
        console.error('Error connecting to backend:', error);
        this.backendStatus.set('Error connecting to backend');
      }
    });
  }

  // ...existing code...
}
