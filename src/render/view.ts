import type { CharacterData } from '../data/types.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { GeometryView } from './geometryView.ts';
import { SpriteView } from './spriteView.ts';

/* A view turns a Fighter's combat state into pixels. The game never sees this interface. */

/** A frozen afterimage pose: the exact cell (and facing) a ghost was stamped with, drawn
 *  instead of the fighter's live state so the silhouette trails a past frame. */
export interface FrozenPose { sheet: string; col: number; row: number; facing: number }

export interface FighterView {
  /** Draws in world coordinates under the caller's entry transform, which defines the raster
      density (device pixels for the arena, a portrait's own scale for its canvas); the sprite
      path reads that scale back to bake cells at raster resolution. */
  draw(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, alpha: number, tint?: string, outline?: string, pose?: FrozenPose): void;
  /** False while the idle sheet is still downloading. Select portraits hold their box instead of drawing the block figure. */
  idleReady?(): boolean;
}

function buildFor(data: CharacterData): 'slim' | 'bulky' | 'tall' {
  if (data.view.kind === 'geometry') return data.view.build;
  return data.trait === 'armor' ? 'bulky' : data.trait === 'rush' ? 'slim' : 'tall';
}

export function createView(data: CharacterData, images: ImageCache): FighterView {
  const spec = data.view;
  const geometry = new GeometryView(data.color, buildFor(data));
  if (spec.kind === 'geometry') return geometry;
  return new SpriteView(images, spec.common, spec.special, spec.height, geometry, spec.frenzy, spec.king, spec.kingScale, spec.world, spec.box);
}

export function createViews(characters: CharacterData[], images: ImageCache): Map<string, FighterView> {
  return new Map(characters.map(c => [c.id, createView(c, images)]));
}
