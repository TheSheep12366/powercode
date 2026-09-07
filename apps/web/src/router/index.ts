import { Message } from 'fuxsto-design/message';
import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue')
    },
    {
      path: '/workspace',
      name: 'workspace-select',
      component: () => import('@/views/ProjectSelectView.vue')
    },
    {
      path: '/workspace/:dirId',
      name: 'workspace',
      component: () => import('@/views/WorkspaceView.vue')
    },
    {
      path: '/contacts',
      name: 'contacts',
      component: () => import('@/views/ContactsView.vue')
    },

    {
      path: '/admin',
      component: () => import('@/layouts/AdminLayout.vue'),
      meta: { requiresAdmin: true },
      children: [
        { path: '', redirect: '/admin/users' },
        { path: 'users', name: 'admin-users', component: () => import('@/views/admin/UserListView.vue') },
        { path: 'directories', name: 'admin-directories', component: () => import('@/views/admin/DirectoryListView.vue') },
        { path: 'permissions', name: 'admin-permissions', component: () => import('@/views/admin/PermissionMatrixView.vue') },
        { path: 'audit-logs', name: 'admin-audit', component: () => import('@/views/admin/AuditLogView.vue') }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) {
    await auth.fetchMe();
  }
  if (to.meta.public) {
    return auth.user ? { path: '/' } : true;
  }
  if (!auth.user) {
    return {
      path: '/login',
      query: to.fullPath && to.fullPath !== '/' ? { redirect: to.fullPath } : undefined
    };
  }
  if (to.meta.requiresAdmin && auth.user.role !== 'admin') {
    Message.error('需要管理员权限');
    return { path: '/' };
  }
  return true;
});

export default router;
