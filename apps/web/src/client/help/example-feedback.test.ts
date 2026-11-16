import { describe, expect, it } from 'vitest';
import { exampleDrawings, type ExampleAnnotation } from './example-feedback.ts';
const annotations: ExampleAnnotation[] = [
  {
    id: 'line',
    kind: 'line',
    frame: 10,
    body: '',
    shape: {
      points: [
        [0.1, 0.2],
        [0.8, 0.3],
      ],
    },
    canEdit: false,
  },
  { id: 'note', kind: 'note', frame: 10, body: 'Example', shape: null, canEdit: false },
];
describe('example overlay frames', () => {
  it('draws saved annotations only on their exact frame and never enables editing', () => {
    const at = exampleDrawings(10, annotations, [], [], null);
    expect(at.map((d) => d.id)).toEqual(['line']);
    expect(at.every((d) => d.editable === false && d.deletable === false)).toBe(true);
    expect(exampleDrawings(11, annotations, [], [], null)).toEqual([]);
  });
  it('keeps the applicable coach boat line until the next correction', () => {
    const lines = [
      {
        frame: 5,
        points: [
          [0.1, 0.2],
          [0.8, 0.3],
        ] as const,
      },
      {
        frame: 20,
        points: [
          [0.2, 0.4],
          [0.8, 0.4],
        ] as const,
      },
    ];
    expect(exampleDrawings(4, [], [], lines, null)[0]).toMatchObject({
      frame: 5,
      points: lines[0]?.points,
    });
    expect(exampleDrawings(19, [], [], lines, null)[0]).toMatchObject({
      frame: 5,
      points: lines[0]?.points,
      variant: 'boat',
      editable: false,
    });
    expect(exampleDrawings(20, [], [], lines, null)[0]).toMatchObject({
      frame: 20,
      points: lines[1]?.points,
    });
  });
});
