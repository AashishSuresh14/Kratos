/** Build-time flags. Both values are statically replaced by Vite, so mock code is dropped from real builds. */
export const USE_MOCKS: boolean =
  import.meta.env.VITE_USE_MOCKS === 'true' || import.meta.env.MODE === 'mock';

export const API_BASE: string = (import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/+$/, '');

export const IS_DEV: boolean = import.meta.env.DEV;
