import axios, { AxiosError } from 'axios';
import { ElMessage } from 'element-plus';
import router from '@/router';

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface ApiBody<T = unknown> {
  code: number;
  message: string;
  data: T;
}

http.interceptors.response.use(
  (response) => {
    const body = response.data as ApiBody;
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data as never;
      if (body.code === 401000) {
        localStorage.removeItem('token');
        if (router.currentRoute.value.path !== '/login') router.push('/login');
      }
      ElMessage.error(body.message || '请求失败');
      return Promise.reject(new Error(body.message));
    }
    return body as never;
  },
  (error: AxiosError<ApiBody>) => {
    const status = error.response?.status;
    const message = error.response?.data?.message;
    if (status === 401) {
      localStorage.removeItem('token');
      if (router.currentRoute.value.path !== '/login') router.push('/login');
    }
    ElMessage.error(message || error.message || '网络错误');
    return Promise.reject(error);
  },
);

export default http;
