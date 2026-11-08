import jscad from '@jscad/modeling';
import { describe, expect, it } from 'vitest';
import { createOpenTrayBox } from './slottedTrayCore.js';
import { embossTrayName } from './trayEmboss.js';

const { measureVolume } = jscad.measurements;

describe('embossTrayName', () => {
  const tray = createOpenTrayBox(60, 60, 10, 2, 2);

  it.each([undefined, '', '   '])('name %j returns the tray unchanged', (name) => {
    expect(embossTrayName(tray, name, 60, 60, 2)).toBe(tray);
  });

  it('a name removes volume from the bottom', () => {
    const result = embossTrayName(tray, 'Tokens', 60, 60, 2);
    expect(measureVolume(result)).toBeLessThan(measureVolume(tray));
  });
});
