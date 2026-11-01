import { saveBlob } from './download';
import { saveNativeBlob } from './native-save';
import { PACKAGED } from '../platform/platform';

describe('saveBlob and native-save', () => {
  it('saveNativeBlob returns false when not running packaged', async () => {
    // No ambiente de teste / web padrão, PACKAGED é false
    expect(PACKAGED).toBeFalse();
    const blob = new Blob(['hello world'], { type: 'text/plain' });
    const result = await saveNativeBlob(blob, 'test.txt');
    expect(result).toBeFalse();
  });

  it('saveBlob does not throw on valid blob and filename', () => {
    const blob = new Blob(['sample data'], { type: 'text/plain' });
    expect(() => saveBlob(blob, 'sample.txt')).not.toThrow();
  });
});
