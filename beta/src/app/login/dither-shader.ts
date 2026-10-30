import { Component, ElementRef, NgZone, OnDestroy, afterNextRender, inject, input } from '@angular/core';
import {
  DitheringShapes,
  DitheringTypes,
  ShaderFitOptions,
  ShaderMount,
  defaultPatternSizing,
  ditheringFragmentShader,
  getShaderColorFromString,
  type DitheringShape,
  type DitheringType,
} from '@paper-design/shaders';

/**
 * An animated two-colour dither, drawn on the GPU by Paper Shaders' dithering
 * shader (https://shaders.paper.design/dithering, Apache-2.0), as in
 * ordnary-console. The shader
 * pauses itself when the tab is hidden or the element is off screen. Under
 * prefers-reduced-motion it renders one still frame. Pure decoration; put it
 * in a positioned parent and the host fills it.
 */
@Component({
  selector: 'amelu-dither-shader',
  template: '',
  host: { class: 'pointer-events-none absolute inset-0 block overflow-hidden', 'aria-hidden': 'true' },
})
export class DitherShader implements OnDestroy {
  readonly colorBack = input('#000000');
  readonly colorFront = input('#1d4ed8');
  readonly shape = input<DitheringShape>('warp');
  readonly type = input<DitheringType>('4x4');
  /** Size of one dither dot in CSS px. */
  readonly size = input(3);
  readonly speed = input(0.6);
  readonly scale = input(1);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private mount: ShaderMount | null = null;

  constructor() {
    afterNextRender(() =>
      this.zone.runOutsideAngular(() => {
        const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        try {
          this.mount = new ShaderMount(
            this.host,
            ditheringFragmentShader,
            {
              u_colorBack: getShaderColorFromString(this.colorBack()),
              u_colorFront: getShaderColorFromString(this.colorFront()),
              u_shape: DitheringShapes[this.shape()],
              u_type: DitheringTypes[this.type()],
              u_pxSize: this.size(),
              u_fit: ShaderFitOptions[defaultPatternSizing.fit],
              u_scale: this.scale(),
              u_rotation: defaultPatternSizing.rotation,
              u_offsetX: defaultPatternSizing.offsetX,
              u_offsetY: defaultPatternSizing.offsetY,
              u_originX: defaultPatternSizing.originX,
              u_originY: defaultPatternSizing.originY,
              u_worldWidth: defaultPatternSizing.worldWidth,
              u_worldHeight: defaultPatternSizing.worldHeight,
            },
            undefined,
            reduced ? 0 : this.speed(),
            // Start a little way in, so the first (or only) frame isn't the blank origin.
            4000,
          );
        } catch {
          // No WebGL: the host's own background shows instead.
        }
      }),
    );
  }

  ngOnDestroy(): void {
    this.mount?.dispose();
  }
}
