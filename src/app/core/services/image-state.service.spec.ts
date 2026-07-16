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

  /**
   * The scenario undo exists for: remove the background, resize, crop — then
   * realise three steps later that the crop was wrong. Before this, the only way
   * back was Start over and re-uploading the original.
   */
  it('steps back through a chain, restoring the exact bytes of each step', () => {
    state.load(pngFile('photo.png'));
    const original = state.currentFile();

    state.apply('remove-bg', new Blob([new Uint8Array(3)], { type: 'image/png' }), 'nobg', 'png');
    const afterNoBg = state.currentFile();

    state.apply('resize', new Blob([new Uint8Array(4)], { type: 'image/png' }), 'resized', 'png');
    const afterResize = state.currentFile();

    state.apply('crop', new Blob([new Uint8Array(5)], { type: 'image/png' }), 'crop', 'png');
    expect(state.history()).toEqual(['remove-bg', 'resize', 'crop']);

    // The crop was bad: drop it, and the resize result must come back untouched.
    state.undo();
    expect(state.currentFile()).toBe(afterResize);
    expect(state.history()).toEqual(['remove-bg', 'resize']);

    state.undo();
    expect(state.currentFile()).toBe(afterNoBg);

    // All the way back to the untouched upload.
    state.undo();
    expect(state.currentFile()).toBe(original);
    expect(state.history()).toEqual([]);
  });

  it('reports which tool undo would take back', () => {
    expect(state.undoableTool()).toBeNull();

    state.load(pngFile());
    expect(state.undoableTool()).toBeNull();

    state.apply('crop', new Blob([new Uint8Array(2)], { type: 'image/png' }), 'crop', 'png');
    expect(state.undoableTool()).toBe('crop');

    state.undo();
    expect(state.undoableTool()).toBeNull();
  });

  it('undo on an untouched upload is a no-op, not a wipe', () => {
    state.load(pngFile());
    const file = state.currentFile();

    state.undo();
    state.undo();

    expect(state.currentFile()).toBe(file);
    expect(state.history()).toEqual([]);
  });

  it('undoing then applying again does not resurrect the dropped step', () => {
    state.load(pngFile());
    state.apply('crop', new Blob([new Uint8Array(2)], { type: 'image/png' }), 'crop', 'png');
    state.undo();
    state.apply('resize', new Blob([new Uint8Array(3)], { type: 'image/png' }), 'resized', 'png');

    expect(state.history()).toEqual(['resize']);
    // And the name still derives from the original, not from the undone crop.
    expect(state.currentFile()?.name).toBe('photo-resized.png');
  });

  it('clears back to empty', () => {
    state.load(pngFile());
    state.clear();

    expect(state.currentFile()).toBeNull();
    expect(state.history()).toEqual([]);
  });
});
