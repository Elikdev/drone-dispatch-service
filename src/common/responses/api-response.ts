import { ErrorCode } from '../errors/error-codes';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  error: null;
}

export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
  details?: unknown;
  requestId?: string;
}

export interface ApiFailure {
  success: false;
  data: null;
  error: ApiErrorBody;
}
