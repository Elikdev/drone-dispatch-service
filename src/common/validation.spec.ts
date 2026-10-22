import { ValidationError } from 'class-validator';
import { formatValidationErrors } from './validation';

describe('formatValidationErrors', () => {
  it('returns one entry per field with its messages', () => {
    const errors: ValidationError[] = [
      {
        property: 'serialNumber',
        constraints: { isString: 'serialNumber must be a string' },
        children: [],
      },
    ];

    expect(formatValidationErrors(errors)).toEqual([
      { field: 'serialNumber', errors: ['serialNumber must be a string'] },
    ]);
  });

  it('uses dotted paths for nested fields', () => {
    const errors: ValidationError[] = [
      {
        property: 'items',
        children: [
          {
            property: '0',
            children: [
              {
                property: 'quantity',
                constraints: { min: 'quantity must not be less than 1' },
                children: [],
              },
            ],
          },
        ],
      },
    ];

    expect(formatValidationErrors(errors)).toEqual([
      {
        field: 'items.0.quantity',
        errors: ['quantity must not be less than 1'],
      },
    ]);
  });
});
