import type { CharacterData } from '../data/types.ts';
import type { Fighter } from '../game/fighter.ts';
import type { ImageCache } from '../assets/loader.ts';
import { GeometryView } from './geometryView.ts';
import { SpriteView } from './spriteView.ts';

/* A view turns a Fighter's combat state into pixels. The game never sees this interface. */
export interface FighterView {
  draw(ctx: CanvasRenderingContext2D, f: Fighter, x: number, y: number, alpha: number): void;
}

function buildFor(data: CharacterData): 'slim' | 'bulky' | 'tall' {
  if (data.view.kind === 'geometry') return data.view.build;
  return data.trait === 'armor' ? 'bulky' : data.trait === 'rush' ? 'slim' : 'tall';
}

export function createView(data: CharacterData, images: ImageCache): FighterView {
  const spec = data.view;
  const geometry = new GeometryView(data.color, buildFor(data));
  if (spec.kind === 'geometry') return geometry;
  return new SpriteView(images, spec.common, spec.special, spec.height, geometry);
}

export function createViews(characters: CharacterData[], images: ImageCache): Map<string, FighterView> {
  return new Map(characters.map(c => [c.id, createView(c, images)]));
}
