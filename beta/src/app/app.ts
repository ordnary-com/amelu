import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConnectionOverlay } from './connection-overlay/connection-overlay';

@Component({
  selector: 'amelu-root',
  imports: [RouterOutlet, ConnectionOverlay],
  template: '<router-outlet /><amelu-connection-overlay />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
