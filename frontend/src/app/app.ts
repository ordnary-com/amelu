import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConnectionOverlay } from './connection-overlay/connection-overlay';
import { YategaOverlay } from './yatega-overlay/yatega-overlay';

@Component({
  selector: 'amelu-root',
  imports: [RouterOutlet, ConnectionOverlay, YategaOverlay],
  template: '<router-outlet /><amelu-yatega-overlay /><amelu-connection-overlay />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
