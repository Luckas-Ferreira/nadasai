import { TestBed } from '@angular/core/testing';
import { ImageStateService } from './image-state.service';
import { AppError } from '../errors';

function pngFile(name = 'photo.png'): File {
  return new File([new Uint8Array(8)], name, { type: 'image/png' });
}

describe('ImageStateService', () => {
  let state: ImageStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    state = TestBed.inject(ImageStateService);
  });

  it('starts empty', () => {
    expect(state.currentFile()).toBeNull();
    expect(state.history()).toEqual([]);
  });

  it('loads a supported image', () => {
    state.load(pngFile());

    expect(state.currentFile()?.name).toBe('photo.png');
    expect(state.session()?.originalName).toBe('photo.png');
  });

  /**
   * The converter could hand a PDF to `continueEditing()`. Every other tool read
   * that file on init WITHOUT a type check (they only validated on drag-and-drop),
   * so the PDF reached crop/compress/resize and rendered a broken <img>. The
   * guard lives here so no caller can reintroduce the hole.
   */
  it('refuses a PDF, so it can never enter the editing chain', () => {
    const pdf = new Blob([new Uint8Array(8)], { type: 'application/pdf' });

    expect(() => state.apply('convert', pdf, 'converted', 'pdf')).toThrowMatching(
      (err: AppError) => err.code === 'unsupported_file',
    );
    expect(state.currentFile()).toBeNull();
  });

  it('refuses a non-image upload', () => {
    const txt = new File([new Uint8Array(8)], 'notes.txt', { type: 'text/plain' });

    expect(() => state.load(txt)).toThrowMatching(
      (err: AppError) => err.code === 'unsupported_file',
    );
  });

  it('derives chained filenames from the ORIGINAL name instead of stacking prefixes', () => {
    state.load(pngFile('photo.jpg'));

    state.apply('remove-bg', new Blob([new Uint8Array(4)], { type: 'image/png' }), 'nobg', 'png');
    expect(state.currentFile()?.name).toBe('photo-nobg.png');

    state.apply('crop', new Blob([new Uint8Array(4)], { type: 'image/png' }), 'crop', 'png');
    // Not `crop-nobg-photo.jpg`.
    expect(state.currentFile()?.name).toBe('photo-crop.png');
    expect(state.session()?.originalName).toBe('photo.jpg');
  });

  it('records the tools applied, in order', () => {
    state.load(pngFile());
    state.apply('remove-bg', new Blob([new Uint8Array(4)], { type: 'image/png' }), 'nobg', 'png');
    state.apply('compress', new Blob([new Uint8Array(4)], { type: 'image/webp' }), 'min', 'webp');

    expect(state.history()).toEqual(['remove-bg', 'compress']);
  });

  it('clears back to empty', () => {
    state.load(pngFile());
    state.clear();

    expect(state.currentFile()).toBeNull();
    expect(state.history()).toEqual([]);
  });
});
