import { api } from './client';
import type { LoginRequest, LoginResponse, User } from './types';

export const authApi = {
  login: (body: LoginRequest) => api.post<LoginResponse>('/auth/login', body, { anonymous: true }),
  me: () => api.get<User>('/auth/me'),
};
