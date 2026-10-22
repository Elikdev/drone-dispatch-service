import { ValidationError } from 'class-validator';

export interface FieldError {
  field: string;
  errors: string[];
}

export function formatValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): FieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own: FieldError[] = error.constraints
      ? [{ field, errors: Object.values(error.constraints) }]
      : [];

    return [...own, ...formatValidationErrors(error.children ?? [], field)];
  });
}
